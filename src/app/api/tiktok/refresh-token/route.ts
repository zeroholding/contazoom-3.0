/**
 * Renova o access token de uma loja do TikTok Shop.
 *
 * Alimenta o botão "Renovar agora" da tela de Contas. O sync também renova
 * sozinho (`ensureTiktokAccessToken`), então esta rota existe para o caso em que
 * a pessoa quer resolver na hora, sem esperar a próxima sincronização.
 *
 * ⚠️  O refresh do TikTok devolve um refresh_token NOVO, e o antigo pode deixar
 * de valer. A gravação acontece dentro de `ensureTiktokAccessToken`, junto da
 * renovação, justamente para não existir caminho que renove sem persistir.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import {
  ensureTiktokAccessToken,
  missingTiktokCredentials,
  TiktokApiError,
} from "@/lib/tiktok";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await assertSessionToken(req.cookies.get("session")?.value);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const { accountId } = await req.json();

    if (!accountId) {
      return NextResponse.json({ error: "accountId é obrigatório" }, { status: 400 });
    }

    const missing = missingTiktokCredentials();
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Credenciais TikTok ausentes: ${missing.join(", ")}` },
        { status: 500 },
      );
    }

    const account = await prisma.tiktokAccount.findFirst({
      where: { id: accountId, userId: session.sub },
    });

    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    if (!account.refresh_token || account.refresh_token.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Refresh token inválido. É necessário reconectar a conta.",
          requiresReconnection: true,
        },
        { status: 400 },
      );
    }

    // `expires_at` no passado força a renovação: sem isso, um token ainda dentro
    // da margem de 30 min seria devolvido intacto e o botão não faria nada, o
    // que para quem clicou é indistinguível de falha silenciosa.
    await ensureTiktokAccessToken({
      id: account.id,
      userId: account.userId,
      shopId: account.shop_id,
      shopCipher: account.shop_cipher,
      shopName: account.shop_name,
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: new Date(0),
    });

    const atualizada = await prisma.tiktokAccount.findFirst({
      where: { id: account.id, userId: session.sub },
      select: { id: true, shop_id: true, expires_at: true },
    });

    return NextResponse.json({
      success: true,
      message: "Token renovado com sucesso",
      account: atualizada,
    });
  } catch (error) {
    console.error("[TikTok] Erro ao renovar token:", error);

    // A autorização foi retirada pelo vendedor: renovar não resolve, e
    // `ensureTiktokAccessToken` já marcou a conta como `reconectar`.
    if (error instanceof TiktokApiError && error.requiresReauthorization) {
      return NextResponse.json(
        {
          success: false,
          error: "O TikTok recusou a autorização guardada. É necessário reconectar a conta.",
          requiresReconnection: true,
        },
        { status: 400 },
      );
    }

    if (error instanceof Error) {
      if (error.message.includes("invalid") || error.message.includes("expired")) {
        return NextResponse.json(
          {
            success: false,
            error: "Refresh token expirado ou inválido. É necessário reconectar a conta.",
            requiresReconnection: true,
          },
          { status: 400 },
        );
      }

      if (
        error.message.includes("network") ||
        error.message.includes("timeout") ||
        error.name === "AbortError"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Erro de conexão. Tente novamente em alguns minutos.",
            retryable: true,
          },
          { status: 503 },
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao renovar token",
      },
      { status: 500 },
    );
  }
}
