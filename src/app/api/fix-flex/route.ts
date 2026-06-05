import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { smartRefreshMeliAccountToken } from "@/lib/meli";
import { fetchWithRetry } from "@/lib/v2/utils/fetch-with-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MELI_API_BASE = process.env.MELI_API_BASE?.replace(/\/$/, "") || "https://api.mercadolibre.com";

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function GET() {
  try {
    const vendas = await prisma.meliVenda.findMany({
      where: {
        logisticType: {
          in: ["FLEX", "self_service", "fulfillment", "cross_docking", "xd_drop_off", "drop_off"]
        }
      },
      select: {
        id: true,
        orderId: true,
        frete: true,
        rawData: true,
        meliAccountId: true,
        logisticType: true,
      }
    });

    let atualizados = 0;
    const logModificacoes = [];

    // Group sales by account
    const accountsMap = new Map<string, any>();
    for (const venda of vendas) {
      if (!accountsMap.has(venda.meliAccountId)) {
        const account = await prisma.meliAccount.findUnique({ where: { id: venda.meliAccountId } });
        if (account) {
          const refreshed = await smartRefreshMeliAccountToken(account);
          accountsMap.set(venda.meliAccountId, refreshed);
        }
      }
    }

    for (const venda of vendas) {
      if (!venda.rawData) continue;
      const account = accountsMap.get(venda.meliAccountId);
      if (!account) continue;

      const raw = typeof venda.rawData === "string" ? JSON.parse(venda.rawData) : venda.rawData;
      const shippingId = raw?.shipping?.id || raw?.shipment?.id;

      let chargeFlex = null;
      let sellerCost = null;
      let sellerSave = null;
      let sellerComp = null;
      let grossAmount = null;

      if (shippingId) {
        // Fetch costs API
        const headers = { Authorization: `Bearer ${account.access_token}` };
        try {
          const costsRes = await fetchWithRetry(`${MELI_API_BASE}/shipments/${shippingId}/costs`, { headers }, 3, account.userId);
          if (costsRes && costsRes.ok) {
            const costsData = await costsRes.json();
            chargeFlex = costsData.senders?.[0]?.charges?.charge_flex;
            sellerCost = costsData.senders?.[0]?.cost;
            sellerSave = costsData.senders?.[0]?.save;
            sellerComp = costsData.senders?.[0]?.compensation;
            grossAmount = costsData.gross_amount;
            
            // Save inside rawData for future cache
            if (!raw.shipment) raw.shipment = {};
            if (chargeFlex !== undefined) raw.shipment._charge_flex = chargeFlex;
            if (sellerCost !== undefined) raw.shipment._seller_shipping_cost = sellerCost;
            if (sellerSave !== undefined) raw.shipment._seller_shipping_save = sellerSave;
            if (sellerComp !== undefined) raw.shipment._seller_shipping_compensation = sellerComp;
            if (grossAmount !== undefined) raw.shipment._costs_gross_amount = grossAmount;
            
            await prisma.meliVenda.update({
              where: { id: venda.id },
              data: { rawData: JSON.stringify(raw) }
            });
          }
        } catch (e) {
          console.error(`Error fetching costs for ${shippingId}`, e);
        }
      }

      // fallback to existing if not fetched
      if (chargeFlex === null || chargeFlex === undefined) chargeFlex = raw.shipment?._charge_flex;
      if (sellerCost === null || sellerCost === undefined) sellerCost = raw.shipment?._seller_shipping_cost;
      if (sellerSave === null || sellerSave === undefined) sellerSave = raw.shipment?._seller_shipping_save;
      if (sellerComp === null || sellerComp === undefined) sellerComp = raw.shipment?._seller_shipping_compensation;
      if (grossAmount === null || grossAmount === undefined) grossAmount = raw.shipment?._costs_gross_amount;

      const toNum = (val: any) => {
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          const parsed = parseFloat(val);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };

      const cF = toNum(chargeFlex);
      const sC = toNum(sellerCost) ?? 0;
      const sS = toNum(sellerSave) ?? 0;
      const sComp = toNum(sellerComp) ?? 0;
      const gA = toNum(grossAmount);

      let novoFrete = 0;
      let logMotivo = "";

      if (venda.logisticType === "self_service" || venda.logisticType === "FLEX") {
        if (cF !== null && cF > 0) {
          novoFrete = cF;
          logMotivo = `FLEX (charge_flex: ${cF})`;
        } else if (gA !== null && gA > 0) {
          novoFrete = gA;
          logMotivo = `FLEX (gross_amount: ${gA})`;
        } else {
          // Keep old fallback just in case
          const optCost = toNum(raw.freight?.shippingOptionCost);
          const baseCost = toNum(raw.freight?.baseCost);
          const listCost = toNum(raw.freight?.listCost);
          const chargedCost = toNum(raw.freight?.chargedCost) ?? 0;
          const lc = listCost !== null && listCost > 0 ? listCost : (optCost !== null && optCost > 0 ? optCost : (baseCost !== null ? baseCost : 0));
          const repasse = roundCurrency(lc - chargedCost);
          novoFrete = repasse > 0 ? repasse : 0;
          logMotivo = `FLEX (fallback: ${lc} - ${chargedCost})`;
        }
      } else {
        const netSellerCost = sC - sS - sComp;
        if (netSellerCost > 0) {
          novoFrete = -roundCurrency(netSellerCost);
          logMotivo = `Agência (cost:${sC} - save:${sS} - comp:${sComp})`;
        } else {
          const listCost = toNum(raw.freight?.listCost);
          const chargedCost = toNum(raw.freight?.chargedCost) ?? 0;
          const baseCost = toNum(raw.freight?.baseCost);
          if (listCost !== null) {
            const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
            novoFrete = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
            logMotivo = `Agência (fallback listCost: ${listCost} - ${chargedCost})`;
          } else if (baseCost !== null && baseCost > 0) {
            novoFrete = -baseCost;
            logMotivo = `Agência (fallback baseCost: ${baseCost})`;
          }
        }
      }

      if (Number(venda.frete) !== novoFrete) {
        await prisma.meliVenda.update({
          where: { id: venda.id },
          data: { frete: novoFrete }
        });
        
        atualizados++;
        logModificacoes.push({
          orderId: venda.orderId,
          type: venda.logisticType,
          freteAntigo: Number(venda.frete),
          freteNovo: novoFrete,
          motivo: logMotivo
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Foram analisadas ${vendas.length} vendas. Um total de ${atualizados} vendas foram corrigidas retroativamente.`,
      modificados: logModificacoes
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
