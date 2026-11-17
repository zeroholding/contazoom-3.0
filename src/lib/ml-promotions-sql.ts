/**
 * Leitura da tela /promocoes.
 *
 * Junta `ml_promotion_item` com `ml_promotion` (nome, datas da campanha) e
 * `user_tokens` (apelido da conta).
 *
 * Duas regras que vêm do dossiê e estão codificadas aqui:
 *
 * 1. **A data de término é do item quando existe, senão da campanha.** Itens
 *    `started` de DEAL não trazem data própria (medido na API); usar a da
 *    campanha é o correto. Em `LIGHTNING` não existe nem uma nem outra — o
 *    painel mostra "não informado", nunca uma data inventada.
 * 2. **O desconto é sempre `price` vs `original_price` da MESMA resposta.** O
 *    preço de tabela (`table_price`) é outra coisa e serve só de comparação.
 */
import { Prisma } from "@prisma/client";

import prisma from "./prisma";
import type { PromotionFilters } from "./ml-promotions-query";

export type PromotionAccountOption = { accountId: string; nickname: string };

export type PromotionRow = {
  promotionUid: string;
  promotionId: string;
  promotionType: string;
  promotionName: string | null;
  promotionStatus: string | null;
  account: string;
  /** Id da conta, para o link do detalhe não depender do apelido. */
  accountId: string;
  itemId: string;
  itemStatus: string | null;
  title: string | null;
  thumbnail: string | null;
  permalink: string | null;
  price: number | null;
  originalPrice: number | null;
  tablePrice: number | null;
  discountAmount: number | null;
  discountPct: number | null;
  meliPct: number | null;
  sellerPct: number | null;
  startAt: Date | null;
  finishAt: Date | null;
  offerId: string | null;
};

export type PromotionSummary = {
  itemsInPromotion: number;
  activePromotions: number;
  accounts: number;
  avgDiscountPct: number | null;
  totalDiscountAmount: number | null;
  endingIn3: number;
  endingIn7: number;
  withoutDate: number;
  candidates: number;
  lastSync: Date | null;
};

function toNum(v: Prisma.Decimal | number | bigint | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return v.toNumber();
}

/** Fim efetivo: o do item quando existe; senão o da campanha. */
const FINISH_EXPR = Prisma.sql`COALESCE(i.finish_at, p.finish_at)`;

/**
 * Fim do dia de hoje em São Paulo, como timestamptz.
 *
 * `CURRENT_DATE` dependeria do fuso do banco (o container roda em UTC), e
 * "termina hoje" às 22h de Brasília cairia no dia seguinte. Aqui o dia é
 * calculado no fuso certo e convertido de volta.
 */
const END_OF_TODAY = Prisma.sql`(
  (date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day')
  AT TIME ZONE 'America/Sao_Paulo'
)`;

const END_OF_TOMORROW = Prisma.sql`(
  (date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '2 days')
  AT TIME ZONE 'America/Sao_Paulo'
)`;

const BASE_FROM = Prisma.sql`
  FROM ml_promotion_item i
  JOIN ml_promotion p ON p.uid = i.promotion_uid
  JOIN meli_account u ON u.id = i.account_id
`;

