/**
 * API de Sincronização de Vendas do Mercado Livre
 *
 * OTIMIZAÇÕES IMPLEMENTADAS:
 * ============================
 *
 * 1. SINCRONIZAÇÃO INCREMENTAL INTELIGENTE:
 *    - Busca vendas progressivamente sem dar timeout (respeitando limite de 60s do Vercel)
 *    - Prioriza vendas mais recentes (mais importantes)
 *    - Vendas já existentes são atualizadas (UPDATE), não duplicadas
 *    - Sincronizações subsequentes continuam de onde a anterior parou
 *    - Suporta contas com 1k até 50k+ vendas
 *
 * 2. DIVISÃO AUTOMÁTICA DE PERÍODOS:
 *    - Quando um período tem mais de 9.950 vendas (limite da API do ML):
 *      * Detecta automaticamente o total de vendas no período
 *      * Divide em sub-períodos menores (7 ou 14 dias dependendo do volume)
 *      * Busca recursivamente cada sub-período
 *      * Garante sincronização completa sem perda de dados
 *
 * 3. SALVAMENTO EM LOTES OTIMIZADO:
 *    - Salva vendas em lotes de 50
 *    - Usa Promise.allSettled para garantir que erros não parem o processo
 *    - Cache de SKU para reduzir queries ao banco
 *    - Sem delays desnecessários para máxima velocidade
 *
 * 4. RETRY AUTOMÁTICO COM BACKOFF:
 *    - Tentativas automáticas em caso de erros temporários (429, 500, 502, 503, 504)
 *    - Exponential backoff: 1s, 2s, 4s
 *    - Até 3 tentativas por requisição
 * 5. Envia progresso em tempo real via SSE
 * 6. Informa se há vendas restantes para próxima sincronização
 *
 * EXEMPLO DE USO (conta com 10k vendas):
 * ======================================
 * Sync 1: 2.500 vendas recentes + 1.000 históricas = 3.500 vendas (55s)
 * Sync 2: Atualiza recentes + 3.000 históricas = 3.000 novas (52s)
 * Sync 3: Atualiza recentes + 3.500 históricas = 3.500 novas (54s)
 * Total: 3 sincronizações = histórico completo de 10k vendas (~3 min)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import { refreshMeliAccountToken } from "@/lib/meli";
import { calcularFreteAdjust } from "@/lib/frete";
import { Decimal } from "@prisma/client/runtime/library";
import { sendProgressToUser, closeUserConnections } from "@/lib/sse-progress";
import { invalidateVendasCache } from "@/lib/cache";
import { smartRefreshMeliAccountToken } from "@/lib/meli";
import {
  enqueueSales,
  getQueueStats,
  type QueuedSale,
} from "@/lib/redis-queue";
import { processAllUserSales } from "@/lib/sync-worker";
import { checkRedisHealth } from "@/lib/redis";
import { extractOrderIdFromPayload } from "@/utils/sync-prepare-sale-data";
import { toFiniteNumber } from "@/utils/numeric-functions";
import { roundCurrency, truncateJsonData, truncateString } from "@/utils/string-utils";
import { calculateMargemContribuicao } from "@/utils/calc-margem-contribuicao";
import { adsTags, mapListingTypeToExposure } from "@/utils/meli-functions";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 segundos (Vercel Pro)

const MELI_API_BASE =
  process.env.MELI_API_BASE?.replace(/\/$/, "") ||
  "https://api.mercadolibre.com";
const PAGE_LIMIT = 50;
const PAGE_FETCH_CONCURRENCY = Math.min(
  5,
  Math.max(1, Number(process.env.MELI_PAGE_FETCH_CONCURRENCY ?? "2") || 2)
);
const MAX_OFFSET = 9950; // Limite seguro antes do 10k da API

// Mutex para evitar refresh concorrente de tokens por conta
const tokenRefreshMutex = new Map<string, Promise<any>>();

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

type FreightSource = "shipment" | "order" | "shipping_option" | null;

type MeliOrderFreight = {
  logisticType: string | null;
  logisticTypeSource: FreightSource | null;
  shippingMode: string | null;

  baseCost: number | null;
  listCost: number | null;
  shippingOptionCost: number | null;
  shipmentCost: number | null;
  orderCostFallback: number | null;
  finalCost: number | null;
  finalCostSource: FreightSource;
  chargedCost: number | null;
  chargedCostSource: FreightSource;

  discount: number | null;
  totalAmount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  diffBaseList: number | null;

  adjustedCost: number | null;
  adjustmentSource: string | null;

  sellerShippingCost: number | null;
  sellerShippingSave: number | null;
  sellerShippingDiscount: number | null;
  receiverShippingCost: number | null;
  receiverShippingSave: number | null;
  receiverShippingDiscount: number | null;
  costsGrossAmount: number | null;
};

function extractOrderDate(order: unknown): Date | null {
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

// Função para debug - identificar qual campo está causando o problema
function debugFieldLengths(data: any, orderId: string) {
  const fieldLengths: { [key: string]: number } = {};

  // Verificar todos os campos de string
  const stringFields = [
    "orderId",
    "userId",
    "meliAccountId",
    "status",
    "conta",
    "titulo",
    "sku",
    "comprador",
    "logisticType",
    "envioMode",
    "shippingStatus",
    "shippingId",
    "exposicao",
    "tipoAnuncio",
    "ads",
    "plataforma",
    "canal",
  ];

  stringFields.forEach((field) => {
    if (data[field] && typeof data[field] === "string") {
      fieldLengths[field] = data[field].length;
    }
  });

  // Log apenas se algum campo for muito longo
  const longFields = Object.entries(fieldLengths).filter(
    ([_, length]) => length > 100
  );
  if (longFields.length > 0) {
    console.log(`[DEBUG] Venda ${orderId} - Campos longos:`, longFields);
  }

  return fieldLengths;
}

function sumOrderQuantities(items: unknown): number | null {
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

function convertLogisticTypeName(logisticType: string | null): string | null {
  if (!logisticType) return logisticType;

  if (logisticType === "xd_drop_off") return "Agência";
  if (logisticType === "self_service") return "FLEX";
  if (logisticType === "cross_docking") return "Coleta";

  return logisticType;
}


function calculateFreight(order: any, shipment: any): MeliOrderFreight {
  const o = order ?? {};
  const s = shipment ?? {};

  const orderShipping =
    o && typeof o.shipping === "object" ? o.shipping ?? {} : {};

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
    s && typeof s.shipping_option === "object" ? s.shipping_option ?? {} : {};

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
  let quantity = sumOrderQuantities(items);

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
    // Para FLEX, o valor real repassado pelo ML está em charge_flex (se >= 79)
    // Se nao houver charge_flex, o bonus vem dos descontos/save do sender ou receiver.
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
      // Fallback
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
    // Fallback genérico
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
    logisticType: convertLogisticTypeName(logisticType),
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

type MeliOrderPayload = {
  accountId: string;
  accountNickname: string | null | undefined;
  mlUserId: number | bigint;
  order: unknown;
  shipment?: unknown;
  freight: MeliOrderFreight;
};

type OrdersFetchResult = {
  orders: MeliOrderPayload[];
  expectedTotal: number;
};

type FetchOrdersResult = {
  orders: MeliOrderPayload[];
  expectedTotal: number;
  forcedStop: boolean;
};

type SyncError = {
  accountId: string;
  mlUserId: bigint;
  message: string;
};

type AccountSummary = {
  id: string;
  nickname: string | null;
  ml_user_id: number;
  expires_at: string;
};

type DateRangeWindow = {
  from: Date;
  to: Date;
  total: number;
  depth: number;
};

type SyncWindow = {
  from: Date;
  to: Date;
  mode: "initial" | "historical" | "manual";
};

type SkuCacheEntry = {
  custoUnitario: number | null;
  tipo: string | null;
};

type MeliAccount = {
  id: string;
  ml_user_id: bigint;
  nickname: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  updated_at: Date;
};

type FetchOrdersPageOptions = {
  account: MeliAccount;
  headers: Record<string, string>;
  userId: string;
  offset: number;
  pageNumber: number;
  dateFrom?: Date;
  dateTo?: Date;
};

type FetchOrdersPageResult = {
  offset: number;
  pageNumber: number;
  total: number | null;
  orders: MeliOrderPayload[];
};

/**
 * Verifica se um erro HTTP é temporário e pode ser retentado
 */
