import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import { applySkuCostRetroactively } from "@/lib/sku-retroactive-cost";
import { invalidateVendasCache } from "@/lib/cache";

export async function POST(
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
    const skuObj = await prisma.sKU.findUnique({
      where: { id },
    });

    if (!skuObj || skuObj.userId !== session.sub) {
      return NextResponse.json({ error: "SKU não encontrado" }, { status: 404 });
    }

    const custoUnitario = Number(skuObj.custoUnitario);
    
    if (isNaN(custoUnitario) || custoUnitario <= 0) {
      return NextResponse.json({ error: "Custo do SKU inválido ou zero." }, { status: 400 });
    }

    const retroactiveResult = await prisma.$transaction((tx) =>
      applySkuCostRetroactively(tx, {
        userId: session.sub,
        sku: skuObj.sku,
        custoUnitario,
      }),
    );
    invalidateVendasCache(session.sub);

    return NextResponse.json({
      success: true,
      message: `Custo aplicado retroativamente em ${retroactiveResult.total} venda(s).`,
      vendasAtualizadas: retroactiveResult.total,
      detalhamento: retroactiveResult,
    });
  } catch (error) {
    console.error("Erro ao aplicar custo retroativo:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