function buildWhere(
  userId: string,
  filters: PromotionFilters,
  opts: { skipWindow?: boolean; skipStatus?: boolean } = {},
): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`u."userId" = ${userId}`,Prisma.sql`i.is_current = true`, Prisma.sql`p.is_current = true`];

  if (!opts.skipStatus && filters.status !== "todos") {
    conds.push(Prisma.sql`i.status = ${filters.status}`);
  }

  if (filters.accounts.length > 0) {
    conds.push(Prisma.sql`i.account_id IN (${Prisma.join(filters.accounts)})`);
  }

  if (filters.types.length > 0) {
    conds.push(Prisma.sql`i.promotion_type IN (${Prisma.join(filters.types)})`);
  }

  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      Prisma.sql`(i.title ILIKE ${like} OR i.item_id ILIKE ${like} OR p.name ILIKE ${like} OR i.promotion_id ILIKE ${like})`,
    );
  }

  if (!opts.skipWindow) {
    if (filters.window === "sem-data") {
      conds.push(Prisma.sql`${FINISH_EXPR} IS NULL`);
    } else if (filters.window === "hoje") {
      conds.push(Prisma.sql`${FINISH_EXPR} >= NOW() AND ${FINISH_EXPR} <= ${END_OF_TODAY}`);
    } else if (filters.window === "amanha") {
      conds.push(
        Prisma.sql`${FINISH_EXPR} > ${END_OF_TODAY} AND ${FINISH_EXPR} <= ${END_OF_TOMORROW}`,
      );
    } else if (filters.window !== "todas") {
      const days = Number(filters.window);
      conds.push(
        Prisma.sql`${FINISH_EXPR} >= NOW() AND ${FINISH_EXPR} <= NOW() + (${days} || ' days')::interval`,
      );
    }
  }

  if (filters.minDiscount !== null) {
    conds.push(Prisma.sql`i.discount_pct >= ${filters.minDiscount}`);
  }

  return Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
}

function buildOrderBy(filters: PromotionFilters): Prisma.Sql {
  if (filters.sort === "desconto") {
    return Prisma.sql`ORDER BY i.discount_pct DESC NULLS LAST, i.price ASC NULLS LAST`;
  }
  if (filters.sort === "preco") {
    return Prisma.sql`ORDER BY i.price ASC NULLS LAST, i.discount_pct DESC NULLS LAST`;
  }
  // Padrão: o que termina antes aparece primeiro. Sem data vai para o fim,
  // porque não dá para priorizar o que não tem prazo conhecido.
  return Prisma.sql`ORDER BY ${FINISH_EXPR} ASC NULLS LAST, i.discount_pct DESC NULLS LAST`;
}

/** Contas que têm promoção agora, para o filtro. */
export async function fetchPromotionAccounts(userId: string): Promise<PromotionAccountOption[]> {
  const rows = await prisma.$queryRaw<Array<{ account_id: string; nickname: string | null }>>(
    Prisma.sql`
      SELECT DISTINCT i.account_id, u.nickname
        FROM ml_promotion_item i
        JOIN meli_account u ON u.id = i.account_id
       WHERE u."userId" = ${userId} AND i.is_current = true
         AND i.status = 'started'
       ORDER BY u.nickname ASC NULLS LAST
    `,
  );
  return rows.map((r) => ({
    accountId: r.account_id.toString(),
    nickname: r.nickname ?? r.account_id.toString(),
  }));
}

/**
 * Tipos de promoção presentes agora, para o filtro.
 *
 * Conta só item `started`: convite não é promoção, e contar convite aqui daria
 * um número que não bate com nada na tela.
 */
export async function fetchPromotionTypes(userId: string): Promise<Array<{ type: string; total: number }>> {
  const rows = await prisma.$queryRaw<Array<{ promotion_type: string; total: bigint }>>(
    Prisma.sql`
      SELECT i.promotion_type, COUNT(*)::bigint AS total
        FROM ml_promotion_item i
        JOIN meli_account u ON u.id = i.account_id
       WHERE u."userId" = ${userId} AND is_current = true
         AND status = 'started'
       GROUP BY promotion_type
       ORDER BY total DESC
    `,
  );
  return rows.map((r) => ({ type: r.promotion_type, total: Number(r.total) }));
}

/**
 * Indicadores do topo.
 *
 * Aplicam `contas`, `tipos` e busca, mas NÃO a janela de término nem a visão
 * (`situacao`). Motivo: se a pessoa filtra "termina em 3 dias" ou muda para
 * "Convites", o total de anúncios em promoção não pode encolher — esses KPIs
 * descrevem a operação, não o recorte da tabela. As contagens por status saem
 * das expressões CASE, que separam started de candidate na mesma varredura.
 */
