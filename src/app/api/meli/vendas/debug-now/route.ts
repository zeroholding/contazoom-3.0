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
        dataVenda: true,
        rawData: true,
        logisticType: true
      },
      orderBy: { dataVenda: 'desc' }
    });

    let log = "CURRENT DB VALUES WITH RAW DATA:\n\n";
    let sum = 0;

    for (const v of vendas) {
      const raw = v.rawData as any;
      const freight = raw?.freight || {};
      const shipment = raw?.shipment || {};
      const orderShipping = raw?.order?.shipping || {};
      
      const details = {
        logisticType: v.logisticType,
        baseCost: shipment.base_cost,
        optCost: shipment.shipping_option?.cost,
        listCost: shipment.shipping_option?.list_cost,
        shipCost: shipment.cost,
        orderCost: orderShipping.cost,
        sellerCost: shipment._seller_shipping_cost,
        sellerSave: shipment._seller_shipping_save,
        grossAmount: shipment._costs_gross_amount,
        freightAdjustedCost: freight.adjustedCost,
        freightSellerShippingCost: freight.sellerShippingCost
      };

      log += `[${v.orderId}] Frete DB: ${v.frete} | Details: ${JSON.stringify(details)}\n`;
      sum += Number(v.frete);
    }
    
    log += `\nTOTAL FRETE DB NOW: ${sum}\n`;

    return new NextResponse(log, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
