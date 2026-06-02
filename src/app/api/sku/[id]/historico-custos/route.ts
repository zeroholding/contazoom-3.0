import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const session = await verifySessionToken(sessionCookie);

    const { id } = await params;

    // Verificar se o SKU pertence ao usuário
    const sku = await prisma.sKU.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!sku || sku.userId !== session.sub) {
      return NextResponse.json({ error: "SKU não encontrado" }, { status: 404 });
    }

    const historico = await prisma.sKUCustoHistorico.findMany({
      where: {
        skuId: id,
        userId: session.sub,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(historico);
  } catch (error) {
    console.error("Erro ao buscar histórico de custos do SKU:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