export async function fetchPromotionSummary(
  userId: string,
  filters: PromotionFilters,
): Promise<PromotionSummary> {
  const where = buildWhere(userId, filters, { skipWindow: true, skipStatus: true });

  const rows = await prisma.$queryRaw<
    Array<{
      items_in_promotion: bigint;
      active_promotions: bigint;
      accounts: bigint;
      avg_discount: Prisma.Decimal | null;
      total_discount: Prisma.Decimal | null;
      ending3: bigint;
      ending7: bigint;
      without_date: bigint;
      candidates: bigint;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(DISTINCT CASE WHEN i.status = 'started' THEN i.item_id END)::bigint AS items_in_promotion,
      COUNT(DISTINCT CASE WHEN i.status = 'started' THEN i.promotion_uid END)::bigint AS active_promotions,
      COUNT(DISTINCT i.account_id)::bigint AS accounts,
      AVG(CASE WHEN i.status = 'started' THEN i.discount_pct END) AS avg_discount,
      SUM(CASE WHEN i.status = 'started' THEN i.discount_amount END) AS total_discount,
      COUNT(DISTINCT CASE WHEN i.status = 'started' AND ${FINISH_EXPR} >= NOW() AND ${FINISH_EXPR} <= NOW() + INTERVAL '3 days' THEN i.item_id END)::bigint AS ending3,
      COUNT(DISTINCT CASE WHEN i.status = 'started' AND ${FINISH_EXPR} >= NOW() AND ${FINISH_EXPR} <= NOW() + INTERVAL '7 days' THEN i.item_id END)::bigint AS ending7,
      COUNT(DISTINCT CASE WHEN i.status = 'started' AND ${FINISH_EXPR} IS NULL THEN i.item_id END)::bigint AS without_date,
      COUNT(DISTINCT CASE WHEN i.status = 'candidate' THEN i.item_id END)::bigint AS candidates
    ${BASE_FROM}
    ${where}
  `);

  const row = rows[0];
  const lastSync = await prisma.mlPromotionSync.findFirst({
    where: { account: { userId }, lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });

  return {
    itemsInPromotion: Number(row?.items_in_promotion ?? 0),
    activePromotions: Number(row?.active_promotions ?? 0),
    accounts: Number(row?.accounts ?? 0),
    avgDiscountPct: toNum(row?.avg_discount ?? null),
    totalDiscountAmount: toNum(row?.total_discount ?? null),
    endingIn3: Number(row?.ending3 ?? 0),
    endingIn7: Number(row?.ending7 ?? 0),
    withoutDate: Number(row?.without_date ?? 0),
    candidates: Number(row?.candidates ?? 0),
    lastSync: lastSync?.lastSyncedAt ?? null,
  };
}

export async function fetchPromotionCount(userId: string, filters: PromotionFilters): Promise<number> {
  const where = buildWhere(userId, filters);
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS total
    ${BASE_FROM}
    ${where}
  `);
  return Number(rows[0]?.total ?? 0);
}

