import { assertSessionToken } from "@/lib/auth";
import { invalidateVendasCache } from "@/lib/cache";
import { closeUserConnections, sendProgressToUser } from "@/lib/sse-progress";
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

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;

  let requestBody: {
    accountIds?: string[];
    orderIdsByAccount?: Record<string, string[]>;
  } = {};

  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
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

  await new Promise((resolve) => setTimeout(resolve, 500));

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
      totals: { expected: 0, fetched: 0, saved: 0 },
    });
  }

  const steps = accounts.map((acc) => ({
    accountId: acc.id,
    accountName: acc.nickname || `Conta ${acc.ml_user_id}`,
    currentStep: "pending" as
      | "pending"
      | "fetching"
      | "saving"
      | "completed"
      | "error",
    progress: 0,
    fetched: 0,
    expected: 0,
    error: undefined as string | undefined,
  }));
  const progressSum = {
    sumFetchedOrders: 0,
    sumExpectedOrders: 0,
    sumSavedOrders: 0,
  };

  for (let accountIndex = 0; accountIndex < accounts.length; accountIndex++) {
    const account = accounts[accountIndex];

    const downloadOrderbuilder = new DownloadMeliOrdersBuilder({
      account,
      meliSyncService: service,
      userId,
      steps,
    });

    // Atualizar step para fetching
    steps[accountIndex].currentStep = "fetching";

    // Enviar progresso: processando conta
    sendProgressToUser(userId, {
      type: "sync_progress",
      message: `Buscando vendas da conta ${
        downloadOrderbuilder.ctx.current.accountName
      }...`,
      current: accountIndex,
      total: accounts.length,
      fetched: downloadOrderbuilder.ctx.progress.fetched,
      expected: downloadOrderbuilder.ctx.progress.expected,
      accountId: account.id,
      accountNickname: downloadOrderbuilder.ctx.current.accountName,
      steps: steps,
    });

    await downloadOrderbuilder.refreshHandler();

    if (downloadOrderbuilder.ctx.current.error) {
      steps[accountIndex].currentStep =
        downloadOrderbuilder.ctx.current.syncStep;
      steps[accountIndex].error = downloadOrderbuilder.ctx.current.error;
      continue;
    }

    try {
      await downloadOrderbuilder.fetchAllOrders();
      progressSum.sumFetchedOrders += downloadOrderbuilder.ctx.progress.fetched
      progressSum.sumExpectedOrders += downloadOrderbuilder.ctx.progress.expected
    } catch (fetchError) {
      const fetchMsg =
        fetchError instanceof Error
          ? fetchError.message
          : "Erro ao buscar vendas";
      console.error(
        `[Sync] ❌ Erro ao buscar vendas da conta ${downloadOrderbuilder.ctx.current.mlUserId}:`,
        fetchError,
      );
      throw new Error(`Falha ao buscar vendas: ${fetchMsg}`);
    }

    await downloadOrderbuilder.enqueueOrders();

    downloadOrderbuilder.finish();

    const saveOrdersbuilder = new SaveMeliOrdersBuilder({
      account,
      meliSyncService: service,
      userId,
    });

    // === FASE 2: Processar Redis → PostgreSQL ===
    console.log(`[Sync] 💾 Fase 2: Processando fila Redis → PostgreSQL...`);

    try {
      if (downloadOrderbuilder.allOrders.length > 0) {
        console.log(
          `[Sync] 💾 Redis indisponível/vazio: salvando ${downloadOrderbuilder.allOrders.length} vendas direto no PostgreSQL...`,
        );
        await saveOrdersbuilder.saveOrdersDirect(downloadOrderbuilder.allOrders);
      } else {
        await saveOrdersbuilder.saveOrdersFromCache();
      }
      progressSum.sumSavedOrders += saveOrdersbuilder.ctx.progress.saved;
    } catch (workerError) {
      console.error(
        `[Sync] ❌ Erro no worker Redis → PostgreSQL:`,
        workerError,
      );
      throw new Error(`Erro ao processar fila: ${workerError}`);
    }
  }

  sendProgressToUser(userId, {
    type: "sync_complete",
    message: `Sincronização completa! ${progressSum.sumSavedOrders} vendas processadas de ${progressSum.sumExpectedOrders} esperadas`,
    current: progressSum.sumSavedOrders,
    total: progressSum.sumExpectedOrders,
    fetched: progressSum.sumFetchedOrders,
    expected: progressSum.sumExpectedOrders,
    hasMoreToSync: false,
  });

  // Invalidar cache de vendas após sincronização
  invalidateVendasCache(userId);
  console.log(`[Cache] Cache de vendas invalidado para usuário ${userId}`);

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    accounts: accounts.map(account => ({
      id: account.id,
      nickname: account.nickname,
      ml_user_id: Number(account.ml_user_id),
      expires_at: account.expires_at.toISOString(),
    })),
    orders: [] as MeliOrderPayload[],
    errors: [], // TODO: implement error handler
    totals: {
      expected: progressSum.sumExpectedOrders,
      fetched: progressSum.sumFetchedOrders,
      saved: progressSum.sumSavedOrders,
    },
    hasMoreToSync: false, // NOVO: flag indicando se há vendas antigas pendentes
    quickMode: false, // NOVO: indica qual modo foi usado
    autoSyncTriggered: false,
  });
}
