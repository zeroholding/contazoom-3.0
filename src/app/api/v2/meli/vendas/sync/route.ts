import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import { invalidateVendasCache } from "@/lib/cache";
import { pMap } from "@/lib/concorrencia";
import { gravarCursorSync } from "@/lib/sync-cursor";
import { acquireSyncLock } from "@/lib/sync-lock";
import {
  collectSkuCandidatesFromMeliOrders,
  fetchMeliCatalogSkuCandidates,
  registerDiscoveredSkus,
} from "@/lib/sku-discovery";
import { sendProgressToUser } from "@/lib/sse-progress";
import { DownloadMeliOrdersBuilder } from "@/lib/v2/builders/meli/download-meli-orders.builder";
import { SaveMeliOrdersBuilder } from "@/lib/v2/builders/meli/save-meli-orders.builder";
import MeliSyncService from "@/lib/v2/services/meli-sync.service";
import {
  AccountSummary,
  MeliOrderPayload,
  SyncError,
} from "@/lib/v2/types/sync-meli";
import { NextRequest, NextResponse } from "next/server";

const service = new MeliSyncService();

type SyncStep = {
  accountId: string;
  accountName: string;
  currentStep: "pending" | "fetching" | "saving" | "completed" | "error";
  progress: number;
  fetched: number;
  expected: number;
  error: string | undefined;
};

