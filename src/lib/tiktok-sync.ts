/**
 * Sync de vendas do TikTok Shop.
 *
 * Mesma espinha do sync da Shopee (progresso por SSE, `pMap`, CMV pela tabela
 * `sku`), com DUAS diferenças estruturais que vêm da API:
 *
 * 1. JANELA POR `update_time`, NÃO por `create_time`.
 *    O endpoint `/order/202309/orders/search` filtra por atualização, então um
 *    pedido antigo que mudou de status volta na janela — é isso que mantém o
 *    status em dia sem varrer a base inteira. Por consequência, o watermark
 *    também tem de ser o MAIOR `update_time` já visto, e não a data da última
 *    venda: com a data de criação, todo pedido antigo que mudasse de status
 *    ficaria de fora para sempre.
 *
 * 2. DOIS PASSOS FINANCEIROS.
 *    O passo 1 grava o ESTIMADO (`isMargemReal = false`) para a venda aparecer
 *    na hora. O passo 2 pega os pedidos já entregues/concluídos que continuam
 *    estimados e troca pelo REAL do extrato. Ver `tiktok-finance.ts`.
 *
 * ⚠️  A doc avisa que o `update_time` devolvido PODE cair fora da janela pedida
 * (os dados mudam durante a varredura). Por isso o watermark recua
 * TIKTOK_OVERLAP_MINUTES antes de cada sync: sobreposição é barata (o upsert é
 * idempotente), pedido perdido não.
 *
 * Sobre `isMargemReal`: na Shopee ele nasce `true`, porque o escrow já dá número
 * fechado. Aqui ele significa "o extrato já confirmou" — enquanto for `false`, a
 * margem daquela linha é projeção.
 */
import { Prisma } from "@prisma/client";

import { pMap } from "@/lib/concorrencia";
import prisma from "@/lib/prisma";
import { buildHistoricalCostMap } from "@/lib/sku-cost-history";
import {
  collectSkuCandidatesFromTiktokOrders,
  registerDiscoveredSkus,
} from "@/lib/sku-discovery";
import { sendProgressToUser } from "@/lib/sse-progress";
import {
  epochSecondsToDate,
  getTiktokOrderStatement,
  searchTiktokOrders,
  toFiniteNumber,
  withTiktokTokenRetry,
  type TiktokAccountRef,
  type TiktokOrder,
} from "@/lib/tiktok";
import {
  applyTiktokSettlement,
  calculateTiktokEstimatedFinancials,
  roundCurrency,
  summarizeTiktokItems,
  TIKTOK_FINANCIAL_RULE_VERSION,
  type TiktokFinancials,
} from "@/lib/tiktok-finance";

/** Lojas em paralelo. A cota do TikTok é por app x loja, então dá para paralelizar. */
const SHOP_CONCURRENCY = 2;
/** Upserts simultâneos por loja. Mesmo teto da Shopee, mesmo pool de conexões. */
const UPSERT_CONCURRENCY = 8;
/** Chamadas de extrato em voo no passo de liquidação. */
const STATEMENT_CONCURRENCY = 4;
/** Teto por loja e por execução, para um backfill não virar job infinito. */
const MAX_ORDERS_PER_SHOP = 10_000;
/** Janela máxima de cada busca. Recortar dá resiliência: uma falha não derruba o resto. */
const MAX_WINDOW_DAYS = 30;
/** Cinto de segurança contra `page_token` em loop. */
const MAX_PAGES_PER_WINDOW = 400;
/** Página máxima aceita pelo endpoint de pedidos. */
const PAGE_SIZE = 50;

/** Status em que o extrato pode existir. Fora deles, chamar a API é desperdício. */
const SETTLEMENT_ELIGIBLE_STATUS = ["COMPLETED", "DELIVERED"];

function envInt(name: string, fallback: number): number {
  const parsed = toFiniteNumber(process.env[name]);
  return parsed !== null && parsed > 0 ? Math.floor(parsed) : fallback;
}

