import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const start = new Date(Date.UTC(2026, 5, 1, 3, 0, 0, 0));
    const end = new Date(Date.UTC(2026, 5, 2, 2, 59, 59, 999));

    const vendas = await prisma.meliVenda.findMany({
      where: {
        conta: 'ELIDELU',
        dataVenda: {
          gte: start,
          lte: end,
        },
        OR: [
          { status: { contains: 'paid', mode: 'insensitive' } },
          { status: { contains: 'payment_approved', mode: 'insensitive' } },
          { status: { contains: 'delivered', mode: 'insensitive' } }
        ]
      },
      select: {
        orderId: true,
        valorTotal: true,
        frete: true,
        dataVenda: true
      },
      orderBy: { dataVenda: 'desc' }
    });

    let log = "CURRENT DB VALUES:\\n\\n";
    let sum = 0;

    for (const v of vendas) {
      log += `[${v.orderId}] ${v.dataVenda.toISOString()} | Frete: ${v.frete}\\n`;
      sum += Number(v.frete);
    }
    
    log += `\\nTOTAL FRETE DB NOW: ${sum}\\n`;

    return new NextResponse(log, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
