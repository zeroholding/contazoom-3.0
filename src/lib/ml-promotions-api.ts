/**
 * Cliente da API de promoções do Mercado Livre — SOMENTE LEITURA.
 *
 * Nenhuma função daqui escreve no Mercado Livre. O módulo /promocoes é de
 * consulta: criar/editar campanha fica fora de escopo por decisão do produto.
 *
 * Formatos conferidos contra a API real (8 contas do NEXUS, 07/11/2026), e não
 * contra a documentação — que diverge em dois pontos importantes:
 *
 * 1. `GET /seller-promotions/users/{id}` devolve `{results, paging}` e cada item
 *    traz SÓ `{id, type, status}`. A doc sugere que viriam nome e datas; não
 *    vêm. Nome e datas exigem uma segunda chamada por campanha.
 * 2. `paging.total` não é confiável (veio 0 numa campanha com 27 itens).
 *
 * O que a doc acerta e o código respeita:
 * - `limit` máximo é 50;
 * - a paginação real é `search_after`, com o cursor em `paging.searchAfter`;
 * - `LIGHTNING` responde 400 em `/promotions/{id}` (não existe detalhe);
 * - itens `started` de DEAL não trazem data; de SMART trazem `end_date`.
 */


const ML_API = "https://api.mercadolibre.com";
const APP_VERSION = "v2";
const PAGE_SIZE = 50;
const TIMEOUT_MS = 20_000;

/** Nome do campo de data de fim muda conforme o tipo (§6 do dossiê). */
type RawDates = {
  start_date?: string | null;
  finish_date?: string | null;
  end_date?: string | null;
  deadline_date?: string | null;
};

export type MlPromotion = {
  /** "{ml_user_id}:{type}:{id}" */
  uid: string;
  promotionId: string;
  promotionType: string;
  mlUserId: bigint;
  name: string | null;
  status: string | null;
  startAt: Date | null;
  finishAt: Date | null;
  deadlineAt: Date | null;
};

export type MlPromotionItem = {
  promotionUid: string;
  promotionId: string;
  promotionType: string;
  mlUserId: bigint;
  itemId: string;
  status: string | null;
  price: number | null;
  originalPrice: number | null;
  meliPct: number | null;
  sellerPct: number | null;
  startAt: Date | null;
  finishAt: Date | null;
  offerId: string | null;
};

