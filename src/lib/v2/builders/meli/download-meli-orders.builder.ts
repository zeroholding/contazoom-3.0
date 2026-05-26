import prisma from "@/lib/prisma";
import { sendProgressToUser } from "@/lib/sse-progress";
import { MeliOrderPayload, SyncError } from "../../types/sync-meli";
import { smartRefreshMeliAccountToken } from "@/lib/meli";
import MeliSyncService from "../../services/meli-sync.service";
import { checkRedisHealth } from "@/lib/redis";
import { enqueueSales, QueuedSale } from "@/lib/redis-queue";

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

export type DownloadMeliOrderBuilderCtx = {
  userId: string;
  errors: SyncError[];
  forcedStop: boolean;

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
  };
};

const defaultCtx: Omit<DownloadMeliOrderBuilderCtx, "current" | "userId"> = {
  errors: [],
  progress: {
    percentage: 0,
    fetched: 0,
    expected: 0,
  },
  forcedStop: false,
};
const PAGE_LIMIT = 50;
const PAGE_FETCH_CONCURRENCY = Math.min(
  5,
  Math.max(1, Number(process.env.MELI_PAGE_FETCH_CONCURRENCY ?? "2") || 2),
);

export class DownloadMeliOrdersBuilder {
  private _steps: {
    accountId: string;
    accountName: string;
    currentStep: "error" | "pending" | "fetching" | "saving" | "completed";
    progress: number;
    fetched: number;
    expected: number;
    error: string | undefined;
  }[];
  private _ctx: DownloadMeliOrderBuilderCtx;
  private _tokenRefreshMutex = new Map<string, Promise<any>>();
  private _meliSyncService: MeliSyncService;

