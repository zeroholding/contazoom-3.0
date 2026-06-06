import prisma from "@/lib/prisma";
import {
  FetchOrdersPageOptions,
  FetchOrdersPageResult,
  FreightSource,
  MeliAccount,
  MeliOrderFreight,
  MeliOrderPayload,
} from "../types/sync-meli";
import { sendProgressToUser } from "@/lib/sse-progress";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { roundCurrency } from "@/utils/string-utils";
import { toFiniteNumber } from "@/utils/numeric-functions";

const MELI_API_BASE =
  process.env.MELI_API_BASE?.replace(/\/$/, "") ||
  "https://api.mercadolibre.com";
const PAGE_LIMIT = 50;
const PAGE_FETCH_CONCURRENCY = Math.min(
  5,
  Math.max(1, Number(process.env.MELI_PAGE_FETCH_CONCURRENCY ?? "2") || 2),
);
const MAX_OFFSET = 50000;

function sumPromotedAmount(discounts: unknown): number | null {
  if (!Array.isArray(discounts)) return null;

  let total = 0;
  let hasValue = false;
  for (const discount of discounts) {
    const promotedAmount = toFiniteNumber((discount as any)?.promoted_amount);
    if (promotedAmount !== null) {
      total += promotedAmount;
      hasValue = true;
    }
  }

  return hasValue ? roundCurrency(total) : null;
}

function firstPositive(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value > 0) {
      return value;
    }
  }
  return null;
}

export default class MeliSyncService {
  async getAccountsByUserId(userId: string, accountIds?: string[]) {
    const accountsWhere: any = { userId };
    if (accountIds && accountIds.length > 0) {
      accountsWhere.id = { in: accountIds };
    }

    const accounts = await prisma.meliAccount.findMany({
      where: accountsWhere,
      orderBy: { created_at: "desc" },
    });

    console.log(
      `[Sync] Encontradas ${accounts.length} conta(s) do Mercado Livre`,
    );

    return accounts;
  }

  convertLogisticTypeName(logisticType: string | null): string | null {
    if (!logisticType) return logisticType;

    if (logisticType === "xd_drop_off") return "Agência";
    if (logisticType === "self_service") return "FLEX";
    if (logisticType === "cross_docking") return "Coleta";

    return logisticType;
  }

  sumOrderQuantities(items: unknown): number | null {
    if (!Array.isArray(items)) return null;
    let total = 0;
    let counted = false;
    for (const it of items) {
      const q = toFiniteNumber((it as any)?.quantity);
      if (q !== null) {
        total += q;
        counted = true;
      }
    }
    return counted ? total : null;
  }

