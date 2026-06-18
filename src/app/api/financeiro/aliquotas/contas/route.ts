import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let userId: string;
  try {
    const session = await verifySessionToken(sessionCookie);
    userId = session.sub;
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const [meliAccounts, shopeeAccounts] = await Promise.all([
      prisma.meliAccount.findMany({
        where: { userId },
        select: { id: true, nickname: true, ml_user_id: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.shopeeAccount.findMany({
        where: { userId },
        select: { id: true, shop_name: true, shop_id: true },
        orderBy: { created_at: "desc" },
      }),
    ]);

    const contas = [
      ...meliAccounts.map((account) => ({
        id: account.id,
        nome: account.nickname?.trim() || account.ml_user_id.toString(),
        plataforma: "Mercado Livre",
        tipo: "meli",
      })),
      ...shopeeAccounts.map((account) => ({
        id: account.id,
        nome: account.shop_name?.trim() || account.shop_id,
        plataforma: "Shopee",
        tipo: "shopee",
      })),
    ].sort((a, b) =>
      `${a.plataforma} ${a.nome}`.localeCompare(
        `${b.plataforma} ${b.nome}`,
        "pt-BR",
      ),
    );

    return NextResponse.json({ data: contas });
  } catch (error) {
    console.error("Erro ao buscar contas para alíquotas:", error);
    return NextResponse.json(
      { error: "Erro ao buscar contas autenticadas" },
      { status: 500 },
    );
  }
}
