import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    // Usar raw query temporariamente até regenerar Prisma Client
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      shop_id: string;
      shop_name: string | null;
      merchant_id: string | null;
      access_token: string;
      refresh_token: string;
      expires_at: Date;
    }>>`
      SELECT
        id,
        shop_id,
        shop_name,
        merchant_id,
        access_token,
        refresh_token,
        expires_at
      FROM shopee_account
      WHERE user_id = ${session.sub}
      ORDER BY created_at DESC
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Erro ao buscar contas Shopee:", error);
    return NextResponse.json(
      { error: "Erro ao buscar contas" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID da conta não fornecido" }, { status: 400 });
    }

    // Verify ownership
    const accounts = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM shopee_account WHERE id = ${id} AND user_id = ${session.sub}
    `;

    if (accounts.length === 0) {
      return NextResponse.json({ error: "Conta não encontrada ou sem permissão" }, { status: 404 });
    }

    await prisma.$executeRaw`DELETE FROM shopee_account WHERE id = ${id} AND user_id = ${session.sub}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar conta Shopee:", error);
    return NextResponse.json(
      { error: "Erro ao deletar conta" },
      { status: 500 }
    );
  }
}