export type TiktokSyncSummary = {
  totalSaved: number;
  /** Pedidos que passaram do estimado para o real nesta execução. */
  totalSettled: number;
  /** Linhas recalculadas por mudança de regra financeira, sem chamar a API. */
  totalReprocessed: number;
  perShop: Array<{
    accountId: string;
    shop: string;
    saved: number;
    settled: number;
    error?: string;
  }>;
  startedAt: string;
  finishedAt: string;
};

type AnyRec = Record<string, unknown>;

function rec(value: unknown): AnyRec {
  return value !== null && typeof value === "object" ? (value as AnyRec) : {};
}

function truncate(value: unknown, max: number): string {
  if (typeof value !== "string" || !value) return "";
  return value.length > max ? value.substring(0, max) : value;
}

function str(value: unknown, max: number): string | null {
  const out = truncate(value, max);
  return out === "" ? null : out;
}

/** America/Sao_Paulo é offset fixo UTC-3 (sem horário de verão desde 2019). */
const SP_OFFSET_SECONDS = 3 * 60 * 60;

/**
 * `create_time` do TikTok é epoch UTC de verdade. Gravamos como horário-de-parede
 * de São Paulo (subtraindo 3h), MESMA convenção do `date_closed` do ML e do
 * `data_venda` da Shopee — assim filtrar por dia-calendário de SP é comparação
 * direta na coluna (usa o índice) e exibir é imprimir o valor cru.
 */
function toSaoPauloWallClock(epochSecondsUtc: number): Date {
  return new Date((epochSecondsUtc - SP_OFFSET_SECONDS) * 1000);
}

/* -------------------------------------------------------------------------- */
/*                                  Watermark                                 */
/* -------------------------------------------------------------------------- */

/**
 * Maior `update_time` já gravado para a loja.
 *
 * Sai de dentro do `raw_data` de propósito: é o valor EXATO que a API usou para
 * filtrar, então o watermark fecha com a semântica do endpoint. Não há coluna
 * dedicada porque o dado só serve para o sync — e um MAX() sobre alguns milhares
 * de linhas filtradas por conta custa menos que uma coluna a mais para manter
 * sincronizada em todo upsert.
 */
async function fetchUpdateWatermark(accountId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ watermark: bigint | null }>>(Prisma.sql`
    SELECT MAX(NULLIF(raw_data->>'update_time', '')::bigint) AS watermark
    FROM tiktok_venda
    WHERE tiktok_account_id = ${accountId}
  `);
  const value = rows[0]?.watermark;
  return value === null || value === undefined ? null : Number(value);
}

/** Início da janela: watermark menos a sobreposição, ou o lookback inicial. */
function resolveWindowStart(watermark: number | null): number {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (watermark === null) {
    return nowSeconds - envInt("TIKTOK_LOOKBACK_DAYS", 120) * 86_400;
  }
  return Math.max(0, watermark - envInt("TIKTOK_OVERLAP_MINUTES", 15) * 60);
}

/* -------------------------------------------------------------------------- */
/*                              Busca de pedidos                              */
/* -------------------------------------------------------------------------- */

/** Uma janela completa, seguindo o `next_page_token` até o fim. */
async function fetchWindow(
  account: TiktokAccountRef,
  updateTimeGe: number,
  updateTimeLt: number,
  remaining: number,
  onPage: (acumulado: number) => void,
): Promise<TiktokOrder[]> {
  const orders: TiktokOrder[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
    const result = await withTiktokTokenRetry(account, (accessToken) =>
      searchTiktokOrders({
        accessToken,
        shopCipher: account.shopCipher,
        updateTimeGe,
        updateTimeLt,
        pageSize: PAGE_SIZE,
        pageToken,
      }),
    );

    orders.push(...result.orders);
    onPage(orders.length);

    if (orders.length >= remaining) return orders.slice(0, remaining);
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }

  return orders;
}