export async function fetchPromotionPage(userId: string, filters: PromotionFilters): Promise<PromotionRow[]> {
  const where = buildWhere(userId, filters);
  const orderBy = buildOrderBy(filters);
  const offset = (filters.page - 1) * filters.perPage;

  const rows = await prisma.$queryRaw<
    Array<{
      promotion_uid: string;
      promotion_id: string;
      promotion_type: string;
      promotion_name: string | null;
      promotion_status: string | null;
      nickname: string | null;
      account_id: string;
      item_id: string;
      item_status: string | null;
      title: string | null;
      thumbnail: string | null;
      permalink: string | null;
      price: Prisma.Decimal | null;
      original_price: Prisma.Decimal | null;
      table_price: Prisma.Decimal | null;
      discount_amount: Prisma.Decimal | null;
      discount_pct: Prisma.Decimal | null;
      meli_pct: Prisma.Decimal | null;
      seller_pct: Prisma.Decimal | null;
      start_at: Date | null;
      finish_at: Date | null;
      offer_id: string | null;
    }>
  >(Prisma.sql`
    SELECT
      i.promotion_uid, i.promotion_id, i.promotion_type,
      p.name AS promotion_name, p.status AS promotion_status,
      u.nickname, i.account_id,
      i.item_id, i.status AS item_status,
      i.title, i.thumbnail, i.permalink,
      i.price, i.original_price, i.table_price,
      i.discount_amount, i.discount_pct,
      i.meli_pct, i.seller_pct,
      i.start_at,
      ${FINISH_EXPR} AS finish_at,
      i.offer_id
    ${BASE_FROM}
    ${where}
    ${orderBy}
    LIMIT ${filters.perPage} OFFSET ${offset}
  `);

  return rows.map((r) => ({
    promotionUid: r.promotion_uid,
    promotionId: r.promotion_id,
    promotionType: r.promotion_type,
    promotionName: r.promotion_name,
    promotionStatus: r.promotion_status,
    account: r.nickname ?? "—",
    accountId: r.account_id.toString(),
    itemId: r.item_id,
    itemStatus: r.item_status,
    title: r.title,
    thumbnail: r.thumbnail,
    permalink: r.permalink,
    price: toNum(r.price),
    originalPrice: toNum(r.original_price),
    tablePrice: toNum(r.table_price),
    discountAmount: toNum(r.discount_amount),
    discountPct: toNum(r.discount_pct),
    meliPct: toNum(r.meli_pct),
    sellerPct: toNum(r.seller_pct),
    startAt: r.start_at,
    finishAt: r.finish_at,
    offerId: r.offer_id,
  }));
}

// ---------------------------------------------------------------------------
// Detalhe da campanha
// ---------------------------------------------------------------------------

export type PromotionDetail = {
  promotion: {
    uid: string;
    promotionId: string;
    promotionType: string;
    name: string | null;
    status: string | null;
    startAt: Date | null;
    finishAt: Date | null;
    deadlineAt: Date | null;
    isCurrent: boolean;
    firstSeenAt: Date;
    lastSeenAt: Date;
    account: string;
    accountId: string;
  } | null;
  items: PromotionRow[];
  counts: { started: number; candidate: number; total: number };
};