  calculateFreight(order: any, shipment: any): MeliOrderFreight {
    const o = order ?? {};
    const s = shipment ?? {};

    const orderShipping =
      o && typeof o.shipping === "object" ? (o.shipping ?? {}) : {};

    const shippingMode =
      typeof orderShipping.mode === "string" ? orderShipping.mode : null;

    const logisticTypeRaw =
      typeof s.logistic_type === "string" ? s.logistic_type : null;

    const logisticTypeFallback = shippingMode;
    const logisticType = logisticTypeRaw ?? logisticTypeFallback ?? null;

    const logisticTypeSource: FreightSource = logisticTypeRaw
      ? "shipment"
      : logisticTypeFallback
        ? "order"
        : null;

    const shipOpt =
      s && typeof s.shipping_option === "object"
        ? (s.shipping_option ?? {})
        : {};

    const baseCost = toFiniteNumber(s.base_cost);
    const optCost = toFiniteNumber((shipOpt as any).cost);
    const listCost = toFiniteNumber((shipOpt as any).list_cost);
    const shipCost = toFiniteNumber(s.cost);
    const orderCost = toFiniteNumber(orderShipping.cost);

    let chargedCost: number | null = null;
    let chargedCostSource: FreightSource = null;

    if (optCost !== null) {
      chargedCost = optCost;
      chargedCostSource = "shipping_option";
    } else if (shipCost !== null) {
      chargedCost = shipCost;
      chargedCostSource = "shipment";
    } else if (orderCost !== null) {
      chargedCost = orderCost;
      chargedCostSource = "order";
    }

    if (chargedCost !== null) chargedCost = roundCurrency(chargedCost);

    const discount =
      listCost !== null && chargedCost !== null
        ? roundCurrency(listCost - chargedCost)
        : null;

    const totalAmount = toFiniteNumber(o.total_amount);

    const items = Array.isArray(o.order_items) ? o.order_items : [];
    let quantity = this.sumOrderQuantities(items);

    if (quantity === null) {
      if (items.length > 0) quantity = items.length;
      else if (totalAmount !== null) quantity = 1;
    }

    let unitPrice: number | null = null;
    if (totalAmount !== null && quantity && quantity > 0) {
      unitPrice = roundCurrency(totalAmount / quantity);
    }

    const diffBaseList =
      baseCost !== null && listCost !== null
        ? roundCurrency(baseCost - listCost)
        : null;

    let adjustedCost: number | null = null;
    let adjustmentSource: string | null = null;

    if (logisticType === "self_service" || logisticType === "FLEX") {
      const chargeFlex = toFiniteNumber((s as any)._charge_flex);
      const sellerShippingCost = toFiniteNumber((s as any)._seller_shipping_cost);
      const sellerShippingSave = toFiniteNumber((s as any)._seller_shipping_save);
      const sellerShippingDiscount = toFiniteNumber((s as any)._seller_shipping_discount);
      const receiverShippingCost = toFiniteNumber((s as any)._receiver_shipping_cost);
      const receiverShippingSave = toFiniteNumber((s as any)._receiver_shipping_save);
      const receiverShippingDiscount = toFiniteNumber((s as any)._receiver_shipping_discount);
      const grossAmount = toFiniteNumber((s as any)._costs_gross_amount);
      const sellerFlexRebate = firstPositive(
        sellerShippingDiscount,
        sellerShippingSave,
      );
      const receiverFlexRebate = firstPositive(
        receiverShippingDiscount,
        receiverShippingSave,
        receiverShippingCost,
      );

      if (chargeFlex !== null && chargeFlex > 0) {
        adjustedCost = chargeFlex;
        adjustmentSource = "shipment";
      } else if (sellerFlexRebate !== null && sellerFlexRebate > 0) {
        adjustedCost = roundCurrency(sellerFlexRebate);
        adjustmentSource = "sender_discount";
      } else if (receiverFlexRebate !== null && receiverFlexRebate > 0) {
        adjustedCost = roundCurrency(receiverFlexRebate);
        adjustmentSource = "receiver";
      } else if ((sellerShippingCost ?? 0) === 0 && grossAmount !== null && grossAmount > 0) {
        adjustedCost = roundCurrency(grossAmount);
        adjustmentSource = "gross_amount";
      } else {
        const lc = listCost !== null && listCost > 0 ? listCost : (optCost !== null && optCost > 0 ? optCost : (baseCost !== null ? baseCost : 0));
        const cc = chargedCost !== null ? chargedCost : 0;
        const repasse = roundCurrency(lc - cc);

        if (repasse > 0) {
          adjustedCost = repasse;
          adjustmentSource = "shipment";
        } else {
          adjustedCost = 0;
          adjustmentSource = "shipping_option";
        }
      }
    } else if (["fulfillment", "cross_docking", "xd_drop_off", "drop_off"].includes(logisticType ?? "")) {
      const sellerCost = toFiniteNumber((s as any)._seller_shipping_cost) ?? 0;
      const sellerSave = toFiniteNumber((s as any)._seller_shipping_save) ?? 0;
      const sellerComp = toFiniteNumber((s as any)._seller_shipping_compensation) ?? 0;
      const netSellerCost = sellerCost - sellerSave - sellerComp;

      if (netSellerCost > 0) {
        adjustedCost = -roundCurrency(netSellerCost);
        adjustmentSource = "shipment";
      } else if (listCost !== null && chargedCost !== null) {
        const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
        adjustedCost = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
        adjustmentSource = "shipping_option";
      } else if (baseCost !== null && baseCost > 0) {
        adjustedCost = -baseCost;
        adjustmentSource = "shipment";
      } else {
        adjustedCost = 0;
      }
    } else {
      if (listCost !== null && chargedCost !== null) {
        const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
        adjustedCost = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
        adjustmentSource = "shipping_option";
      } else if (orderCost !== null && orderCost > 0) {
        adjustedCost = -orderCost;
        adjustmentSource = "order";
      } else {
        adjustedCost = 0;
      }
    }

    return {
      logisticType: this.convertLogisticTypeName(logisticType),
      logisticTypeSource,
      shippingMode,

      baseCost,
      listCost,
      shippingOptionCost: optCost !== null ? roundCurrency(optCost) : null,
      shipmentCost: shipCost !== null ? roundCurrency(shipCost) : null,
      orderCostFallback: orderCost !== null ? roundCurrency(orderCost) : null,

      finalCost: chargedCost,
      finalCostSource: chargedCostSource,
      chargedCost,
      chargedCostSource,

      discount,
      totalAmount,
      quantity,
      unitPrice,
      diffBaseList,

      adjustedCost,
      adjustmentSource,

      sellerShippingCost: toFiniteNumber((s as any)._seller_shipping_cost),
      sellerShippingSave: toFiniteNumber((s as any)._seller_shipping_save),
      sellerShippingDiscount: toFiniteNumber((s as any)._seller_shipping_discount),
      receiverShippingCost: toFiniteNumber((s as any)._receiver_shipping_cost),
      receiverShippingSave: toFiniteNumber((s as any)._receiver_shipping_save),
      receiverShippingDiscount: toFiniteNumber((s as any)._receiver_shipping_discount),
      costsGrossAmount: toFiniteNumber((s as any)._costs_gross_amount),
    };
  }

