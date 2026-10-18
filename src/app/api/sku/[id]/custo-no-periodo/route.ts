import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import { invalidateVendasCache } from "@/lib/cache";
import {
  aplicarCustoNoPassado,
  diaSP,
  lerPedidoCustoNoPassado,
  simularCustoNoPassado,
} from "@/lib/sku-custo-periodo";

/**
 * POST /api/sku/:id/custo-no-periodo
 *
 * Usa um custo nas vendas PASSADAS do SKU: todas ("desde o início") ou as de um
 * período. Corpo: `{ escopo: "tudo" | "periodo", custo, de?, ate?, simular? }`,
 * com datas "AAAA-MM-DD" (fuso de São Paulo).
 *
 * `simular: true` só conta as vendas e mostra o CMV antes e depois, sem gravar.
 * Sem ele, grava o custo no histórico e regrava o CMV das vendas da janela.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const session = await verifySessionToken(sessionCookie);

    const { id } = await params;
    const sku = await prisma.sKU.findUnique({
      where: { id },
      select: { id: true, userId: true, sku: true, custoUnitario: true, quantidade: true },
    });
    if (!sku || sku.userId !== session.sub) {
      return NextResponse.json({ error: "SKU não encontrado" }, { status: 404 });
    }

    const corpo = await request.json().catch(() => null);
    const agora = new Date();
    const leitura = lerPedidoCustoNoPassado(corpo, diaSP(agora));
    if (!leitura.ok) {
      return NextResponse.json({ error: leitura.erro }, { status: 400 });
    }

    if (corpo?.simular === true) {
      const simulacao = await simularCustoNoPassado(sku, leitura.pedido, agora);
      return NextResponse.json({ simulacao });
    }

    const resultado = await aplicarCustoNoPassado(sku, leitura.pedido, session.sub, agora);
    invalidateVendasCache(session.sub);

    return NextResponse.json({
      success: true,
      ...resultado,
      message:
        resultado.vendasAtualizadas === 1
          ? "Custo usado em 1 venda."
          : `Custo usado em ${resultado.vendasAtualizadas} vendas.`,
    });
  } catch (error) {
    console.error("Erro ao usar custo em vendas passadas:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
