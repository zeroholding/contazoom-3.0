/**
 * POST /api/tiktok/vendas/sync
 *
 * Dispara o sync de vendas do TikTok Shop do usuário logado. Aceita
 * `{ accountIds: string[] }` para sincronizar só as lojas escolhidas na tela.
 *
 * A rota é fina de propósito: a lógica mora em `src/lib/tiktok-sync.ts`. Os syncs
 * de ML e Shopee cresceram dentro do próprio `route.ts` (o da Shopee tem ~800
 * linhas), o que deixa a regra financeira impossível de testar sem subir um
 * servidor. Separando, `syncTiktokAccounts` pode ser chamada por um agendador
 * mais tarde sem duplicar nada.
 *
 * ⚠️  O primeiro sync de uma loja varre TIKTOK_LOOKBACK_DAYS (120 por padrão) e
 * pode passar do timeout do proxy. Se o fetch morrer com 504, o job CONTINUA
 * rodando no servidor — acompanhe pelo SSE de progresso em vez de disparar de
 * novo.
 */
import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import { invalidateVendasCache } from "@/lib/cache";
import prisma from "@/lib/prisma";
import { closeUserConnections, sendProgressToUser } from "@/lib/sse-progress";
import { acquireSyncLock } from "@/lib/sync-lock";
import { missingTiktokCredentials } from "@/lib/tiktok";
import { syncTiktokAccounts } from "@/lib/tiktok-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const userId = session.sub;

  let accountIds: string[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.accountIds)) accountIds = body.accountIds;
  } catch {
    // Segue sem filtro: sincroniza todas as lojas do usuário.
  }

  let syncLock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

  try {
    const missing = missingTiktokCredentials();
    if (missing.length > 0) {
      return NextResponse.json(
        { message: `Credenciais TikTok ausentes: ${missing.join(", ")}` },
        { status: 500 },
      );
    }

    sendProgressToUser(userId, {
      type: "sync_start",
      message: "Conectando ao TikTok Shop...",
      current: 0,
      total: 0,
      fetched: 0,
      expected: 0,
    });

    const contas = await prisma.tiktokAccount.findMany({
      where: {
        userId,
        ...(accountIds && accountIds.length > 0 ? { id: { in: accountIds } } : {}),
      },
      select: { id: true },
    });

    if (contas.length === 0) {
      sendProgressToUser(userId, {
        type: "sync_complete",
        message: "Nenhuma conta encontrada",
        current: 0,
        total: 0,
        fetched: 0,
        expected: 0,
      });
      return NextResponse.json(
        { message: "Nenhuma conta TikTok Shop ativa." },
        { status: 404 },
      );
    }

    // Mesma forma de chave dos outros syncs: plataforma + usuário + contas
    // ordenadas. Duas abas disparando o mesmo conjunto colidem; sincronizar
    // lojas diferentes em paralelo continua permitido.
    syncLock = await acquireSyncLock([
      "vendas",
      "tiktok",
      userId,
      ...contas.map((conta) => conta.id).sort(),
    ]);

    if (!syncLock.acquired) {
      sendProgressToUser(userId, {
        type: "sync_warning",
        message:
          "Ja existe uma sincronizacao do TikTok Shop em andamento. Aguarde finalizar antes de iniciar outra.",
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
          message: "Ja existe uma sincronizacao do TikTok Shop em andamento.",
        },
        { status: 409 },
      );
    }

    console.log(`[TikTok Sync] Iniciando para usuario ${userId} (${contas.length} loja(s))`);

    const summary = await syncTiktokAccounts({ userId, accountIds });
    const erros = summary.perShop.filter((shop) => shop.error);

    sendProgressToUser(userId, {
      type: "sync_complete",
      message: `Sincronizacao concluida! ${summary.totalSaved} vendas processadas`,
      current: summary.totalSaved,
      total: summary.totalSaved,
      fetched: summary.totalSaved,
      expected: summary.totalSaved,
    });

    invalidateVendasCache(userId);
    setTimeout(() => closeUserConnections(userId), 2000);

    return NextResponse.json({
      success: erros.length === 0,
      syncedAt: summary.finishedAt,
      saved: summary.totalSaved,
      settled: summary.totalSettled,
      reprocessed: summary.totalReprocessed,
      accounts: summary.perShop,
      errors: erros,
    });
  } catch (error) {
    console.error("Erro fatal ao sincronizar vendas TikTok Shop:", error);
    sendProgressToUser(userId, {
      type: "sync_error",
      message: error instanceof Error ? error.message : "Erro interno no servidor.",
      errorCode: "TIKTOK_SYNC_FATAL",
    });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erro interno no servidor." },
      { status: 500 },
    );
  } finally {
    if (syncLock?.acquired) {
      await syncLock.release();
    }
  }
}
