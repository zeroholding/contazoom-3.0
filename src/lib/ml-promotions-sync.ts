/**
 * Sincronização das promoções do Mercado Livre — SOMENTE LEITURA na API.
 *
 * Fluxo por conta (medido contra a API real, 07/11/2026):
 *   1. GET /seller-promotions/users/{id}            → {results:[{id,type,status}]}
 *   2. por campanha: GET /promotions/{id}            → nome + datas
 *                    GET /promotions/{id}/items      → itens (started + candidate)
 *   3. GET /items?ids=...                            → título, foto, link, preço de tabela
 *
 * Duas decisões que o código carrega:
 *
 * a) **Itens `candidate` também são gravados.** Eles NÃO estão em promoção — são
 *    convites. Ficam na mesma tabela com `status='candidate'` e a tela filtra.
 *    Sem isso o painel mostraria convidado como se estivesse participando, que
 *    é exatamente a armadilha descrita na §4 do dossiê.
 *
 * b) **Nada é apagado.** O ML não devolve promoção encerrada; se a gente
 *    apagasse, o histórico sumiria junto. `is_current` marca o que veio nesta
 *    rodada e o que ficou para trás vira histórico.
 */
import prisma from "@/lib/prisma";
import type { MeliAccount, Prisma } from "@prisma/client";
import { refreshMeliAccountToken } from "@/lib/meli";
import { pMap } from "@/lib/concorrencia";

import {
  fetchAccountPromotions,
  fetchItemPromotions,
  fetchItemsInfo,
  fetchPromotionDetail,
  fetchPromotionItems,
  listActiveItemIds,
  promotionUid,
  type MlPromotion,
  type MlPromotionItem,
} from "./ml-promotions-api";

/**
 * Quantas contas em paralelo.
 *
 * Subiu de 3 para 4 junto com a varredura por anúncio: o trabalho pesado é por
 * item (806 chamadas no total), e conta pequena terminava antes de a grande
 * começar. Com 4 contas × 12 requisições, a fila fica sempre cheia.
 */
const ACCOUNT_CONCURRENCY = 4;
/** Campanhas em paralelo dentro de uma conta. */
const CAMPAIGN_CONCURRENCY = 3;

export type PromotionSyncSummary = {
  accounts: number;
  promotions: number;
  items: number;
  startedItems: number;
  errors: { account: string; error: string }[];
  startedAt: string;
  finishedAt: string;
};

/** Converte Date para texto ISO, que o Postgres aceita converter em timestamptz. */
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

async function savePromotions(tx: Prisma.TransactionClient, accountId: string, rows: MlPromotion[]): Promise<void> {
  if (rows.length === 0) return;
  // UNNEST com colunas nomeadas + escalares no SELECT. As datas viajam como
  // texto e o Postgres converte: array de Date o Prisma manda como número.
  await tx.$executeRawUnsafe(
    `INSERT INTO ml_promotion (
       uid, promotion_id, promotion_type, account_id, name, status,
       start_at, finish_at, deadline_at, is_current, first_seen_at, last_seen_at
     )
     SELECT u.uid, u.promotion_id, u.promotion_type, u.account_id, u.name, u.status,
            u.start_at::timestamptz, u.finish_at::timestamptz, u.deadline_at::timestamptz,
            true, NOW(), NOW()
       FROM UNNEST(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
         $7::text[], $8::text[], $9::text[]
       ) AS u(uid, promotion_id, promotion_type, account_id, name, status,
              start_at, finish_at, deadline_at)
     ON CONFLICT (uid) DO UPDATE SET
       name          = EXCLUDED.name,
       status        = EXCLUDED.status,
       start_at      = EXCLUDED.start_at,
       finish_at     = EXCLUDED.finish_at,
       deadline_at   = EXCLUDED.deadline_at,
       is_current    = true,
       last_seen_at  = NOW()`,
    rows.map((r) => `${accountId}:${r.uid}`),
    rows.map((r) => r.promotionId),
    rows.map((r) => r.promotionType),
    rows.map(() => accountId),
    rows.map((r) => r.name),
    rows.map((r) => r.status),
    rows.map((r) => iso(r.startAt)),
    rows.map((r) => iso(r.finishAt)),
    rows.map((r) => iso(r.deadlineAt)),
  );
}

type ItemRow = MlPromotionItem & {
  title: string | null;
  thumbnail: string | null;
  permalink: string | null;
  tablePrice: number | null;
};

