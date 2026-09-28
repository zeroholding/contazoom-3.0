/**
 * POST /api/tiktok/vendas/sync
 *
 * Dispara o sync de vendas do TikTok Shop do usuário logado. Aceita
 * `{ accountIds: string[] }` para sincronizar só as lojas escolhidas na tela.
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
  const keepConnectionsOpen =
    req.headers.get("x-contazoom-sync-all") === "1";

  let accountIds: string[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.accountIds)) accountIds = body.accountIds;
  } catch {
    // Segue sem filtro: sincroniza todas as lojas do usuário.
  }

  let syncLock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

  try {
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

    const missing = missingTiktokCredentials();
    if (missing.length > 0) {
      const message = `Credenciais TikTok ausentes: ${missing.join(", ")}`;
      sendProgressToUser(userId, {
        type: "sync_error",
        message,
        errorCode: "TIKTOK_CREDENTIALS_MISSING",
      });
      return NextResponse.json({ message }, { status: 500 });
    }

    syncLock = await acquireSyncLock(["vendas", "tiktok", userId]);

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

    console.log(
      `[TikTok Sync] Iniciando para usuario ${userId} (${contas.length} loja(s))`,
    );

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
    // No sync agregado, os outros canais ainda usam a mesma conexão SSE.
    if (!keepConnectionsOpen) {
      setTimeout(() => closeUserConnections(userId), 2000);
    }

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
