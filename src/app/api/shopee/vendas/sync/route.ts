import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { NextRequest, NextResponse } from "next/server";

import { assertSessionToken } from "@/lib/auth";
import { invalidateVendasCache } from "@/lib/cache";
import { pMap } from "@/lib/concorrencia";
import { extrairPrazoDespachoShopee } from "@/lib/prazo-despacho";
import prisma from "@/lib/prisma";
import {
  calculateShopeeFinancials,
  SHOPEE_FINANCIAL_RULE_VERSION,
} from "@/lib/shopee-finance";
import {
  getShopeeEscrowDetail,
  getShopeeOrderDetail,
  getShopeeOrderList,
  refreshShopeeAccountToken,
  type ShopeeOrderTimeRangeField,
} from "@/lib/shopee";
import {
  collectSkuCandidatesFromShopeeOrders,
  fetchShopeeCatalogSkuCandidates,
  registerDiscoveredSkus,
} from "@/lib/sku-discovery";
import { closeUserConnections, sendProgressToUser } from "@/lib/sse-progress";
import { acquireSyncLock } from "@/lib/sync-lock";
import {
  gravarCursorSync,
  inicioJanelaPeloCursor,
} from "@/lib/sync-cursor";

export const runtime = "nodejs";
export const maxDuration = 3600;

const ACCOUNT_CONCURRENCY = 3;
const WINDOW_CONCURRENCY = 2;
const DETAIL_CONCURRENCY = 4;
const ESCROW_CONCURRENCY = 10;
const UPSERT_CONCURRENCY = 8;
const ORDER_PIPELINE_CHUNK_SIZE = 100;
const MAX_WINDOW_SECONDS = 15 * 24 * 60 * 60;
const NON_TERMINAL_HEAL_LIMIT = 500;
const FINANCIAL_HEAL_LIMIT = 200;
const HISTORICAL_START = new Date("2024-01-01T00:00:00.000Z");
const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED"];

type AnyRecord = Record<string, unknown>;
type SyncError = { accountId: string; shopId: string; message: string };
type AccountSummary = { id: string; shop_id: string };
type PipelineFailure = {
  stage: "list" | "ownership" | "detail" | "escrow" | "finance" | "save";
  message: string;
  orderId?: string;
};
type ShopeeAccountRef = {
  id: string;
  userId: string;
  shop_id: string;
  shop_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
};
type EnrichedOrder = {
  order: AnyRecord;
  existing?: ExistingShopeeVenda;
  financialComplete: boolean;
};
type AccountRunResult = {
  expected: number;
  fetched: number;
  saved: number;
  skipped: number;
  error?: SyncError;
};

type SyncOwnership = { lost: boolean };

const LEASE_LOST_MESSAGE =
  "lock da sincronização perdido; execução interrompida antes do próximo lote";

const existingVendaSelect = {
  orderId: true,
  userId: true,
  shopeeAccountId: true,
  status: true,
  rawData: true,
  paymentDetails: true,
  valorTotal: true,
  quantidade: true,
  unitario: true,
  taxaPlataforma: true,
  frete: true,
  margemContribuicao: true,
  isMargemReal: true,
} satisfies Prisma.ShopeeVendaSelect;

type ExistingShopeeVenda = Prisma.ShopeeVendaGetPayload<{
  select: typeof existingVendaSelect;
}>;

function rec(value: unknown): AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function records(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.map(rec) : [];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  return value === null || value === undefined ? "" : String(value);
}

function truncateString(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0) return "";
  return value.length > maxLength ? value.substring(0, maxLength) : value;
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getPartnerCredentials() {
  const partnerId =
    process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_CLIENT_ID || "";
  const partnerKey =
    process.env.SHOPEE_PARTNER_KEY ||
    process.env.SHOPEE_CLIENT_SECRET ||
    "";
  if (!partnerId || !partnerKey) {
    throw new Error("Credenciais da integração Shopee não configuradas");
  }
  return { partnerId, partnerKey };
}

const refreshInFlight = new Map<
  string,
  Promise<{ access_token: string; refresh_token: string; expires_at: Date }>
>();

async function refreshAccountSingleFlight(
  account: ShopeeAccountRef,
): Promise<void> {
  let pending = refreshInFlight.get(account.id);
  if (!pending) {
    const { partnerId, partnerKey } = getPartnerCredentials();
    pending = refreshShopeeAccountToken(account, partnerId, partnerKey);
    refreshInFlight.set(account.id, pending);
  }

  try {
    const refreshed = await pending;
    account.access_token = refreshed.access_token;
    account.refresh_token = refreshed.refresh_token;
    account.expires_at = refreshed.expires_at;
  } finally {
    if (refreshInFlight.get(account.id) === pending) {
      refreshInFlight.delete(account.id);
    }
  }
}

async function executeWithTokenRetry<T>(
  account: ShopeeAccountRef,
  operation: (accessToken: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const tokenUsed = account.access_token;
    try {
      return await operation(tokenUsed);
    } catch (error) {
      lastError = error;
      const message = errorMessage(error);
      const invalidToken =
        message.includes("invalid_access_token") ||
        message.includes("invalid_acceess_token");

      if (!invalidToken || attempt === 1) throw error;

      // Outra chamada da mesma conta pode ter renovado enquanto esta falhava.
      if (account.access_token === tokenUsed) {
        await refreshAccountSingleFlight(account);
      }
    }
  }

  throw lastError;
}

function preferNewestOrder(
  current: AnyRecord | undefined,
  candidate: AnyRecord,
): AnyRecord {
  if (!current) return candidate;
  const currentUpdate = toFiniteNumber(current.update_time);
  const candidateUpdate = toFiniteNumber(candidate.update_time);
  if (candidateUpdate === null) return current;
  if (currentUpdate === null || candidateUpdate >= currentUpdate) return candidate;
  return current;
}