function isRetryableError(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

/**
 * Aguarda um tempo específico (exponential backoff)
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Faz uma requisição HTTP com retry automático para erros temporários
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  userId?: string
): Promise<Response> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      lastResponse = response;

      // Se sucesso, retorna imediatamente
      if (response.ok) {
        return response;
      }

      // Erros de autenticação (401, 403) não devem ser retryable - falhar imediatamente
      if (response.status === 401 || response.status === 403) {
        console.error(
          `[Sync] Erro de autenticação ${response.status} - Token pode estar inválido`
        );
        if (userId) {
          sendProgressToUser(userId, {
            type: "sync_warning",
            message: `Erro de autenticação ${response.status}. Verifique se a conta está conectada corretamente.`,
            errorCode: response.status.toString(),
          });
        }
        return response; // Retornar resposta de erro para tratamento específico
      }

      // Se erro não-retryable (exceto auth), retorna imediatamente
      if (!isRetryableError(response.status)) {
        console.warn(
          `[Sync] Erro HTTP ${
            response.status
          } (não-retryable) em ${url.substring(0, 80)}...`
        );
        return response;
      }

      // Erro retryable - tentar novamente
      lastError = new Error(`HTTP ${response.status}`);

      // Calcular delay com exponential backoff
      const baseDelay = 1000; // 1 segundo
      const delay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
      const jitter = Math.random() * 1000; // até 1s de jitter
      const totalDelay = delay + jitter;

      console.warn(
        `[Retry] Erro ${response.status} em ${url.substring(0, 80)}... ` +
          `Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${Math.round(
            totalDelay
          )}ms`
      );

      // Enviar aviso via SSE apenas na primeira tentativa
      if (userId && attempt === 0) {
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: `Erro temporário ${response.status} da API do Mercado Livre. Tentando novamente...`,
          errorCode: response.status.toString(),
        });
      }

      // Aguardar antes de tentar novamente
      await sleep(totalDelay);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Log do erro
      console.error(
        `[Retry] Erro na requisição (tentativa ${attempt + 1}/${maxRetries}):`,
        lastError.message
      );

      // Se é a última tentativa, lançar erro
      if (attempt === maxRetries - 1) {
        if (userId) {
          sendProgressToUser(userId, {
            type: "sync_warning",
            message: `Erro de conexão após ${maxRetries} tentativas: ${lastError.message}`,
            errorCode: "NETWORK_ERROR",
          });
        }
        throw lastError;
      }

      const baseDelay = 1000;
      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;

      console.warn(
        `[Retry] Erro de rede em ${url.substring(0, 80)}... ` +
          `Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${Math.round(
            totalDelay
          )}ms`
      );

      // Enviar aviso via SSE apenas na primeira tentativa
      if (userId && attempt === 0) {
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: `Erro de conexão. Tentando novamente...`,
          errorCode: "NETWORK_ERROR",
        });
      }

      await sleep(totalDelay);
    }
  }

  // Se chegou aqui, todas as tentativas falharam
  if (lastResponse && !lastResponse.ok) {
    return lastResponse; // Retornar última resposta de erro
  }

  throw lastError || new Error("Falha após múltiplas tentativas");
}

async function fetchOrdersPage({
  account,
  headers,
  userId,
  offset,
  pageNumber,
  dateFrom,
  dateTo,
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
      message
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
    console.log(`[Sync] 📄 Página ${pageNumber}: 0 vendas (offset ${offset})`);
    return result;
  }

  console.log(
    `[Sync] 📄 Página ${pageNumber}: ${
      orders.length
    } vendas (offset ${offset})${
      result.total
        ? ` (${Math.min(offset + orders.length, result.total)}/${result.total})`
        : ""
    }`
  );

  // OTIMIZA��O: Fetch shipments em batches menores para evitar rate limiting
  // Limite de 10 shipments concorrentes (ao inv�s de 50) para n�o sobrecarregar API
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
      })
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
        freight: calculateFreight(order, shipment),
      };
    })
    .filter(Boolean) as MeliOrderPayload[];

  return result;
}

/**
 * FUNÇÃO OTIMIZADA: Busca vendas com limite de tempo (58s máximo)
 * - Prioriza vendas mais recentes primeiro
 * - Busca progressivamente vendas antigas
 * - Evita timeout do Vercel (60s)
 * - Sincronizações subsequentes continuam de onde parou
 */
async function fetchAllOrdersForAccount(
  account: MeliAccount,
  headers: Record<string, string>,
  userId: string,
  quickMode: boolean = false, // Novo parâmetro para controle de modo
  fullSync: boolean = false // Novo parâmetro para sincronização completa desde 01/2025
): Promise<FetchOrdersResult> {
  const startTime = Date.now();
  // MUDANÇA CRÍTICA: Em quickMode, buscar em 20s e deixar 40s para salvar no banco (total 60s)
  // Salvamento de 500 vendas ~5s, mas com margem de segurança para contas grandes
  // Em background mode, pode usar até 45s de busca (deixa 15s para salvar ~1500 vendas)
  // OTIMIZA��O: 30s fetch + 20s save = 50s total (margem 10s para 60s timeout)
  // const MAX_EXECUTION_TIME = 30000; // SEMPRE 30 segundos
  const MAX_EXECUTION_TIME = 3000000; // SEMPRE 30 minutos
  const results: MeliOrderPayload[] = [];
  const detailsResults: MeliOrderPayload[] = [];
  const logisticStats = new Map<string, number>();
  let forcedStop = false; // Declarar forcedStop localmente

  const modoTexto = fullSync
    ? "FULL SYNC (buscar TODAS as vendas)"
    : quickMode
    ? "QUICK (20s busca + 40s salvar)"
    : "BACKGROUND (45s busca + 15s salvar)";
  console.log(
    `[Sync] ?? Iniciando busca de vendas para conta ${account.ml_user_id} (${account.nickname}) - Modo: ${modoTexto}`
  );

  // Verificar venda mais antiga já sincronizada para continuar de onde parou
  const oldestSyncedOrder = await prisma.meliVenda.findFirst({
    where: { meliAccountId: account.id },
    orderBy: { dataVenda: "asc" },
    select: { dataVenda: true },
  });

  const oldestSyncedDate = oldestSyncedOrder?.dataVenda;
  if (oldestSyncedDate) {
    console.log(
      `[Sync] 📅 Venda mais antiga no banco: ${
        oldestSyncedDate.toISOString().split("T")[0]
      }`
    );
  } else {
    console.log(`[Sync] 📅 Primeira sincronização - buscando desde o início`);
  }

  const MAX_OFFSET = 50000; // Limite seguro antes do 10k da API
  let total = 0;
  let discoveredTotal: number | null = null;
  let nextOffset = 0;
  // MUDANÇA CRÍTICA: Em quickMode, buscar apenas 500 vendas para garantir tempo de salvar no banco
  // Salvamento de ~10k vendas demora ~30s, então limitar busca para caber em 60s total
  // Em background, buscar 1500 vendas (mais conservador para evitar timeout)
  // LIMITE SEGURO: 100 vendas por sync (30s fetch + 15s save = 45s total)
  // 12k vendas = 120 syncs autom�ticos
  const SAFE_BATCH_SIZE = 50000;
  let maxOffsetToFetch = Math.min(MAX_OFFSET, SAFE_BATCH_SIZE);
  const activePages = new Set<Promise<void>>();
  let oldestOrderDate: Date | null = null;

  const schedulePageFetch = (offsetValue: number) => {
    const pageNumber = Math.floor(offsetValue / PAGE_LIMIT) + 1;
    const pagePromise = (async () => {
      try {
        const pageResult = await fetchOrdersPage({
          account,
          headers,
          userId,
          offset: offsetValue,
          pageNumber,
        });

        if (
          typeof pageResult.total === "number" &&
          pageResult.total >= 0 &&
          discoveredTotal === null
        ) {
          discoveredTotal = pageResult.total;
          total = discoveredTotal;
          maxOffsetToFetch = Math.min(MAX_OFFSET, discoveredTotal);
          console.log(
            `[Sync] ?? Conta ${account.ml_user_id}: total estimado ${total} vendas`
          );
        }

        if (pageResult.orders.length === 0) {
          return;
        }

        for (const payload of pageResult.orders) {
          results.push(payload);
          const logisticTypeRaw =
            payload.freight.logisticType ||
            payload.freight.shippingMode ||
            "sem_tipo";
          logisticStats.set(
            logisticTypeRaw,
            (logisticStats.get(logisticTypeRaw) || 0) + 1
          );

          const createdAt = extractOrderDate(payload.order);
          if (createdAt && (!oldestOrderDate || createdAt < oldestOrderDate)) {
            oldestOrderDate = createdAt;
          }
        }

        sendProgressToUser(userId, {
          type: "sync_progress",
          message: `${account.nickname || `Conta ${account.ml_user_id}`}: ${
            results.length
          }/${
            discoveredTotal ?? results.length
          } vendas baixadas (p�gina ${pageNumber})`,
          current: results.length,
          total: discoveredTotal ?? results.length,
          fetched: results.length,
          expected: discoveredTotal ?? results.length,
          accountId: account.id,
          accountNickname: account.nickname || undefined,
          page: pageNumber,
        });
      } catch (error) {
        console.error(
          `[Sync] ?? Erro inesperado na p�gina ${pageNumber}:`,
          error
        );
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: `Erro inesperado na p�gina ${pageNumber}: ${
            error instanceof Error ? error.message : "Falha desconhecida"
          }`,
          errorCode: "PAGE_FETCH_ERROR",
        });
      }
    })();

    pagePromise.finally(() => activePages.delete(pagePromise));
    activePages.add(pagePromise);
  };

  // PASSO 1: Buscar vendas recentes (paginação normal)
  while (
    activePages.size < PAGE_FETCH_CONCURRENCY &&
    nextOffset < Math.min(MAX_OFFSET, maxOffsetToFetch)
  ) {
    // Verificar tempo antes de continuar
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      console.log(
        `[Sync] ⏱️ Tempo limite atingido (${Math.round(
          (Date.now() - startTime) / 1000
        )}s) - parando busca de vendas recentes`
      );
      forcedStop = true;
      break;
    }
    schedulePageFetch(nextOffset);
    nextOffset += PAGE_LIMIT;
  }

  while (activePages.size > 0) {
    await Promise.race(activePages);

    // Verificar tempo antes de continuar
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      console.log(`[Sync] ⏱️ Tempo limite atingido - parando paginação`);
      forcedStop = true;
      break;
    }

    while (
      activePages.size < PAGE_FETCH_CONCURRENCY &&
      nextOffset < maxOffsetToFetch &&
      Date.now() - startTime < MAX_EXECUTION_TIME
    ) {
      schedulePageFetch(nextOffset);
      nextOffset += PAGE_LIMIT;
    }
  }

  if (discoveredTotal === null) {
    total = results.length;
  }

  // PASSO 2: Buscar vendas hist�ricas apenas se N�O atingiu o limite
  const timeRemaining = MAX_EXECUTION_TIME - (Date.now() - startTime);
  const reachedLimit = results.length >= SAFE_BATCH_SIZE;
  const shouldFetchHistory = !reachedLimit && timeRemaining > 10000;

  if (shouldFetchHistory) {
    console.log(
      `[Sync] 🔄 Buscando vendas históricas (tempo restante: ${Math.round(
        timeRemaining / 1000
      )}s)...`
    );

    // Determinar ponto de partida para busca histórica
    let searchStartDate: Date;

    if (oldestSyncedDate) {
      // Continuar de onde a última sincronização parou
      searchStartDate = new Date(oldestSyncedDate);
      searchStartDate.setDate(searchStartDate.getDate() - 1); // Um dia antes da última sincronizada
      console.log(
        `[Sync] 📅 Continuando busca histórica a partir de ${
          searchStartDate.toISOString().split("T")[0]
        }`
      );
    } else {
      // Primeira vez: começar da venda mais antiga das recentes
      const fallbackOldest =
        results.length > 0
          ? extractOrderDate(results[results.length - 1].order) ?? new Date()
          : new Date();

      // const fallbackOldest =
      //   results.length > 0
      //     ? extractOrderDate(results[0].order) ?? new Date()
      //     : new Date();
      searchStartDate = oldestOrderDate ?? fallbackOldest;
      console.log("fallback")
      console.log(fallbackOldest)
      console.log(
        `[Sync] 📅 Primeira busca histórica a partir de ${
          searchStartDate.toISOString().split("T")[0]
        }`
      );
    }

    // Buscar vendas mais antigas em blocos de 1 mês
    const currentMonthStart = new Date(searchStartDate);
    currentMonthStart.setDate(1); // Primeiro dia do mês
    currentMonthStart.setHours(0, 0, 0, 0);
    currentMonthStart.setMonth(currentMonthStart.getMonth() - 1); // Começar do mês anterior

    // // NOVA L�"GICA: Se fullSync, buscar TODAS as vendas (desde 2000). Caso contrário, buscar desde 2010.
    // const startDate = fullSync
    //   ? new Date("2000-01-01")
    //   : new Date("2010-01-01");

    const startDate = new Date();
    console.log(
      `[Sync] ${
        fullSync
          ? "?? FULL SYNC ativado - buscando TODAS as vendas (desde 2000)"
          : "?? Modo incremental - buscando desde 2010"
      }`
    );

    // Buscar enquanto tiver tempo
    while (
      currentMonthStart < startDate &&
      Date.now() - startTime < MAX_EXECUTION_TIME - 5000
    ) {
      // Calcular fim do mês
      const currentMonthEnd = new Date(currentMonthStart);
      currentMonthEnd.setMonth(currentMonthEnd.getMonth() + 1);
      currentMonthEnd.setDate(0); // Último dia do mês
      currentMonthEnd.setHours(23, 59, 59, 999);

      console.log(
        `[Sync] 📅 Buscando: ${
          currentMonthStart.toISOString().split("T")[0]
        } a ${currentMonthEnd.toISOString().split("T")[0]}`
      );
      // Buscar vendas deste mês
      const monthOrders = await fetchOrdersInDateRange(
        account,
        headers,
        userId,
        currentMonthStart,
        currentMonthEnd,
        logisticStats
      );

      console.log(
        `[Sync] ✅ Encontradas ${monthOrders.length} vendas neste período`
      );

      detailsResults.push(...monthOrders);

      sendProgressToUser(userId, {
        type: "sync_details_progress",
        message: `${account.nickname || `Conta ${account.ml_user_id}`}: ${
          results.length
        } vendas baixadas (buscando histórico: ${
          currentMonthStart.toISOString().split("T")[0]
        })`,
        current: detailsResults.length,
        total: Math.max(total, results.length), // Usar o maior valor entre total estimado e vendas baixadas
        fetched: detailsResults.length,
        expected: Math.max(total, results.length),
        accountId: account.id,
        accountNickname: account.nickname || undefined,
      });

      // Se não encontrou vendas neste mês, chegou no início do histórico
      if (monthOrders.length === 0) {
        console.log(
          `[Sync] ✅ Nenhuma venda encontrada neste período - histórico completo!`
        );
        // break;
      }

      // Ir para o mês anterior
      currentMonthStart.setMonth(currentMonthStart.getMonth() + 1);
    }

    results.push(...detailsResults)

    const elapsedTime = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `[Sync] ✅ Busca por período concluída em ${elapsedTime}s: ${results.length} vendas baixadas`
    );
    if (
      Date.now() - startTime >= MAX_EXECUTION_TIME - 5000 &&
      currentMonthStart > startDate
    ) {
      forcedStop = true;
    }
  } else if (!shouldFetchHistory && total > results.length) {
    if (timeRemaining <= 10000) {
      forcedStop = true;
    }
    console.log(
      `[Sync] ⏱️ Tempo insuficiente para busca histórica - execute sincronização novamente para continuar`
    );
  }

  // Calcular estatísticas finais
  const elapsedTime = Math.round((Date.now() - startTime) / 1000);
  const finalTotal = Math.max(total, results.length);

  console.log(
    `[Sync] 🎉 ${results.length} vendas baixadas em ${elapsedTime}s (total estimado: ${total})`
  );
  console.log(
    `[Sync] 📊 Tipos de logística:`,
    Array.from(logisticStats.entries())
  );

  // Verificar se há mais vendas para sincronizar
  const totalInDatabase = await prisma.meliVenda.count({
    where: { meliAccountId: account.id },
  });

  if (totalInDatabase < total) {
    const remaining = total - totalInDatabase;
    console.log(
      `[Sync] 📌 ${remaining} vendas restantes - execute sincronização novamente para continuar`
    );
    sendProgressToUser(userId, {
      type: "sync_warning",
      message: `${remaining} vendas antigas ainda não sincronizadas. Execute sincronização novamente para buscar o restante.`,
      accountId: account.id,
      accountNickname: account.nickname || undefined,
    });
  } else {
    console.log(`[Sync] ✅ Histórico completo sincronizado!`);
  }

  return { orders: results, expectedTotal: finalTotal, forcedStop };
}