type AccountSyncResult = {
  expected: number;
  fetched: number;
  saved: number;
  skipped: number;
  skippedOtherUser: number;
  complete: boolean;
  errors: SyncError[];
};

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;

  let requestBody: {
    accountIds?: string[];
    orderIdsByAccount?: Record<string, string[]>;
  } = {};

  try {
    const bodyText = await req.text();
    if (bodyText) requestBody = JSON.parse(bodyText);
  } catch (error) {
    console.error("[Sync Meli V2] Erro ao parsear body:", error);
  }

  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const userId = session.sub;

  console.log(`[Sync] Iniciando sincronização para usuário ${userId}`, {
    accountIds: requestBody.accountIds,
    hasOrderIds: !!requestBody.orderIdsByAccount,
  });

  sendProgressToUser(userId, {
    type: "sync_start",
    message: "Conectando ao Mercado Livre...",
    current: 0,
    total: 0,
    fetched: 0,
    expected: 0,
  });

  const accounts = await service.getAccountsByUserId(
    userId,
    requestBody.accountIds,
  );

  if (accounts.length === 0) {
    sendProgressToUser(userId, {
      type: "sync_complete",
      message: "Nenhuma conta do MercadoLivre encontrada",
      current: 0,
      total: 0,
      fetched: 0,
      expected: 0,
    });

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      accounts: [] as AccountSummary[],
      orders: [] as MeliOrderPayload[],
      errors: [] as SyncError[],
      totals: {
        expected: 0,
        fetched: 0,
        saved: 0,
        skipped: 0,
        skippedOtherUser: 0,
      },
    });
  }

  const syncLock = await acquireSyncLock(["vendas", "meli", userId]);

  if (!syncLock.acquired) {
    sendProgressToUser(userId, {
      type: "sync_warning",
      message:
        "Ja existe uma sincronizacao do Mercado Livre em andamento. Aguarde finalizar antes de iniciar outra.",
      current: 0,
      total: 0,
      fetched: 0,
      expected: 0,
      alreadyRunning: true,
    });

    return NextResponse.json(
      {
        success: false,
        alreadyRunning: true,
        message:
          "Ja existe uma sincronizacao do Mercado Livre em andamento. Aguarde finalizar antes de iniciar outra.",
      },
      { status: 409 },
    );
  }

  try {
    const steps: SyncStep[] = accounts.map((account) => ({
      accountId: account.id,
      accountName: account.nickname || `Conta ${account.ml_user_id}`,
      currentStep: "pending",
      progress: 0,
      fetched: 0,
      expected: 0,
      error: undefined,
    }));

    const accountResults = await pMap(
      accounts,
      3,
      async (account, accountIndex): Promise<AccountSyncResult> => {
        const step = steps[accountIndex];
        const accountErrors: SyncError[] = [];
        let downloadBuilder: DownloadMeliOrdersBuilder | null = null;
        let saveBuilder: SaveMeliOrdersBuilder | null = null;

        const addError = (message: string): void => {
          if (accountErrors.some((error) => error.message === message)) return;
          accountErrors.push({
            accountId: account.id,
            mlUserId: account.ml_user_id,
            message,
          });
        };

        const collectBuilderErrors = (): void => {
          for (const error of downloadBuilder?.ctx.errors ?? []) {
            addError(error.message);
          }
        };

        const snapshot = (complete: boolean): AccountSyncResult => ({
          expected: downloadBuilder?.ctx.progress.expected ?? 0,
          fetched: downloadBuilder?.ctx.progress.fetched ?? 0,
          saved: saveBuilder?.ctx.progress.saved ?? 0,
          skipped: downloadBuilder?.ctx.progress.skipped ?? 0,
          skippedOtherUser:
            downloadBuilder?.ctx.progress.skippedOtherUser ?? 0,
          complete,
          errors: accountErrors,
        });

        try {
          downloadBuilder = new DownloadMeliOrdersBuilder({
            account,
            accountIndex,
            meliSyncService: service,
            userId,
            steps,
          });

          step.currentStep = "fetching";
          sendProgressToUser(userId, {
            type: "sync_progress",
            message: `Buscando vendas da conta ${downloadBuilder.ctx.current.accountName}...`,
            current: accountIndex,
            total: accounts.length,
            fetched: 0,
            expected: 0,
            accountId: account.id,
            accountNickname: downloadBuilder.ctx.current.accountName,
            steps,
          });

          await downloadBuilder.refreshHandler();
          collectBuilderErrors();
          if (downloadBuilder.ctx.current.error) {
            step.currentStep = "error";
            step.error = downloadBuilder.ctx.current.error;
            return snapshot(false);
          }

          // O scan completo do catálogo é caro e só é útil na primeira sync.
          const existingSales = await prisma.meliVenda.count({
            where: { meliAccountId: account.id },
          });
          if (existingSales === 0) {
            try {
              const catalogCandidates = await fetchMeliCatalogSkuCandidates(
                downloadBuilder.ctx.current.accountData,
                userId,
              );
              const catalogResult = await registerDiscoveredSkus(
                userId,
                catalogCandidates,
              );
              if (catalogResult.found > 0) {
                console.log(
                  "[SKU Discovery][ML] Catalogo processado (primeira sync)",
                  {
                    accountId: account.id,
                    found: catalogResult.found,
                    created: catalogResult.created,
                    existing: catalogResult.existing,
                    skipped: catalogResult.skipped,
                  },
                );
              }
            } catch (skuError) {
              console.warn("[SKU Discovery][ML] Falha ao ler catalogo da conta", {
                accountId: account.id,
                error:
                  skuError instanceof Error
                    ? skuError.message
                    : String(skuError),
              });
            }
          }

          await downloadBuilder.fetchAllOrders();
          collectBuilderErrors();
          downloadBuilder.finish();

          step.fetched = downloadBuilder.ctx.progress.fetched;
          step.expected = downloadBuilder.ctx.progress.expected;
          step.progress = downloadBuilder.ctx.progress.percentage;

          // Descoberta de SKU não pode impedir que atualizações já baixadas sejam
          // persistidas; a venda continua segura com CMV pendente.
          try {
            const orderSkuResult = await registerDiscoveredSkus(
              userId,
              collectSkuCandidatesFromMeliOrders(downloadBuilder.allOrders),
            );
            if (orderSkuResult.found > 0) {
              console.log("[SKU Discovery][ML] Vendas processadas", {
                accountId: account.id,
                found: orderSkuResult.found,
                created: orderSkuResult.created,
                existing: orderSkuResult.existing,
                skipped: orderSkuResult.skipped,
              });
            }
          } catch (skuError) {
            console.warn("[SKU Discovery][ML] Falha ao registrar SKUs das vendas", {
              accountId: account.id,
              error:
                skuError instanceof Error ? skuError.message : String(skuError),
            });
          }

          step.currentStep = "saving";
          sendProgressToUser(userId, {
            type: "sync_progress",
            message: `Salvando vendas da conta ${downloadBuilder.ctx.current.accountName}...`,
            current: downloadBuilder.ctx.progress.fetched,
            total: downloadBuilder.ctx.progress.expected,
            fetched: downloadBuilder.ctx.progress.fetched,
            expected: downloadBuilder.ctx.progress.expected,
            skipped: downloadBuilder.ctx.progress.skipped,
            skippedOtherUser: downloadBuilder.ctx.progress.skippedOtherUser,
            accountId: account.id,
            accountNickname: downloadBuilder.ctx.current.accountName,
            steps,
          });

          saveBuilder = new SaveMeliOrdersBuilder({
            account,
            accountIndex,
            meliSyncService: service,
            userId,
          });

          if (downloadBuilder.allOrders.length > 0) {
            console.log(
              `[Sync] Salvando ${downloadBuilder.allOrders.length} vendas direto no PostgreSQL...`,
            );
            await saveBuilder.saveOrdersDirect(downloadBuilder.allOrders);
          } else {
            console.log("[Sync] Nenhuma venda alterada para salvar nesta conta.");
          }
          saveBuilder.finish();

          const allSalesSaved =
            saveBuilder.ctx.progress.errors === 0 &&
            saveBuilder.ctx.progress.saved === downloadBuilder.allOrders.length;

          if (!downloadBuilder.ctx.fetchComplete && accountErrors.length === 0) {
            addError(
              downloadBuilder.ctx.forcedStop
                ? "Leitura interrompida por tempo/limite; cursor preservado"
                : "Leitura de páginas incompleta; cursor preservado",
            );
          }
          if (!allSalesSaved) {
            const missing = Math.max(
              0,
              downloadBuilder.allOrders.length -
                saveBuilder.ctx.progress.saved,
            );
            addError(
              `${saveBuilder.ctx.progress.errors || missing} venda(s) falharam ao salvar; cursor preservado`,
            );
          }

          const canAdvanceCursor =
            downloadBuilder.ctx.fetchComplete &&
            allSalesSaved &&
            downloadBuilder.ctx.syncStartedAt !== null;

          if (canAdvanceCursor) {
            await gravarCursorSync(
              "meli",
              account.id,
              downloadBuilder.ctx.syncStartedAt!,
            );
          }

          step.currentStep = canAdvanceCursor ? "completed" : "error";
          step.progress = canAdvanceCursor ? 100 : step.progress;
          step.error = accountErrors[0]?.message;

          sendProgressToUser(userId, {
            type: canAdvanceCursor ? "sync_progress" : "sync_warning",
            message: canAdvanceCursor
              ? `${step.accountName}: sincronização concluída`
              : `${step.accountName}: sincronização parcial; o cursor não avançou`,
            current: downloadBuilder.ctx.progress.fetched,
            total: downloadBuilder.ctx.progress.expected,
            fetched: downloadBuilder.ctx.progress.fetched,
            expected: downloadBuilder.ctx.progress.expected,
            skipped: downloadBuilder.ctx.progress.skipped,
            skippedOtherUser: downloadBuilder.ctx.progress.skippedOtherUser,
            accountId: account.id,
            accountNickname: step.accountName,
            steps,
          });

          return snapshot(canAdvanceCursor);
        } catch (error) {
          collectBuilderErrors();
          const message =
            error instanceof Error ? error.message : "Erro desconhecido";
          addError(message);
          step.currentStep = "error";
          step.error = message;
          step.fetched = downloadBuilder?.ctx.progress.fetched ?? step.fetched;
          step.expected =
            downloadBuilder?.ctx.progress.expected ?? step.expected;
          step.progress =
            downloadBuilder?.ctx.progress.percentage ?? step.progress;

          console.error(
            `[Sync] Erro na conta ${account.ml_user_id}; demais contas continuarão:`,
            error,
          );
          sendProgressToUser(userId, {
            type: "sync_warning",
            message: `Erro na conta ${step.accountName}: ${message}. Continuando com as demais...`,
            errorCode: "ACCOUNT_SYNC_FAILED",
            accountId: account.id,
            accountNickname: step.accountName,
            steps,
          });
          return snapshot(false);
        }
      },
    );

    const totals = accountResults.reduce(
      (sum, result) => ({
        expected: sum.expected + result.expected,
        fetched: sum.fetched + result.fetched,
        saved: sum.saved + result.saved,
        skipped: sum.skipped + result.skipped,
        skippedOtherUser:
          sum.skippedOtherUser + result.skippedOtherUser,
      }),
      {
        expected: 0,
        fetched: 0,
        saved: 0,
        skipped: 0,
        skippedOtherUser: 0,
      },
    );
    const errors = accountResults.flatMap((result) => result.errors);
    const hasMoreToSync = accountResults.some((result) => !result.complete);

    sendProgressToUser(userId, {
      type: "sync_complete",
      message:
        `Sincronização concluída: ${totals.saved} vendas salvas, ` +
        `${totals.skipped} inalteradas de ${totals.expected} esperadas`,
      current: totals.fetched,
      total: totals.expected,
      fetched: totals.fetched,
      expected: totals.expected,
      skipped: totals.skipped,
      skippedOtherUser: totals.skippedOtherUser,
      hasMoreToSync,
      steps,
    });

    return NextResponse.json({
      success: errors.length === 0,
      syncedAt: new Date().toISOString(),
      accounts: accounts.map((account) => ({
        id: account.id,
        nickname: account.nickname,
        ml_user_id: Number(account.ml_user_id),
        expires_at: account.expires_at.toISOString(),
      })),
      orders: [] as MeliOrderPayload[],
      errors: errors.map((error) => ({
        ...error,
        mlUserId: Number(error.mlUserId),
      })),
      totals,
      hasMoreToSync,
      quickMode: false,
      autoSyncTriggered: false,
    });
  } finally {
    // Inclusive em erro parcial/inesperado: alguma conta pode ter sido salva.
    try {
      invalidateVendasCache(userId);
      console.log(`[Cache] Cache de vendas invalidado para usuário ${userId}`);
    } catch (error) {
      console.error("[Cache] Falha ao invalidar cache de vendas:", error);
    }
    await syncLock.release();
  }
}