async function fetchListWindow(
  account: ShopeeAccountRef,
  startSeconds: number,
  endSeconds: number,
  timeRangeField: ShopeeOrderTimeRangeField,
): Promise<{ orders: AnyRecord[]; failure?: PipelineFailure }> {
  const { partnerId, partnerKey } = getPartnerCredentials();
  const orders: AnyRecord[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  try {
    for (let page = 0; page < 1_000; page += 1) {
      const rawResponse = await executeWithTokenRetry(
        account,
        (accessToken) =>
          getShopeeOrderList({
            partnerId,
            partnerKey,
            accessToken,
            shopId: account.shop_id,
            timeRangeField,
            timeFrom: startSeconds,
            timeTo: endSeconds,
            pageSize: 100,
            cursor,
          }),
      );
      if (
        rawResponse === null ||
        typeof rawResponse !== "object" ||
        Array.isArray(rawResponse)
      ) {
        throw new Error("resposta de listagem ausente ou malformada");
      }
      const response = rec(rawResponse);
      if (!Array.isArray(response.order_list)) {
        throw new Error("order_list ausente na resposta de listagem");
      }
      if (typeof response.more !== "boolean") {
        throw new Error("marcador more ausente na resposta de listagem");
      }

      for (const order of records(response.order_list)) {
        if (!stringValue(order.order_sn)) {
          throw new Error("pedido sem order_sn na resposta de listagem");
        }
        orders.push(order);
      }
      if (!response.more) return { orders };

      const nextCursor = stringValue(response.next_cursor);
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new Error("cursor de paginacao ausente ou repetido");
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    throw new Error("limite de paginas da janela atingido");
  } catch (error) {
    return {
      orders,
      failure: {
        stage: "list",
        message: `${new Date(startSeconds * 1000).toISOString()} - ${new Date(
          endSeconds * 1000,
        ).toISOString()}: ${errorMessage(error)}`,
      },
    };
  }
}

function buildWindows(
  since: Date,
  until: Date,
): Array<{ startSeconds: number; endSeconds: number }> {
  const windows: Array<{ startSeconds: number; endSeconds: number }> = [];
  let startSeconds = epochSeconds(since);
  const untilSeconds = epochSeconds(until);

  while (startSeconds <= untilSeconds) {
    const endSeconds = Math.min(
      startSeconds + MAX_WINDOW_SECONDS - 1,
      untilSeconds,
    );
    windows.push({ startSeconds, endSeconds });
    startSeconds = endSeconds + 1;
  }

  // Primeira carga começa pelo período mais recente. Assim o usuário enxerga
  // as vendas atuais em segundos enquanto o histórico segue preenchendo atrás.
  return windows.reverse();
}

type ListedBatchHandler = (
  orderIds: string[],
  progress: { windowsDone: number; windowsTotal: number },
) => Promise<void>;

async function fetchListedOrders(
  account: ShopeeAccountRef,
  since: Date,
  until: Date,
  timeRangeField: ShopeeOrderTimeRangeField,
  userId: string,
  onBatch?: ListedBatchHandler,
  shouldContinue?: () => boolean,
): Promise<{
  byOrderId: Map<string, AnyRecord>;
  failures: PipelineFailure[];
}> {
  const windows = buildWindows(since, until);
  const byOrderId = new Map<string, AnyRecord>();
  const failures: PipelineFailure[] = [];
  // Listagem e processamento trabalham como uma esteira: enquanto um lote faz
  // detalhes/escrow/gravação, as próximas janelas já são listadas. O pipeline
  // permanece sequencial para não multiplicar a concorrência financeira.
  let batchProcessing: Promise<void> = Promise.resolve();

  console.log(
    `[Shopee Sync] ${account.shop_id}: ${windows.length} janela(s) por ${timeRangeField}`,
  );

  for (let index = 0; index < windows.length; index += WINDOW_CONCURRENCY) {
    if (shouldContinue && !shouldContinue()) {
      failures.push({ stage: "save", message: LEASE_LOST_MESSAGE });
      break;
    }
    const batch = windows.slice(index, index + WINDOW_CONCURRENCY);
    const results = await pMap(batch, WINDOW_CONCURRENCY, (window) =>
      fetchListWindow(
        account,
        window.startSeconds,
        window.endSeconds,
        timeRangeField,
      ),
    );

    const batchOrderIds: string[] = [];
    for (const result of results) {
      if (result.failure) failures.push(result.failure);

      for (const order of result.orders) {
        const orderId = stringValue(order.order_sn);
        if (!orderId) continue;

        const previous = byOrderId.get(orderId);
        if (!previous) batchOrderIds.push(orderId);
        byOrderId.set(orderId, preferNewestOrder(previous, order));
      }
    }

    if (onBatch && batchOrderIds.length > 0) {
      const idsToProcess = [...batchOrderIds];
      const progress = {
        windowsDone: Math.min(index + batch.length, windows.length),
        windowsTotal: windows.length,
      };
      batchProcessing = batchProcessing
        .then(() => onBatch(idsToProcess, progress))
        .catch((error) => {
          const message = `pipeline do lote falhou: ${errorMessage(error)}`;
          failures.push({ stage: "save", message });
          console.error(`[Shopee Sync] ${account.shop_id}: ${message}`, error);
        });
    }

    sendProgressToUser(userId, {
      type: "sync_progress",
      message: `Loja ${account.shop_id}: ${byOrderId.size} pedido(s) listados`,
      current: Math.min(index + batch.length, windows.length),
      total: windows.length,
      fetched: byOrderId.size,
      expected: byOrderId.size,
      accountId: account.id,
      accountNickname: `Loja ${account.shop_id}`,
    });

  }

  // Todas as janelas podem já estar listadas, mas o último lote ainda pode estar
  // salvando. A conta só termina (e o cursor só avança) depois de drenar a esteira.
  await batchProcessing;

  return { byOrderId, failures };
}

async function fetchExistingVendas(
  orderIds: string[],
): Promise<ExistingShopeeVenda[]> {
  if (orderIds.length === 0) return [];
  return prisma.shopeeVenda.findMany({
    where: { orderId: { in: orderIds } },
    select: existingVendaSelect,
  });
}

async function findFinancialHealOrderIds(accountId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ order_id: string }>>`
    SELECT order_id
    FROM shopee_venda
    WHERE shopee_account_id = ${accountId}
      AND (
        (status = 'COMPLETED' AND taxa_plataforma >= 0)
        OR payment_details IS NULL
        OR NOT jsonb_exists(payment_details::jsonb, 'productValueBreakdown')
        OR payment_details->>'financialRuleVersion' IS DISTINCT FROM ${SHOPEE_FINANCIAL_RULE_VERSION}
        OR COALESCE(payment_details->>'financialSyncPending', 'false') = 'true'
      )
    ORDER BY atualizado_em ASC, data_venda DESC
    LIMIT ${FINANCIAL_HEAL_LIMIT}
  `;
  return rows.map((row) => row.order_id).filter(Boolean);
}

async function findNonTerminalHealOrderIds(
  accountId: string,
  listedOrderIds: string[],
): Promise<string[]> {
  const rows = await prisma.shopeeVenda.findMany({
    where: {
      shopeeAccountId: accountId,
      status: { notIn: TERMINAL_STATUSES },
      ...(listedOrderIds.length > 0
        ? { orderId: { notIn: listedOrderIds } }
        : {}),
    },
    orderBy: [{ dataVenda: "desc" }, { orderId: "desc" }],
    take: NON_TERMINAL_HEAL_LIMIT,
    select: { orderId: true },
  });
  return rows.map((row) => row.orderId);
}

async function fetchOrderDetails(
  account: ShopeeAccountRef,
  orderIds: string[],
): Promise<{ orders: AnyRecord[]; failures: PipelineFailure[] }> {
  if (orderIds.length === 0) return { orders: [], failures: [] };

  const { partnerId, partnerKey } = getPartnerCredentials();
  const batches: string[][] = [];
  for (let index = 0; index < orderIds.length; index += 50) {
    batches.push(orderIds.slice(index, index + 50));
  }

  const results = await pMap(batches, DETAIL_CONCURRENCY, async (batch) => {
    try {
      const response = rec(
        await executeWithTokenRetry(account, (accessToken) =>
          getShopeeOrderDetail({
            partnerId,
            partnerKey,
            accessToken,
            shopId: account.shop_id,
            orderSnList: batch.join(","),
          }),
        ),
      );
      return { orders: records(response.order_list), batch };
    } catch (error) {
      return {
        orders: [] as AnyRecord[],
        batch,
        failure: {
          stage: "detail" as const,
          orderId: batch[0],
          message: `lote de ${batch.length}: ${errorMessage(error)}`,
        },
      };
    }
  });

  const requested = new Set(orderIds);
  const failedIds = new Set<string>();
  const byOrderId = new Map<string, AnyRecord>();
  const failures: PipelineFailure[] = [];

  for (const result of results) {
    if (result.failure) {
      failures.push(result.failure);
      result.batch.forEach((orderId) => failedIds.add(orderId));
    }
    for (const order of result.orders) {
      const orderId = stringValue(order.order_sn);
      if (!orderId || !requested.has(orderId)) continue;
      byOrderId.set(
        orderId,
        preferNewestOrder(byOrderId.get(orderId), order),
      );
    }
  }

  for (const orderId of orderIds) {
    if (!byOrderId.has(orderId) && !failedIds.has(orderId)) {
      failures.push({
        stage: "detail",
        orderId,
        message: "pedido ausente na resposta de detalhes",
      });
    }
  }

  return { orders: Array.from(byOrderId.values()), failures };
}

function financialVersionIsCurrent(existing: ExistingShopeeVenda): boolean {
  const paymentDetails = rec(existing.paymentDetails);
  const productBreakdown = rec(paymentDetails.productValueBreakdown);
  const pending = paymentDetails.financialSyncPending;
  return (
    paymentDetails.financialRuleVersion === SHOPEE_FINANCIAL_RULE_VERSION &&
    Object.keys(productBreakdown).length > 0 &&
    pending !== true &&
    pending !== "true"
  );
}

function canSkipEscrowAndSave(
  existing: ExistingShopeeVenda | undefined,
  detail: AnyRecord,
): boolean {
  if (!existing || !financialVersionIsCurrent(existing)) return false;

  const oldRawData = rec(existing.rawData);
  const oldStatus = stringValue(oldRawData.order_status);
  const newStatus = stringValue(detail.order_status);
  const oldUpdateTime = toFiniteNumber(oldRawData.update_time);
  const newUpdateTime = toFiniteNumber(detail.update_time);

  return (
    newStatus.length > 0 &&
    existing.status === newStatus &&
    oldStatus === newStatus &&
    oldUpdateTime !== null &&
    newUpdateTime !== null &&
    oldUpdateTime === newUpdateTime
  );
}

async function enrichWithEscrow(
  account: ShopeeAccountRef,
  detailedOrders: AnyRecord[],
  existingByOrderId: Map<string, ExistingShopeeVenda>,
): Promise<{
  enriched: EnrichedOrder[];
  skipped: number;
  failures: PipelineFailure[];
}> {
  const { partnerId, partnerKey } = getPartnerCredentials();
  const failures: PipelineFailure[] = [];
  const toEnrich: Array<{
    order: AnyRecord;
    existing?: ExistingShopeeVenda;
  }> = [];
  let skipped = 0;

  for (const order of detailedOrders) {
    const orderId = stringValue(order.order_sn);
    const existing = existingByOrderId.get(orderId);
    if (canSkipEscrowAndSave(existing, order)) {
      skipped += 1;
    } else {
      toEnrich.push({ order, existing });
    }
  }

  const enriched = await pMap(
    toEnrich,
    ESCROW_CONCURRENCY,
    async ({ order, existing }): Promise<EnrichedOrder> => {
      const orderId = stringValue(order.order_sn);
      try {
        const escrow = await executeWithTokenRetry(account, (accessToken) =>
          getShopeeEscrowDetail({
            partnerId,
            partnerKey,
            accessToken,
            shopId: account.shop_id,
            orderSn: orderId,
          }),
        );
        return {
          order: { ...order, escrow_details: rec(escrow) },
          existing,
          financialComplete: true,
        };
      } catch (error) {
        // Status novo ainda deve ser salvo. Preserva o último financeiro e marca
        // a linha para nova tentativa, mas esta conta não avança o cursor.
        const previousEscrow = rec(rec(existing?.rawData).escrow_details);
        failures.push({
          stage: "escrow",
          orderId,
          message: errorMessage(error),
        });
        return {
          order: { ...order, escrow_details: previousEscrow },
          existing,
          financialComplete: false,
        };
      }
    },
  );

  return { enriched, skipped, failures };
}

function decimalNumber(value: Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function orderToVenda(
  item: EnrichedOrder,
  account: ShopeeAccountRef,
  userId: string,
) {
  const { order, existing, financialComplete } = item;
  const itemList = records(order.item_list);
  const fallback = existing
    ? {
        valorTotal: decimalNumber(existing.valorTotal),
        unitario: decimalNumber(existing.unitario),
        quantidade: existing.quantidade,
        taxaPlataforma: decimalNumber(existing.taxaPlataforma),
        frete: decimalNumber(existing.frete),
        paymentDetails: existing.paymentDetails,
      }
    : undefined;
  const financials = calculateShopeeFinancials(order, fallback);
  const preserveFinancial = !financialComplete && Boolean(existing);

  const firstItem = itemList[0] ?? {};
  const packageInfo = records(order.package_list)[0] ?? {};
  const prazoDespacho = extrairPrazoDespachoShopee(order);
  const paymentBreakdown = financials.paymentBreakdown;
  const shipmentBreakdown = financials.shipmentBreakdown;
  const previousPaymentDetails = rec(existing?.paymentDetails);

  const paymentDetails = financialComplete
    ? {
        ...rec(order.escrow_details),
        financialRuleVersion: SHOPEE_FINANCIAL_RULE_VERSION,
        financialSyncPending: false,
        productValueBreakdown: {
          product_gross_subtotal: paymentBreakdown.product_gross_subtotal,
          product_effective_subtotal:
            paymentBreakdown.product_effective_subtotal,
          product_discount_total: paymentBreakdown.product_discount_total,
          pix_payment_adjustment: paymentBreakdown.pix_payment_adjustment,
          buyer_coupon_adjustment: paymentBreakdown.buyer_coupon_adjustment,
          seller_discount: paymentBreakdown.seller_discount,
          shopee_discount: paymentBreakdown.shopee_discount,
          voucher_from_seller: paymentBreakdown.voucher_from_seller,
          voucher_from_shopee: paymentBreakdown.voucher_from_shopee,
          coins: paymentBreakdown.coins,
          payment_promotion: paymentBreakdown.payment_promotion,
        },
        platformFeeBreakdown: {
          commission_fee: paymentBreakdown.commission_fee,
          service_fee: paymentBreakdown.service_fee,
          outros_encargos: paymentBreakdown.outros_encargos,
          ignored_as_platform_fee: paymentBreakdown.ignored_as_platform_fee,
        },
      }
    : {
        ...previousPaymentDetails,
        financialSyncPending: true,
        ...(existing
          ? {}
          : {
              productValueBreakdown: financials.paymentBreakdown,
              platformFeeBreakdown: {
                commission_fee: paymentBreakdown.commission_fee,
                service_fee: paymentBreakdown.service_fee,
                outros_encargos: paymentBreakdown.outros_encargos,
                ignored_as_platform_fee:
                  paymentBreakdown.ignored_as_platform_fee,
              },
            }),
      };

  const skuRaw =
    firstItem.item_sku ??
    firstItem.model_sku ??
    firstItem.variation_sku ??
    null;
  const parcelWeight =
    toFiniteNumber(packageInfo.parcel_chargeable_weight_gram) ?? 0;
  const shippingCarrier =
    truncateString(
      packageInfo.shipping_carrier ?? order.shipping_carrier,
      100,
    ) || null;

  return {
    orderId: stringValue(order.order_sn),
    userId,
    shopeeAccountId: account.id,
    dataVenda: new Date((toFiniteNumber(order.create_time) ?? 0) * 1000),
    status: stringValue(order.order_status) || "DESCONHECIDO",
    conta: account.shop_name ?? account.shop_id,
    valorTotal: preserveFinancial
      ? existing!.valorTotal
      : new Decimal(financials.effectiveProductSubtotal),
    quantidade: preserveFinancial ? existing!.quantidade : financials.quantity || 1,
    unitario: preserveFinancial
      ? existing!.unitario
      : new Decimal(financials.unitPrice),
    taxaPlataforma: preserveFinancial
      ? existing!.taxaPlataforma
      : financials.platformFee === null
        ? null
        : new Decimal(financials.platformFee),
    frete: preserveFinancial
      ? existing!.frete
      : new Decimal(financials.freight),
    margemContribuicao: preserveFinancial
      ? existing!.margemContribuicao
      : new Decimal(financials.netRevenue),
    isMargemReal: financialComplete
      ? true
      : (existing?.isMargemReal ?? false),
    titulo: truncateString(firstItem.item_name, 500) || "Pedido",
    sku: skuRaw ? truncateString(String(skuRaw), 255) : null,
    comprador: truncateString(order.buyer_username, 255) || "Comprador",
    shippingId:
      truncateString(packageInfo.tracking_number, 255) || null,
    shippingStatus: shippingCarrier,
    prazoDespacho: prazoDespacho.prazo,
    prazoDespachoOrigem: prazoDespacho.origem,
    plataforma: "Shopee",
    canal: "SP",
    rawData: order,
    paymentDetails,
    shipmentDetails: {
      parcel_chargeable_weight_gram: parcelWeight,
      shipping_carrier: shippingCarrier,
      logistics_status:
        truncateString(packageInfo.logistics_status, 100) || null,
      actual_shipping_fee: shipmentBreakdown.actual_shipping_fee,
      reverse_shipping_fee: shipmentBreakdown.reverse_shipping_fee,
      shopee_shipping_rebate: shipmentBreakdown.shopee_shipping_rebate,
      buyer_paid_shipping_fee: shipmentBreakdown.buyer_paid_shipping_fee,
      shipping_fee_discount_from_3pl:
        shipmentBreakdown.shipping_fee_discount_from_3pl,
      custo_vendedor_frete: shipmentBreakdown.custo_vendedor_frete,
      ...packageInfo,
    },
    atualizadoEm: new Date(),
  };
}

type ShopeeVendaRecord = ReturnType<typeof orderToVenda>;

function updateData(record: ShopeeVendaRecord) {
  return {
    dataVenda: record.dataVenda,
    status: record.status,
    conta: record.conta,
    valorTotal: record.valorTotal,
    quantidade: record.quantidade,
    unitario: record.unitario,
    taxaPlataforma: record.taxaPlataforma,
    frete: record.frete,
    margemContribuicao: record.margemContribuicao,
    isMargemReal: record.isMargemReal,
    titulo: record.titulo,
    sku: record.sku,
    comprador: record.comprador,
    shippingId: record.shippingId,
    shippingStatus: record.shippingStatus,
    prazoDespacho: record.prazoDespacho,
    prazoDespachoOrigem: record.prazoDespachoOrigem,
    plataforma: record.plataforma,
    canal: record.canal,
    rawData: record.rawData as Prisma.InputJsonValue,
    paymentDetails: record.paymentDetails as Prisma.InputJsonValue,
    shipmentDetails: record.shipmentDetails as Prisma.InputJsonValue,
    atualizadoEm: record.atualizadoEm,
  };
}

async function persistVendas(
  vendaRecords: ShopeeVendaRecord[],
  userId: string,
  account: ShopeeAccountRef,
): Promise<{ saved: number; failures: PipelineFailure[] }> {
  if (vendaRecords.length === 0) return { saved: 0, failures: [] };

  const uniqueRecords = Array.from(
    new Map(vendaRecords.map((record) => [record.orderId, record])).values(),
  );
  const owners = await prisma.shopeeVenda.findMany({
    where: { orderId: { in: uniqueRecords.map((record) => record.orderId) } },
    select: { orderId: true, userId: true, shopeeAccountId: true },
  });
  const ownerByOrderId = new Map(owners.map((owner) => [owner.orderId, owner]));
  const failures: PipelineFailure[] = [];
  const eligible: ShopeeVendaRecord[] = [];

  for (const record of uniqueRecords) {
    const owner = ownerByOrderId.get(record.orderId);
    if (
      owner &&
      (owner.userId !== userId || owner.shopeeAccountId !== account.id)
    ) {
      failures.push({
        stage: "ownership",
        orderId: record.orderId,
        message: `pedido pertence a outro usuario/conta (${owner.userId}/${owner.shopeeAccountId})`,
      });
    } else {
      eligible.push(record);
    }
  }

  let saved = 0;
  let completed = 0;
  await pMap(eligible, UPSERT_CONCURRENCY, async (record) => {
    const owner = ownerByOrderId.get(record.orderId);
    try {
      if (owner) {
        const result = await prisma.shopeeVenda.updateMany({
          where: {
            orderId: record.orderId,
            userId,
            shopeeAccountId: account.id,
          },
          data: updateData(record),
        });
        if (result.count !== 1) {
          throw new Error("ownership mudou antes da atualizacao");
        }
      } else {
        await prisma.shopeeVenda.create({
          data: {
            ...record,
            rawData: record.rawData as Prisma.InputJsonValue,
            paymentDetails: record.paymentDetails as Prisma.InputJsonValue,
            shipmentDetails: record.shipmentDetails as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
      }
      saved += 1;
    } catch (error) {
      failures.push({
        stage: "save",
        orderId: record.orderId,
        message: errorMessage(error),
      });
      console.error(`[Shopee Sync] Erro na venda ${record.orderId}:`, error);
    } finally {
      completed += 1;
      if (completed % 50 === 0 || completed === eligible.length) {
        sendProgressToUser(userId, {
          type: "sync_save_progress",
          message: `Loja ${account.shop_id}: ${completed}/${eligible.length} gravacoes`,
          current: completed,
          total: eligible.length,
          fetched: saved,
          expected: eligible.length,
          accountId: account.id,
          accountNickname: `Loja ${account.shop_id}`,
        });
      }
    }
  });

  return { saved, failures };
}

function summarizeFailures(failures: PipelineFailure[]): string {
  const preview = failures
    .slice(0, 3)
    .map(
      (failure) =>
        `${failure.stage}${failure.orderId ? ` ${failure.orderId}` : ""}: ${failure.message}`,
    )
    .join("; ");
  const remaining = failures.length > 3 ? `; +${failures.length - 3}` : "";
  return `${failures.length} falha(s) parcial(is): ${preview}${remaining}`;
}

function clampHistoricalStart(date: Date): Date {
  return new Date(Math.max(date.getTime(), HISTORICAL_START.getTime()));
}

type OrderPipelineResult = {
  expected: number;
  fetched: number;
  saved: number;
  skipped: number;
  failures: PipelineFailure[];
};

async function processOrderChunk(
  account: ShopeeAccountRef,
  userId: string,
  orderIds: string[],
): Promise<OrderPipelineResult> {
  const uniqueOrderIds = Array.from(new Set(orderIds));
  const failures: PipelineFailure[] = [];

  // A consulta é global por orderId porque a coluna é única no banco inteiro.
  // A checagem abaixo impede uma loja conectada em dois usuários de regravar a
  // venda do outro usuário.
  const existingRows = await fetchExistingVendas(uniqueOrderIds);
  const existingByOrderId = new Map(
    existingRows.map((row) => [row.orderId, row]),
  );
  const allowedOrderIds: string[] = [];
  for (const orderId of uniqueOrderIds) {
    const existing = existingByOrderId.get(orderId);
    if (
      existing &&
      (existing.userId !== userId ||
        existing.shopeeAccountId !== account.id)
    ) {
      failures.push({
        stage: "ownership",
        orderId,
        message: `pedido pertence a outro usuario/conta (${existing.userId}/${existing.shopeeAccountId})`,
      });
    } else {
      allowedOrderIds.push(orderId);
    }
  }

  const details = await fetchOrderDetails(account, allowedOrderIds);
  failures.push(...details.failures);

  // Cadastro de SKU é acessório: uma falha não pode jogar fora o pedido que já
  // veio da Shopee. A próxima sincronização tenta descobrir o SKU novamente.
  try {
    const skuResult = await registerDiscoveredSkus(
      userId,
      collectSkuCandidatesFromShopeeOrders(details.orders, account),
    );
    if (skuResult.created > 0) {
      console.log(
        `[SKU Discovery][Shopee] ${account.shop_id}: ${skuResult.created} SKU(s) criados`,
      );
    }
  } catch (error) {
    console.warn(
      `[SKU Discovery][Shopee] ${account.shop_id}: falha não bloqueante`,
      error,
    );
  }

  const escrow = await enrichWithEscrow(
    account,
    details.orders,
    existingByOrderId,
  );
  failures.push(...escrow.failures);

  const vendaRecords: ShopeeVendaRecord[] = [];
  for (const item of escrow.enriched) {
    try {
      vendaRecords.push(orderToVenda(item, account, userId));
    } catch (error) {
      failures.push({
        stage: "finance",
        orderId: stringValue(item.order.order_sn),
        message: errorMessage(error),
      });
    }
  }

  const persistence = await persistVendas(vendaRecords, userId, account);
  failures.push(...persistence.failures);

  return {
    expected: uniqueOrderIds.length,
    fetched: details.orders.length,
    saved: persistence.saved,
    skipped: escrow.skipped,
    failures,
  };
}

/**
 * Detalha, calcula e grava no máximo 100 pedidos por vez.
 *
 * Antes a primeira carga guardava milhares de pedidos na memória e só fazia o
 * primeiro INSERT após terminar 67 janelas + todos os escrows. Com esta barreira
 * curta, as vendas recentes aparecem já no primeiro lote e uma queda refaz no
 * máximo o lote corrente (os já gravados são reconhecidos e reaproveitados).
 */
async function processOrderIdsInChunks(
  account: ShopeeAccountRef,
  userId: string,
  orderIds: string[],
  phase: string,
  ownership: SyncOwnership,
): Promise<OrderPipelineResult> {
  const ids = Array.from(new Set(orderIds));
  const total: OrderPipelineResult = {
    expected: ids.length,
    fetched: 0,
    saved: 0,
    skipped: 0,
    failures: [],
  };

  for (let index = 0; index < ids.length; index += ORDER_PIPELINE_CHUNK_SIZE) {
    if (ownership.lost) {
      total.failures.push({ stage: "save", message: LEASE_LOST_MESSAGE });
      break;
    }
    const chunk = ids.slice(index, index + ORDER_PIPELINE_CHUNK_SIZE);
    let result: OrderPipelineResult;
    try {
      result = await processOrderChunk(account, userId, chunk);
    } catch (error) {
      const message = `chunk ${index / ORDER_PIPELINE_CHUNK_SIZE + 1} falhou: ${errorMessage(error)}`;
      total.failures.push({ stage: "save", message });
      console.error(`[Shopee Sync] ${account.shop_id}: ${message}`, error);
      break;
    }
    total.fetched += result.fetched;
    total.saved += result.saved;
    total.skipped += result.skipped;
    total.failures.push(...result.failures);

    if (ownership.lost) {
      total.failures.push({ stage: "save", message: LEASE_LOST_MESSAGE });
    }

    if (result.saved > 0) {
      // O evento do lote só sai depois de apagar a resposta antiga do servidor.
      // A tela pode recarregar imediatamente sem receber o cache de 0 vendas.
      invalidateVendasCache(userId);
    }

    const processed = Math.min(index + chunk.length, ids.length);
    const blocking = result.failures.filter(
      (failure) => failure.stage !== "escrow",
    );
    console.log(
      `[Shopee Sync] ${account.shop_id}: ${phase} ${processed}/${ids.length} ` +
        `(${result.saved} salvas, ${result.skipped} reaproveitadas, ` +
        `${result.failures.length} falhas; ${blocking.length} bloqueantes)`,
    );
    if (blocking.length > 0) {
      console.error(
        `[Shopee Sync] ${account.shop_id}: ${summarizeFailures(blocking)}`,
      );
    }

    if (ownership.lost) break;
  }

  return total;
}

function mergePipelineResult(
  target: OrderPipelineResult,
  source: OrderPipelineResult,
): void {
  target.expected += source.expected;
  target.fetched += source.fetched;
  target.saved += source.saved;
  target.skipped += source.skipped;
  target.failures.push(...source.failures);
}

async function syncAccount(
  account: ShopeeAccountRef,
  accountIndex: number,
  totalAccounts: number,
  userId: string,
  ownership: SyncOwnership,
): Promise<AccountRunResult> {
  const syncStartedAt = new Date();
  const failures: PipelineFailure[] = [];
  let expected = 0;
  let fetched = 0;
  let saved = 0;
  let skipped = 0;

  sendProgressToUser(userId, {
    type: "sync_progress",
    message: `Processando conta ${accountIndex + 1}/${totalAccounts}: Loja ${account.shop_id}`,
    current: accountIndex,
    total: totalAccounts,
    fetched: 0,
    expected: 0,
    accountId: account.id,
    accountNickname: `Loja ${account.shop_id}`,
  });

  try {
    const [saleCount, cursorStart, financialHealOrderIds] =
      await Promise.all([
        prisma.shopeeVenda.count({
          where: { shopeeAccountId: account.id, valorTotal: { gt: 0 } },
        }),
        inicioJanelaPeloCursor("shopee", account.id),
        findFinancialHealOrderIds(account.id),
      ]);

    if (saleCount === 0) {
      try {
        const { partnerId, partnerKey } = getPartnerCredentials();
        const candidates = await fetchShopeeCatalogSkuCandidates(
          {
            id: account.id,
            shop_id: account.shop_id,
            shop_name: account.shop_name,
            access_token: account.access_token,
          },
          { partnerId, partnerKey },
        );
        await registerDiscoveredSkus(userId, candidates);
      } catch (error) {
        console.warn(
          `[SKU Discovery][Shopee] Falha ao ler catalogo ${account.shop_id}:`,
          error,
        );
      }
    }

    // Sem cursor completo, inclusive quando uma execução anterior já salvou
    // alguns lotes, continuamos em bootstrap por create_time. Isso impede o pior
    // caso: uma queda após salvar só o mês recente seguida de incremental, que
    // deixaria o restante do histórico invisível para sempre.
    const isBootstrap = cursorStart === null;
    const timeRangeField: ShopeeOrderTimeRangeField = isBootstrap
      ? "create_time"
      : "update_time";
    const since = isBootstrap
      ? HISTORICAL_START
      : clampHistoricalStart(cursorStart);

    console.log(
      `[Shopee Sync] ${account.shop_id}: ${timeRangeField} ${since.toISOString()} -> ${syncStartedAt.toISOString()}${isBootstrap ? " (bootstrap recente-primeiro)" : ""}`,
    );
    if (financialHealOrderIds.length > 0) {
      console.log(
        `[Shopee Sync] ${account.shop_id}: cura financeira direcionada para ${financialHealOrderIds.length} pedido(s)`,
      );
    }

    const pipelineTotals: OrderPipelineResult = {
      expected: 0,
      fetched: 0,
      saved: 0,
      skipped: 0,
      failures: [],
    };

    const listed = await fetchListedOrders(
      account,
      since,
      syncStartedAt,
      timeRangeField,
      userId,
      async (orderIds, windowProgress) => {
        const result = await processOrderIdsInChunks(
          account,
          userId,
          orderIds,
          `janelas ${windowProgress.windowsDone}/${windowProgress.windowsTotal}`,
          ownership,
        );
        mergePipelineResult(pipelineTotals, result);
        expected = pipelineTotals.expected;
        fetched = pipelineTotals.fetched;
        saved = pipelineTotals.saved;
        skipped = pipelineTotals.skipped;
        sendProgressToUser(userId, {
          type: "sync_batch_saved",
          message:
            `Loja ${account.shop_id}: ${saved} venda(s) salvas e ` +
            `${skipped} reaproveitadas; histórico ${windowProgress.windowsDone}/${windowProgress.windowsTotal}`,
          current: windowProgress.windowsDone,
          total: windowProgress.windowsTotal,
          fetched,
          expected,
          saved,
          skipped,
          accountId: account.id,
          accountNickname: `Loja ${account.shop_id}`,
          phase: "saving",
        });
      },
      () => !ownership.lost,
    );
    failures.push(...listed.failures, ...pipelineTotals.failures);

    const listedOrderIds = Array.from(listed.byOrderId.keys());
    const nonTerminalHealOrderIds = await findNonTerminalHealOrderIds(
      account.id,
      listedOrderIds,
    );
    const listedSet = new Set(listedOrderIds);
    const healOrderIds = Array.from(
      new Set([...nonTerminalHealOrderIds, ...financialHealOrderIds]),
    ).filter((orderId) => !listedSet.has(orderId));

    if (healOrderIds.length > 0) {
      const healResult = await processOrderIdsInChunks(
        account,
        userId,
        healOrderIds,
        "cura direcionada",
        ownership,
      );
      mergePipelineResult(pipelineTotals, healResult);
      failures.push(...healResult.failures);
      expected = pipelineTotals.expected;
      fetched = pipelineTotals.fetched;
      saved = pipelineTotals.saved;
      skipped = pipelineTotals.skipped;
    }

    console.log(
      `[Shopee Sync] ${account.shop_id}: ${listedOrderIds.length} listados, ` +
        `${nonTerminalHealOrderIds.length} nao terminais, ` +
        `${financialHealOrderIds.length} financeiros; ` +
        `${saved} salvos e ${skipped} reaproveitados`,
    );

    const blockingFailures = failures.filter(
      (failure) => failure.stage !== "escrow",
    );
    if (ownership.lost && !blockingFailures.some((failure) => failure.message === LEASE_LOST_MESSAGE)) {
      blockingFailures.push({ stage: "save", message: LEASE_LOST_MESSAGE });
    }
    if (blockingFailures.length === 0) {
      // Falha de escrow não perde pedido: ele foi salvo com financeiro estimado e
      // financialSyncPending, entrando na cura direcionada da próxima execução.
      // Por isso ela não obriga uma nova varredura das 67 janelas.
      await gravarCursorSync("shopee", account.id, syncStartedAt);
      console.log(
        `[Shopee Sync] ${account.shop_id}: cursor avancado para ${syncStartedAt.toISOString()} (${saved} salvas, ${skipped} skip, ${failures.length} financeiro pendente)`,
      );
      if (failures.length === 0) {
        return { expected, fetched, saved, skipped };
      }

      const message = `${summarizeFailures(failures)}; vendas salvas e financeiro pendente para a proxima execucao`;
      console.warn(`[Shopee Sync] ${account.shop_id}: ${message}`);
      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `Loja ${account.shop_id}: ${message}.`,
        errorCode: "SHOPEE_FINANCE_PENDING",
        accountId: account.id,
      });
      return {
        expected,
        fetched,
        saved,
        skipped,
        error: { accountId: account.id, shopId: account.shop_id, message },
      };
    }

    const message = summarizeFailures(blockingFailures);
    console.error(
      `[Shopee Sync] ${account.shop_id}: ${message}. Cursor preservado.`,
    );
    if (!ownership.lost) {
      sendProgressToUser(userId, {
        type: "sync_error",
        message: `Loja ${account.shop_id}: ${message}. Cursor preservado.`,
        errorCode: "SHOPEE_SYNC_PARTIAL",
        accountId: account.id,
      });
    }
    return {
      expected,
      fetched,
      saved,
      skipped,
      error: { accountId: account.id, shopId: account.shop_id, message },
    };
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[Shopee Sync] Erro na conta ${account.id}:`, error);
    if (!ownership.lost) {
      sendProgressToUser(userId, {
        type: "sync_error",
        message: `Erro ao processar conta ${account.shop_id}: ${message}`,
        errorCode: "SHOPEE_SYNC_ERROR",
        accountId: account.id,
      });
    }
    return {
      expected,
      fetched,
      saved,
      skipped,
      error: { accountId: account.id, shopId: account.shop_id, message },
    };
  }
}

export async function POST(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const userId = session.sub;
  const keepConnectionsOpen =
    req.headers.get("x-contazoom-sync-all") === "1";
  let accountIds: string[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.accountIds)) accountIds = body.accountIds;
  } catch {
    // Continua sem filtro.
  }

  let syncLock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;
  let lockRenewal: ReturnType<typeof setInterval> | null = null;
  const ownership: SyncOwnership = { lost: false };

  try {
    sendProgressToUser(userId, {
      type: "sync_start",
      message: "Conectando ao Shopee...",
      current: 0,
      total: 0,
      fetched: 0,
      expected: 0,
    });

    const contasAtivas = await prisma.shopeeAccount.findMany({
      where: {
        userId,
        ...(accountIds && accountIds.length > 0 ? { id: { in: accountIds } } : {}),
      },
    });

    if (contasAtivas.length === 0) {
      sendProgressToUser(userId, {
        type: "sync_complete",
        message: "Nenhuma conta encontrada",
        current: 0,
        total: 0,
        fetched: 0,
        expected: 0,
      });
      return NextResponse.json(
        { message: "Nenhuma conta Shopee ativa." },
        { status: 404 },
      );
    }

    syncLock = await acquireSyncLock(["vendas", "shopee", userId]);
    if (!syncLock.acquired) {
      sendProgressToUser(userId, {
        type: "sync_warning",
        message:
          "Ja existe uma sincronizacao da Shopee em andamento. Aguarde finalizar antes de iniciar outra.",
        current: 0,
        total: 0,
        fetched: 0,
        expected: 0,
        alreadyRunning: true,
      });
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message:
            "Ja existe uma sincronizacao da Shopee em andamento. Aguarde finalizar antes de iniciar outra.",
        },
        { status: 409 },
      );
    }

    // Primeira carga pode atravessar milhares de pedidos. Renovar o lock impede
    // outro clique de iniciar uma segunda carga quando o TTL original vencer.
    lockRenewal = setInterval(() => {
      void syncLock?.renew().then((renewed) => {
        if (!renewed) {
          ownership.lost = true;
          console.error("[Shopee Sync] Lock perdido durante a sincronização");
        }
      }).catch((error) => {
        ownership.lost = true;
        console.error("[Shopee Sync] Falha ao renovar lock:", error);
      });
    }, 5 * 60 * 1000);

    sendProgressToUser(userId, {
      type: "sync_progress",
      message: "Verificando tokens de acesso...",
      current: 0,
      total: contasAtivas.length,
      fetched: 0,
      expected: contasAtivas.length,
    });

    const tokenResults = await pMap(
      contasAtivas,
      ACCOUNT_CONCURRENCY,
      async (conta) => {
        const account = conta as ShopeeAccountRef;
        try {
          if (account.expires_at.getTime() - Date.now() < 10 * 60 * 1000) {
            await refreshAccountSingleFlight(account);
          }
          return { account };
        } catch (error) {
          return { account, error: errorMessage(error) };
        }
      },
    );

    const errors: SyncError[] = [];
    const contasAtualizadas: ShopeeAccountRef[] = [];
    for (const result of tokenResults) {
      if (result.error) {
        errors.push({
          accountId: result.account.id,
          shopId: result.account.shop_id,
          message: result.error,
        });
        sendProgressToUser(userId, {
          type: "sync_error",
          message: `Falha ao renovar token da conta ${result.account.shop_id}. Reconecte a conta.`,
          errorCode: "TOKEN_REFRESH_FAILED",
          accountId: result.account.id,
        });
      } else {
        contasAtualizadas.push(result.account);
      }
    }

    if (contasAtualizadas.length === 0) {
      return NextResponse.json(
        {
          success: false,
          errors,
          message: "Nenhuma conta Shopee com token valido. Reconecte suas contas.",
        },
        { status: 400 },
      );
    }

    const summaries: AccountSummary[] = contasAtualizadas.map((account) => ({
      id: account.id,
      shop_id: account.shop_id,
    }));
    const accountResults = await pMap(
      contasAtualizadas,
      ACCOUNT_CONCURRENCY,
      (account, index) =>
        syncAccount(
          account,
          index,
          contasAtualizadas.length,
          userId,
          ownership,
        ),
    );

    let totalExpected = 0;
    let totalFetched = 0;
    let totalSaved = 0;
    let totalSkipped = 0;
    for (const result of accountResults) {
      totalExpected += result.expected;
      totalFetched += result.fetched;
      totalSaved += result.saved;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    if (ownership.lost) {
      // O novo owner controla os eventos a partir daqui. O job antigo só limpa
      // caches das linhas que conseguiu salvar e encerra sem tocar no SSE.
      invalidateVendasCache(userId);
      console.warn(
        `[Shopee Sync] Execução encerrada após perda do lock: ${totalSaved} venda(s) já salvas`,
      );
      return NextResponse.json(
        {
          success: false,
          ownershipLost: true,
          message: LEASE_LOST_MESSAGE,
          accounts: summaries,
          errors,
          totals: {
            expected: totalExpected,
            fetched: totalFetched,
            saved: totalSaved,
            skipped: totalSkipped,
          },
        },
        { status: 409 },
      );
    }

    // A recarga terminal só pode sair depois de invalidar o último snapshot.
    invalidateVendasCache(userId);
    console.log(
      `[Shopee Sync] Concluída: ${totalSaved} salva(s), ${totalSkipped} inalterada(s), ${errors.length} erro(s)`,
    );
    sendProgressToUser(userId, {
      type: "sync_complete",
      message: `Sincronizacao concluida: ${totalSaved} salva(s), ${totalSkipped} inalterada(s)`,
      current: totalSaved + totalSkipped,
      total: totalExpected,
      fetched: totalFetched,
      expected: totalExpected,
    });

    if (!keepConnectionsOpen) {
      setTimeout(() => closeUserConnections(userId), 2000);
    }

    return NextResponse.json({
      success: errors.length === 0,
      syncedAt: new Date().toISOString(),
      accounts: summaries,
      orders: totalFetched,
      saved: totalSaved,
      errors,
      totals: {
        expected: totalExpected,
        fetched: totalFetched,
        saved: totalSaved,
        skipped: totalSkipped,
      },
    });
  } catch (error) {
    console.error("Erro fatal ao sincronizar vendas Shopee:", error);
    return NextResponse.json(
      { message: errorMessage(error) || "Erro interno no servidor." },
      { status: 500 },
    );
  } finally {
    if (lockRenewal) clearInterval(lockRenewal);
    if (syncLock?.acquired) {
      await syncLock.release();
    }
  }
}
