import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { refreshMeliAccountToken } from "@/lib/meli";
import { MeliAccount } from "@prisma/client";

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
  const receiverCost = costs?.receiver?.cost ?? 0;
  const netFreteVendedor = chargeFlex > 0
    ? chargeFlex                                    // FLEX: receita positiva
    : shipment?.logistic_type === "self_service" && receiverCost > 0
      ? receiverCost                                // FLEX < 79: comprador paga e ML repassa ao vendedor
      : -senderCost;                                // outros: despesa negativa

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
      receiver_cost: receiverCost,
      sender_cost: senderCost,
      sender_save: senderSave,
      sender_compensation: senderCompensation,
      net_frete_vendedor: netFreteVendedor,
      interpretacao: chargeFlex > 0
        ? `✅ FLEX: Vendedor RECEBE R$${chargeFlex.toFixed(2)} do ML`
        : shipment?.logistic_type === "self_service" && receiverCost > 0
          ? `✅ FLEX: Comprador pagou R$${receiverCost.toFixed(2)} de envio e o vendedor RECEBE como bônus`
          : `📦 Frete normal: Vendedor PAGA R$${senderCost.toFixed(2)}`,
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

async function getRefreshedAccounts() {
  const accounts = await prisma.meliAccount.findMany({
    orderBy: { updated_at: "desc" },
  });

  const refreshed: MeliAccount[] = [];
  const errors: Array<{ accountId: string; nickname: string | null; error: string }> = [];

  for (const account of accounts) {
    try {
      refreshed.push(await refreshMeliAccountToken(account));
    } catch (error: any) {
      errors.push({
        accountId: account.id,
        nickname: account.nickname,
        error: error?.message || String(error),
      });
    }
  }

  return { accounts: refreshed, errors };
}

async function findOrderAcrossAccounts(orderId: string, accounts: MeliAccount[]) {
  const attempts: Array<{
    accountId: string;
    nickname: string | null;
    ml_user_id: string;
    status?: number;
    found: boolean;
  }> = [];

  for (const account of accounts) {
    const orderRes = await safeFetch(
      `${MELI_API_BASE}/orders/${orderId}`,
      account.access_token,
    );

    attempts.push({
      accountId: account.id,
      nickname: account.nickname,
      ml_user_id: account.ml_user_id.toString(),
      status: orderRes?._status,
      found: !orderRes?._error,
    });

    if (!orderRes?._error) {
      const shippingId = orderRes.shipping?.id;
      if (!shippingId) {
        return {
          account,
          order: orderRes,
          analysis: null,
          error: "Pedido sem envio associado",
          attempts,
        };
      }

      return {
        account,
        order: orderRes,
        analysis: await analyzeShipment(shippingId, orderRes, account.access_token),
        error: null,
        attempts,
      };
    }
  }

  return { account: null, order: null, analysis: null, error: "Pedido nao encontrado em nenhuma conta", attempts };
}

function sampleKey(logisticType: string | undefined | null) {
  if (logisticType === "self_service") return "FLEX";
  if (logisticType === "fulfillment") return "FULL";
  if (logisticType === "cross_docking") return "COLETA";
  if (logisticType === "xd_drop_off") return "AGENCIA";
  if (logisticType === "drop_off") return "DROP_OFF";
  return logisticType || "SEM_TIPO";
}

async function collectSamplesByType(accounts: MeliAccount[], limitPerAccount: number) {
  const samples = new Map<string, any>();
  const accountSummaries: any[] = [];

  for (const account of accounts) {
    const ordersRes = await safeFetch(
      `${MELI_API_BASE}/orders/search?seller=${account.ml_user_id}&sort=date_desc&limit=${limitPerAccount}`,
      account.access_token,
    );

    if (ordersRes?._error) {
      accountSummaries.push({
        accountId: account.id,
        nickname: account.nickname,
        ml_user_id: account.ml_user_id.toString(),
        error: ordersRes,
      });
      continue;
    }

    const orders = Array.isArray(ordersRes.results) ? ordersRes.results : [];
    accountSummaries.push({
      accountId: account.id,
      nickname: account.nickname,
      ml_user_id: account.ml_user_id.toString(),
      fetched: orders.length,
    });

    for (const order of orders) {
      const shippingId = order?.shipping?.id;
      if (!shippingId) continue;

      const analysis = await analyzeShipment(shippingId, order, account.access_token);
      const key = sampleKey(analysis?.classic_endpoint?.logistic_type);
      if (!samples.has(key)) {
        samples.set(key, {
          account: {
            id: account.id,
            nickname: account.nickname,
            ml_user_id: account.ml_user_id.toString(),
          },
          analysis,
        });
      }
    }
  }

  return { samples: Object.fromEntries(samples), accountSummaries };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orderIdParam = url.searchParams.get("orderId");
    const shippingIdParam = url.searchParams.get("shippingId");
    const samplesParam = url.searchParams.get("samples");
    const limitParam = Number(url.searchParams.get("limit") || "25");
    const limitPerAccount = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 25, 1), 50);

    const { accounts, errors: refreshErrors } = await getRefreshedAccounts();

    if (accounts.length === 0) {
      return NextResponse.json({
        error: "Nenhuma conta ML encontrada ou com token valido",
        refreshErrors,
      });
    }

    if (samplesParam === "1" || samplesParam === "true") {
      const result = await collectSamplesByType(accounts, limitPerAccount);
      return NextResponse.json({
        mode: "samples_by_logistic_type",
        refreshErrors,
        ...result,
      });
    }

    // Pegar primeira conta ativa
    const account = accounts[0];
    const token = account.access_token;

    // ── MODO 1: orderId específico ────────────────────────────────────────────
    if (orderIdParam) {
      const result = await findOrderAcrossAccounts(orderIdParam, accounts);
      if (result.error) {
        return NextResponse.json({
          error: result.error,
          orderId: orderIdParam,
          attempts: result.attempts,
          refreshErrors,
        });
      }
      return NextResponse.json({
        mode: "order_id_lookup",
        account: result.account
          ? { id: result.account.id, nickname: result.account.nickname, ml_user_id: result.account.ml_user_id.toString() }
          : null,
        attempts: result.attempts,
        refreshErrors,
        shipment_analysis: result.analysis ? [result.analysis] : [],
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
