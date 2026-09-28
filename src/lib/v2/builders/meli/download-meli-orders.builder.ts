import prisma from "@/lib/prisma";
import {
  inicioJanelaPeloCursor,
} from "@/lib/sync-cursor";
import { sendProgressToUser } from "@/lib/sse-progress";
import { smartRefreshMeliAccountToken } from "@/lib/meli";
import MeliSyncService from "../../services/meli-sync.service";
import { MeliOrderPayload, SyncError } from "../../types/sync-meli";

type AccountData = {
  id: string;
  userId: string;
  ml_user_id: bigint;
  nickname: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  refresh_token_invalid_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

type SyncStep = {
  accountId: string;
  accountName: string;
  currentStep: "error" | "pending" | "fetching" | "saving" | "completed";
  progress: number;
  fetched: number;
  expected: number;
  error: string | undefined;
};

export type DownloadMeliOrderBuilderCtx = {
  userId: string;
  errors: SyncError[];
  forcedStop: boolean;
  fetchComplete: boolean;
  failedPages: number;
  syncStartedAt: Date | null;

  current: {
    accountId: string;
    accountName: string;
    mlUserId: number;
    accountIndex: number;
    accountData: AccountData;
    syncStep: "pending" | "fetching" | "saving" | "completed" | "error";
    expiresAt: string;
    error?: string;
  };
  progress: {
    percentage: number;
    fetched: number;
    expected: number;
    skipped: number;
    skippedOtherUser: number;
  };
};

const PAGE_LIMIT = 50;
const MAX_OFFSET = 50_000;
const MAX_EXECUTION_TIME = 30 * 60 * 1000;
const FALLBACK_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const PAGE_FETCH_CONCURRENCY = Math.min(
  6,
  Math.max(1, Number(process.env.MELI_PAGE_FETCH_CONCURRENCY ?? "5") || 5),
);

export class DownloadMeliOrdersBuilder {
  private _steps: SyncStep[];
  private _ctx: DownloadMeliOrderBuilderCtx;
  private _tokenRefreshMutex = new Map<string, Promise<AccountData>>();
  private _meliSyncService: MeliSyncService;
  private _allOrders: MeliOrderPayload[] = [];

  public get steps() {
    return this._steps;
  }

  public get ctx() {
    return this._ctx;
  }

  public get allOrders() {
    return this._allOrders;
  }

  constructor(params: {
    account: AccountData;
    userId: string;
    meliSyncService: MeliSyncService;
    steps: SyncStep[];
    accountIndex?: number;
  }) {
    // Não reutilizar arrays/objetos do contexto padrão: até três contas rodam
    // simultaneamente e cada uma precisa de métricas e erros isolados.
    this._ctx = {
      userId: params.userId,
      errors: [],
      forcedStop: false,
      fetchComplete: false,
      failedPages: 0,
      syncStartedAt: null,
      progress: {
        percentage: 0,
        fetched: 0,
        expected: 0,
        skipped: 0,
        skippedOtherUser: 0,
      },
      current: {
        accountData: params.account,
        accountId: params.account.id,
        accountIndex: params.accountIndex ?? 0,
        accountName:
          params.account.nickname || `Conta ${params.account.ml_user_id}`,
        mlUserId: Number(params.account.ml_user_id),
        syncStep: "fetching",
        expiresAt: params.account.expires_at.toISOString(),
      },
    };
    this._meliSyncService = params.meliSyncService;
    this._steps = params.steps;
  }

  private getHeaders = () => ({
    Authorization: `Bearer ${this._ctx.current.accountData.access_token}`,
  });

  async refreshHandler(): Promise<this> {
    try {
      const mutexKey = `refresh_${this._ctx.current.accountId}`;
      if (this._tokenRefreshMutex.has(mutexKey)) {
        console.log(
          `[Sync] Aguardando refresh em andamento para conta ${this._ctx.current.accountId}`,
        );
        this._ctx.current.accountData =
          await this._tokenRefreshMutex.get(mutexKey)!;
      } else {
        const refreshPromise = smartRefreshMeliAccountToken(
          this._ctx.current.accountData,
        );
        this._tokenRefreshMutex.set(mutexKey, refreshPromise);
        try {
          this._ctx.current.accountData = await refreshPromise;
        } finally {
          this._tokenRefreshMutex.delete(mutexKey);
        }
      }
      this._ctx.current.expiresAt =
        this._ctx.current.accountData.expires_at.toISOString();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao renovar token.";
      this._ctx.errors.push({
        accountId: this._ctx.current.accountId,
        mlUserId: this._ctx.current.accountData.ml_user_id,
        message,
      });
      console.error(
        `[Sync] Erro ao renovar token da conta ${this._ctx.current.accountId}:`,
        error,
      );

      this._ctx.current.syncStep = "error";
      this._ctx.current.error = message;
      sendProgressToUser(this._ctx.userId, {
        type: "sync_warning",
        message: `Erro ao renovar token da conta ${this._ctx.current.accountName}: ${message}. Continuando com próxima conta...`,
        errorCode: "TOKEN_REFRESH_FAILED",
        accountId: this._ctx.current.accountId,
      });
    }

    return this;
  }

  async fetchAllOrders(): Promise<this> {
    const startedAtMs = Date.now();
    const syncStartedAt = new Date(startedAtMs);
    this._ctx.syncStartedAt = syncStartedAt;
    this._ctx.fetchComplete = false;
    this._ctx.failedPages = 0;
    this._ctx.forcedStop = false;
    this._ctx.progress = {
      percentage: 0,
      fetched: 0,
      expected: 0,
      skipped: 0,
      skippedOtherUser: 0,
    };
    this._allOrders = [];

    const results: MeliOrderPayload[] = [];
    const logisticStats = new Map<string, number>();
    const headers = this.getHeaders();
    const account = this._ctx.current.accountData;
    const userId = this._ctx.userId;

    console.log(
      `[Sync] Iniciando busca de vendas para conta ${account.ml_user_id} (${account.nickname}) em ${syncStartedAt.toISOString()}`,
    );

    const [latestSyncedOrder, lastWriteAgg] = await Promise.all([
      prisma.meliVenda.findFirst({
        where: { meliAccountId: account.id },
        select: { id: true },
      }),
      prisma.meliVenda.aggregate({
        where: { meliAccountId: account.id },
        _max: { atualizadoEm: true },
      }),
    ]);

    let lastUpdatedFrom: Date | undefined;
    if (latestSyncedOrder) {
      const cursorWindowStart = await inicioJanelaPeloCursor(
        "meli",
        account.id,
      );
      if (cursorWindowStart) {
        lastUpdatedFrom = cursorWindowStart;
        console.log(
          `[Sync] Modo incremental por cursor: atualizações desde ${lastUpdatedFrom.toISOString()}`,
        );
      } else {
        const lastWrite = lastWriteAgg._max.atualizadoEm;
        if (lastWrite) {
          lastUpdatedFrom = new Date(lastWrite.getTime() - FALLBACK_WINDOW_MS);
          console.log(
            `[Sync] Cursor ausente: fallback seguro desde ${lastUpdatedFrom.toISOString()} (max atualizadoEm - 2 dias)`,
          );
        } else {
          console.warn(
            `[Sync] Conta com vendas sem atualizadoEm; usando janela ampla.`,
          );
        }
      }
    } else {
      console.log(
        "[Sync] Primeira sincronização - buscando histórico (limitado aos 50k mais recentes)",
      );
    }

    let discoveredTotal: number | null = null;
    let nextOffset = 0;
    // A primeira página define o total. Só depois abrimos a fila concorrente,
    // evitando requisitar offsets que não pertencem à janela.
    let maxOffsetToFetch = PAGE_LIMIT;
    let forcedStop = false;
    let stopScheduling = false;
    let truncatedByApiLimit = false;
    const successfulOffsets = new Set<number>();
    const activePages = new Set<Promise<void>>();

    const recordPageFailure = (
      pageNumber: number,
      message: string,
    ): void => {
      this._ctx.failedPages += 1;
      stopScheduling = true;
      this._ctx.errors.push({
        accountId: account.id,
        mlUserId: account.ml_user_id,
        message: `Página ${pageNumber}: ${message}`,
      });
    };

    const schedulePageFetch = (offsetValue: number): void => {
      const pageNumber = Math.floor(offsetValue / PAGE_LIMIT) + 1;
      const pagePromise = (async () => {
        try {
          const pageResult = await this._meliSyncService.fetchOrdersPage({
            account,
            headers,
            userId,
            offset: offsetValue,
            pageNumber,
            lastUpdatedFrom,
            lastUpdatedTo: syncStartedAt,
          });

          if (pageResult.failed) {
            recordPageFailure(
              pageNumber,
              pageResult.failure?.message ?? "Falha ao buscar página",
            );
            return;
          }

          successfulOffsets.add(offsetValue);
          if (discoveredTotal === null && pageResult.total !== null) {
            discoveredTotal = pageResult.total;
            maxOffsetToFetch = Math.min(MAX_OFFSET, discoveredTotal);
            truncatedByApiLimit = discoveredTotal > MAX_OFFSET;
            this._ctx.progress.expected = discoveredTotal;
            console.log(
              `[Sync] Conta ${account.ml_user_id}: total estimado ${discoveredTotal} vendas`,
            );
          }

          this._ctx.progress.fetched += pageResult.fetched;
          this._ctx.progress.skipped += pageResult.skipped;
          this._ctx.progress.skippedOtherUser +=
            pageResult.skippedOtherUser;

          for (const payload of pageResult.orders) {
            results.push(payload);
            const logisticTypeRaw =
              payload.freight.logisticType ||
              payload.freight.shippingMode ||
              "sem_tipo";
            logisticStats.set(
              logisticTypeRaw,
              (logisticStats.get(logisticTypeRaw) || 0) + 1,
            );
          }

          const expected =
            discoveredTotal ?? Math.max(this._ctx.progress.fetched, 1);
          this._ctx.progress.percentage = Math.min(
            100,
            (this._ctx.progress.fetched / expected) * 100,
          );

          sendProgressToUser(userId, {
            type: "sync_progress",
            message:
              `${account.nickname || `Conta ${account.ml_user_id}`}: ` +
              `${this._ctx.progress.fetched}/${discoveredTotal ?? this._ctx.progress.fetched} vendas verificadas ` +
              `(${results.length} para salvar, ${this._ctx.progress.skipped} inalteradas)`,
            current: this._ctx.progress.fetched,
            total: discoveredTotal ?? this._ctx.progress.fetched,
            fetched: this._ctx.progress.fetched,
            expected: discoveredTotal ?? this._ctx.progress.fetched,
            skipped: this._ctx.progress.skipped,
            skippedOtherUser: this._ctx.progress.skippedOtherUser,
            accountId: account.id,
            accountNickname: account.nickname || undefined,
            page: pageNumber,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Falha desconhecida";
          console.error(
            `[Sync] Erro inesperado na página ${pageNumber}:`,
            error,
          );
          recordPageFailure(pageNumber, message);
          sendProgressToUser(userId, {
            type: "sync_warning",
            message: `Erro inesperado na página ${pageNumber}: ${message}`,
            errorCode: "PAGE_FETCH_ERROR",
            accountId: account.id,
          });
        }
      })();

      activePages.add(pagePromise);
      void pagePromise.finally(() => activePages.delete(pagePromise));
    };

    const fillPageQueue = (): void => {
      while (
        !stopScheduling &&
        activePages.size < PAGE_FETCH_CONCURRENCY &&
        nextOffset < maxOffsetToFetch
      ) {
        if (Date.now() - startedAtMs > MAX_EXECUTION_TIME) {
          forcedStop = true;
          stopScheduling = true;
          break;
        }
        schedulePageFetch(nextOffset);
        nextOffset += PAGE_LIMIT;
      }
    };

    fillPageQueue();
    while (activePages.size > 0) {
      await Promise.race(activePages);

      if (
        !stopScheduling &&
        Date.now() - startedAtMs > MAX_EXECUTION_TIME
      ) {
        console.log("[Sync] Tempo limite atingido - parando paginação");
        forcedStop = true;
        stopScheduling = true;
      }

      fillPageQueue();
    }

    if (truncatedByApiLimit) {
      forcedStop = true;
      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `A busca retornou mais de ${MAX_OFFSET} vendas e foi truncada; o cursor não será avançado.`,
        accountId: account.id,
        accountNickname: account.nickname || undefined,
      });
    }

    let allRequiredPagesSucceeded = discoveredTotal !== null;
    const requiredOffsetLimit = Math.min(discoveredTotal ?? 0, MAX_OFFSET);
    for (
      let requiredOffset = 0;
      requiredOffset < requiredOffsetLimit;
      requiredOffset += PAGE_LIMIT
    ) {
      if (!successfulOffsets.has(requiredOffset)) {
        allRequiredPagesSucceeded = false;
        break;
      }
    }

    this._ctx.forcedStop = forcedStop;
    this._ctx.fetchComplete =
      discoveredTotal !== null &&
      this._ctx.failedPages === 0 &&
      !forcedStop &&
      !truncatedByApiLimit &&
      allRequiredPagesSucceeded;
    this._ctx.progress.expected =
      discoveredTotal ?? this._ctx.progress.fetched;
    this._ctx.progress.percentage = this._ctx.fetchComplete
      ? 100
      : this._ctx.progress.expected > 0
        ? Math.min(
            100,
            (this._ctx.progress.fetched / this._ctx.progress.expected) * 100,
          )
        : 0;
    this._allOrders = results;

    const elapsedTime = Math.round((Date.now() - startedAtMs) / 1000);
    console.log(
      `[Sync] Conta ${this._ctx.current.mlUserId}: ${this._ctx.progress.fetched} verificadas, ` +
        `${results.length} para salvar, ${this._ctx.progress.skipped} inalteradas, ` +
        `${this._ctx.progress.skippedOtherUser} de outro usuário em ${elapsedTime}s. ` +
        `Leitura completa: ${this._ctx.fetchComplete}`,
    );
    console.log(
      "[Sync] Tipos de logística:",
      Array.from(logisticStats.entries()),
    );

    return this;
  }

  finish() {
    return this;
  }
}