  // TODO: see if it is necessary to add this attributes to CTX
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
    steps: {
      accountId: string;
      accountName: string;
      currentStep: "error" | "pending" | "fetching" | "saving" | "completed";
      progress: number;
      fetched: number;
      expected: number;
      error: string | undefined;
    }[];
  }) {
    this._ctx = {
      ...defaultCtx,
      userId: params.userId,
      current: {
        accountData: params.account,
        accountId: params.account.id,
        accountIndex: 0,
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
      // Usar mutex para evitar refresh concorrente
      const mutexKey = `refresh_${this._ctx.current.accountId}`;
      if (this._tokenRefreshMutex.has(mutexKey)) {
        console.log(
          `[Sync] Aguardando refresh em andamento para conta ${this._ctx.current.accountId}`,
        );
        this._ctx.current.accountData = await this._tokenRefreshMutex.get(mutexKey)!;
      } else {
        const refreshPromise = smartRefreshMeliAccountToken(
          this._ctx.current.accountData,
        );
        this._tokenRefreshMutex.set(mutexKey, refreshPromise);
        try {
          this._ctx.current.accountData = await refreshPromise;
          this._tokenRefreshMutex.delete(mutexKey);
        } catch (error) {
          this._tokenRefreshMutex.delete(mutexKey);
          throw error;
        }
      }
      this._ctx.current.expiresAt = this._ctx.current.accountData.expires_at.toISOString();
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

      // Atualizar step para erro
      this._ctx.current.syncStep = "error";
      this._ctx.current.error = message;

      // Enviar erro via SSE
      sendProgressToUser(this._ctx.userId, {
        type: "sync_warning",
        message: `Erro ao renovar token da conta ${
          this._ctx.current.accountName
        }: ${message}. Continuando com próxima conta...`,
        errorCode: "TOKEN_REFRESH_FAILED",
      });
    }

    return this;
  }

  async fetchAllOrders(): Promise<this> {
    const startTime = Date.now();
    const MAX_EXECUTION_TIME = 3000000; // SEMPRE 30 minutos
    const results: MeliOrderPayload[] = [];
    const detailsResults: MeliOrderPayload[] = [];
    const logisticStats = new Map<string, number>();
    let forcedStop = false; // Declarar forcedStop localmente

    const headers = this.getHeaders();
    const account = this._ctx.current.accountData;
    const userId = this._ctx.userId;

    console.log(
      `[Sync] ?? Iniciando busca de vendas para conta ${account.ml_user_id} (${account.nickname})`,
    );

    // Verificar a venda mais recente já sincronizada para fazer Sincronização Incremental (Delta Sync)
    const latestSyncedOrder = await prisma.meliVenda.findFirst({
      where: { meliAccountId: account.id },
      orderBy: { dataVenda: "desc" },
      select: { dataVenda: true },
    });

    let lastUpdatedFrom: Date | undefined;

    const latestDate = latestSyncedOrder?.dataVenda;
    if (latestDate) {
      // Define a data de início da busca como 15 dias atrás para capturar atualizações recentes
      lastUpdatedFrom = new Date();
      lastUpdatedFrom.setDate(lastUpdatedFrom.getDate() - 15);
      console.log(
        `[Sync] 🚀 Modo Incremental: Buscando atualizações desde ${
          lastUpdatedFrom.toISOString().split("T")[0]
        }`,
      );
    } else {
      console.log(`[Sync] 📅 Primeira sincronização - buscando histórico (limitado aos 50k mais recentes)`);
    }

    const MAX_OFFSET = 50000; // Limite seguro antes do 50k da API
    let total = 0;
    let discoveredTotal: number | null = null;
    let nextOffset = 0;
    const SAFE_BATCH_SIZE = 50000;
    let maxOffsetToFetch = Math.min(MAX_OFFSET, SAFE_BATCH_SIZE);
    const activePages = new Set<Promise<void>>();
    let oldestOrderDate: Date | null = null;

    const schedulePageFetch = (offsetValue: number) => {
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
          });

          if (
            typeof pageResult.total === "number" &&
            pageResult.total >= 0 &&
            discoveredTotal === null
          ) {
            discoveredTotal = pageResult.total;
            this._ctx.progress.expected = discoveredTotal;
            maxOffsetToFetch = Math.min(MAX_OFFSET, discoveredTotal);
            console.log(
              `[Sync] ?? Conta ${account.ml_user_id}: total estimado ${total} vendas`,
            );
          }

          if (pageResult.orders.length === 0) {
            return;
          }

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

            const createdAt = this._meliSyncService.extractOrderDate(
              payload.order,
            );
            if (
              createdAt &&
              (!oldestOrderDate || createdAt < oldestOrderDate)
            ) {
              oldestOrderDate = createdAt;
            }
          }

          sendProgressToUser(userId, {
            type: "sync_progress",
            message: `${account.nickname || `Conta ${account.ml_user_id}`}: ${
              results.length
            }/${
              discoveredTotal ?? results.length
            } vendas baixadas (página ${pageNumber})`,
            current: results.length,
            total: discoveredTotal ?? results.length,
            fetched: results.length,
            expected: discoveredTotal ?? results.length,
            accountId: account.id,
            accountNickname: account.nickname || undefined,
            page: pageNumber,
          });
        } catch (error) {
          console.error(
            `[Sync] ?? Erro inesperado na p�gina ${pageNumber}:`,
            error,
          );
          sendProgressToUser(userId, {
            type: "sync_warning",
            message: `Erro inesperado na p�gina ${pageNumber}: ${
              error instanceof Error ? error.message : "Falha desconhecida"
            }`,
            errorCode: "PAGE_FETCH_ERROR",
          });
        }
      })();

      pagePromise.finally(() => activePages.delete(pagePromise));
      activePages.add(pagePromise);
    };

    // PASSO 1: Buscar vendas recentes (paginação normal)
    while (
      activePages.size < PAGE_FETCH_CONCURRENCY &&
      nextOffset < Math.min(MAX_OFFSET, maxOffsetToFetch)
    ) {
      // Verificar tempo antes de continuar
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(
          `[Sync] ⏱️ Tempo limite atingido (${Math.round(
            (Date.now() - startTime) / 1000,
          )}s) - parando busca de vendas recentes`,
        );
        forcedStop = true;
        break;
      }
      schedulePageFetch(nextOffset);
      nextOffset += PAGE_LIMIT;
    }

    while (activePages.size > 0) {
      await Promise.race(activePages);

      // Verificar tempo antes de continuar
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`[Sync] ⏱️ Tempo limite atingido - parando paginação`);
        forcedStop = true;
        break;
      }

      while (
        activePages.size < PAGE_FETCH_CONCURRENCY &&
        nextOffset < maxOffsetToFetch &&
        Date.now() - startTime < MAX_EXECUTION_TIME
      ) {
        schedulePageFetch(nextOffset);
        nextOffset += PAGE_LIMIT;
      }
    }

    if (discoveredTotal === null) {
      total = results.length;
    }

    // // PASSO 2: Buscar vendas hist�ricas apenas se N�O atingiu o limite
    // const timeRemaining = MAX_EXECUTION_TIME - (Date.now() - startTime);
    // const reachedLimit = results.length >= SAFE_BATCH_SIZE;
    // const shouldFetchHistory = !reachedLimit && timeRemaining > 10000;

    // if (shouldFetchHistory) {
    //   console.log(
    //     `[Sync] 🔄 Buscando vendas históricas (tempo restante: ${Math.round(
    //       timeRemaining / 1000,
    //     )}s)...`,
    //   );

    //   // Determinar ponto de partida para busca histórica
    //   let searchStartDate: Date;

    //   if (oldestSyncedDate) {
    //     // Continuar de onde a última sincronização parou
    //     searchStartDate = new Date(oldestSyncedDate);
    //     searchStartDate.setDate(searchStartDate.getDate() - 1); // Um dia antes da última sincronizada
    //     console.log(
    //       `[Sync] 📅 Continuando busca histórica a partir de ${
    //         searchStartDate.toISOString().split("T")[0]
    //       }`,
    //     );
    //   } else {
    //     // Primeira vez: começar da venda mais antiga das recentes
    //     const firstSyncFallbackDate = new Date(2025, 0, 1);
    //     const fallbackOldest =
    //       results.length > 0
    //         ? (this._meliSyncService.extractOrderDate(
    //             results[results.length - 1].order,
    //           ) ?? firstSyncFallbackDate)
    //         : firstSyncFallbackDate;

    //     searchStartDate = oldestOrderDate ?? fallbackOldest;
    //     console.log(
    //       `[Sync] 📅 Primeira busca histórica a partir de ${
    //         searchStartDate.toISOString().split("T")[0]
    //       }`,
    //     );
    //   }

    //   // Buscar vendas mais antigas em blocos de 1 mês
    //   const currentMonthStart = new Date(searchStartDate);
    //   currentMonthStart.setDate(1); // Primeiro dia do mês
    //   currentMonthStart.setHours(0, 0, 0, 0);
    //   currentMonthStart.setMonth(currentMonthStart.getMonth() - 1); // Começar do mês anterior

    //   const startDate = new Date();
    //   console.log(
    //     `[Sync] ?? FULL SYNC ativado - buscando TODAS as vendas (desde 2000)`,
    //   );

    //   // Buscar enquanto tiver tempo
    //   while (
    //     currentMonthStart < startDate &&
    //     Date.now() - startTime < MAX_EXECUTION_TIME - 5000
    //   ) {
    //     // Calcular fim do mês
    //     const currentMonthEnd = new Date(currentMonthStart);
    //     currentMonthEnd.setMonth(currentMonthEnd.getMonth() + 1);
    //     currentMonthEnd.setDate(0); // Último dia do mês
    //     currentMonthEnd.setHours(23, 59, 59, 999);

    //     console.log(
    //       `[Sync] 📅 Buscando: ${
    //         currentMonthStart.toISOString().split("T")[0]
    //       } a ${currentMonthEnd.toISOString().split("T")[0]}`,
    //     );
    //     // Buscar vendas deste mês
    //     const monthOrders = await this._meliSyncService.fetchOrdersInDateRange(
    //       account,
    //       headers,
    //       userId,
    //       currentMonthStart,
    //       currentMonthEnd,
    //       logisticStats,
    //     );

    //     console.log(
    //       `[Sync] ✅ Encontradas ${monthOrders.length} vendas neste período`,
    //     );

    //     detailsResults.push(...monthOrders);

    //     sendProgressToUser(userId, {
    //       type: "sync_details_progress",
    //       message: `${account.nickname || `Conta ${account.ml_user_id}`}: ${
    //         results.length
    //       } vendas baixadas (buscando histórico: ${
    //         currentMonthStart.toISOString().split("T")[0]
    //       })`,
    //       current: detailsResults.length,
    //       total: Math.max(total, results.length), // Usar o maior valor entre total estimado e vendas baixadas
    //       fetched: detailsResults.length,
    //       expected: Math.max(total, results.length),
    //       accountId: account.id,
    //       accountNickname: account.nickname || undefined,
    //     });

    //     // Se não encontrou vendas neste mês, chegou no início do histórico
    //     if (monthOrders.length === 0) {
    //       console.log(
    //         `[Sync] ✅ Nenhuma venda encontrada neste período - histórico completo!`,
    //       );
    //       // break;
    //     }

    //     // Ir para o mês anterior
    //     currentMonthStart.setMonth(currentMonthStart.getMonth() + 1);
    //   }

    //   results.push(...detailsResults);

    //   const elapsedTime = Math.round((Date.now() - startTime) / 1000);
    //   console.log(
    //     `[Sync] ✅ Busca por período concluída em ${elapsedTime}s: ${results.length} vendas baixadas`,
    //   );
    //   if (
    //     Date.now() - startTime >= MAX_EXECUTION_TIME - 5000 &&
    //     currentMonthStart > startDate
    //   ) {
    //     forcedStop = true;
    //   }
    // } else if (!shouldFetchHistory && total > results.length) {
    //   if (timeRemaining <= 10000) {
    //     forcedStop = true;
    //   }
    //   console.log(
    //     `[Sync] ⏱️ Tempo insuficiente para busca histórica - execute sincronização novamente para continuar`,
    //   );
    // }

    // Calcular estatísticas finais
    const elapsedTime = Math.round((Date.now() - startTime) / 1000);
    const finalTotal = Math.max(total, results.length);

    console.log(
      `[Sync] 🎉 ${results.length} vendas baixadas em ${elapsedTime}s (total estimado: ${total})`,
    );
    console.log(
      `[Sync] 📊 Tipos de logística:`,
      Array.from(logisticStats.entries()),
    );

    // Verificar se há mais vendas para sincronizar
    const totalInDatabase = await prisma.meliVenda.count({
      where: { meliAccountId: account.id },
    });

    if (totalInDatabase < total) {
      const remaining = total - totalInDatabase;
      console.log(
        `[Sync] 📌 ${remaining} vendas restantes - execute sincronização novamente para continuar`,
      );
      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `${remaining} vendas antigas ainda não sincronizadas. Execute sincronização novamente para buscar o restante.`,
        accountId: account.id,
        accountNickname: account.nickname || undefined,
      });
    } else {
      console.log(`[Sync] ✅ Histórico completo sincronizado!`);
    }

    this._allOrders = results;
    this.ctx.progress.expected = finalTotal;
    this.ctx.forcedStop = forcedStop;
    console.log(
      `[Sync] ✅ Conta ${this.ctx.current.mlUserId}: ${this.allOrders.length} vendas baixadas de ${this.ctx.progress.expected} totais`,
    );
    console.log(
      `[Sync] Debug - allOrders.length: ${this.allOrders.length}, expectedTotal: ${this.ctx.progress.expected}`,
    );

    return this;
  }

  async enqueueOrders(): Promise<this> {
    const isRedisHealthy = await checkRedisHealth();
    console.log(
      `[Sync] Redis status: ${
        isRedisHealthy ? "✅ Available" : "⚠️ Unavailable - using direct save"
      }`,
    );

    if (isRedisHealthy && this._allOrders.length > 0) {
      // === FASE 1: Enqueue no Redis ===
      console.log(
        `[Sync] 📦 Fase 1: Enfileirando ${this._allOrders.length} vendas no Redis...`,
      );

      sendProgressToUser(this._ctx.userId, {
        type: "sync_download_progress",
        message: `Salvando ${this._allOrders.length} vendas no cache...`,
        current: 0,
        total: this._allOrders.length,
        phase: "downloading",
        accountId: this._ctx.current.accountId,
        accountNickname: this._ctx.current.accountName,
      });

      // Convert to QueuedSale format
      const queuedSales: QueuedSale[] = this._allOrders.map((order) => ({
        accountId: order.accountId,
        accountNickname: order.accountNickname ?? null,
        mlUserId: Number(order.mlUserId),
        order: order.order,
        shipment: order.shipment,
        freight: order.freight,
      }));

      const enqueueResult = await enqueueSales(
        this._ctx.userId,
        this._ctx.current.accountId,
        queuedSales,
      );

      if (enqueueResult.success) {
        console.log(
          `[Sync] ✅ ${enqueueResult.count} vendas enfileiradas no Redis`,
        );

        sendProgressToUser(this._ctx.userId, {
          type: "sync_download_complete",
          message: `${enqueueResult.count} vendas baixadas e armazenadas`,
          current: enqueueResult.count,
          total: enqueueResult.count,
          phase: "downloading",
        });

        this._allOrders = [];
      }
    }

    return this;
  }

  finish() {
    return this;
  }
}
