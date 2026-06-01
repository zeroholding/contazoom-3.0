import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const brazilToday = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    
    // Pegar o 'Hoje' igual o dashboard
    const start = new Date(Date.UTC(2026, 5, 1, 3, 0, 0, 0));
    const end = new Date(Date.UTC(2026, 5, 2, 2, 59, 59, 999));

    const vendas = await prisma.meliVenda.findMany({
      where: {
        conta: 'ELIDELU',
        dataVenda: {
          gte: start,
          lte: end,
        },
        status: 'pagos',
      },
      select: {
        orderId: true,
        dataVenda: true,
        valorTotal: true,
        frete: true,
        taxaPlataforma: true,
      },
      distinct: ['orderId'],
      orderBy: { dataVenda: 'desc' }
    });

    let log = "VENDAS CONSIDERADAS NO DASHBOARD (HOJE - PAGOS):\\n\\n";
    let faturamentoTotal = 0;
    let freteTotal = 0;
    let taxaTotal = 0;

    for (const v of vendas) {
      log += `[${v.dataVenda.toISOString()}] ID: ${v.orderId} | Valor: ${v.valorTotal} | Frete: ${v.frete} | Taxa: ${v.taxaPlataforma}\\n`;
      faturamentoTotal += Number(v.valorTotal);
      freteTotal += Number(v.frete);
      taxaTotal += Number(v.taxaPlataforma);
    }

    log += `\\nRESUMO DASHBOARD:`;
    log += `\\nQtd Vendas: ${vendas.length}`;
    log += `\\nFaturamento Total: ${faturamentoTotal.toFixed(2)}`;
    log += `\\nFrete Total: ${freteTotal.toFixed(2)}`;
    log += `\\nTaxa Total: ${taxaTotal.toFixed(2)}`;

    return new NextResponse(log, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
