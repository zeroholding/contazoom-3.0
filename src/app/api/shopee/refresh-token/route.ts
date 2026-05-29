import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import { refreshShopeeAccountToken } from "@/lib/shopee";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await assertSessionToken(req.cookies.get("session")?.value);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const { accountId } = await req.json();

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId é obrigatório" },
        { status: 400 }
      );
    }

    const account = await prisma.shopeeAccount.findFirst({
      where: {
        id: accountId,
        userId: session.sub,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Conta não encontrada" },
        { status: 404 }
      );
    }

    if (!account.refresh_token || account.refresh_token.trim() === '') {
      return NextResponse.json(
        { 
          success: false,
          error: "Refresh token inválido. É necessário reconectar a conta.",
          requiresReconnection: true
        },
        { status: 400 }
      );
    }

    // Usar renovação
    const updated = await refreshShopeeAccountToken(account);

    return NextResponse.json({
      success: true,
      message: "Token renovado com sucesso",
      account: {
        id: updated.id,
        shop_id: updated.shop_id.toString(),
        expires_at: updated.expires_at,
      },
    });

  } catch (error) {
    console.error("[Shopee] Erro ao renovar token:", error);
    
    if (error instanceof Error) {
      if (error.message.includes("invalid") || error.message.includes("expired")) {
        return NextResponse.json(
          {
            success: false,
            error: "Refresh token expirado ou inválido. É necessário reconectar a conta.",
            requiresReconnection: true,
          },
          { status: 400 }
        );
      }
      
      if (error.message.includes("network") || error.message.includes("timeout")) {
        return NextResponse.json(
          {
            success: false,
            error: "Erro de conexão. Tente novamente em alguns minutos.",
            retryable: true,
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao renovar token",
      },
      { status: 500 }
    );
  }
}
