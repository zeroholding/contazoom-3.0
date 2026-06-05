import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const vendas = await prisma.meliVenda.findMany({
      where: { orderId: '2000016719270888' },
      select: { orderId: true, frete: true, rawData: true }
    });

    if (vendas.length === 0) return NextResponse.json({ error: "Not found" });

    const rawData = vendas[0].rawData as any;
    
    // I will copy the EXACT logic of calculateFreight from sync/route.ts here to see what it outputs
    const o = rawData.order ?? {};
    const s = rawData.shipment ?? {};

    const orderShipping = o && typeof o.shipping === "object" ? o.shipping ?? {} : {};
    const shippingMode = typeof orderShipping.mode === "string" ? orderShipping.mode : null;
    const logisticTypeRaw = typeof s.logistic_type === "string" ? s.logistic_type : null;
    const logisticTypeFallback = shippingMode;
    const logisticType = logisticTypeRaw ?? logisticTypeFallback ?? null;

    const shipOpt = s && typeof s.shipping_option === "object" ? s.shipping_option ?? {} : {};
    
    const toFiniteNumber = (val: any) => {
      if (typeof val === "number") return val;
      if (typeof val === "string") {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : parsed;
      }
      return null;
    };
    
    const roundCurrency = (value: number) => {
      const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
      return Object.is(rounded, -0) ? 0 : rounded;
    };

    const baseCost = toFiniteNumber(s.base_cost);
    const optCost = toFiniteNumber((shipOpt as any).cost);
    const listCost = toFiniteNumber((shipOpt as any).list_cost);
    const shipCost = toFiniteNumber(s.cost);
    const orderCost = toFiniteNumber(orderShipping.cost);

    let chargedCost: number | null = null;

    if (optCost !== null) {
      chargedCost = optCost;
    } else if (shipCost !== null) {
      chargedCost = shipCost;
    } else if (orderCost !== null) {
      chargedCost = orderCost;
    }

    if (chargedCost !== null) chargedCost = roundCurrency(chargedCost);

    let adjustedCost: number | null = null;

    if (["fulfillment", "cross_docking", "xd_drop_off", "drop_off"].includes(logisticType ?? "")) {
      if (listCost !== null && chargedCost !== null) {
        const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
        adjustedCost = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
      } else if (baseCost !== null && baseCost > 0) {
        adjustedCost = -baseCost;
      } else {
        adjustedCost = 0;
      }
    }

    return NextResponse.json({
      baseCost, optCost, listCost, shipCost, orderCost, chargedCost, logisticType, adjustedCost,
      freteDb: vendas[0].frete
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message });
  }
}