/** Todos os pedidos atualizados desde `sinceSeconds`, andando em janelas. */
async function fetchOrdersSince(
  account: TiktokAccountRef,
  sinceSeconds: number,
  onProgress: (acumulado: number) => void,
): Promise<TiktokOrder[]> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const all: TiktokOrder[] = [];
  let windowStart = sinceSeconds;

  while (windowStart < nowSeconds && all.length < MAX_ORDERS_PER_SHOP) {
    const windowEnd = Math.min(windowStart + MAX_WINDOW_DAYS * 86_400, nowSeconds);
    const orders = await fetchWindow(
      account,
      windowStart,
      windowEnd,
      MAX_ORDERS_PER_SHOP - all.length,
      (naJanela) => onProgress(all.length + naJanela),
    );
    all.push(...orders);
    windowStart = windowEnd;
  }

  // A sobreposição do watermark faz o mesmo pedido voltar em janelas vizinhas.
  // Deduplica aqui para não gastar upsert repetido (e não inflar o "salvos").
  const byId = new Map<string, TiktokOrder>();
  for (const order of all) {
    const id = typeof order.id === "string" ? order.id : String(order.id ?? "");
    if (id) byId.set(id, order);
  }
  return Array.from(byId.values());
}

/* -------------------------------------------------------------------------- */
/*                          Mapeamento pedido -> linha                        */
/* -------------------------------------------------------------------------- */

/**
 * Primeiro pacote do pedido. O TikTok pode dividir um pedido em vários envios;
 * a tela mostra o primeiro, e o pedido inteiro fica no `rawData`.
 */
function firstPackage(order: AnyRec): AnyRec {
  const packages = Array.isArray(order.packages) ? (order.packages as AnyRec[]) : [];
  return rec(packages[0]);
}

function firstLineItem(order: AnyRec): AnyRec {
  const items = Array.isArray(order.line_items) ? (order.line_items as AnyRec[]) : [];
  return rec(items[0]);
}

/**
 * Prazo para despachar.
 *
 * Contraparte do `ship_by_date` da Shopee. O TikTok tem mais de um campo de
 * prazo e eles não significam a mesma coisa: `rts_sla_time` é o prazo para
 * deixar o pedido pronto para envio (Ready To Ship), que é o que a operação
 * precisa cumprir; `shipping_due_time` é o limite de postagem. Usamos o primeiro
 * e caímos no segundo, registrando qual dos dois valeu — sem isso, um pedido sem
 * prazo fica indistinguível de um que nunca foi olhado.
 */
function resolvePrazoDespacho(order: AnyRec): {
  prazo: Date | null;
  origem: string;
} {
  const rts = epochSecondsToDate(order.rts_sla_time);
  if (rts) return { prazo: rts, origem: "tt_rts_time" };

  const shipBy = epochSecondsToDate(order.shipping_due_time);
  if (shipBy) return { prazo: shipBy, origem: "tt_ship_by_date" };

  return { prazo: null, origem: "ausente" };
}

type CostMap = Awaited<ReturnType<typeof buildHistoricalCostMap>>;