export type MlAccountPromotions = {
  promotions: MlPromotion[];
  /** Itens por uid da promoção. */
  items: Map<string, MlPromotionItem[]>;
  /** Erros por campanha, sem interromper o resto da conta. */
  warnings: string[];
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Data no "formato local" do Mercado Livre, sem fuso.
 *
 * `PRICE_DISCOUNT` devolve `2026-10-29T00:00:00` — sem `Z` e sem offset. Lido
 * cru, o JavaScript interpreta no fuso do SERVIDOR (o container roda em UTC), e
 * 29/10 00:00 viraria 28/10 21:00 em São Paulo: um dia errado na tela. A doc
 * diz que essas datas são locais do Brasil, então o offset é fixado em −03:00.
 */
function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasZone ? value : `${value}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function promotionUid(mlUserId: bigint, type: string, id: string): string {
  return `${mlUserId.toString()}:${type}:${id}`;
}

async function mlGet(
  path: string,
  token: string,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_API}${path}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Resposta não-JSON: o status já diz o suficiente.
    }

    if (!res.ok) {
      const message =
        (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
      return { ok: false, status: res.status, message };
    }
    return { ok: true, json };
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha de rede";
    return { ok: false, status: 0, message };
  } finally {
    clearTimeout(timeout);
  }
}

/** Campanha como vem na listagem por usuário. */
export type ListedPromotion = {
  id: string;
  type: string;
  status: string;
  name: string | null;
  startAt: Date | null;
  finishAt: Date | null;
  deadlineAt: Date | null;
};

/**
 * Todas as promoções da conta.
 *
 * Só vêm `started` e `pending` — promoção encerrada desaparece da API, e é
 * justamente por isso que o NEXUS guarda histórico próprio.
 *
 * A resposta traz nome e datas para todos os tipos **menos `LIGHTNING`**, que
 * devolve só `{id, type, status}`. Guardar esses campos aqui evita uma chamada
 * de detalhe por campanha: só cai no detalhe quem não veio completo.
 */
export async function fetchAccountPromotions(
  mlUserId: bigint,
  token: string,
): Promise<{ promotions: ListedPromotion[]; error: string | null }> {
  const result = await mlGet(
    `/seller-promotions/users/${mlUserId.toString()}?app_version=${APP_VERSION}`,
    token,
  );
  if (!result.ok) {
    return { promotions: [], error: `${result.message} (HTTP ${result.status})` };
  }

  const raw = (result.json as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(raw)) return { promotions: [], error: "Resposta inválida ao listar campanhas." };

  const promotions: ListedPromotion[] = [];
  for (const entry of raw) {
    const node = entry as RawDates & {
      id?: unknown;
      type?: unknown;
      status?: unknown;
      name?: unknown;
    };
    const id = toText(node.id);
    const type = toText(node.type);
    if (!id || !type) continue; // sem id ou tipo não há o que consultar

    promotions.push({
      id,
      type,
      status: toText(node.status) ?? "",
      name: toText(node.name),
      startAt: parseDate(node.start_date),
      finishAt: parseDate(node.finish_date),
      deadlineAt: parseDate(node.deadline_date),
    });
  }
  return { promotions, error: null };
}

/**
 * Detalhe da campanha: nome e datas.
 *
 * `LIGHTNING` (e `DOD`) não têm detalhe — a API responde 400 "Invalid promotion
 * type". Nesse caso não é erro do módulo: a promoção segue válida, só sem nome
 * e sem data de campanha.
 */
export async function fetchPromotionDetail(
  mlUserId: bigint,
  promotionId: string,
  promotionType: string,
  token: string,
): Promise<{ detail: MlPromotion | null; error: string | null }> {
  const result = await mlGet(
    `/seller-promotions/promotions/${promotionId}?promotion_type=${encodeURIComponent(promotionType)}&app_version=${APP_VERSION}`,
    token,
  );

  if (!result.ok) {
    // 400 em LIGHTNING/DOD é esperado: não há detalhe para esses tipos.
    if (result.status === 400) return { detail: null, error: null };
    return { detail: null, error: `${result.message} (HTTP ${result.status})` };
  }

  const node = (result.json ?? {}) as RawDates & {
    id?: unknown;
    type?: unknown;
    status?: unknown;
    name?: unknown;
  };

  const type = toText(node.type) ?? promotionType;
  const id = toText(node.id) ?? promotionId;

  return {
    detail: {
      uid: promotionUid(mlUserId, type, id),
      promotionId: id,
      promotionType: type,
      mlUserId,
      name: toText(node.name),
      status: toText(node.status),
      startAt: parseDate(node.start_date),
      finishAt: parseDate(node.finish_date),
      deadlineAt: parseDate(node.deadline_date),
    },
    error: null,
  };
}

/**
 * Itens de uma campanha.
 *
 * ⚠️  `status` é obrigatório na prática: sem filtro a API devolve `candidate`
 * (convidado que NÃO participa). Mostrar isso como promoção seria mentira — um
 * DEAL real devolveu 1 `started` e 50 `candidate`.
 *
 * Paginação por `search_after`: `limit` para em 50 e `offset` é ignorado.
 */
export async function fetchPromotionItems(
  mlUserId: bigint,
  promotionId: string,
  promotionType: string,
  token: string,
  status = "started",
): Promise<{ items: MlPromotionItem[]; error: string | null }> {
  const uid = promotionUid(mlUserId, promotionType, promotionId);
  const items: MlPromotionItem[] = [];
  // A API já devolveu o mesmo item duas vezes em páginas seguidas quando o
  // cursor não avança. Deduplicar aqui evita chave repetida no INSERT.
  const seen = new Set<string>();
  let searchAfter: string | null = null;

  // Teto de segurança: 20 páginas × 50 = 1000 itens por campanha. A maior
  // campanha medida tinha 346 convidados, então sobra folga.
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      promotion_type: promotionType,
      status,
      limit: String(PAGE_SIZE),
      app_version: APP_VERSION,
    });
    if (searchAfter) params.set("search_after", searchAfter);

    const result = await mlGet(
      `/seller-promotions/promotions/${promotionId}/items?${params.toString()}`,
      token,
    );
    if (!result.ok) {
      return { items, error: `${result.message} (HTTP ${result.status})` };
    }

    const body = result.json as {
      results?: unknown[];
      paging?: { searchAfter?: string; search_after?: string };
    } | null;

    if (!Array.isArray(body?.results)) {
      return { items, error: "Resposta inválida ao listar itens da campanha." };
    }
    const results = body.results;
    let added = 0;
    for (const entry of results) {
      const node = entry as RawDates & {
        id?: unknown;
        status?: unknown;
        price?: unknown;
        original_price?: unknown;
        offer_id?: unknown;
        meli_percentage?: unknown;
        seller_percentage?: unknown;
      };

      const itemId = toText(node.id);
      if (!itemId || seen.has(itemId)) continue;
      seen.add(itemId);
      added++;

      items.push({
        promotionUid: uid,
        promotionId,
        promotionType,
        mlUserId,
        itemId,
        status: toText(node.status),
        price: toNum(node.price),
        originalPrice: toNum(node.original_price),
        meliPct: toNum(node.meli_percentage),
        sellerPct: toNum(node.seller_percentage),
        // O nome do campo muda conforme o tipo: DEAL/LIGHTNING usam
        // finish_date, SMART/SELLER_CAMPAIGN usam end_date.
        startAt: parseDate(node.start_date),
        finishAt: parseDate(node.finish_date ?? node.end_date),
        offerId: toText(node.offer_id),
      });
    }

    const cursor = body?.paging?.searchAfter ?? body?.paging?.search_after ?? null;
    if (!cursor || results.length === 0) return { items, error: null };
    if (added === 0 || cursor === searchAfter) {
      return { items, error: "A paginação da campanha deixou de avançar." };
    }
    searchAfter = cursor;
  }

  return { items, error: "A campanha atingiu o limite de páginas da sincronização." };
}

export type MlItemInfo = {
  itemId: string;
  title: string | null;
  thumbnail: string | null;
  permalink: string | null;
  /** Preço de tabela do anúncio. NÃO é o preço da promoção (§5). */
  tablePrice: number | null;
};

/**
 * Título, foto, link e preço de tabela dos anúncios.
 *
 * Multiget em lotes de 20. O preço que sai daqui é o de TABELA — a promoção não
 * aparece em `/items`. Ele é guardado só para a coluna "vs tabela"; o desconto
 * do painel é sempre calculado entre `price` e `original_price` da campanha.
 */
export async function fetchItemsInfo(
  mlUserId: bigint,
  itemIds: string[],
  token: string,
): Promise<Map<string, MlItemInfo>> {
  const info = new Map<string, MlItemInfo>();
  const unique = Array.from(new Set(itemIds.filter(Boolean)));
  if (unique.length === 0) return info;

  const attributes = "id,title,price,base_price,thumbnail,secure_thumbnail,permalink,status";

  for (let i = 0; i < unique.length; i += 20) {
    const batch = unique.slice(i, i + 20);
    const result = await mlGet(
      `/items?ids=${batch.join(",")}&attributes=${encodeURIComponent(attributes)}`,
      token,
    );
    if (!result.ok || !Array.isArray(result.json)) continue;

    for (const entry of result.json as Array<{ code?: number; body?: Record<string, unknown> }>) {
      const body = entry.body;
      if (entry.code !== 200 || !body) continue;

      const itemId = toText(body.id);
      if (!itemId) continue;

      // `secure_thumbnail` nem sempre volta no multiget; `thumbnail` vem em
      // http:// e o navegador bloqueia imagem http em página https.
      const thumb = toText(body.secure_thumbnail) ?? toText(body.thumbnail);
      info.set(itemId, {
        itemId,
        title: toText(body.title),
        thumbnail: thumb ? thumb.replace(/^http:\/\//, "https://") : null,
        permalink: toText(body.permalink),
        tablePrice: toNum(body.price) ?? toNum(body.base_price),
      });
    }
  }

  return info;
}



// ---------------------------------------------------------------------------
// Promoções por anúncio — onde vive o DESCONTO INDIVIDUAL
// ---------------------------------------------------------------------------

export type MlItemPromotion = {
  itemId: string;
  type: string;
  status: string | null;
  /** Só existe em campanha; desconto individual não tem id. */
  promotionId: string | null;
  price: number | null;
  originalPrice: number | null;
  startAt: Date | null;
  finishAt: Date | null;
};

/**
 * Teto de segurança contra laço infinito — NÃO é limite de cobertura.
 *
 * O valor é alto de propósito: 20.000 anúncios por conta. O que manda é a
 * paginação acabar; este número só existe para o `for` não rodar para sempre se
 * a API passar a devolver página cheia eternamente. Antes havia um teto de 1.200
 * e ele cortava conta grande: a NAIROBI tem 346 ativos, mas a varredura de
 * conferência parava em 200 e escondia desconto.
 */
const SCAN_GUARD_PAGES = 400;
const ITEM_SCAN_PAGE = 100;
const ITEM_SCAN_CONCURRENCY = 12;

/**
 * IDs dos anúncios ativos da conta.
 *
 * É a lista de candidatos para a varredura por item — o único jeito de achar
 * `PRICE_DISCOUNT`, que não aparece na listagem de campanhas.
 */
export async function listActiveItemIds(
  mlUserId: bigint,
  token: string,
): Promise<{ ids: string[]; complete: boolean }> {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < SCAN_GUARD_PAGES; page++) {
    const offset = page * ITEM_SCAN_PAGE;
    const result = await mlGet(
      `/users/${mlUserId.toString()}/items/search?limit=${ITEM_SCAN_PAGE}&offset=${offset}&status=active`,
      token,
    );
    if (!result.ok) return { ids, complete: false };

    const batch = (result.json as { results?: unknown[] } | null)?.results;
    if (!Array.isArray(batch)) return { ids, complete: false };
    if (batch.length === 0) return { ids, complete: true };

    let added = 0;
    for (const raw of batch) {
      const id = toText(raw);
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
        added++;
      }
    }
    // Página sem nada novo = a API parou de avançar o offset.
    if (added === 0) return { ids, complete: false };
    if (batch.length < ITEM_SCAN_PAGE) return { ids, complete: true };
  }

  return { ids, complete: false };
}

/**
 * Todas as promoções de cada anúncio.
 *
 * `GET /seller-promotions/items/{id}` devolve um array que mistura campanha e
 * desconto individual. Uma chamada por anúncio — não existe versão em lote, e
 * o multiget de `/items` não revela o desconto (devolve o preço de tabela).
 */
export async function fetchItemPromotions(
  itemIds: string[],
  token: string,
): Promise<{ found: MlItemPromotion[]; failures: number }> {
  const found: MlItemPromotion[] = [];
  let failures = 0;
  const queue = [...itemIds];

  const workers = Array.from(
    { length: Math.min(ITEM_SCAN_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const itemId = queue.shift();
        if (!itemId) return;

        const result = await mlGet(
          `/seller-promotions/items/${itemId}?app_version=${APP_VERSION}`,
          token,
        );
        if (!result.ok || !Array.isArray(result.json)) {
          failures++;
          continue;
        }

        for (const entry of result.json as Array<RawDates & {
          id?: unknown;
          type?: unknown;
          status?: unknown;
          price?: unknown;
          original_price?: unknown;
        }>) {
          const type = toText(entry.type);
          if (!type) continue;
          found.push({
            itemId,
            type,
            status: toText(entry.status),
            promotionId: toText(entry.id),
            price: toNum(entry.price),
            originalPrice: toNum(entry.original_price),
            // Aqui as datas podem vir sem fuso (PRICE_DISCOUNT), então é o
            // parser de data local, não o de data UTC.
            startAt: parseLocalDate(entry.start_date),
            finishAt: parseLocalDate(entry.finish_date ?? entry.end_date),
          });
        }
      }
    },
  );

  await Promise.all(workers);
  return { found, failures };
}
