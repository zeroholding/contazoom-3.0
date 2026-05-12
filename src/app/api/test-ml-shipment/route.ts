import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { refreshMeliAccountToken } from "@/lib/meli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MELI_API_BASE = "https://api.mercadolibre.com";

async function safeFetch(url: string, token: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { _error: true, _status: res.status, _url: url };
    }
    return await res.json();
  } catch (e: any) {
    return { _error: true, _message: e.message, _url: url };
  }
}

async function analyzeShipment(shippingId: number | string, order: any, token: string) {
  const [shipment, costs, billing, itemsCosts] = await Promise.all([
    safeFetch(`${MELI_API_BASE}/shipments/${shippingId}`, token),
    safeFetch(`${MELI_API_BASE}/shipments/${shippingId}/costs`, token),
    safeFetch(`${MELI_API_BASE}/shipments/${shippingId}/billing_info`, token),
    safeFetch(`${MELI_API_BASE}/shipments/${shippingId}/items/costs`, token),
  ]);

  // Calcular receita FLEX se houver
  const sender = costs?.senders?.[0];
  const chargeFlex = sender?.charges?.charge_flex ?? 0;
  const senderCost = sender?.cost ?? 0;
  const senderSave = sender?.save ?? 0;
  const senderCompensation = sender?.compensation ?? 0;
  const netFreteVendedor = chargeFlex > 0
    ? chargeFlex                                    // FLEX: receita positiva
    : -(senderCost - senderSave - senderCompensation); // outros: despesa negativa

  return {
    order_id: order?.id ?? null,
    shipping_id: shippingId,
    total_amount: order?.total_amount ?? null,
    unit_price: order?.order_items?.[0]?.unit_price ?? null,
    quantity: order?.order_items?.[0]?.quantity ?? null,
    sale_fee: order?.order_items?.[0]?.sale_fee ?? null,

    // --- Resumo FLEX ---
    flex_analysis: {
      logistic_type: shipment?.logistic_type,
      is_flex: shipment?.logistic_type === "self_service" || chargeFlex > 0,
      charge_flex: chargeFlex,
      sender_cost: senderCost,
      sender_save: senderSave,
      sender_compensation: senderCompensation,
      net_frete_vendedor: netFreteVendedor,
      interpretacao: chargeFlex > 0
        ? `✅ FLEX: Vendedor RECEBE R$${chargeFlex.toFixed(2)} do ML`
        : `📦 Frete normal: Vendedor PAGA R$${(senderCost - senderSave).toFixed(2)} líquido`,
    },

    // Dados raw
    classic_endpoint: {
      logistic_type: shipment.logistic_type,
      base_cost: shipment.base_cost,
      cost: shipment.cost,
      status: shipment.status,
      shipping_option: shipment.shipping_option
        ? {
            cost: shipment.shipping_option.cost,
            list_cost: shipment.shipping_option.list_cost,
            currency_id: shipment.shipping_option.currency_id,
            name: shipment.shipping_option.name,
          }
        : null,
    },
    costs_endpoint: costs,
    billing_endpoint: billing,
    items_costs_endpoint: itemsCosts,
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orderIdParam = url.searchParams.get("orderId");
    const shippingIdParam = url.searchParams.get("shippingId");

    // Pegar primeira conta ativa
    const account = await prisma.meliAccount.findFirst({
      orderBy: { updated_at: "desc" },
    });

    if (!account) {
      return NextResponse.json({ error: "Nenhuma conta ML encontrada" });
    }

    const refreshed = await refreshMeliAccountToken(account);
    const token = refreshed.access_token;

    // ── MODO 1: orderId específico ────────────────────────────────────────────
    if (orderIdParam) {
      // Buscar o pedido diretamente na API do ML
      const orderRes = await safeFetch(
        `${MELI_API_BASE}/orders/${orderIdParam}`,
        token
      );
      if (orderRes._error) {
        return NextResponse.json({ error: "Pedido não encontrado na API do ML", orderId: orderIdParam, details: orderRes });
      }
      const shippingId = orderRes.shipping?.id;
      if (!shippingId) {
        return NextResponse.json({ error: "Pedido sem envio associado", orderId: orderIdParam });
      }
      const analysis = await analyzeShipment(shippingId, orderRes, token);
      return NextResponse.json({
        mode: "order_id_lookup",
        account: { id: account.id, nickname: account.nickname, ml_user_id: account.ml_user_id.toString() },
        shipment_analysis: [analysis],
      });
    }

    // ── MODO 2: shippingId específico ─────────────────────────────────────────
    if (shippingIdParam) {
      const analysis = await analyzeShipment(shippingIdParam, null, token);
      return NextResponse.json({
        mode: "shipping_id_lookup",
        account: { id: account.id, nickname: account.nickname, ml_user_id: account.ml_user_id.toString() },
        shipment_analysis: [analysis],
      });
    }

    // ── MODO 3: últimos 3 pedidos (default) ──────────────────────────────────
    const ordersRes = await safeFetch(
      `${MELI_API_BASE}/orders/search?seller=${account.ml_user_id}&sort=date_desc&limit=5`,
      token
    );

    if (ordersRes._error) {
      return NextResponse.json({ error: "Erro ao buscar orders", details: ordersRes });
    }

    const orders = ordersRes.results || [];
    const results: any[] = [];

    for (const order of orders) {
      const shippingId = order?.shipping?.id;
      if (!shippingId) continue;
      const analysis = await analyzeShipment(shippingId, order, token);
      results.push(analysis);
      if (results.length >= 3) break;
    }

    return NextResponse.json({
      mode: "recent_orders",
      account: { id: account.id, nickname: account.nickname, ml_user_id: account.ml_user_id.toString() },
      shipment_analysis: results,
    }, { status: 200 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.split("\n").slice(0, 5) });
  }
}
