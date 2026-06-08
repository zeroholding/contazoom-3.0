import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import { buildPendingSkuSummary } from "@/lib/sku-pending";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);

    const [totalSkus, pendingSummary] = await Promise.all([
      prisma.sKU.count({
        where: {
          userId: session.sub,
          ativo: true,
        },
      }),
      buildPendingSkuSummary(session.sub),
    ]);

    return NextResponse.json({
      totalSkus,
      skusSemCusto: pendingSummary.total,
      skusPendentes: pendingSummary.total,
      semCusto: pendingSummary.semCusto,
      naoCadastrados: pendingSummary.naoCadastrados,
    });
  } catch (error) {
    console.error("Erro ao buscar estatisticas de SKU:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}