async function saveItems(tx: Prisma.TransactionClient, accountId: string, rows: ItemRow[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.$executeRawUnsafe(
    `INSERT INTO ml_promotion_item (
       uid, promotion_uid, promotion_id, promotion_type, account_id, item_id, status,
       price, original_price, table_price, discount_amount, discount_pct,
       meli_pct, seller_pct, start_at, finish_at, offer_id,
       title, thumbnail, permalink, is_current, last_seen_at
     )
     SELECT u.uid, u.promotion_uid, u.promotion_id, u.promotion_type, u.account_id,
            u.item_id, u.status,
            u.price::numeric, u.original_price::numeric, u.table_price::numeric,
            u.discount_amount::numeric, u.discount_pct::numeric,
            u.meli_pct::numeric, u.seller_pct::numeric,
            u.start_at::timestamptz, u.finish_at::timestamptz, u.offer_id,
            u.title, u.thumbnail, u.permalink, true, NOW()
       FROM UNNEST(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
         $8::text[], $9::text[], $10::text[], $11::text[], $12::text[],
         $13::text[], $14::text[],
         $15::text[], $16::text[], $17::text[],
         $18::text[], $19::text[], $20::text[]
       ) AS u(uid, promotion_uid, promotion_id, promotion_type, account_id, item_id, status,
              price, original_price, table_price, discount_amount, discount_pct,
              meli_pct, seller_pct, start_at, finish_at, offer_id,
              title, thumbnail, permalink)
     ON CONFLICT (uid) DO UPDATE SET
       status          = EXCLUDED.status,
       price           = EXCLUDED.price,
       original_price  = EXCLUDED.original_price,
       table_price     = EXCLUDED.table_price,
       discount_amount = EXCLUDED.discount_amount,
       discount_pct    = EXCLUDED.discount_pct,
       meli_pct        = EXCLUDED.meli_pct,
       seller_pct      = EXCLUDED.seller_pct,
       start_at        = EXCLUDED.start_at,
       finish_at       = EXCLUDED.finish_at,
       offer_id        = EXCLUDED.offer_id,
       title           = COALESCE(EXCLUDED.title, ml_promotion_item.title),
       thumbnail       = COALESCE(EXCLUDED.thumbnail, ml_promotion_item.thumbnail),
       permalink       = COALESCE(EXCLUDED.permalink, ml_promotion_item.permalink),
       is_current      = true,
       last_seen_at    = NOW()`,
    rows.map((r) => `${accountId}:${r.promotionUid}:${r.itemId}`),
    rows.map((r) => `${accountId}:${r.promotionUid}`),
    rows.map((r) => r.promotionId),
    rows.map((r) => r.promotionType),
    rows.map(() => accountId),
    rows.map((r) => r.itemId),
    rows.map((r) => r.status),
    // Números viajam como texto e são convertidos por ::numeric — evita o
    // Prisma adivinhar o tipo de um array com null no meio.
    rows.map((r) => (r.price === null ? null : String(r.price))),
    rows.map((r) => (r.originalPrice === null ? null : String(r.originalPrice))),
    rows.map((r) => (r.tablePrice === null ? null : String(r.tablePrice))),
    // Desconto sempre sobre o par da MESMA resposta (§5): price vs original_price
    // da campanha. Nunca contra o preço de tabela, que é outro número.
    rows.map((r) =>
      r.price !== null && r.originalPrice !== null && r.originalPrice > 0
        ? String((r.originalPrice - r.price).toFixed(2))
        : null,
    ),
    rows.map((r) =>
      r.price !== null && r.originalPrice !== null && r.originalPrice > 0
        ? String((((r.originalPrice - r.price) / r.originalPrice) * 100).toFixed(4))
        : null,
    ),
    rows.map((r) => (r.meliPct === null ? null : String(r.meliPct))),
    rows.map((r) => (r.sellerPct === null ? null : String(r.sellerPct))),
    rows.map((r) => iso(r.startAt)),
    rows.map((r) => iso(r.finishAt)),
    rows.map((r) => r.offerId),
    rows.map((r) => r.title),
    rows.map((r) => r.thumbnail),
    rows.map((r) => r.permalink),
  );
}

/**
 * Marca como histórico tudo o que NÃO veio nesta rodada.
 *
 * Feito por comparação de `last_seen_at` com o instante em que a conta começou
 * a ser sincronizada — assim a limpeza não depende de montar uma lista de ids
 * (que ficaria enorme) nem de apagar linha nenhuma.
 */
async function markStale(tx: Prisma.TransactionClient, accountId: string, runStartedAt: Date): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE ml_promotion
        SET is_current = false
      WHERE account_id = $1 AND last_seen_at < $2`,
    accountId,
    runStartedAt,
  );
  await tx.$executeRawUnsafe(
    `UPDATE ml_promotion_item
        SET is_current = false
      WHERE account_id = $1 AND last_seen_at < $2`,
    accountId,
    runStartedAt,
  );
}

async function syncAccount(account: MeliAccount, nickname: string): Promise<{
  promotions: number;
  items: number;
  startedItems: number;
  error: string | null;
}> {
  const runStartedAt = new Date();
  const { id: accountId, ml_user_id: mlUserId } = account;
  const token = (await refreshMeliAccountToken(account)).access_token;
  if (!token) {
    return { promotions: 0, items: 0, startedItems: 0, error: "sem token válido" };
  }

  const { promotions: listed, error: listError } = await fetchAccountPromotions(mlUserId, token);
  if (listError) {
    return { promotions: 0, items: 0, startedItems: 0, error: listError };
  }

  const promotionRows: MlPromotion[] = [];
  const itemRows: MlPromotionItem[] = [];
  const warnings: string[] = [];
  let incompleteItems = false;

  await pMap(listed, CAMPAIGN_CONCURRENCY, async (listedPromotion) => {
    const uid = promotionUid(mlUserId, listedPromotion.type, listedPromotion.id);

    // A listagem já traz nome e datas para todo tipo menos LIGHTNING. Só busca
    // o detalhe de quem veio incompleto — uma chamada a menos por campanha na
    // maioria dos casos.
    const complete =
      listedPromotion.name !== null && listedPromotion.finishAt !== null;

    if (complete) {
      promotionRows.push({
        uid,
        promotionId: listedPromotion.id,
        promotionType: listedPromotion.type,
        mlUserId,
        name: listedPromotion.name,
        status: listedPromotion.status,
        startAt: listedPromotion.startAt,
        finishAt: listedPromotion.finishAt,
        deadlineAt: listedPromotion.deadlineAt,
      });
    } else {
      const detail = await fetchPromotionDetail(
        mlUserId,
        listedPromotion.id,
        listedPromotion.type,
        token,
      );
      if (detail.error) warnings.push(`${listedPromotion.id}: ${detail.error}`);

      // LIGHTNING/DOD não têm detalhe: a promoção continua válida, só sem nome
      // e sem data de campanha. Nunca inventar data.
      promotionRows.push(
        detail.detail ?? {
          uid,
          promotionId: listedPromotion.id,
          promotionType: listedPromotion.type,
          mlUserId,
          name: listedPromotion.name,
          status: listedPromotion.status,
          startAt: listedPromotion.startAt,
          finishAt: listedPromotion.finishAt,
          deadlineAt: listedPromotion.deadlineAt,
        },
      );
    }

    // `started` = participando agora. `candidate` = convite, NÃO participa.
    for (const status of ["started", "candidate"] as const) {
      const result = await fetchPromotionItems(
        mlUserId,
        listedPromotion.id,
        listedPromotion.type,
        token,
        status,
      );
      itemRows.push(...result.items);
      if (result.error) {
        incompleteItems = true;
        warnings.push(`${listedPromotion.id}/${status}: ${result.error}`);
      }
    }
  });

  // -------------------------------------------------------------------
  // Desconto individual (PRICE_DISCOUNT) — não é campanha, então NÃO aparece
  // em /seller-promotions/users. Só existe no endpoint por anúncio, e é uma
  // chamada por anúncio ativo. Sem esta varredura, a promoção que o vendedor
  // criou sozinho fica invisível no painel.
  // -------------------------------------------------------------------
  const scan = await listActiveItemIds(mlUserId, token);
  const { found: itemPromos, failures } = await fetchItemPromotions(scan.ids, token);
  if (!scan.complete || failures > 0) {
    incompleteItems = true;
    warnings.push("A consulta aos descontos individuais ficou incompleta.");
  }

  // Campanha já vem pelo caminho de /users; aqui interessa o que o vendedor
  // criou por conta própria.
  const ownPromos = itemPromos.filter(
    (p) =>
      (p.type === "PRICE_DISCOUNT" || p.type === "SELLER_CAMPAIGN") &&
      (p.status === "started" || p.status === "pending"),
  );

  if (ownPromos.length > 0) {
    // Agrupa por campanha quando existe id (SELLER_CAMPAIGN). Desconto
    // individual não tem id: vira um agrupamento por conta, com o nome que o
    // vendedor reconhece.
    const groups = new Map<string, { id: string; name: string; type: string }>();
    for (const promo of ownPromos) {
      const key = promo.promotionId ?? "PRICE_DISCOUNT";
      if (groups.has(key)) continue;
      groups.set(key, {
        id: key,
        type: promo.type,
        name: promo.promotionId
          ? promo.type === "SELLER_CAMPAIGN"
            ? "Campanha do vendedor"
            : "Desconto individual"
          : "Desconto individual",
      });
    }

    for (const group of groups.values()) {
      promotionRows.push({
        uid: promotionUid(mlUserId, group.type, group.id),
        promotionId: group.id,
        promotionType: group.type,
        mlUserId,
        name: group.name,
        status: "started",
        // Sem data de campanha: cada desconto tem a sua própria.
        startAt: null,
        finishAt: null,
        deadlineAt: null,
      });
    }

    for (const promo of ownPromos) {
      const key = promo.promotionId ?? "PRICE_DISCOUNT";
      itemRows.push({
        promotionUid: promotionUid(mlUserId, promo.type, key),
        promotionId: key,
        promotionType: promo.type,
        mlUserId,
        itemId: promo.itemId,
        status: promo.status,
        price: promo.price,
        originalPrice: promo.originalPrice,
        meliPct: null,
        sellerPct: null,
        startAt: promo.startAt,
        finishAt: promo.finishAt,
        offerId: null,
      });
    }
  }

  // Título, foto, link e preço de tabela de todos os anúncios envolvidos.
  const info = await fetchItemsInfo(
    mlUserId,
    itemRows.map((i) => i.itemId),
    token,
  );

  // Um mesmo anúncio pode voltar em `started` e em `candidate` da MESMA
  // campanha (a API não garante exclusividade). A chave é (promoção, anúncio),
  // então deduplicar aqui — com `started` vencendo, porque é o que participa.
  const deduped = new Map<string, MlPromotionItem>();
  for (const item of itemRows) {
    const key = `${item.promotionUid}:${item.itemId}`;
    const existing = deduped.get(key);
    if (!existing || (existing.status !== "started" && item.status === "started")) {
      deduped.set(key, item);
    }
  }

  const enriched: ItemRow[] = Array.from(deduped.values()).map((item) => {
    const meta = info.get(item.itemId);
    return {
      ...item,
      title: meta?.title ?? null,
      thumbnail: meta?.thumbnail ?? null,
      permalink: meta?.permalink ?? null,
      tablePrice: meta?.tablePrice ?? null,
    };
  });

  // Mesma campanha não pode entrar duas vezes na mesma instrução.
  const promotionsByUid = new Map(promotionRows.map((p) => [p.uid, p]));

  const startedItems = enriched.filter((i) => i.status === "started").length;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('ml-promotion'), hashtext(${accountId}))::text`;
    const previous = await tx.mlPromotionSync.findUnique({ where: { accountId } });
    if (previous?.lastSyncedAt && previous.lastSyncedAt > runStartedAt) return;
    await savePromotions(tx, accountId, [...promotionsByUid.values()]);
    await saveItems(tx, accountId, enriched);
    if (!incompleteItems) await markStale(tx, accountId, runStartedAt);
    const state = {
      lastSyncedAt: new Date(),
      lastError: warnings.length > 0 ? warnings.slice(0, 5).join(" | ") : null,
      promotions: promotionsByUid.size,
      items: enriched.length,
    };
    await tx.mlPromotionSync.upsert({
      where: { accountId },
      create: { accountId, ...state },
      update: state,
    });
  }, { timeout: 30_000 });

  return {
    promotions: promotionsByUid.size,
    items: enriched.length,
    startedItems,
    error: warnings.length > 0 ? `${nickname}: ${warnings[0]}` : null,
  };
}