function orderToVenda(
  order: TiktokOrder,
  account: TiktokAccountRef,
  costMap: CostMap,
) {
  const raw = rec(order);
  const orderId = String(raw.id ?? "");
  const summary = summarizeTiktokItems(raw);
  const fin = calculateTiktokEstimatedFinancials(raw);

  const createTime = toFiniteNumber(raw.create_time) ?? 0;
  const item = firstLineItem(raw);
  const pkg = firstPackage(raw);
  const recipient = rec(raw.recipient_address);

  // A data da venda decide qual versão de custo vale, então é resolvida antes do
  // CMV e reaproveitada no registro em vez de convertida duas vezes.
  const dataVenda = toSaoPauloWallClock(createTime);

  // Mesma conta das outras plataformas: custo unitário vigente na data x
  // quantidade. A leitura (`/api/vendas`) recalcula por cima, então isto é o
  // valor de partida, não a verdade final.
  const custoUnitario = summary.sku
    ? costMap.getCostAtDate(summary.sku, dataVenda)
    : 0;
  const cmv = custoUnitario > 0 ? roundCurrency(custoUnitario * fin.quantity) : null;
  const margem = cmv === null ? fin.netRevenue : roundCurrency(fin.netRevenue - cmv);

  const prazo = resolvePrazoDespacho(raw);

  const paymentDetails: AnyRec = {
    ...fin.breakdown,
    financialRuleVersion: TIKTOK_FINANCIAL_RULE_VERSION,
    payment: raw.payment ?? null,
    sku_breakdown: summary.skuBreakdown,
  };

  const shipmentDetails: AnyRec = {
    shipping_type: raw.shipping_type ?? null,
    shipping_provider: str(item.shipping_provider_name, 100),
    delivery_option_name: str(raw.delivery_option_name, 200),
    recipient_name: str(recipient.name, 255),
    recipient_state: str(recipient.region_code, 32),
    // Prazos operacionais do TikTok, guardados crus para auditoria do que
    // `resolvePrazoDespacho` escolheu.
    rts_sla_time: toFiniteNumber(raw.rts_sla_time),
    tts_sla_time: toFiniteNumber(raw.tts_sla_time),
    shipping_due_time: toFiniteNumber(raw.shipping_due_time),
    collection_due_time: toFiniteNumber(raw.collection_due_time),
    delivery_sla_time: toFiniteNumber(raw.delivery_sla_time),
    package_id: str(pkg.id, 100),
    tracking_number: str(item.tracking_number, 255),
    is_sample_order: raw.is_sample_order ?? null,
    fulfillment_type: str(raw.fulfillment_type, 64),
  };

  return {
    orderId,
    userId: account.userId,
    tiktokAccountId: account.id,
    dataVenda,
    status: truncate(raw.status, 64) || "DESCONHECIDO",
    conta: account.shopName ?? account.shopId,
    valorTotal: new Prisma.Decimal(fin.effectiveProductSubtotal),
    quantidade: fin.quantity,
    unitario: new Prisma.Decimal(fin.unitPrice),
    taxaPlataforma: new Prisma.Decimal(fin.platformFee),
    frete: new Prisma.Decimal(fin.freight),
    cmv: cmv === null ? null : new Prisma.Decimal(cmv),
    margemContribuicao: new Prisma.Decimal(margem),
    // Nasce ESTIMADO. O passo 2 troca pelo real quando o extrato existir.
    isMargemReal: fin.isReal,
    titulo: truncate(summary.title, 500) || "Pedido",
    sku: str(summary.sku, 255),
    comprador: str(recipient.name, 255) ?? str(raw.buyer_email, 255) ?? "Comprador",
    itemId: str(summary.productId, 64),
    shippingId: str(item.tracking_number, 255) ?? str(pkg.id, 255),
    shippingStatus: str(item.shipping_provider_name, 100),
    logisticType: str(raw.shipping_type, 64),
    envioMode: str(raw.fulfillment_type, 64),
    prazoDespacho: prazo.prazo,
    prazoDespachoOrigem: prazo.origem,
    plataforma: "TikTok Shop",
    canal: "TT",
    rawData: raw as unknown as Prisma.InputJsonValue,
    paymentDetails: paymentDetails as unknown as Prisma.InputJsonValue,
    shipmentDetails: shipmentDetails as unknown as Prisma.InputJsonValue,
    atualizadoEm: new Date(),
  };
}

/* -------------------------------------------------------------------------- */
/*                   Passo 2 — liquidação (financeiro real)                   */
/* -------------------------------------------------------------------------- */

type PendingRow = {
  order_id: string;
  quantidade: number;
  valor_total: Prisma.Decimal;
  taxa_plataforma: Prisma.Decimal | null;
  cmv: Prisma.Decimal | null;
  payment_details: unknown;
};

