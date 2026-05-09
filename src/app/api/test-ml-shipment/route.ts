import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    // Pegar primeira conta ativa
    const account = await prisma.meliAccount.findFirst({
      orderBy: { updated_at: "desc" },
    });

    if (!account) {
      return NextResponse.json({ error: "Nenhuma conta ML encontrada" });
    }

    // Refresh token se necessário
    const refreshed = await refreshMeliAccountToken(account);
    const token = refreshed.access_token;

    // Buscar 5 vendas recentes
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

      // 1) Endpoint clássico: GET /shipments/{id}
      const shipment = await safeFetch(
        `${MELI_API_BASE}/shipments/${shippingId}`,
        token
      );

      // 2) Endpoint novo: GET /shipments/{id}/costs
      const costs = await safeFetch(
        `${MELI_API_BASE}/shipments/${shippingId}/costs`,
        token
      );

      // 3) Endpoint billing: GET /shipments/{id}/billing_info
      const billing = await safeFetch(
        `${MELI_API_BASE}/shipments/${shippingId}/billing_info`,
        token
      );

      // 4) Endpoint items cost: GET /shipments/{id}/items/costs  
      const itemsCosts = await safeFetch(
        `${MELI_API_BASE}/shipments/${shippingId}/items/costs`,
        token
      );

      results.push({
        order_id: order.id,
        shipping_id: shippingId,
        total_amount: order.total_amount,
        unit_price: order.order_items?.[0]?.unit_price,
        quantity: order.order_items?.[0]?.quantity,
        sale_fee: order.order_items?.[0]?.sale_fee,

        // Dados do endpoint clássico /shipments/{id}
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

        // Dados do endpoint novo /shipments/{id}/costs
        costs_endpoint: costs,

        // Dados do endpoint /shipments/{id}/billing_info
        billing_endpoint: billing,

        // Dados do endpoint /shipments/{id}/items/costs
        items_costs_endpoint: itemsCosts,
      });

      if (results.length >= 3) break;
    }

    return NextResponse.json({
      account: {
        id: account.id,
        nickname: account.nickname,
        ml_user_id: account.ml_user_id.toString(),
      },
      shipment_analysis: results,
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.split("\n").slice(0, 5) });
  }
}
