import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
        rawData: true
      },
      orderBy: { dataVenda: 'desc' }
    });

    let log = "DEBUG FREIGHT RECALCULATION:\\n\\n";
    
    function roundCurrency(value: number): number {
      const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
      return Object.is(rounded, -0) ? 0 : rounded;
    }

    for (const venda of vendas) {
      const rawData = (venda.rawData as any) || {};
      const freightData = rawData.freight || {};
      
      const toNum = (val: any) => {
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          const parsed = parseFloat(val);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };

      const logisticType = typeof freightData.logisticType === "string" ? freightData.logisticType : null;
      const optCost = toNum(freightData.shippingOptionCost);
      const baseCost = toNum(freightData.baseCost);
      const shipCost = toNum(freightData.shipmentCost);
      const listCost = toNum(freightData.listCost);
      const orderCost = toNum(freightData.orderCostFallback);

      let chargedCost = toNum(freightData.chargedCost);
      if (chargedCost === null) {
        chargedCost = optCost !== null ? optCost : shipCost !== null ? shipCost : orderCost !== null ? orderCost : null;
      }
      if (chargedCost !== null) chargedCost = roundCurrency(chargedCost);

      let calculated = 0;

      if (logisticType === "self_service" || logisticType === "FLEX") {
        const valorTotalNum = Number(venda.valorTotal);
        if (valorTotalNum >= 79) {
          if (chargedCost !== null && chargedCost > 0) calculated = chargedCost;
        } else {
          if (optCost !== null && optCost > 0) calculated = optCost;
          else if (baseCost !== null && baseCost > 0) calculated = baseCost;
          else if (shipCost !== null && shipCost > 0) calculated = shipCost;
        }
      } else if (["fulfillment", "cross_docking", "xd_drop_off", "drop_off"].includes(logisticType ?? "")) {
        if (listCost !== null && chargedCost !== null) {
          const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
          calculated = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
        } else if (baseCost !== null && baseCost > 0) {
          calculated = -baseCost;
        }
      } else {
        if (listCost !== null && chargedCost !== null) {
          const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
          calculated = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
        } else if (orderCost !== null && orderCost > 0) {
          calculated = -orderCost;
        }
      }

      log += `[${venda.orderId}] Frete Banco: ${venda.frete} | Frete Tabela Recalculado: ${calculated}\\n`;
      log += `JSON: ${JSON.stringify(freightData)}\\n\\n`;
    }

    return new NextResponse(log, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