function toNum(value: Prisma.Decimal | number | null): number {
  if (value === null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

/**
 * Reconstrói o financeiro estimado a partir da LINHA JÁ GRAVADA, em vez de
 * refazer a chamada do pedido. O que `applyTiktokSettlement` precisa é só o
 * faturamento (subtotal) e o breakdown anterior — os dois estão na linha, então
 * o passo de liquidação custa uma chamada de API por pedido, não duas.
 */
function estimatedFromRow(row: PendingRow): TiktokFinancials {
  const subtotal = toNum(row.valor_total);
  const platformFee = toNum(row.taxa_plataforma);
  const quantity = Math.max(1, row.quantidade);
  return {
    quantity,
    grossProductSubtotal: subtotal,
    effectiveProductSubtotal: subtotal,
    unitPrice: roundCurrency(subtotal / quantity),
    platformFee,
    freight: 0,
    netRevenue: roundCurrency(subtotal + platformFee),
    isReal: false,
    breakdown: rec(row.payment_details),
  };
}

/**
 * Recalcula linhas gravadas com REGRA FINANCEIRA ANTIGA — sem chamar a API.
 *
 * Dá para consertar para trás porque o sync guarda `rawData` (o pedido inteiro) e
 * `paymentDetails.statement` (o extrato inteiro). Guardar payload cru não é
 * redundância: é o que torna a regra financeira corrigível depois, inclusive
 * quando a API já não devolveria mais aquele extrato.
 *
 * O filtro é a versão da regra na própria linha, então cada linha é reprocessada
 * uma vez só e o passo fica barato depois que a base converge.
 */
async function reprocessOldRule(account: TiktokAccountRef): Promise<number> {
  const rows = await prisma.$queryRaw<Array<PendingRow & { raw_data: unknown }>>(Prisma.sql`
    SELECT order_id, quantidade, valor_total, taxa_plataforma, cmv, payment_details, raw_data
    FROM tiktok_venda
    WHERE tiktok_account_id = ${account.id}
      AND COALESCE(payment_details->>'financialRuleVersion', '') <> ${TIKTOK_FINANCIAL_RULE_VERSION}
      AND raw_data IS NOT NULL
    ORDER BY data_venda DESC
    LIMIT ${envInt("TIKTOK_REPROCESS_BATCH", 1000)}
  `);
  if (rows.length === 0) return 0;

  let fixed = 0;
  for (const row of rows) {
    try {
      // 1. Recalcula o estimado do pedido cru, já com a regra nova.
      const estimated = calculateTiktokEstimatedFinancials(rec(row.raw_data));

      // 2. Se o extrato já está guardado, aplica o real por cima.
      const statement = rec(rec(row.payment_details).statement);
      const real =
        Object.keys(statement).length > 0
          ? applyTiktokSettlement(estimated, statement)
          : null;
      const fin = real ?? estimated;

      const cmv = row.cmv === null ? null : toNum(row.cmv);
      const margem = cmv === null ? fin.netRevenue : roundCurrency(fin.netRevenue - cmv);

      // `updateMany` com a conta no filtro: o `order_id` é único global, mas
      // amarrar à conta garante que um sync só escreva no que é dele.
      await prisma.tiktokVenda.updateMany({
        where: { orderId: row.order_id, tiktokAccountId: account.id },
        data: {
          valorTotal: new Prisma.Decimal(fin.effectiveProductSubtotal),
          unitario: new Prisma.Decimal(fin.unitPrice),
          taxaPlataforma: new Prisma.Decimal(fin.platformFee),
          margemContribuicao: new Prisma.Decimal(margem),
          isMargemReal: fin.isReal,
          paymentDetails: fin.breakdown as unknown as Prisma.InputJsonValue,
        },
      });
      fixed += 1;
    } catch (error) {
      console.warn(`[TikTok Sync] falha ao reprocessar ${row.order_id}:`, error);
    }
  }

  if (fixed > 0) {
    console.log(
      `[TikTok Sync] ${fixed} pedido(s) recalculados para a regra ${TIKTOK_FINANCIAL_RULE_VERSION} (sem chamada de API).`,
    );
  }
  return fixed;
}

/**
 * Troca o estimado pelo real nos pedidos que já podem ter extrato.
 *
 * Fila: `is_margem_real = false` + status entregue/concluído (fora deles a API
 * devolve vazio e a chamada é desperdício). O teto por execução evita que um
 * backfill grande consuma a cota inteira da loja numa rodada — o que sobrar
 * entra na próxima.
 */
async function settleAccount(account: TiktokAccountRef): Promise<number> {
  const batchSize = envInt("TIKTOK_SETTLEMENT_BATCH", 300);

  /*
   * Só pedidos que NÃO foram consultados recentemente.
   *
   * Sem esse corte, todo sync refaria uma chamada de extrato para cada pedido
   * entregue que ainda não liquidou — e como a resposta vazia não muda nada, os
   * mesmos pedidos voltariam na rodada seguinte, para sempre. Com o volume
   * crescendo, isso viraria centenas de chamadas inúteis por sync, consumindo a
   * cota da loja e o tempo do job sem produzir um único dado.
   *
   * A liquidação no BR leva ~7 dias após a entrega, então re-tentar de 12 em 12
   * horas é folgado.
   */
  const retryHours = envInt("TIKTOK_SETTLEMENT_RETRY_HOURS", 12);
  const cutoff = Date.now() - retryHours * 3_600_000;

  const rows = await prisma.$queryRaw<PendingRow[]>(Prisma.sql`
    SELECT order_id, quantidade, valor_total, taxa_plataforma, cmv, payment_details
    FROM tiktok_venda
    WHERE tiktok_account_id = ${account.id}
      AND is_margem_real = FALSE
      AND status IN (${Prisma.join(SETTLEMENT_ELIGIBLE_STATUS)})
      AND COALESCE(NULLIF(payment_details->>'settlement_checked_at', '')::bigint, 0) < ${cutoff}
    ORDER BY data_venda DESC
    LIMIT ${batchSize}
  `);
  if (rows.length === 0) return 0;

  /** Marca a tentativa para o pedido não ser reconsultado na próxima rodada. */
  const markChecked = async (orderId: string) => {
    try {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE tiktok_venda
        SET payment_details = COALESCE(payment_details, '{}'::jsonb)
          || jsonb_build_object('settlement_checked_at', ${Date.now()}::text)
        WHERE order_id = ${orderId}
          AND tiktok_account_id = ${account.id}
      `);
    } catch (error) {
      console.warn(`[TikTok Sync] nao consegui marcar a checagem de ${orderId}:`, error);
    }
  };

  let settled = 0;
  await pMap(rows, STATEMENT_CONCURRENCY, async (row) => {
    let statement: AnyRec;
    try {
      statement = await withTiktokTokenRetry(account, (accessToken) =>
        getTiktokOrderStatement({
          accessToken,
          shopCipher: account.shopCipher,
          orderId: row.order_id,
        }),
      );
    } catch {
      // Sem extrato ainda (ou erro pontual): mantém o estimado e tenta depois.
      await markChecked(row.order_id);
      return;
    }

    const real = applyTiktokSettlement(estimatedFromRow(row), statement);
    // null = não achamos o valor liquidado no payload. Preferimos manter o
    // estimado a gravar um número inventado.
    if (!real) {
      await markChecked(row.order_id);
      return;
    }

    const cmv = row.cmv === null ? null : toNum(row.cmv);
    const margem = cmv === null ? real.netRevenue : roundCurrency(real.netRevenue - cmv);

    try {
      await prisma.tiktokVenda.updateMany({
        where: { orderId: row.order_id, tiktokAccountId: account.id },
        data: {
          taxaPlataforma: new Prisma.Decimal(real.platformFee),
          margemContribuicao: new Prisma.Decimal(margem),
          isMargemReal: true,
          paymentDetails: real.breakdown as unknown as Prisma.InputJsonValue,
        },
      });
      settled += 1;
    } catch (error) {
      console.warn(`[TikTok Sync] falha ao gravar liquidacao ${row.order_id}:`, error);
    }
  });

  return settled;
}

/* -------------------------------------------------------------------------- */
/*                                Orquestração                                */
/* -------------------------------------------------------------------------- */

/**
 * Sincroniza as lojas TikTok do usuário (incremental).
 *
 * Diferente do v2, que é single-tenant: aqui TODA leitura e escrita é filtrada
 * por `userId`, e `accountIds` permite sincronizar só as lojas escolhidas na
 * tela.
 */
export async function syncTiktokAccounts(params: {
  userId: string;
  accountIds?: string[];
}): Promise<TiktokSyncSummary> {
  const { userId, accountIds } = params;
  const startedAt = new Date().toISOString();

  const rows = await prisma.tiktokAccount.findMany({
    where: {
      userId,
      ...(accountIds && accountIds.length > 0 ? { id: { in: accountIds } } : {}),
    },
  });

  const accounts: TiktokAccountRef[] = rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    shopId: row.shop_id,
    shopCipher: row.shop_cipher,
    shopName: row.shop_name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
  }));

  const perShop: TiktokSyncSummary["perShop"] = [];
  let totalSaved = 0;
  let totalSettled = 0;
  let totalReprocessed = 0;
  let contasConcluidas = 0;

  await pMap(accounts, SHOP_CONCURRENCY, async (account) => {
    const label = account.shopName ?? account.shopId;
    try {
      if (!account.shopCipher) {
        // Sem cipher nenhuma chamada de loja funciona. Falhar com mensagem
        // própria é melhor que deixar a API devolver erro de assinatura.
        throw new Error(
          "Loja sem shop_cipher gravado. Reconecte a conta para o TikTok devolver o cipher.",
        );
      }

      sendProgressToUser(userId, {
        type: "sync_progress",
        message: `Buscando pedidos de ${label}...`,
        accountId: account.id,
        accountNickname: label,
        current: contasConcluidas,
        total: accounts.length,
      });

      const watermark = await fetchUpdateWatermark(account.id);
      const since = resolveWindowStart(watermark);

      const orders = await fetchOrdersSince(account, since, (acumulado) => {
        sendProgressToUser(userId, {
          type: "sync_progress",
          message: `${label}: ${acumulado} pedido(s) recebidos`,
          accountId: account.id,
          accountNickname: label,
          fetched: acumulado,
          current: contasConcluidas,
          total: accounts.length,
        });
      });

      // SKU novo precisa existir antes do CMV ser resolvido, senão a primeira
      // venda de um produto novo nasce sem custo e sem cadastro.
      const skuResult = await registerDiscoveredSkus(
        userId,
        collectSkuCandidatesFromTiktokOrders(orders, {
          shop_id: account.shopId,
          shop_name: account.shopName,
        }),
      );
      if (skuResult.created > 0) {
        console.log(
          `[TikTok Sync] ${label}: ${skuResult.created} SKU(s) cadastrados automaticamente`,
        );
      }

      const skus = Array.from(
        new Set(
          orders
            .map((order) => summarizeTiktokItems(rec(order)).sku)
            .filter((sku): sku is string => Boolean(sku)),
        ),
      );
      const costMap = await buildHistoricalCostMap(userId, skus);

      let saved = 0;
      await pMap(orders, UPSERT_CONCURRENCY, async (order) => {
        try {
          const record = orderToVenda(order, account, costMap);
          if (!record.orderId) return;

          const { orderId, ...rest } = record;
          await prisma.tiktokVenda.upsert({
            where: { orderId },
            create: { orderId, ...rest },
            // `isMargemReal` volta a false de propósito quando o pedido é
            // reprocessado: se o pedido mudou (item cancelado, valor ajustado),
            // o financeiro real anterior não vale mais e precisa ser buscado de
            // novo no extrato.
            update: rest,
          });
          saved += 1;
        } catch (error) {
          console.warn(`[TikTok Sync] erro no pedido ${rec(order).id}:`, error);
        }
      });

      // Antes de buscar extrato novo, corrige o que já está no banco com regra
      // velha — usando o pedido e o extrato já guardados.
      totalReprocessed += await reprocessOldRule(account);

      sendProgressToUser(userId, {
        type: "sync_progress",
        message: `${label}: conferindo liquidacoes...`,
        accountId: account.id,
        accountNickname: label,
        current: contasConcluidas,
        total: accounts.length,
      });
      const settled = await settleAccount(account);

      totalSaved += saved;
      totalSettled += settled;
      contasConcluidas += 1;
      perShop.push({ accountId: account.id, shop: label, saved, settled });
    } catch (error) {
      contasConcluidas += 1;
      const message = error instanceof Error ? error.message : "erro desconhecido";
      console.error(`[TikTok Sync] Erro na conta ${account.id}:`, error);
      perShop.push({
        accountId: account.id,
        shop: label,
        saved: 0,
        settled: 0,
        error: message,
      });
      sendProgressToUser(userId, {
        type: "sync_error",
        message: `Erro ao processar loja ${label}: ${message}`,
        errorCode: "TIKTOK_SYNC_ERROR",
      });
    }
  });

  return {
    totalSaved,
    totalSettled,
    totalReprocessed,
    perShop,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