export async function syncAllPromotions(userId: string): Promise<PromotionSyncSummary> {
  const startedAt = new Date().toISOString();

  const accounts = await prisma.meliAccount.findMany({
    where: { userId },
    orderBy: { nickname: "asc" },
  });


  let promotions = 0;
  let items = 0;
  let startedItems = 0;
  const errors: { account: string; error: string }[] = [];

  await pMap(accounts, ACCOUNT_CONCURRENCY, async (account) => {
    const name = account.nickname ?? account.ml_user_id.toString();
    try {
      const result = await syncAccount(account, name);
      promotions += result.promotions;
      items += result.items;
      startedItems += result.startedItems;
      if (result.error) errors.push({ account: name, error: result.error });
    } catch (err) {
      console.error("[Promoções ML] Falha ao sincronizar conta", account.id, err);
      const message = "Falha ao sincronizar a conta do Mercado Livre.";
      errors.push({ account: name, error: message });
      // Registra a falha da conta sem derrubar as outras.
      await prisma.mlPromotionSync
        .upsert({
          where: { accountId: account.id },
          create: { accountId: account.id, lastError: message },
          update: { lastError: message },
        })
        .catch(() => undefined);
    }
  });


  return {
    accounts: accounts.length,
    promotions,
    items,
    startedItems,
    errors,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
