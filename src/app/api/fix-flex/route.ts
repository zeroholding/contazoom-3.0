import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function GET() {
  try {
    const vendasFlex = await prisma.meliVenda.findMany({
      where: {
        logisticType: {
          in: ["FLEX", "self_service"]
        }
      },
      select: {
        id: true,
        orderId: true,
        frete: true,
        rawData: true
      }
    });

    let atualizados = 0;
    const logModificacoes = [];

    for (const venda of vendasFlex) {
      if (!venda.rawData) continue;
      
      const raw = typeof venda.rawData === "string" ? JSON.parse(venda.rawData) : venda.rawData;
      const freightData = raw.freight || {};

      const toNum = (val: any) => {
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          const parsed = parseFloat(val);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };

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

      const lc = listCost !== null && listCost > 0 ? listCost : (optCost !== null && optCost > 0 ? optCost : (baseCost !== null ? baseCost : 0));
      const cc = chargedCost !== null ? chargedCost : 0;
      
      const repasse = roundCurrency(lc - cc);

      let novoFrete = 0;
      if (repasse > 0) {
        novoFrete = repasse;
      }

      if (Number(venda.frete) !== novoFrete) {
        await prisma.meliVenda.update({
          where: { id: venda.id },
          data: { frete: novoFrete }
        });
        
        atualizados++;
        logModificacoes.push({
          orderId: venda.orderId,
          freteAntigo: Number(venda.frete),
          freteNovo: novoFrete,
          motivo: repasse > 0 ? `Subsidio ML (${lc} - ${cc})` : "Zerar"
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Foram analisadas ${vendasFlex.length} vendas FLEX. Um total de ${atualizados} vendas foram corrigidas retroativamente.`,
      modificados: logModificacoes
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