  async fetchOrdersPage({
    account,
    headers,
    userId,
    offset,
    pageNumber,
    dateFrom,
    dateTo,
    ...options
  }: FetchOrdersPageOptions): Promise<FetchOrdersPageResult> {
    const limit = PAGE_LIMIT;
    const url = new URL(`${MELI_API_BASE}/orders/search`);
    url.searchParams.set("seller", account.ml_user_id.toString());
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("offset", offset.toString());
    if (dateFrom) {
      url.searchParams.set("order.date_created.from", dateFrom.toISOString());
    }
    if (dateTo) {
      url.searchParams.set("order.date_created.to", dateTo.toISOString());
    }
    if (options.lastUpdatedFrom) {
      url.searchParams.set("order.date_last_updated.from", options.lastUpdatedFrom.toISOString());
    }
    if (options.lastUpdatedTo) {
      url.searchParams.set("order.date_last_updated.to", options.lastUpdatedTo.toISOString());
    }

    const result: FetchOrdersPageResult = {
      offset,
      pageNumber,
      total: null,
      orders: [],
    };

    let response: Response;
    let payload: any = null;

    try {
      response = await fetchWithRetry(url.toString(), { headers }, 3, userId);
    } catch (error) {
      console.error(`[Sync] ⚠️ Erro ao buscar página ${pageNumber}:`, error);
      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `Erro ao buscar página ${pageNumber}: ${
          error instanceof Error ? error.message : "Falha desconhecida"
        }`,
        errorCode: "PAGE_FETCH_ERROR",
      });
      return result;
    }

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    result.total =
      typeof payload?.paging?.total === "number" &&
      Number.isFinite(payload.paging.total)
        ? payload.paging.total
        : null;

    if (!response.ok) {
      const message =
        typeof payload?.message === "string"
          ? payload.message
          : `Status ${response.status}`;
      console.error(
        `[Sync] ⚠️ Erro HTTP ${response.status} ao buscar página ${pageNumber}:`,
        message,
      );
      if (response.status === 400) {
        console.log(`[Sync] ⚠️ Limite da API atingido em offset ${offset}`);
      }
      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `Erro HTTP ${response.status} na página ${pageNumber}: ${message}`,
        errorCode: response.status.toString(),
      });
      return result;
    }

    const orders = Array.isArray(payload?.results) ? payload.results : [];
    if (orders.length === 0) {
      console.log(
        `[Sync] 📄 Página ${pageNumber}: 0 vendas (offset ${offset})`,
      );
      return result;
    }

    console.log(
      `[Sync] 📄 Página ${pageNumber}: ${
        orders.length
      } vendas (offset ${offset})${
        result.total
          ? ` (${Math.min(offset + orders.length, result.total)}/${result.total})`
          : ""
      }`,
    );

    const SHIPMENT_BATCH_SIZE = 10;
    const shipments: any[] = new Array(orders.length).fill(null);

    for (let i = 0; i < orders.length; i += SHIPMENT_BATCH_SIZE) {
      const batchOrders = orders.slice(i, i + SHIPMENT_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batchOrders.map(async (order: any) => {
          const shippingId = order?.shipping?.id;
          if (!shippingId) {
            return typeof order?.shipping === "object" ? order.shipping : null;
          }
          try {
            const [res, costsRes] = await Promise.all([
              fetchWithRetry(`${MELI_API_BASE}/shipments/${shippingId}`, { headers }, 3, userId),
              fetchWithRetry(`${MELI_API_BASE}/shipments/${shippingId}/costs`, { headers }, 3, userId).catch(() => null)
            ]);
            
            if (!res.ok) return null;
            const shipmentData = await res.json();
            
            if (costsRes && costsRes.ok) {
              const costsData = await costsRes.json();
              const senderCost = costsData.senders?.[0]?.cost;
              if (senderCost !== undefined && senderCost !== null) {
                shipmentData._seller_shipping_cost = senderCost;
              }
              const senderSave = costsData.senders?.[0]?.save;
              if (senderSave !== undefined && senderSave !== null) {
                shipmentData._seller_shipping_save = senderSave;
              }
              const senderDiscount = sumPromotedAmount(costsData.senders?.[0]?.discounts);
              if (senderDiscount !== null) {
                shipmentData._seller_shipping_discount = senderDiscount;
              }
              const senderComp = costsData.senders?.[0]?.compensation;
              if (senderComp !== undefined && senderComp !== null) {
                shipmentData._seller_shipping_compensation = senderComp;
              }
              const receiverCost = costsData.receiver?.cost;
              if (receiverCost !== undefined && receiverCost !== null) {
                shipmentData._receiver_shipping_cost = receiverCost;
              }
              const receiverSave = costsData.receiver?.save;
              if (receiverSave !== undefined && receiverSave !== null) {
                shipmentData._receiver_shipping_save = receiverSave;
              }
              const receiverDiscount = sumPromotedAmount(costsData.receiver?.discounts);
              if (receiverDiscount !== null) {
                shipmentData._receiver_shipping_discount = receiverDiscount;
              }
              const grossAmount = costsData.gross_amount;
              if (grossAmount !== undefined && grossAmount !== null) {
                shipmentData._costs_gross_amount = grossAmount;
              }
              const chargeFlex = costsData.senders?.[0]?.charges?.charge_flex;
              if (chargeFlex !== undefined && chargeFlex !== null) {
                shipmentData._charge_flex = chargeFlex;
              }
            }
            return shipmentData;
          } catch {
            return null;
          }
        }),
      );

      // Mapear resultados para array de shipments
      batchResults.forEach((result, idx) => {
        const originalIdx = i + idx;
        if (result.status === "fulfilled" && result.value) {
          shipments[originalIdx] = result.value;
        } else {
          shipments[originalIdx] =
            typeof orders[originalIdx]?.shipping === "object"
              ? orders[originalIdx].shipping
              : null;
        }
      });
    }

    result.orders = orders
      .map((order: any, idx: number) => {
        if (!order) return null;
        const shipment = shipments[idx] ?? undefined;
        return {
          accountId: account.id,
          accountNickname: account.nickname || undefined,
          mlUserId: Number(account.ml_user_id),
          order,
          shipment,
          freight: this.calculateFreight(order, shipment),
        };
      })
      .filter(Boolean) as MeliOrderPayload[];

    return result;
  }

  extractOrderDate(order: unknown): Date | null {
    if (!order || typeof order !== "object") return null;
    const rawDate =
      (order as any)?.date_closed ??
      (order as any)?.date_created ??
      (order as any)?.date_last_updated ??
      null;
    if (!rawDate) return null;
    const parsed = new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Busca vendas em um período específico (para contornar limite de 10k)
   * Se o período tiver mais de 9.950 vendas, divide em sub-períodos automaticamente
   */
  async fetchOrdersInDateRange(
    account: MeliAccount,
    headers: Record<string, string>,
    userId: string,
    dateFrom: Date,
    dateTo: Date,
    logisticStats: Map<string, number>
  ): Promise<MeliOrderPayload[]> {
    const results: MeliOrderPayload[] = [];
    let offset = 0;
    const MAX_OFFSET = 50000;
    let totalInPeriod = 0;
    let needsSplitting = false;
  
    // Primeira requisição para verificar quantas vendas existem no período
    const checkUrl = new URL(`${MELI_API_BASE}/orders/search`);
    checkUrl.searchParams.set("seller", account.ml_user_id.toString());
    checkUrl.searchParams.set("sort", "date_desc");
    checkUrl.searchParams.set("limit", "1");
    checkUrl.searchParams.set("offset", "0");
    checkUrl.searchParams.set("order.date_created.from", dateFrom.toISOString());
    checkUrl.searchParams.set("order.date_created.to", dateTo.toISOString());
  
    try {
      const checkResponse = await fetchWithRetry(
        checkUrl.toString(),
        { headers },
        3,
        userId
      );
      if (checkResponse.ok) {
        const checkPayload = await checkResponse.json();
        totalInPeriod = checkPayload?.paging?.total || 0;
        console.log(
          `[Sync] 📊 Período ${dateFrom.toISOString().split("T")[0]} a ${
            dateTo.toISOString().split("T")[0]
          }: ${totalInPeriod} vendas`
        );
  
        if (totalInPeriod > MAX_OFFSET) {
          needsSplitting = true;
          console.log(
            `[Sync] 🔄 Período tem ${totalInPeriod} vendas (> ${MAX_OFFSET}) - dividindo em sub-períodos`
          );
        }
      }
    } catch (error) {
      console.error(`[Sync] Erro ao verificar total do período:`, error);
    }
  
    // Se precisa dividir, criar sub-períodos
    if (needsSplitting) {
      // Calcular duração do período em dias
      const durationMs = dateTo.getTime() - dateFrom.getTime();
      const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  
      console.log(
        `[Sync] 📅 Período de ${durationDays} dias - dividindo em sub-períodos menores`
      );
  
      // Determinar tamanho ideal do sub-período
      // Se tem mais de 50k vendas, dividir em períodos de 7 dias
      // Se tem 10k-50k vendas, dividir em períodos de 14 dias
      const subPeriodDays = totalInPeriod > 50000 ? 7 : 14;
  
      console.log(`[Sync] 🔄 Dividindo em sub-períodos de ${subPeriodDays} dias`);
  
      let currentStart = new Date(dateFrom);
      while (currentStart < dateTo) {
        const currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + subPeriodDays);
  
        // Ajustar para não ultrapassar dateTo
        if (currentEnd > dateTo) {
          currentEnd.setTime(dateTo.getTime());
        }
  
        console.log(
          `[Sync] 📆 Buscando sub-período: ${
            currentStart.toISOString().split("T")[0]
          } a ${currentEnd.toISOString().split("T")[0]}`
        );
  
        // Buscar recursivamente (pode precisar dividir mais se ainda tiver >9.950)
        const subResults = await this.fetchOrdersInDateRange(
          account,
          headers,
          userId,
          currentStart,
          currentEnd,
          logisticStats
        );
  
        results.push(...subResults);
        console.log(
          `[Sync] ✅ Sub-período: ${subResults.length} vendas baixadas (total acumulado: ${results.length})`
        );
  
        // Enviar progresso
        sendProgressToUser(userId, {
          type: "sync_progress",
          message: `${results.length}/${totalInPeriod} vendas baixadas (período histórico)`,
          current: results.length,
          total: totalInPeriod,
          fetched: results.length,
          expected: totalInPeriod,
          accountId: account.id,
          accountNickname: account.nickname || undefined,
        });
  
        // Avançar para próximo sub-período
        currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() + 1); // Próximo dia após o fim
      }
  
      console.log(
        `[Sync] 🎉 Período completo: ${results.length} vendas de ${totalInPeriod} totais`
      );
      return results;
    }
  
    // Se não precisa dividir, buscar normalmente
    while (offset < MAX_OFFSET) {
      const url = new URL(`${MELI_API_BASE}/orders/search`);
      url.searchParams.set("seller", account.ml_user_id.toString());
      url.searchParams.set("sort", "date_desc");
      url.searchParams.set("limit", PAGE_LIMIT.toString());
      url.searchParams.set("offset", offset.toString());
      url.searchParams.set("order.date_created.from", dateFrom.toISOString());
      url.searchParams.set("order.date_created.to", dateTo.toISOString());
  
      try {
        const response = await fetchWithRetry(
          url.toString(),
          { headers },
          3,
          userId
        );
  
        if (!response.ok) {
          // Se der erro 400, parar (atingiu limite)
          if (response.status === 400) {
            console.log(
              `[Sync] ⚠️ Atingiu limite no período - baixadas ${results.length} vendas`
            );
          }
          break;
        }
  
        const payload = await response.json();
        const orders = Array.isArray(payload?.results) ? payload.results : [];
  
        if (orders.length === 0) break;
  
        // Buscar detalhes dos orders
        const orderDetailsResults = await Promise.allSettled(
          orders.map(async (o: any) => {
            if (!o?.id) {
              return o
            };
            try {
              const r = await fetchWithRetry(
                `${MELI_API_BASE}/orders/${o.id}`,
                { headers },
                3,
                userId
              );

              if (!r.ok) return 0;

              const payload = await r.json();

              return payload;
            } catch {
              return o;
            }
          })
        );
  
        const detailedOrders = orderDetailsResults.map((r, i) =>
          r.status === "fulfilled" ? r.value : orders[i]
        );
  
        // OTIMIZA��O: Buscar shipments em batches menores (10 por vez)
        const SHIPMENT_BATCH_SIZE = 10;
        const shipments: any[] = new Array(orders.length).fill(null);
  
        for (let i = 0; i < orders.length; i += SHIPMENT_BATCH_SIZE) {
          const batchOrders = orders.slice(i, i + SHIPMENT_BATCH_SIZE);
          const batchResults = await Promise.allSettled(
            batchOrders.map(async (o: any) => {
              const sid = o?.shipping?.id;
              if (!sid) return null;
              try {
                const [r, costsRes] = await Promise.all([
                  fetchWithRetry(`${MELI_API_BASE}/shipments/${sid}`, { headers }, 3, userId),
                  fetchWithRetry(`${MELI_API_BASE}/shipments/${sid}/costs`, { headers }, 3, userId).catch(() => null)
                ]);
                
                if (!r.ok) return null;
                const shipmentData = await r.json();
                
                if (costsRes && costsRes.ok) {
                  const costsData = await costsRes.json();
                  const senderCost = costsData.senders?.[0]?.cost;
                  if (senderCost !== undefined && senderCost !== null) {
                    shipmentData._seller_shipping_cost = senderCost;
                  }
                  const senderSave = costsData.senders?.[0]?.save;
                  if (senderSave !== undefined && senderSave !== null) {
                    shipmentData._seller_shipping_save = senderSave;
                  }
                  const senderDiscount = sumPromotedAmount(costsData.senders?.[0]?.discounts);
                  if (senderDiscount !== null) {
                    shipmentData._seller_shipping_discount = senderDiscount;
                  }
                  const senderComp = costsData.senders?.[0]?.compensation;
                  if (senderComp !== undefined && senderComp !== null) {
                    shipmentData._seller_shipping_compensation = senderComp;
                  }
                  const receiverCost = costsData.receiver?.cost;
                  if (receiverCost !== undefined && receiverCost !== null) {
                    shipmentData._receiver_shipping_cost = receiverCost;
                  }
                  const receiverSave = costsData.receiver?.save;
                  if (receiverSave !== undefined && receiverSave !== null) {
                    shipmentData._receiver_shipping_save = receiverSave;
                  }
                  const receiverDiscount = sumPromotedAmount(costsData.receiver?.discounts);
                  if (receiverDiscount !== null) {
                    shipmentData._receiver_shipping_discount = receiverDiscount;
                  }
                  const grossAmount = costsData.gross_amount;
                  if (grossAmount !== undefined && grossAmount !== null) {
                    shipmentData._costs_gross_amount = grossAmount;
                  }
                  const chargeFlex = costsData.senders?.[0]?.charges?.charge_flex;
                  if (chargeFlex !== undefined && chargeFlex !== null) {
                    shipmentData._charge_flex = chargeFlex;
                  }
                }
                return shipmentData;
              } catch {
                return null;
              }
            })
          );
  
          batchResults.forEach((result, idx) => {
            shipments[i + idx] =
              result.status === "fulfilled" ? result.value : null;
          });
        }
  
        detailedOrders.forEach((order: any, idx: number) => {
          if (!order) return;
          const shipment = shipments[idx];
          const freight = this.calculateFreight(order, shipment);
          const logType =
            shipment?.logistic_type || order?.shipping?.mode || "sem_tipo";
          logisticStats.set(logType, (logisticStats.get(logType) || 0) + 1);
  
          results.push({
            accountId: account.id,
            accountNickname: account.nickname || undefined,
            mlUserId: account.ml_user_id,
            order,
            shipment,
            freight,
          });
        });
  
        offset += orders.length;
  
        // IMPORTANTE: Parar antes de atingir limite
        if (offset >= MAX_OFFSET) {
          console.log(
            `[Sync] ⚠️ Atingiu ${offset} vendas no período - parando antes do limite`
          );
          break;
        }
      } catch (error) {
        console.error(`[Sync] Erro ao buscar período:`, error);
        break;
      }
    }
  
    return results;
  }
}