/**
 * Busca vendas em um período específico (para contornar limite de 10k)
 * Se o período tiver mais de 9.950 vendas, divide em sub-períodos automaticamente
 */
async function fetchOrdersInDateRange(
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

      // Se período tem mais de 9.950 vendas, precisa dividir
      if (totalInPeriod > MAX_OFFSET) {
        needsSplitting = true;
        console.log(
          `[Sync] 🔄 Período tem ${totalInPeriod} vendas (> ${MAX_OFFSET}) - dividindo em sub-períodos`
        );
      }
    }
  } catch (error) {
    console.error(`[Sync] Erro ao verificar total do período:`, error);
    // Continuar mesmo com erro na verificação
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
      const subResults = await fetchOrdersInDateRange(
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

            return r.ok ? await r.json() : o;
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
        const freight = calculateFreight(order, shipment);
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
async function fetchOrdersForWindow(
  account: MeliAccount,
  userId: string,
  window?: SyncWindow,
  specificOrderIds?: string[]
): Promise<OrdersFetchResult> {
  return { orders: [], expectedTotal: 0 };
}

async function buildSafeDateRanges(
  account: MeliAccount,
  headers: Record<string, string>,
  fetchFrom: Date,
  now: Date,
  userId: string
): Promise<DateRangeWindow[]> {
  // Implementação simplificada - retorna um range único
  return [
    {
      from: fetchFrom,
      to: now,
      total: 0,
      depth: 0,
    },
  ];
}

async function buildSkuCache(
  orders: MeliOrderPayload[],
  userId: string
): Promise<Map<string, SkuCacheEntry>> {
  const skuSet = new Set<string>();

  for (const payload of orders) {
    const rawOrder: any = payload.order ?? {};
    const orderItems: any[] = Array.isArray(rawOrder.order_items)
      ? rawOrder.order_items
      : [];

    for (const item of orderItems) {
      const itemData =
        typeof item?.item === "object" && item?.item !== null ? item.item : {};
      const candidate =
        itemData?.seller_sku ||
        itemData?.sku ||
        item?.seller_sku ||
        item?.sku ||
        null;

      if (candidate) {
        const normalized = truncateString(String(candidate), 255);
        if (normalized) {
          skuSet.add(normalized);
        }
      }
    }
  }

  if (skuSet.size === 0) {
    return new Map();
  }

  const skuList = Array.from(skuSet);
  const skuRecords = await prisma.sKU.findMany({
    where: {
      userId,
      sku: { in: skuList },
    },
    select: {
      sku: true,
      custoUnitario: true,
      tipo: true,
    },
  });

  const cache = new Map<string, SkuCacheEntry>();
  for (const record of skuRecords) {
    cache.set(record.sku, {
      custoUnitario:
        record.custoUnitario !== null ? Number(record.custoUnitario) : null,
      tipo: record.tipo ?? null,
    });
  }

  return cache;
}

function deduplicateOrders(orders: MeliOrderPayload[]): {
  uniqueOrders: MeliOrderPayload[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const uniqueOrders: MeliOrderPayload[] = [];
  let duplicates = 0;

  for (const order of orders) {
    const orderId = extractOrderIdFromPayload(order);
    if (!orderId) {
      uniqueOrders.push(order);
      continue;
    }
    if (seen.has(orderId)) {
      duplicates += 1;
      continue;
    }
    seen.add(orderId);
    uniqueOrders.push(order);
  }

  return { uniqueOrders, duplicates };
}

async function saveVendasBatch(
  orders: MeliOrderPayload[],
  userId: string,
  batchSize: number = 100 // OTIMIZADO: aumentado para 100 para batch operations
): Promise<{ saved: number; errors: number }> {
  let saved = 0;
  let errors = 0;

  const { uniqueOrders, duplicates } = deduplicateOrders(orders);
  const totalOrders = uniqueOrders.length;

  if (duplicates > 0) {
    console.warn(
      `[Sync] ${duplicates} venda(s) duplicada(s) detectada(s) no retorno do Mercado Livre. Ignorando duplicatas para evitar salvar pedidos repetidos.`
    );
  }

  if (totalOrders === 0) {
    return { saved, errors };
  }

  try {
    const skuCache = await buildSkuCache(uniqueOrders, userId);
    let processedCount = 0;

    // OTIMIZA��O CR�TICA: Processar em lotes com batch UPSERT
    // Reduz de 500 queries individuais para 5-10 queries em lote
    for (let i = 0; i < totalOrders; i += batchSize) {
      const batch = uniqueOrders.slice(i, i + batchSize);

      try {
        // Preparar todos os dados do batch primeiro
        const preparedData = await Promise.all(
          batch.map((order) => prepareVendaData(order, userId, skuCache))
        );

        // Filtrar dados v�lidos
        const validData = preparedData.filter((d) => d !== null);

        if (validData.length === 0) {
          errors += batch.length;
          processedCount += batch.length;
          continue;
        }

        // Buscar IDs existentes para dividir em creates vs updates
        const orderIds = validData.map((d) => d!.orderId);
        const existingOrders = await prisma.meliVenda.findMany({
          where: { orderId: { in: orderIds } },
          select: { orderId: true },
        });

        const existingOrderIdSet = new Set(
          existingOrders.map((o: any) => o.orderId)
        );

        const toCreate = validData.filter(
          (d) => !existingOrderIdSet.has(d!.orderId)
        );
        const toUpdate = validData.filter((d) =>
          existingOrderIdSet.has(d!.orderId)
        );

        // BATCH CREATE: insere m�ltiplos registros de uma vez
        if (toCreate.length > 0) {
          try {
            await prisma.meliVenda.createMany({
              data: toCreate.map((d) => d!.createData),
              skipDuplicates: true, // Evita erro se j� existir
            });
            saved += toCreate.length;
          } catch (createError) {
            console.error(`[Sync] Erro em batch create:`, createError);
            errors += toCreate.length;
          }
        }

        // BATCH UPDATE: atualiza m�ltiplos registros em uma transa��o
        if (toUpdate.length > 0) {
          try {
            await prisma.$transaction(
              toUpdate.map((d) =>
                prisma.meliVenda.update({
                  where: { orderId: d!.orderId },
                  data: { ...d!.updateData, atualizadoEm: new Date() },
                })
              )
            );
            saved += toUpdate.length;
          } catch (updateError) {
            console.error(`[Sync] Erro em batch update:`, updateError);
            errors += toUpdate.length;
          }
        }
      } catch (batchError) {
        console.error(
          `[Sync] Erro cr�tico no batch ${i}-${i + batchSize}:`,
          batchError
        );
        errors += batch.length;
      }

      // Enviar progresso SSE apenas a cada lote (nao a cada venda) para reduzir overhead
      processedCount += batch.length;
      const percentage = Math.round((processedCount / totalOrders) * 100);
      try {
        sendProgressToUser(userId, {
          type: "sync_progress",
          message: `Salvando no banco: ${processedCount}/${totalOrders} vendas (${percentage}%)`,
          current: processedCount,
          total: totalOrders,
          fetched: processedCount,
          expected: totalOrders,
        });
      } catch (sseError) {
        // Ignorar erros de SSE - nao sao criticos
        console.warn(
          `[Sync] Erro ao enviar progresso SSE (nao critico):`,
          sseError
        );
      }
    }
  } catch (error) {
    console.error(`[Sync] Erro critico em saveVendasBatch:`, error);
    // Retornar o que foi salvo ate agora
    errors = totalOrders - saved;
  }

  return { saved, errors };
}

// Nova fun��o auxiliar para preparar dados da venda sem salvar
async function prepareVendaData(
  order: MeliOrderPayload,
  userId: string,
  skuCache: Map<string, SkuCacheEntry>
): Promise<{ orderId: string; createData: any; updateData: any } | null> {
  const extractedOrderId = extractOrderIdFromPayload(order);

  if (!extractedOrderId) {
    console.error(`[Sync] Venda sem ID valido, pulando...`);
    return null;
  }

  const orderId = extractedOrderId;

  try {
    const o: any = order.order ?? {};
    const freight = order.freight;
    const normalizedMlUserId =
      (order as any)?.mlUserId ??
      (order as any)?.ml_user_id ??
      (typeof o?.seller?.id === "number" ? o.seller.id : null);

    const orderItems: any[] = Array.isArray(o.order_items) ? o.order_items : [];
    const firstItem = orderItems[0] ?? {};
    const orderItem =
      typeof firstItem === "object" && firstItem !== null ? firstItem : {};
    const itemData =
      typeof orderItem?.item === "object" && orderItem.item !== null
        ? orderItem.item
        : {};

    const firstItemTitle =
      itemData?.title ??
      orderItems.find((entry: any) => entry?.item?.title)?.item?.title ??
      o.title ??
      "Pedido";

    const quantity = orderItems.reduce((sum, item) => {
      const qty = toFiniteNumber(item?.quantity) ?? 0;
      return sum + qty;
    }, 0);

    const totalAmount =
      toFiniteNumber(o.total_amount) ??
      orderItems.reduce((acc, item) => {
        const qty = toFiniteNumber(item?.quantity) ?? 0;
        const price = toFiniteNumber(item?.unit_price) ?? 0;
        return acc + qty * price;
      }, 0);

    const buyerName =
      o?.buyer?.nickname ||
      [o?.buyer?.first_name, o?.buyer?.last_name].filter(Boolean).join(" ") ||
      "Comprador";

    const dateString = o.date_closed || o.date_created || o.date_last_updated;

    const tags: string[] = Array.isArray(o.tags)
      ? o.tags.map((t: unknown) => String(t))
      : [];

    const internalTags: string[] = Array.isArray(o.internal_tags)
      ? o.internal_tags.map((t: unknown) => String(t))
      : [];

    const shippingStatus =
      (order.shipment as any)?.status || o?.shipping?.status || undefined;
    const shippingId =
      (order.shipment as any)?.id?.toString() || o?.shipping?.id?.toString();

    const receiverAddress =
      (order.shipment as any)?.receiver_address ??
      (o?.shipping && typeof o.shipping === "object"
        ? (o as any).shipping?.receiver_address
        : undefined) ??
      undefined;
    const latitude = toFiniteNumber(
      (receiverAddress as any)?.latitude ??
        (receiverAddress as any)?.geo?.latitude
    );
    const longitude = toFiniteNumber(
      (receiverAddress as any)?.longitude ??
        (receiverAddress as any)?.geo?.longitude
    );

    const saleFee = orderItems.reduce((acc, item) => {
      const fee = toFiniteNumber(item?.sale_fee) ?? 0;
      const qty = toFiniteNumber(item?.quantity) ?? 1;
      return acc + fee * qty;
    }, 0);

    const unitario =
      toFiniteNumber(orderItem?.unit_price) ??
      (quantity > 0 && totalAmount !== null
        ? roundCurrency(totalAmount / quantity)
        : 0);

    const taxaPlataforma = saleFee > 0 ? -roundCurrency(saleFee) : null;
    const frete = freight.adjustedCost || 0;

    const skuVendaRaw = itemData?.seller_sku || itemData?.sku || null;
    const skuVenda = skuVendaRaw
      ? truncateString(String(skuVendaRaw), 255) || null
      : null;
    let cmv: number | null = null;

    if (skuVenda) {
      const cachedSku = skuCache.get(skuVenda);

      if (cachedSku) {
        if (cachedSku.custoUnitario !== null) {
          cmv = roundCurrency(cachedSku.custoUnitario * quantity);
        }
      }
    }

    const { valor: margemContribuicao, isMargemReal } =
      calculateMargemContribuicao(totalAmount, taxaPlataforma, frete, cmv);

    const contaLabel = truncateString(
      order.accountNickname ?? String(normalizedMlUserId ?? order.accountId),
      255
    );

    const vendaBaseData = {
      dataVenda: dateString ? new Date(dateString) : new Date(),
      status: truncateString(
        String(o.status ?? "desconhecido").replace(/_/g, " "),
        100
      ),
      conta: contaLabel,
      valorTotal: new Decimal(totalAmount),
      quantidade: quantity > 0 ? quantity : 1,
      unitario: new Decimal(unitario),
      taxaPlataforma: taxaPlataforma ? new Decimal(taxaPlataforma) : null,
      frete: new Decimal(frete),
      cmv: cmv !== null ? new Decimal(cmv) : null,
      margemContribuicao: new Decimal(margemContribuicao),
      isMargemReal,
      titulo: truncateString(firstItemTitle, 500) || "Produto sem titulo",
      sku: skuVenda,
      // MLB do anuncio. O dado ja chegava aqui dentro de `itemData` e era
      // descartado: so titulo e SKU eram persistidos. Sem ele nao ha como
      // agrupar vendas por ANUNCIO, e SKU nao substitui -- um SKU vive em
      // varios anuncios, e anuncio com variacao tem varios SKUs.
      itemId:
        truncateString(
          itemData?.id ??
            orderItems.find((entry: any) => entry?.item?.id)?.item?.id ??
            null,
          32,
        ) || null,
      comprador: truncateString(buyerName, 255) || "Comprador",
      logisticType: truncateString(freight.logisticType, 100) || null,
      envioMode: truncateString(freight.shippingMode, 100) || null,
      shippingStatus: truncateString(shippingStatus, 100) || null,
      shippingId: truncateString(shippingId, 255) || null,
      exposicao: (() => {
        const listingTypeId =
          orderItem?.listing_type_id ?? itemData?.listing_type_id ?? null;
        return mapListingTypeToExposure(listingTypeId);
      })(),
      tipoAnuncio: tags.includes("catalog") ? "Catalogo" : "Proprio",
      ads: (internalTags.includes("ads") || tags.some(value => adsTags.includes(value))) ? "ADS" : null,
      plataforma: "Mercado Livre",
      canal: "ML",
      tags: truncateJsonData(tags),
      internalTags: truncateJsonData(internalTags),
      rawData: truncateJsonData({
        order: o,
        shipment: order.shipment as any,
        freight: freight,
      }),
    };

    // Tentar incluir geo se dispon�vel
    const geoData =
      latitude !== null && longitude !== null
        ? {
            latitude: new Decimal(latitude),
            longitude: new Decimal(longitude),
          }
        : {};

    const createData = {
      orderId: truncateString(orderId, 255),
      userId: truncateString(userId, 50),
      meliAccountId: truncateString(order.accountId, 25),
      ...vendaBaseData,
      ...geoData,
    };

    const updateData = {
      ...vendaBaseData,
      ...geoData,
    };

    return { orderId, createData, updateData };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Sync] Erro ao preparar venda ${orderId}:`, errorMsg);
    return null;
  }
}

// REMOVIDA: saveVendaToDatabase() - refatorada em prepareVendaData() + batch operations
export async function POST(req: NextRequest) {
  // Suportar tanto autentica��o de usu�rio quanto cron job
  const sessionCookie = req.cookies.get("session")?.value;
  const cronSecret = req.headers.get("x-cron-secret");

  // Ler body primeiro (s� pode ser lido uma vez)
  let requestBody: {
    accountIds?: string[];
    orderIdsByAccount?: Record<string, string[]>;
    quickMode?: boolean;
    fullSync?: boolean;
  } = {};

  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch (error) {
    console.error("[Sync] Erro ao parsear body:", error);
  }

  let userId: string;

  // Autenticar via cron secret OU sess�o de usu�rio
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    // Requisi��o de cron job - pegar userId do body
    const accountId = requestBody.accountIds?.[0];
    if (!accountId) {
      return new NextResponse("Missing accountId for cron job", {
        status: 400,
      });
    }

    // Buscar userId da conta
    const account = await prisma.meliAccount.findUnique({
      where: { id: accountId },
      select: { userId: true },
    });

    if (!account) {
      return new NextResponse("Account not found", { status: 404 });
    }

    userId = account.userId;
    console.log(`[Sync] Cron job autenticado para userId: ${userId}`);
  } else {
    // Autentica��o normal via sess�o
    let session;
    try {
      session = await assertSessionToken(sessionCookie);
    } catch {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    userId = session.sub;
  }

  // Por padrão, usar quickMode=true para evitar timeout
  // const quickMode = requestBody.quickMode !== false; // true por padrão, false apenas se explicitamente passado
  const quickMode = false;
  const fullSync = requestBody.fullSync === true; // fullSync apenas se explicitamente true

  console.log(`[Sync] Iniciando sincronização para usuário ${userId}`, {
    accountIds: requestBody.accountIds,
    hasOrderIds: !!requestBody.orderIdsByAccount,
    quickMode: quickMode, // Log do modo
    fullSync: fullSync, // Log do modo fullSync
  });

  // Dar um delay para garantir que o SSE está conectado
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Enviar evento de início da sincronização
  sendProgressToUser(userId, {
    type: "sync_start",
    message: "Conectando ao Mercado Livre...",
    current: 0,
    total: 0,
    fetched: 0,
    expected: 0,
  });

  // Buscar contas - filtrar por IDs se fornecidos
  const accountsWhere: any = { userId };
  if (requestBody.accountIds && requestBody.accountIds.length > 0) {
    accountsWhere.id = { in: requestBody.accountIds };
  }

  const accounts = await prisma.meliAccount.findMany({
    where: accountsWhere,
    orderBy: { created_at: "desc" },
  });

  console.log(
    `[Sync] Encontradas ${accounts.length} conta(s) do Mercado Livre`
  );

  if (accounts.length === 0) {
    sendProgressToUser(userId, {
      type: "sync_complete",
      message: "Nenhuma conta do MercadoLivre encontrada",
      current: 0,
      total: 0,
      fetched: 0,
      expected: 0,
    });

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      accounts: [] as AccountSummary[],
      orders: [] as MeliOrderPayload[],
      errors: [] as SyncError[],
      totals: { expected: 0, fetched: 0, saved: 0 },
    });
  }

  const errors: SyncError[] = [];
  const summaries: AccountSummary[] = [];
  let totalExpectedOrders = 0;
  let totalFetchedOrders = 0;
  let totalSavedOrders = 0;
  let forcedStop = false;

  // Preparar steps para cada conta
  const steps = accounts.map((acc: any) => ({
    accountId: acc.id,
    accountName: acc.nickname || `Conta ${acc.ml_user_id}`,
    currentStep: "pending" as
      | "pending"
      | "fetching"
      | "saving"
      | "completed"
      | "error",
    progress: 0,
    fetched: 0,
    expected: 0,
    error: undefined as string | undefined,
  }));

  for (let accountIndex = 0; accountIndex < accounts.length; accountIndex++) {
    const account = accounts[accountIndex];
    const summary: AccountSummary = {
      id: account.id,
      nickname: account.nickname,
      ml_user_id: Number(account.ml_user_id),
      expires_at: account.expires_at.toISOString(),
    };
    summaries.push(summary);

    try {
      // Atualizar step para fetching
      steps[accountIndex].currentStep = "fetching";

      // Enviar progresso: processando conta
      sendProgressToUser(userId, {
        type: "sync_progress",
        message: `Buscando vendas da conta ${
          account.nickname || account.ml_user_id
        }...`,
        current: accountIndex,
        total: accounts.length,
        fetched: totalFetchedOrders,
        expected: totalExpectedOrders,
        accountId: account.id,
        accountNickname: account.nickname || `Conta ${account.ml_user_id}`,
        steps: steps,
      });

      let current = account;
      try {
        // Usar mutex para evitar refresh concorrente
        const mutexKey = `refresh_${account.id}`;
        if (tokenRefreshMutex.has(mutexKey)) {
          console.log(
            `[Sync] Aguardando refresh em andamento para conta ${account.id}`
          );
          current = await tokenRefreshMutex.get(mutexKey)!;
        } else {
          const refreshPromise = smartRefreshMeliAccountToken(account);
          tokenRefreshMutex.set(mutexKey, refreshPromise);
          try {
            current = await refreshPromise;
            tokenRefreshMutex.delete(mutexKey);
          } catch (error) {
            tokenRefreshMutex.delete(mutexKey);
            throw error;
          }
        }
        summary.expires_at = current.expires_at.toISOString();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao renovar token.";
        errors.push({
          accountId: account.id,
          mlUserId: account.ml_user_id,
          message,
        });
        console.error(
          `[Sync] Erro ao renovar token da conta ${account.id}:`,
          error
        );

        // Atualizar step para erro
        steps[accountIndex].currentStep = "error";
        steps[accountIndex].error = message;

        // Enviar erro via SSE
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: `Erro ao renovar token da conta ${
            account.nickname || account.ml_user_id
          }: ${message}. Continuando com próxima conta...`,
          errorCode: "TOKEN_REFRESH_FAILED",
        });
        continue;
      }

      try {
        const specificOrderIds = requestBody.orderIdsByAccount?.[account.id];

        const existingVendasCount = await prisma.meliVenda.count({
          where: { meliAccountId: account.id },
        });
        const now = new Date();

        const processAndSave = async (
          fetchedOrders: MeliOrderPayload[],
          expectedTotal: number,
          label: string
        ) => {
          const effectiveExpected = expectedTotal || fetchedOrders.length;
          totalExpectedOrders += effectiveExpected;
          totalFetchedOrders += fetchedOrders.length;

          steps[accountIndex].expected += effectiveExpected;
          steps[accountIndex].fetched += fetchedOrders.length;
          steps[accountIndex].progress =
            fetchedOrders.length > 0 ? 50 : steps[accountIndex].progress;

          console.log(
            `[Sync] Conta ${account.nickname}: ${fetchedOrders.length} venda(s) encontradas na janela ${label}`
          );

          if (fetchedOrders.length === 0) {
            return;
          }

          steps[accountIndex].currentStep = "saving";
          sendProgressToUser(userId, {
            type: "sync_progress",
            message: `Salvando ${
              fetchedOrders.length
            } venda(s) (${label}) da conta ${
              account.nickname || account.ml_user_id
            }...`,
            current: accountIndex,
            total: accounts.length,
            fetched: totalFetchedOrders,
            expected: totalExpectedOrders,
            accountId: account.id,
            accountNickname: account.nickname || `Conta ${account.ml_user_id}`,
            steps,
          });

          try {
            const batchResult = await saveVendasBatch(
              fetchedOrders,
              userId,
              50
            );
            totalSavedOrders += batchResult.saved;
            console.log(
              `[Sync] Conta ${account.nickname}: ${batchResult.saved} vendas salvas (${label}), ${batchResult.errors} erros`
            );

            if (batchResult.errors > 0) {
              console.warn(
                `[Sync] ${batchResult.errors} vendas falharam ao salvar para conta ${current.id}`
              );
              sendProgressToUser(userId, {
                type: "sync_warning",
                message: `${batchResult.errors} vendas da conta ${
                  account.nickname || account.ml_user_id
                } nao puderam ser salvas (${label})`,
                errorCode: "SAVE_ERRORS",
              });
            }
          } catch (saveError) {
            const saveErrorMsg =
              saveError instanceof Error
                ? saveError.message
                : "Erro desconhecido";
            console.error(
              `[Sync] Erro ao salvar vendas da conta ${current.id}:`,
              saveError
            );
            errors.push({
              accountId: current.id,
              mlUserId: current.ml_user_id,
              message: `Erro ao salvar vendas: ${saveErrorMsg}`,
            });

            sendProgressToUser(userId, {
              type: "sync_warning",
              message: `Erro ao salvar vendas da conta ${
                account.nickname || account.ml_user_id
              }: ${saveErrorMsg}`,
              errorCode: "SAVE_BATCH_ERROR",
            });
          }
        };

        steps[accountIndex].expected = 0;
        steps[accountIndex].fetched = 0;

        // NOVA LÓGICA SIMPLES: Buscar TODAS as vendas sem janelas complexas
        const headers = { Authorization: `Bearer ${current.access_token}` };

        console.log(
          `[Sync] 🚀 Buscando TODAS as vendas da conta ${current.ml_user_id} (${current.nickname})`
        );
        console.log(
          `[Sync] Debug - accountIndex: ${accountIndex}, userId: ${userId}`
        );

        let allOrders: MeliOrderPayload[] = [];
        let expectedTotal = 0;
        let accountForcedStop = false;

        try {
          const result = await fetchAllOrdersForAccount(
            current,
            headers,
            userId,
            quickMode, // NOVO: passa o modo de sincronização
            fullSync // NOVO: passa o modo fullSync
          );
          allOrders = result.orders;
          expectedTotal = result.expectedTotal;
          accountForcedStop = result.forcedStop;
          forcedStop = forcedStop || accountForcedStop;

          console.log(
            `[Sync] ✅ Conta ${current.ml_user_id}: ${allOrders.length} vendas baixadas de ${expectedTotal} totais`
          );
          console.log(
            `[Sync] Debug - allOrders.length: ${allOrders.length}, expectedTotal: ${expectedTotal}`
          );
        } catch (fetchError) {
          const fetchMsg =
            fetchError instanceof Error
              ? fetchError.message
              : "Erro ao buscar vendas";
          console.error(
            `[Sync] ❌ Erro ao buscar vendas da conta ${current.ml_user_id}:`,
            fetchError
          );
          throw new Error(`Falha ao buscar vendas: ${fetchMsg}`);
        }

        // NOVA LÓGICA COM REDIS: Two-phase sync
        const isRedisHealthy = await checkRedisHealth();
        console.log(
          `[Sync] Redis status: ${
            isRedisHealthy
              ? "✅ Available"
              : "⚠️ Unavailable - using direct save"
          }`
        );

        if (isRedisHealthy && allOrders.length > 0) {
          // === FASE 1: Enqueue no Redis ===
          console.log(
            `[Sync] 📦 Fase 1: Enfileirando ${allOrders.length} vendas no Redis...`
          );

          sendProgressToUser(userId, {
            type: "sync_download_progress",
            message: `Salvando ${allOrders.length} vendas no cache...`,
            current: 0,
            total: allOrders.length,
            phase: "downloading",
            accountId: current.id,
            accountNickname: current.nickname || `Conta ${current.ml_user_id}`,
          });

          // Convert to QueuedSale format
          const queuedSales: QueuedSale[] = allOrders.map((order) => ({
            accountId: order.accountId,
            accountNickname: order.accountNickname ?? null,
            mlUserId: Number(order.mlUserId),
            order: order.order,
            shipment: order.shipment,
            freight: order.freight,
          }));

          const enqueueResult = await enqueueSales(
            userId,
            current.id,
            queuedSales
          );

          if (enqueueResult.success) {
            console.log(
              `[Sync] ✅ ${enqueueResult.count} vendas enfileiradas no Redis`
            );

            sendProgressToUser(userId, {
              type: "sync_download_complete",
              message: `${enqueueResult.count} vendas baixadas e armazenadas`,
              current: enqueueResult.count,
              total: enqueueResult.count,
              phase: "downloading",
            });

            // === FASE 2: Processar Redis → PostgreSQL ===
            console.log(
              `[Sync] 💾 Fase 2: Processando fila Redis → PostgreSQL...`
            );

            try {
              const workerResult = await processAllUserSales(userId);
              console.log(
                `[Sync] ✅ Worker completou: ${workerResult.totalProcessed} salvas, ${workerResult.totalErrors} erros`
              );

              totalSavedOrders += workerResult.totalProcessed;

              sendProgressToUser(userId, {
                type: "sync_save_complete",
                message: `✅ ${workerResult.totalProcessed} vendas salvas no banco`,
                current: workerResult.totalProcessed,
                total: workerResult.totalProcessed,
                phase: "complete",
                accountId: current.id,
                accountNickname:
                  current.nickname || `Conta ${current.ml_user_id}`,
              });
            } catch (workerError) {
              console.error(
                `[Sync] ❌ Erro no worker Redis → PostgreSQL:`,
                workerError
              );
              throw new Error(`Erro ao processar fila: ${workerError}`);
            }
          } else {
            // Redis falhou, usar salvamento direto
            console.warn(
              `[Sync] ⚠️ Falha ao enfileirar no Redis, usando salvamento direto`
            );
            await processAndSave(allOrders, expectedTotal, "completo");
          }
        } else {
          // Redis indisponível ou sem vendas, usar salvamento direto
          console.log(
            `[Sync] 📥 Redis indisponível ou sem vendas, usando salvamento direto`
          );

          sendProgressToUser(userId, {
            type: "sync_progress",
            message: `Salvando ${allOrders.length} vendas diretamente no banco...`,
            current: 0,
            total: allOrders.length,
            accountId: current.id,
            accountNickname: current.nickname || `Conta ${current.ml_user_id}`,
          });

          try {
            await processAndSave(allOrders, expectedTotal, "completo");
            console.log(
              `[Sync] ✅ Salvamento direto concluído para conta ${current.ml_user_id}`
            );
          } catch (saveError) {
            const saveMsg =
              saveError instanceof Error
                ? saveError.message
                : "Erro ao salvar vendas";
            console.error(
              `[Sync] ❌ Erro ao salvar vendas da conta ${current.ml_user_id}:`,
              saveError
            );
            throw new Error(`Falha ao salvar vendas: ${saveMsg}`);
          }
        }
      } catch (error) {
        steps[accountIndex].currentStep = "error";
        steps[accountIndex].error =
          error instanceof Error ? error.message : "Erro desconhecido";
        const message =
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao processar pedidos.";
        errors.push({
          accountId: current.id,
          mlUserId: current.ml_user_id,
          message,
        });
        console.error(`[Sync] Erro ao processar conta ${current.id}:`, error);

        // Enviar erro via SSE
        sendProgressToUser(userId, {
          type: "sync_warning",
          message: `Erro na conta ${
            current.nickname || current.ml_user_id
          }: ${message}. Continuando com próxima conta...`,
          errorCode: "ACCOUNT_PROCESSING_ERROR",
        });

        // Atualizar progresso mesmo com erro
        sendProgressToUser(userId, {
          type: "sync_progress",
          message: `Conta ${current.nickname || current.ml_user_id} com erro`,
          current: accountIndex + 1,
          total: accounts.length,
          fetched: totalFetchedOrders,
          expected: totalExpectedOrders,
          accountId: current.id,
          accountNickname: current.nickname || `Conta ${current.ml_user_id}`,
          steps: steps,
        });
      }
    } catch (error) {
      // Erro catastrófico na conta - continuar com próxima
      const errorMsg =
        error instanceof Error ? error.message : "Erro crítico desconhecido";
      console.error(
        `[Sync] Erro catastrófico ao processar conta ${account.id}:`,
        error
      );

      steps[accountIndex].currentStep = "error";
      steps[accountIndex].error = errorMsg;
      errors.push({
        accountId: account.id,
        mlUserId: account.ml_user_id,
        message: errorMsg,
      });

      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `Erro crítico na conta ${
          account.nickname || account.ml_user_id
        }: ${errorMsg}. Continuando com próxima conta...`,
        errorCode: "CRITICAL_ERROR",
      });
    }
  }

  // Verificar se há mais vendas antigas para sincronizar
  // Em fullSync ou quickMode, indicar se ainda faltam vendas
  const pendingVolume = totalFetchedOrders < totalExpectedOrders;
  const hasMoreToSync =
    forcedStop || ((fullSync || quickMode) && pendingVolume);

  // Enviar evento de conclus�o da sincroniza��o
  let mensagemFinal = "";
  if (forcedStop) {
    mensagemFinal = `?? ${totalSavedOrders} vendas processadas at� agora. Tempo limite atingido, continuaremos automaticamente.`;
  } else if (fullSync && hasMoreToSync) {
    mensagemFinal = `? ${totalSavedOrders} vendas sincronizadas de ${totalExpectedOrders}! Clique novamente para continuar...`;
  } else if (fullSync) {
    mensagemFinal = `? Sincroniza��o completa! ${totalSavedOrders} vendas processadas de ${totalExpectedOrders}`;
  } else if (quickMode) {
    mensagemFinal = `Vendas recentes sincronizadas! ${totalSavedOrders} vendas processadas${
      hasMoreToSync ? ". Sincronizando vendas antigas em background..." : ""
    }`;
  } else {
    mensagemFinal = `Sincroniza��o completa! ${totalSavedOrders} vendas processadas de ${totalExpectedOrders} esperadas`;
  }

  sendProgressToUser(userId, {
    type: "sync_complete",
    message: mensagemFinal,
    current: totalSavedOrders,
    total: totalExpectedOrders,
    fetched: totalSavedOrders,
    expected: totalExpectedOrders,
    hasMoreToSync, // NOVO: indica se há mais vendas antigas
  });

  // Invalidar cache de vendas após sincronização
  invalidateVendasCache(userId);
  console.log(`[Cache] Cache de vendas invalidado para usuário ${userId}`);

  // AUTO-SYNC: Continuar automaticamente se houver mais vendas
  if (hasMoreToSync) {
    console.log(`[Sync] Iniciando proximo sync automaticamente...`);

    sendProgressToUser(userId, {
      type: "sync_continue",
      message: `Continuando... ${totalSavedOrders} vendas salvas.`,
      current: totalSavedOrders,
      total: totalExpectedOrders,
      fetched: totalFetchedOrders,
      expected: totalExpectedOrders,
    });

    // Trigger pr�ximo sync (fire-and-forget - n�o espera resposta)
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    fetch(`${baseUrl}/api/meli/vendas/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${sessionCookie}`,
      },
      body: JSON.stringify({
        accountIds: requestBody.accountIds,
        quickMode: requestBody.quickMode,
        fullSync: requestBody.fullSync,
      }),
    }).catch((err) => console.error(`[Sync] Erro ao continuar:`, err));
  } else {
    // Fechar SSE apenas quando completar tudo
    setTimeout(() => closeUserConnections(userId), 2000);
  }

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    accounts: summaries,
    orders: [] as MeliOrderPayload[],
    errors,
    totals: {
      expected: totalExpectedOrders,
      fetched: totalFetchedOrders,
      saved: totalSavedOrders,
    },
    hasMoreToSync, // NOVO: flag indicando se há vendas antigas pendentes
    quickMode, // NOVO: indica qual modo foi usado
    autoSyncTriggered: hasMoreToSync,
  });
}
