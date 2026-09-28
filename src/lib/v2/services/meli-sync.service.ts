import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  FetchOrdersPageOptions,
  FetchOrdersPageResult,
  FreightSource,
  MeliAccount,
  MeliOrderFreight,
  MeliOrderPayload,
} from "../types/sync-meli";
import { pMap } from "@/lib/concorrencia";
import { sendProgressToUser } from "@/lib/sse-progress";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { roundCurrency } from "@/utils/string-utils";
import { toFiniteNumber } from "@/utils/numeric-functions";
import { ML_SYNC_RULE_VERSION } from "@/utils/sync-prepare-sale-data";

const MELI_API_BASE =
  process.env.MELI_API_BASE?.replace(/\/$/, "") ||
  "https://api.mercadolibre.com";
const PAGE_LIMIT = 50;

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

type ExistingOrderSignature = {
  orderId: string;
  userId: string;
  dateLastUpdated: string | null;
  status: string | null;
  tags: unknown;
  shipmentHasStatus: boolean;
  syncRule: string | null;
};

function tagSignature(value: unknown): string | null {
  let tags = value;
  if (typeof tags === "string") {
    try {
      tags = JSON.parse(tags);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(tags)) return null;
  return JSON.stringify(tags.map((tag) => String(tag)).sort());
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
    const url = new URL(`${MELI_API_BASE}/orders/search`);
    url.searchParams.set("seller", account.ml_user_id.toString());
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("limit", PAGE_LIMIT.toString());
    url.searchParams.set("offset", offset.toString());
    if (dateFrom) {
      url.searchParams.set("order.date_created.from", dateFrom.toISOString());
    }
    if (dateTo) {
      url.searchParams.set("order.date_created.to", dateTo.toISOString());
    }
    if (options.lastUpdatedFrom) {
      url.searchParams.set(
        "order.date_last_updated.from",
        options.lastUpdatedFrom.toISOString(),
      );
    }
    if (options.lastUpdatedTo) {
      url.searchParams.set(
        "order.date_last_updated.to",
        options.lastUpdatedTo.toISOString(),
      );
    }

    const result: FetchOrdersPageResult = {
      offset,
      pageNumber,
      total: null,
      orders: [],
      fetched: 0,
      skipped: 0,
      skippedOtherUser: 0,
      failed: false,
    };

    const fail = (message: string, status?: number): FetchOrdersPageResult => {
      result.failed = true;
      result.failure = status === undefined ? { message } : { message, status };
      return result;
    };

    let response: Response;
    try {
      response = await fetchWithRetry(url.toString(), { headers }, 3, userId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida";
      console.error(`[Sync] ⚠️ Erro ao buscar página ${pageNumber}:`, error);
      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `Erro ao buscar página ${pageNumber}: ${message}`,
        errorCode: "PAGE_FETCH_ERROR",
        accountId: account.id,
      });
      return fail(message);
    }

    let payload: any = null;
    let validJson = true;
    try {
      payload = await response.json();
    } catch {
      validJson = false;
    }

    result.total =
      typeof payload?.paging?.total === "number" &&
      Number.isFinite(payload.paging.total) &&
      payload.paging.total >= 0
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
        accountId: account.id,
      });
      return fail(message, response.status);
    }

    if (!validJson || !Array.isArray(payload?.results) || result.total === null) {
      const message = "Resposta inválida da API de pedidos";
      console.error(`[Sync] ⚠️ ${message} na página ${pageNumber}`);
      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `${message} na página ${pageNumber}`,
        errorCode: "INVALID_PAGE_RESPONSE",
        accountId: account.id,
      });
      return fail(message);
    }

    const orders: any[] = payload.results;
    result.fetched = orders.length;

    if (orders.length === 0) {
      console.log(
        `[Sync] 📄 Página ${pageNumber}: 0 vendas (offset ${offset})`,
      );
      return result;
    }

    console.log(
      `[Sync] 📄 Página ${pageNumber}: ${orders.length} vendas (offset ${offset}) ` +
        `(${Math.min(offset + orders.length, result.total)}/${result.total})`,
    );

    const orderIds = Array.from(
      new Set(
        orders
          .map((order) => {
            const id = order?.id;
            if (id === undefined || id === null) return null;
            const normalized = String(id).trim();
            return normalized.length > 0 ? normalized : null;
          })
          .filter((id): id is string => id !== null),
      ),
    );

    const existingByOrderId = new Map<string, ExistingOrderSignature>();
    if (orderIds.length > 0) {
      try {
        // Uma única consulta parametrizada lê só a assinatura necessária para
        // decidir o skip; raw_data inteiro nunca trafega para a aplicação.
        const existingOrders = await prisma.$queryRaw<ExistingOrderSignature[]>(
          Prisma.sql`
            SELECT
              order_id AS "orderId",
              user_id AS "userId",
              raw_data -> 'order' ->> 'date_last_updated' AS "dateLastUpdated",
              raw_data -> 'order' ->> 'status' AS "status",
              raw_data -> 'order' -> 'tags' AS "tags",
              COALESCE(NULLIF(raw_data -> 'shipment' ->> 'status', ''), '') <> '' AS "shipmentHasStatus",
              raw_data ->> 'syncRule' AS "syncRule"
            FROM meli_venda
            WHERE order_id IN (${Prisma.join(orderIds)})
          `,
        );
        for (const existing of existingOrders) {
          existingByOrderId.set(existing.orderId, existing);
        }
      } catch (error) {
        // O skip é só otimização. Se a assinatura não puder ser lida, processa
        // tudo para nunca perder atualização.
        console.warn(
          `[Sync] Falha ao consultar assinaturas da página ${pageNumber}; processando todos os pedidos.`,
          error,
        );
      }
    }

    const ordersToEnrich: any[] = [];
    for (const order of orders) {
      const rawId = order?.id;
      const orderId =
        rawId === undefined || rawId === null ? null : String(rawId).trim();
      const existing = orderId ? existingByOrderId.get(orderId) : undefined;

      if (!existing) {
        ordersToEnrich.push(order);
        continue;
      }

      if (existing.userId !== userId) {
        result.skippedOtherUser += 1;
        continue;
      }

      const incomingDate = nonEmptyString(order?.date_last_updated);
      const incomingStatus = nonEmptyString(order?.status);
      const incomingTags = tagSignature(order?.tags);
      const storedTags = tagSignature(existing.tags);
      const shippingId = order?.shipping?.id;
      const hasShippingId =
        shippingId !== undefined &&
        shippingId !== null &&
        String(shippingId).trim().length > 0;

      const unchanged =
        incomingDate !== null &&
        incomingDate === existing.dateLastUpdated &&
        incomingStatus !== null &&
        incomingStatus === existing.status &&
        incomingTags !== null &&
        incomingTags === storedTags &&
        (!hasShippingId || existing.shipmentHasStatus) &&
        existing.syncRule === ML_SYNC_RULE_VERSION;

      if (unchanged) {
        result.skipped += 1;
      } else {
        ordersToEnrich.push(order);
      }
    }

    if (result.skipped > 0 || result.skippedOtherUser > 0) {
      console.log(
        `[Sync] ⚡ Página ${pageNumber}: ${result.skipped} inalteradas e ` +
          `${result.skippedOtherUser} de outro usuário; ` +
          `${ordersToEnrich.length} exigem enriquecimento`,
      );
    }

    // Fila contínua: assim que um pedido termina, o próximo começa, sem a
    // barreira artificial dos antigos blocos de 10.
    const shipments = await pMap(ordersToEnrich, 10, async (order: any) => {
      const fallbackShipment =
        typeof order?.shipping === "object" ? order.shipping : null;
      const shippingId = order?.shipping?.id;
      if (!shippingId) return fallbackShipment;

      try {
        const [shipmentResponse, costsResponse, slaResponse] = await Promise.all([
          fetchWithRetry(
            `${MELI_API_BASE}/shipments/${shippingId}`,
            { headers },
            3,
            userId,
          ),
          fetchWithRetry(
            `${MELI_API_BASE}/shipments/${shippingId}/costs`,
            { headers },
            3,
            userId,
          ).catch(() => null),
          fetchWithRetry(
            `${MELI_API_BASE}/shipments/${shippingId}/sla`,
            { headers },
            1,
            undefined,
            5000,
          ).catch(() => null),
        ]);

        if (!shipmentResponse.ok) return fallbackShipment;
        const shipmentData = await shipmentResponse.json();

        // SLA continua best-effort e nunca descarta o shipment principal.
        if (slaResponse?.ok) {
          try {
            shipmentData.sla = await slaResponse.json();
          } catch {
            // noop
          }
        }

        if (costsResponse?.ok) {
          const costsData = await costsResponse.json();
          const senderCost = costsData.senders?.[0]?.cost;
          if (senderCost !== undefined && senderCost !== null) {
            shipmentData._seller_shipping_cost = senderCost;
          }
          const senderSave = costsData.senders?.[0]?.save;
          if (senderSave !== undefined && senderSave !== null) {
            shipmentData._seller_shipping_save = senderSave;
          }
          const senderDiscount = sumPromotedAmount(
            costsData.senders?.[0]?.discounts,
          );
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
          const receiverDiscount = sumPromotedAmount(
            costsData.receiver?.discounts,
          );
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
        return fallbackShipment;
      }
    });

    result.orders = ordersToEnrich
      .map((order: any, index: number) => {
        if (!order) return null;
        const shipment = shipments[index] ?? undefined;
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
  
        // Mesma fila contínua do fluxo incremental, preservando a ordem.
        const shipments = await pMap(orders, 10, async (o: any) => {
          const sid = o?.shipping?.id;
          if (!sid) return null;
          try {
            const [r, costsRes, slaRes] = await Promise.all([
              fetchWithRetry(
                `${MELI_API_BASE}/shipments/${sid}`,
                { headers },
                3,
                userId,
              ),
              fetchWithRetry(
                `${MELI_API_BASE}/shipments/${sid}/costs`,
                { headers },
                3,
                userId,
              ).catch(() => null),
              fetchWithRetry(
                `${MELI_API_BASE}/shipments/${sid}/sla`,
                { headers },
                1,
                undefined,
                5000,
              ).catch(() => null),
            ]);

            if (!r.ok) return null;
            const shipmentData = await r.json();

            if (slaRes?.ok) {
              try {
                shipmentData.sla = await slaRes.json();
              } catch {
                // noop
              }
            }

            if (costsRes?.ok) {
              const costsData = await costsRes.json();
              const senderCost = costsData.senders?.[0]?.cost;
              if (senderCost !== undefined && senderCost !== null) {
                shipmentData._seller_shipping_cost = senderCost;
              }
              const senderSave = costsData.senders?.[0]?.save;
              if (senderSave !== undefined && senderSave !== null) {
                shipmentData._seller_shipping_save = senderSave;
              }
              const senderDiscount = sumPromotedAmount(
                costsData.senders?.[0]?.discounts,
              );
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
              const receiverDiscount = sumPromotedAmount(
                costsData.receiver?.discounts,
              );
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
        });
  
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