export async function fetchPromotionDetail(
  userId: string,
  promotionId: string,
  options: { account?: string; type?: string } = {},
): Promise<PromotionDetail> {
  const accountFilter = options.account
    ? Prisma.sql`AND p.account_id = ${options.account}`
    : Prisma.empty;
  const typeFilter = options.type
    ? Prisma.sql`AND p.promotion_type = ${options.type}`
    : Prisma.empty;

  // A MESMA campanha existe em várias contas (o "11.11 da Black" está em 7).
  // Sem conta informada, escolhe a que tem mais anúncio participando — mostrar
  // a conta errada daria uma campanha "vazia" mesmo com 13 itens ativos.
  const promotions = await prisma.$queryRaw<
    Array<{
      uid: string;
      promotion_id: string;
      promotion_type: string;
      name: string | null;
      status: string | null;
      start_at: Date | null;
      finish_at: Date | null;
      deadline_at: Date | null;
      is_current: boolean;
      first_seen_at: Date;
      last_seen_at: Date;
      nickname: string | null;
      account_id: string;
    }>
  >(Prisma.sql`
    SELECT p.uid, p.promotion_id, p.promotion_type, p.name, p.status,
           p.start_at, p.finish_at, p.deadline_at,
           p.is_current, p.first_seen_at, p.last_seen_at,
           u.nickname, p.account_id
      FROM ml_promotion p
      JOIN meli_account u ON u.id = p.account_id
     WHERE u."userId" = ${userId} AND p.promotion_id = ${promotionId}
       ${accountFilter}
       ${typeFilter}
     ORDER BY (
                SELECT COUNT(*) FROM ml_promotion_item i
                 WHERE i.promotion_uid = p.uid AND i.status = 'started'
              ) DESC,
              p.is_current DESC,
              p.last_seen_at DESC
     LIMIT 1
  `);

  const head = promotions[0];
  if (!head) {
    return { promotion: null, items: [], counts: { started: 0, candidate: 0, total: 0 } };
  }

  const rows = await prisma.$queryRaw<
    Array<{
      promotion_uid: string;
      promotion_id: string;
      promotion_type: string;
      promotion_name: string | null;
      promotion_status: string | null;
      nickname: string | null;
      account_id: string;
      item_id: string;
      item_status: string | null;
      title: string | null;
      thumbnail: string | null;
      permalink: string | null;
      price: Prisma.Decimal | null;
      original_price: Prisma.Decimal | null;
      table_price: Prisma.Decimal | null;
      discount_amount: Prisma.Decimal | null;
      discount_pct: Prisma.Decimal | null;
      meli_pct: Prisma.Decimal | null;
      seller_pct: Prisma.Decimal | null;
      start_at: Date | null;
      finish_at: Date | null;
      offer_id: string | null;
    }>
  >(Prisma.sql`
    SELECT i.promotion_uid, i.promotion_id, i.promotion_type,
           p.name AS promotion_name, p.status AS promotion_status,
           u.nickname, i.account_id,
           i.item_id, i.status AS item_status,
           i.title, i.thumbnail, i.permalink,
           i.price, i.original_price, i.table_price,
           i.discount_amount, i.discount_pct, i.meli_pct, i.seller_pct,
           i.start_at, ${FINISH_EXPR} AS finish_at, i.offer_id
      FROM ml_promotion_item i
      JOIN ml_promotion p ON p.uid = i.promotion_uid
      JOIN meli_account u ON u.id = i.account_id
     WHERE u."userId" = ${userId} AND i.promotion_uid = ${head.uid}
     ORDER BY (i.status = 'started') DESC, i.discount_pct DESC NULLS LAST
     LIMIT 500
  `);

  const items: PromotionRow[] = rows.map((r) => ({
    promotionUid: r.promotion_uid,
    promotionId: r.promotion_id,
    promotionType: r.promotion_type,
    promotionName: r.promotion_name,
    promotionStatus: r.promotion_status,
    account: r.nickname ?? "—",
    accountId: r.account_id.toString(),
    itemId: r.item_id,
    itemStatus: r.item_status,
    title: r.title,
    thumbnail: r.thumbnail,
    permalink: r.permalink,
    price: toNum(r.price),
    originalPrice: toNum(r.original_price),
    tablePrice: toNum(r.table_price),
    discountAmount: toNum(r.discount_amount),
    discountPct: toNum(r.discount_pct),
    meliPct: toNum(r.meli_pct),
    sellerPct: toNum(r.seller_pct),
    startAt: r.start_at,
    finishAt: r.finish_at,
    offerId: r.offer_id,
  }));

  return {
    promotion: {
      uid: head.uid,
      promotionId: head.promotion_id,
      promotionType: head.promotion_type,
      name: head.name,
      status: head.status,
      startAt: head.start_at,
      finishAt: head.finish_at,
      deadlineAt: head.deadline_at,
      isCurrent: head.is_current,
      firstSeenAt: head.first_seen_at,
      lastSeenAt: head.last_seen_at,
      account: head.nickname ?? "—",
      accountId: head.account_id.toString(),
    },
    items,
    counts: {
      started: items.filter((i) => i.itemStatus === "started").length,
      candidate: items.filter((i) => i.itemStatus === "candidate").length,
      total: items.length,
    },
  };
}
