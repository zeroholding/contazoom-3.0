/**
 * Ranking multicanal de anúncios/produtos vendidos.
 *
 * Cada canal é agregado isoladamente e só é executado quando foi pedido. Depois,
 * as linhas são combinadas em memória para que hierarquia, relevância, ordenação,
 * paginação e KPIs tenham exatamente o mesmo significado em ML, Shopee, TikTok
 * Shop e na visão Todos.
 *
 * Shopee e TikTok persistem o pedido inteiro. Seus itens são expandidos do JSON e
 * o valor total/margem do pedido é rateado por preço unitário × quantidade quando
 * todos os itens têm preço válido; caso contrário, o pedido inteiro usa unidades.
 * A precisão numeric do banco preserva a soma, arredondada apenas no resumo.
 */

import prisma from "@/lib/prisma";
import { ITEM_ID_AUSENTE, ITEM_ID_SQL } from "@/lib/anuncios-backfill";
import { buscarAnuncioInfo, type AnuncioInfo } from "@/lib/meli-anuncio-info";
import { SHOPEE_PAGO, TIKTOK_PAGO } from "@/lib/vendasStatus";

function listaSqlEstatica(valores: readonly string[]): string {
  return valores.map((valor) => `'${valor.replaceAll("'", "''")}'`).join(", ");
}

const SHOPEE_PAGO_SQL = listaSqlEstatica(SHOPEE_PAGO);
const TIKTOK_PAGO_SQL = listaSqlEstatica(TIKTOK_PAGO);

export type CanalAnuncio = "ML" | "SP" | "TT";
export type CanalFiltroAnuncio = "todos" | CanalAnuncio;

export type OrdemAnuncio =
  | "faturamento_desc"
  | "unidades_desc"
  | "dias_desc"
  | "dias_asc"
  | "ultima_venda_asc";

export type ModoAnuncio = "mais_vendidos" | "mortos";

export type FiltrosAnuncios = {
  modo: ModoAnuncio;
  canal?: CanalFiltroAnuncio;
  /** Canal ao qual accountId pertence quando a conta foi namespaced. */
  accountCanal?: CanalAnuncio;
  /** ID interno da conta, válido para o canal selecionado. */
  accountId?: string;
  /** Alias legado usado por chamadas ML antigas e por AnunciosMortos. */
  meliAccountId: string;
  /** Janela do histórico, em dias. 0 = desde sempre. */
  janelaDias: number;
  diasSemVenda: number;
  minUnidades: number;
  minFaturamento: number;
  relevancia: "ou" | "e";
  busca: string;
  hierarquia1: string;
  hierarquia2: string;
  /** Capacidades atuais exclusivas do Mercado Livre. */
  status: string;
  estoque: string;
  ordem: OrdemAnuncio;
  pagina: number;
  porPagina: number;
};

export type LinhaAnuncio = {
  canal: CanalAnuncio;
  accountId: string;
  /** Compatibilidade: preenchido somente nas linhas Mercado Livre. */
  meliAccountId: string;
  /** ID externo do anúncio/produto no canal. */
  itemId: string;
  titulo: string;
  conta: string;
  skus: string[];
  hierarquia1: string[];
  hierarquia2: string[];
  pedidos: number;
  unidades: number;
  faturamento: number;
  ticketMedio: number;
  margem: number | null;
  primeiraVenda: string;
  ultimaVenda: string;
  diasSemVenda: number;
  horasSemVenda: number;
  status: string | null;
  subStatus: string[];
  preco: number | null;
  estoque: number | null;
  totalVendido: number | null;
  logisticType: string | null;
  health: number | null;
  thumbnailUrl: string | null;
  permalink: string | null;
};

export type ResumoAnuncios = {
  anuncios: number;
  unidades: number;
  faturamento: number;
  mediaHoras: number;
  semEstoque: number;
  pausadosSemEstoque: number;
  estoqueIndisponivel: number;
  escopoEstoque: "total" | "pagina";
  estoqueConsultados: number;
  porCanal: Record<CanalAnuncio, number>;
};

export type ResultadoAnuncios = {
  linhas: LinhaAnuncio[];
  resumo: ResumoAnuncios;
  total: number;
  pagina: number;
  totalPaginas: number;
  backfillPendente: number;
  truncado: boolean;
};

// O teto é aplicado no SQL somente depois da relevância e na ordem solicitada,
// garantindo que o corte retenha os primeiros resultados elegíveis de cada canal.
// Filtros dependentes de enriquecimento pós-SQL omitem o teto para não enviesar o conjunto.
const TETO_ANUNCIOS_POR_CANAL = 10_000;
const LIMITE_CONSULTA_POR_CANAL = TETO_ANUNCIOS_POR_CANAL + 1;

type LinhaCrua = {
  canal: CanalAnuncio;
  account_id: string;
  item_id: string;
  titulo: string | null;
  conta: string | null;
  skus: string[] | null;
  pedidos: bigint;
  unidades: bigint;
  faturamento: string | number | null;
  margem: string | number | null;
  primeira_venda: Date;
  ultima_venda: Date;
  dias_sem_venda: number;
  horas_sem_venda: bigint;
  thumbnail_url: string | null;
  permalink: string | null;
};

function num(v: string | number | null): number {
  if (v === null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function arred(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function filtrosBase(
  userId: string,
  f: FiltrosAnuncios,
  canalRamo: CanalAnuncio,
  colunaConta: string,
): { params: unknown[]; cond: string[] } {
  const params: unknown[] = [userId];
  const cond = [`v.user_id = $1`];
  if (f.janelaDias > 0) {
    params.push(f.janelaDias);
    cond.push(`v.data_venda >= (NOW() - ($${params.length}::int * INTERVAL '1 day'))`);
  }
  const accountId = f.accountId ?? f.meliAccountId;
  if (accountId && (!f.accountCanal || f.accountCanal === canalRamo)) {
    params.push(accountId);
    cond.push(`${colunaConta} = $${params.length}`);
  }
  return { params, cond };
}

function predicadoRelevanciaSql(f: FiltrosAnuncios, params: unknown[]): string {
  if (f.modo !== "mortos") return "";

  params.push(f.diasSemVenda);
  const condicoes = [`a.dias_sem_venda >= $${params.length}::int`];
  const criteriosPositivos: string[] = [];

  if (f.minUnidades > 0) {
    params.push(f.minUnidades);
    criteriosPositivos.push(`a.unidades >= $${params.length}::numeric`);
  }
  if (f.minFaturamento > 0) {
    params.push(f.minFaturamento);
    criteriosPositivos.push(`a.faturamento >= $${params.length}::numeric`);
  }
  if (criteriosPositivos.length > 0) {
    const operador = f.relevancia === "ou" ? " OR " : " AND ";
    condicoes.push(`(${criteriosPositivos.join(operador)})`);
  }

  return condicoes.join(" AND ");
}

function clausulaRelevanciaSql(f: FiltrosAnuncios, params: unknown[]): string {
  const predicado = predicadoRelevanciaSql(f, params);
  return predicado ? `WHERE ${predicado}` : "";
}

function ordemSql(ordem: OrdemAnuncio): string {
  let principal: string;
  if (ordem === "unidades_desc") principal = "a.unidades DESC";
  else if (ordem === "faturamento_desc") principal = "a.faturamento DESC";
  else if (ordem === "dias_desc") principal = "a.horas_sem_venda DESC";
  else if (ordem === "dias_asc") principal = "a.horas_sem_venda ASC";
  else principal = "a.ultima_venda ASC";
  return `${principal}, a.canal ASC, a.account_id ASC, a.item_id ASC`;
}

function aplicaTetoSql(f: FiltrosAnuncios): boolean {
  return !f.hierarquia1 && !f.hierarquia2 && !f.status && !f.estoque;
}

function limiteSql(f: FiltrosAnuncios): string {
  return aplicaTetoSql(f) ? `LIMIT ${LIMITE_CONSULTA_POR_CANAL}` : "";
}

/** Agregação ML preserva as colunas históricas e o fallback de item_id atual. */
async function agregarMl(userId: string, f: FiltrosAnuncios): Promise<LinhaCrua[]> {
  const { params, cond } = filtrosBase(userId, f, "ML", "v.meli_account_id");
  cond.push(`LOWER(v.status) NOT IN ('cancelled', 'canceled', 'cancelado', 'invalid')`);

  if (f.busca) {
    params.push(`%${f.busca}%`);
    const i = params.length;
    cond.push(`(v.titulo ILIKE $${i} OR v.sku ILIKE $${i} OR (${ITEM_ID_SQL}) ILIKE $${i})`);
  }

  params.push(ITEM_ID_AUSENTE);
  const iAusente = params.length;
  const clausulaRelevancia = clausulaRelevanciaSql(f, params);

  const sql = `
    WITH agregado AS (
      SELECT
        'ML'::text AS canal,
        v.meli_account_id AS account_id,
        ${ITEM_ID_SQL} AS item_id,
        (array_agg(v.titulo ORDER BY v.data_venda DESC)
          FILTER (WHERE v.titulo IS NOT NULL AND v.titulo <> ''))[1] AS titulo,
        MAX(v.conta) AS conta,
        COALESCE(array_agg(DISTINCT v.sku)
          FILTER (WHERE v.sku IS NOT NULL AND v.sku <> ''), ARRAY[]::text[]) AS skus,
        COUNT(DISTINCT v.order_id)::bigint AS pedidos,
        COALESCE(SUM(v.quantidade), 0)::bigint AS unidades,
        COALESCE(SUM(v.valor_total), 0) AS faturamento,
        SUM(v.margem_contribuicao) AS margem,
        MIN(v.data_venda) AS primeira_venda,
        MAX(v.data_venda) AS ultima_venda,
        (CURRENT_DATE - MAX(v.data_venda)::date)::int AS dias_sem_venda,
        FLOOR(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - MAX(v.data_venda))) / 3600))::bigint
          AS horas_sem_venda,
        NULL::text AS thumbnail_url,
        NULL::text AS permalink
      FROM meli_venda v
      WHERE ${cond.join(" AND ")}
      GROUP BY v.meli_account_id, ${ITEM_ID_SQL}
      HAVING ${ITEM_ID_SQL} IS NOT NULL
        AND ${ITEM_ID_SQL} <> ''
        AND ${ITEM_ID_SQL} <> $${iAusente}
    )
    SELECT *
    FROM agregado a
    ${clausulaRelevancia}
    ORDER BY ${ordemSql(f.ordem)}
    ${limiteSql(f)}
  `;

  return prisma.$queryRawUnsafe<LinhaCrua[]>(sql, ...params);
}

/**
 * Expande `raw_data.item_list` da Shopee. Quantidade e preços unitários usam
 * regex/CASE antes do cast. Se todos os itens têm preço positivo, o peso é preço
 * × quantidade; se algum não tem, o pedido inteiro cai para peso por unidades.
 * O LEFT JOIN mantém pedidos antigos sem item_list visíveis.
 */
async function agregarShopee(userId: string, f: FiltrosAnuncios): Promise<LinhaCrua[]> {
  const { params, cond } = filtrosBase(userId, f, "SP", "v.shopee_account_id");
  cond.push(`LOWER(v.status) IN (${SHOPEE_PAGO_SQL})`);

  let filtroBusca = "";
  if (f.busca) {
    params.push(`%${f.busca}%`);
    const i = params.length;
    filtroBusca = `WHERE (n.titulo ILIKE $${i} OR n.sku ILIKE $${i} OR n.item_id ILIKE $${i})`;
  }

  const sql = `
    WITH normalizado AS (
      SELECT
        'SP'::text AS canal,
        v.shopee_account_id AS account_id,
        COALESCE(it.item_id, it.model_id, it.sku, NULLIF(v.sku, ''), 'pedido:' || v.order_id) AS item_id,
        COALESCE(it.titulo, NULLIF(v.titulo, ''), 'Produto sem título') AS titulo,
        COALESCE(a.shop_name, NULLIF(v.conta, ''), a.shop_id, '—') AS conta,
        COALESCE(it.sku, NULLIF(v.sku, '')) AS sku,
        v.order_id,
        COALESCE(it.quantidade, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END)::bigint AS quantidade,
        v.valor_total *
          COALESCE(it.peso, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END)::numeric /
          NULLIF(COALESCE(it.total_peso, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END), 0)::numeric
          AS valor_rateado,
        CASE WHEN v.margem_contribuicao IS NULL THEN NULL ELSE
          v.margem_contribuicao *
          COALESCE(it.peso, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END)::numeric /
          NULLIF(COALESCE(it.total_peso, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END), 0)::numeric
        END AS margem_rateada,
        v.data_venda,
        it.thumbnail_url,
        CASE
          WHEN it.item_id ~ '^[0-9]+$' AND a.shop_id ~ '^[0-9]+$'
          THEN 'https://shopee.com.br/product/' || a.shop_id || '/' || it.item_id
          ELSE NULL
        END AS permalink
      FROM shopee_venda v
      JOIN shopee_account a
        ON a.id = v.shopee_account_id AND a.user_id = v.user_id
      LEFT JOIN LATERAL (
        SELECT
          NULLIF(TRIM(y.oi->>'item_id'), '') AS item_id,
          NULLIF(TRIM(y.oi->>'model_id'), '') AS model_id,
          NULLIF(TRIM(y.oi->>'item_name'), '') AS titulo,
          COALESCE(
            NULLIF(TRIM(y.oi->>'item_sku'), ''),
            NULLIF(TRIM(y.oi->>'model_sku'), ''),
            NULLIF(TRIM(y.oi->>'variation_sku'), '')
          ) AS sku,
          y.quantidade,
          y.peso,
          SUM(y.peso) OVER () AS total_peso,
          NULLIF(TRIM(y.oi->'image_info'->>'image_url'), '') AS thumbnail_url
        FROM (
          SELECT
            x.oi,
            x.quantidade,
            CASE
              WHEN BOOL_AND(x.preco IS NOT NULL) OVER ()
              THEN x.preco * x.quantidade
              ELSE x.quantidade
            END AS peso
          FROM (
            SELECT
              oi,
              COALESCE(
                NULLIF(
                  CASE WHEN TRIM(oi->>'model_quantity_purchased') ~ '^[0-9]+$'
                       THEN TRIM(oi->>'model_quantity_purchased')::numeric END,
                  0
                ),
                NULLIF(
                  CASE WHEN TRIM(oi->>'quantity_purchased') ~ '^[0-9]+$'
                       THEN TRIM(oi->>'quantity_purchased')::numeric END,
                  0
                ),
                NULLIF(
                  CASE WHEN TRIM(oi->>'quantity') ~ '^[0-9]+$'
                       THEN TRIM(oi->>'quantity')::numeric END,
                  0
                ),
                1::numeric
              ) AS quantidade,
              COALESCE(
                NULLIF(
                  CASE WHEN TRIM(oi->>'model_discounted_price') ~ '^[0-9]+([.][0-9]+)?$'
                       THEN TRIM(oi->>'model_discounted_price')::numeric END,
                  0
                ),
                NULLIF(
                  CASE WHEN TRIM(oi->>'discounted_price') ~ '^[0-9]+([.][0-9]+)?$'
                       THEN TRIM(oi->>'discounted_price')::numeric END,
                  0
                ),
                NULLIF(
                  CASE WHEN TRIM(oi->>'model_original_price') ~ '^[0-9]+([.][0-9]+)?$'
                       THEN TRIM(oi->>'model_original_price')::numeric END,
                  0
                ),
                NULLIF(
                  CASE WHEN TRIM(oi->>'original_price') ~ '^[0-9]+([.][0-9]+)?$'
                       THEN TRIM(oi->>'original_price')::numeric END,
                  0
                ),
                NULLIF(
                  CASE WHEN TRIM(oi->>'price') ~ '^[0-9]+([.][0-9]+)?$'
                       THEN TRIM(oi->>'price')::numeric END,
                  0
                )
              ) AS preco
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(v.raw_data->'item_list') = 'array'
                   THEN v.raw_data->'item_list' ELSE '[]'::jsonb END
            ) AS j(oi)
          ) x
        ) y
      ) it ON TRUE
      WHERE ${cond.join(" AND ")}
    ), agregado AS (
      SELECT
        n.canal,
      n.account_id,
      n.item_id,
      (array_agg(n.titulo ORDER BY n.data_venda DESC)
        FILTER (WHERE n.titulo IS NOT NULL AND n.titulo <> ''))[1] AS titulo,
      MAX(n.conta) AS conta,
      COALESCE(array_agg(DISTINCT n.sku)
        FILTER (WHERE n.sku IS NOT NULL AND n.sku <> ''), ARRAY[]::text[]) AS skus,
      COUNT(DISTINCT n.order_id)::bigint AS pedidos,
      COALESCE(SUM(n.quantidade), 0)::bigint AS unidades,
      COALESCE(SUM(n.valor_rateado), 0) AS faturamento,
      SUM(n.margem_rateada) AS margem,
      MIN(n.data_venda) AS primeira_venda,
      MAX(n.data_venda) AS ultima_venda,
      (CURRENT_DATE - MAX(n.data_venda)::date)::int AS dias_sem_venda,
      FLOOR(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - MAX(n.data_venda))) / 3600))::bigint
        AS horas_sem_venda,
      (array_agg(n.thumbnail_url ORDER BY n.data_venda DESC)
        FILTER (WHERE n.thumbnail_url IS NOT NULL))[1] AS thumbnail_url,
      MAX(n.permalink) AS permalink
    FROM normalizado n
    ${filtroBusca}
      GROUP BY n.canal, n.account_id, n.item_id
    )
    SELECT *
    FROM agregado a
    ${clausulaRelevanciaSql(f, params)}
    ORDER BY ${ordemSql(f.ordem)}
    ${limiteSql(f)}
  `;

  return prisma.$queryRawUnsafe<LinhaCrua[]>(sql, ...params);
}

/** TikTok aplica o mesmo rateio: preço × quantidade ou fallback do pedido por unidades. */
async function agregarTiktok(userId: string, f: FiltrosAnuncios): Promise<LinhaCrua[]> {
  const { params, cond } = filtrosBase(userId, f, "TT", "v.tiktok_account_id");
  cond.push(`LOWER(v.status) IN (${TIKTOK_PAGO_SQL})`);

  let filtroBusca = "";
  if (f.busca) {
    params.push(`%${f.busca}%`);
    const i = params.length;
    filtroBusca = `WHERE (n.titulo ILIKE $${i} OR n.sku ILIKE $${i} OR n.item_id ILIKE $${i})`;
  }

  const sql = `
    WITH normalizado AS (
      SELECT
        'TT'::text AS canal,
        v.tiktok_account_id AS account_id,
        COALESCE(it.item_id, NULLIF(v.item_id, ''), 'pedido:' || v.order_id) AS item_id,
        COALESCE(it.titulo, NULLIF(v.titulo, ''), 'Produto sem título') AS titulo,
        COALESCE(a.shop_name, NULLIF(v.conta, ''), a.shop_id, '—') AS conta,
        COALESCE(it.sku, NULLIF(v.sku, '')) AS sku,
        v.order_id,
        COALESCE(it.quantidade, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END)::bigint AS quantidade,
        v.valor_total *
          COALESCE(it.peso, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END)::numeric /
          NULLIF(COALESCE(it.total_peso, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END), 0)::numeric
          AS valor_rateado,
        CASE WHEN v.margem_contribuicao IS NULL THEN NULL ELSE
          v.margem_contribuicao *
          COALESCE(it.peso, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END)::numeric /
          NULLIF(COALESCE(it.total_peso, CASE WHEN v.quantidade > 0 THEN v.quantidade ELSE 1 END), 0)::numeric
        END AS margem_rateada,
        v.data_venda,
        it.thumbnail_url,
        NULL::text AS permalink
      FROM tiktok_venda v
      JOIN tiktok_account a
        ON a.id = v.tiktok_account_id AND a.user_id = v.user_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(NULLIF(TRIM(y.oi->>'product_id'), ''), NULLIF(TRIM(y.oi->>'item_id'), '')) AS item_id,
          NULLIF(TRIM(y.oi->>'product_name'), '') AS titulo,
          COALESCE(NULLIF(TRIM(y.oi->>'seller_sku'), ''), NULLIF(TRIM(y.oi->>'sku_id'), '')) AS sku,
          y.quantidade,
          y.peso,
          SUM(y.peso) OVER () AS total_peso,
          CASE
            WHEN jsonb_typeof(y.oi->'sku_image') = 'string' THEN NULLIF(TRIM(y.oi->>'sku_image'), '')
            WHEN jsonb_typeof(y.oi->'sku_image') = 'object' THEN
              COALESCE(NULLIF(TRIM(y.oi->'sku_image'->>'url'), ''), NULLIF(TRIM(y.oi->'sku_image'->>'image_url'), ''))
            ELSE NULL
          END AS thumbnail_url
        FROM (
          SELECT
            x.oi,
            x.quantidade,
            CASE
              WHEN BOOL_AND(x.preco IS NOT NULL) OVER ()
              THEN x.preco * x.quantidade
              ELSE x.quantidade
            END AS peso
          FROM (
            SELECT
              oi,
              COALESCE(
                NULLIF(
                  CASE WHEN (oi->>'quantity') ~ '^[0-9]+$'
                       THEN (oi->>'quantity')::numeric END,
                  0
                ),
                NULLIF(
                  CASE WHEN (oi->>'sku_quantity') ~ '^[0-9]+$'
                       THEN (oi->>'sku_quantity')::numeric END,
                  0
                ),
                1::numeric
              ) AS quantidade,
              COALESCE(
                NULLIF(
                  CASE WHEN TRIM(oi->>'sale_price') ~ '^[0-9]+([.][0-9]+)?$'
                       THEN TRIM(oi->>'sale_price')::numeric END,
                  0
                ),
                NULLIF(
                  CASE WHEN TRIM(oi->>'original_price') ~ '^[0-9]+([.][0-9]+)?$'
                       THEN TRIM(oi->>'original_price')::numeric END,
                  0
                )
              ) AS preco
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(v.raw_data->'line_items') = 'array'
                   THEN v.raw_data->'line_items' ELSE '[]'::jsonb END
            ) AS j(oi)
          ) x
        ) y
      ) it ON TRUE
      WHERE ${cond.join(" AND ")}
    ), agregado AS (
      SELECT
        n.canal,
      n.account_id,
      n.item_id,
      (array_agg(n.titulo ORDER BY n.data_venda DESC)
        FILTER (WHERE n.titulo IS NOT NULL AND n.titulo <> ''))[1] AS titulo,
      MAX(n.conta) AS conta,
      COALESCE(array_agg(DISTINCT n.sku)
        FILTER (WHERE n.sku IS NOT NULL AND n.sku <> ''), ARRAY[]::text[]) AS skus,
      COUNT(DISTINCT n.order_id)::bigint AS pedidos,
      COALESCE(SUM(n.quantidade), 0)::bigint AS unidades,
      COALESCE(SUM(n.valor_rateado), 0) AS faturamento,
      SUM(n.margem_rateada) AS margem,
      MIN(n.data_venda) AS primeira_venda,
      MAX(n.data_venda) AS ultima_venda,
      (CURRENT_DATE - MAX(n.data_venda)::date)::int AS dias_sem_venda,
      FLOOR(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - MAX(n.data_venda))) / 3600))::bigint
        AS horas_sem_venda,
      (array_agg(n.thumbnail_url ORDER BY n.data_venda DESC)
        FILTER (WHERE n.thumbnail_url IS NOT NULL))[1] AS thumbnail_url,
      NULL::text AS permalink
    FROM normalizado n
    ${filtroBusca}
      GROUP BY n.canal, n.account_id, n.item_id
    )
    SELECT *
    FROM agregado a
    ${clausulaRelevanciaSql(f, params)}
    ORDER BY ${ordemSql(f.ordem)}
    ${limiteSql(f)}
  `;

  return prisma.$queryRawUnsafe<LinhaCrua[]>(sql, ...params);
}

function montar(c: LinhaCrua): LinhaAnuncio {
  const pedidos = Number(c.pedidos);
  const faturamento = num(c.faturamento);
  return {
    canal: c.canal,
    accountId: c.account_id,
    meliAccountId: c.canal === "ML" ? c.account_id : "",
    itemId: c.item_id,
    titulo: c.titulo ?? "Produto sem título",
    conta: c.conta ?? "—",
    skus: c.skus ?? [],
    hierarquia1: [],
    hierarquia2: [],
    pedidos,
    unidades: Number(c.unidades),
    faturamento,
    ticketMedio: pedidos > 0 ? arred(faturamento / pedidos) : 0,
    margem: c.margem === null ? null : num(c.margem),
    primeiraVenda: c.primeira_venda.toISOString(),
    ultimaVenda: c.ultima_venda.toISOString(),
    diasSemVenda: Number(c.dias_sem_venda),
    horasSemVenda: Number(c.horas_sem_venda),
    status: null,
    subStatus: [],
    preco: null,
    estoque: null,
    totalVendido: null,
    logisticType: null,
    health: null,
    thumbnailUrl: c.thumbnail_url,
    permalink: c.permalink,
  };
}

async function comHierarquia(userId: string, linhas: LinhaAnuncio[]): Promise<void> {
  const codigos = [...new Set(linhas.flatMap((l) => l.skus))];
  if (codigos.length === 0) return;
  const skus = await prisma.sKU.findMany({
    where: { userId, sku: { in: codigos } },
    select: { sku: true, hierarquia1: true, hierarquia2: true },
  });
  const porSku = new Map(skus.map((s) => [s.sku, s]));
  for (const l of linhas) {
    const h1 = new Set<string>();
    const h2 = new Set<string>();
    for (const codigo of l.skus) {
      const s = porSku.get(codigo);
      if (s?.hierarquia1) h1.add(s.hierarquia1);
      if (s?.hierarquia2) h2.add(s.hierarquia2);
    }
    l.hierarquia1 = [...h1];
    l.hierarquia2 = [...h2];
  }
}

function aplicarInfo(linha: LinhaAnuncio, info: AnuncioInfo | undefined): LinhaAnuncio {
  if (!info) return linha;
  return {
    ...linha,
    titulo: info.titulo ?? linha.titulo,
    status: info.status ?? null,
    subStatus: info.subStatus ?? [],
    preco: info.preco ?? null,
    estoque: info.estoqueDisponivel ?? null,
    totalVendido: info.totalVendido ?? null,
    logisticType: info.logisticType ?? null,
    health: info.health ?? null,
    thumbnailUrl: info.thumbnailUrl ?? linha.thumbnailUrl,
    permalink: info.permalink ?? linha.permalink,
  };
}

async function enriquecerMl(userId: string, linhas: LinhaAnuncio[]): Promise<LinhaAnuncio[]> {
  const porConta = new Map<string, LinhaAnuncio[]>();
  for (const linha of linhas) {
    if (linha.canal !== "ML") continue;
    const grupo = porConta.get(linha.accountId) ?? [];
    grupo.push(linha);
    porConta.set(linha.accountId, grupo);
  }
  if (porConta.size === 0) return linhas;

  const infoComposta = new Map<string, AnuncioInfo>();
  await Promise.all(
    [...porConta.entries()].map(async ([accountId, grupo]) => {
      const infos = await buscarAnuncioInfo(
        userId,
        grupo.map((l) => ({ itemId: l.itemId, meliAccountId: accountId })),
      );
      for (const l of grupo) {
        const info = infos.get(l.itemId);
        if (info) infoComposta.set(`${accountId}:${l.itemId}`, info);
      }
    }),
  );

  return linhas.map((l) =>
    l.canal === "ML" ? aplicarInfo(l, infoComposta.get(`${l.accountId}:${l.itemId}`)) : l,
  );
}

function passouRelevancia(l: LinhaAnuncio, f: FiltrosAnuncios): boolean {
  if (f.modo !== "mortos") return true;
  if (l.diasSemVenda < f.diasSemVenda) return false;
  const testes: boolean[] = [];
  if (f.minUnidades > 0) testes.push(l.unidades >= f.minUnidades);
  if (f.minFaturamento > 0) testes.push(l.faturamento >= f.minFaturamento);
  if (testes.length === 0) return true;
  return f.relevancia === "ou" ? testes.some(Boolean) : testes.every(Boolean);
}

function ordenar(linhas: LinhaAnuncio[], ordem: OrdemAnuncio): void {
  linhas.sort((a, b) => {
    let diferenca = 0;
    if (ordem === "unidades_desc") diferenca = b.unidades - a.unidades;
    else if (ordem === "faturamento_desc") diferenca = b.faturamento - a.faturamento;
    else if (ordem === "dias_desc") diferenca = b.horasSemVenda - a.horasSemVenda;
    else if (ordem === "dias_asc") diferenca = a.horasSemVenda - b.horasSemVenda;
    else diferenca = a.ultimaVenda.localeCompare(b.ultimaVenda);
    if (diferenca !== 0) return diferenca;
    return `${a.canal}:${a.accountId}:${a.itemId}`.localeCompare(
      `${b.canal}:${b.accountId}:${b.itemId}`,
    );
  });
}

function resumir(
  todas: LinhaAnuncio[],
  comEstoque: LinhaAnuncio[],
  modo: ModoAnuncio,
  escopoEstoque: "total" | "pagina",
): ResumoAnuncios {
  let unidades = 0;
  let faturamento = 0;
  let horas = 0;
  const porCanal: Record<CanalAnuncio, number> = { ML: 0, SP: 0, TT: 0 };
  for (const l of todas) {
    unidades += l.unidades;
    faturamento += l.faturamento;
    horas += l.horasSemVenda;
    porCanal[l.canal] += 1;
  }

  // Estoque/status/preço têm cobertura apenas no ML. SP/TT não entram nem como
  // indisponíveis, pois não houve uma consulta que pudesse falhar.
  const linhasMl = comEstoque.filter((l) => l.canal === "ML");
  let semEstoque = 0;
  let pausadosSemEstoque = 0;
  let indisponivel = 0;
  for (const l of linhasMl) {
    if (l.estoque === null) indisponivel += 1;
    else if (l.estoque === 0) semEstoque += 1;
    if (l.subStatus.includes("out_of_stock")) pausadosSemEstoque += 1;
  }

  return {
    anuncios: todas.length,
    unidades,
    faturamento: arred(faturamento),
    mediaHoras: modo === "mortos" && todas.length > 0 ? Math.round(horas / todas.length) : 0,
    semEstoque,
    pausadosSemEstoque,
    estoqueIndisponivel: indisponivel,
    escopoEstoque,
    estoqueConsultados: linhasMl.length,
    porCanal,
  };
}

async function executarAgregacoes(
  userId: string,
  f: FiltrosAnuncios,
): Promise<{ linhasCruas: LinhaCrua[]; truncado: boolean }> {
  const canal = f.canal ?? "ML";
  const inclui = (ramo: CanalAnuncio) =>
    (canal === "todos" || canal === ramo) && (!f.accountCanal || f.accountCanal === ramo);
  const tarefas: Array<Promise<LinhaCrua[]>> = [];
  if (inclui("ML")) tarefas.push(agregarMl(userId, f));
  if (inclui("SP")) tarefas.push(agregarShopee(userId, f));
  if (inclui("TT")) tarefas.push(agregarTiktok(userId, f));

  const resultados = await Promise.all(tarefas);
  const tetoAplicado = aplicaTetoSql(f);
  return {
    linhasCruas: resultados.flatMap((linhas) =>
      tetoAplicado ? linhas.slice(0, TETO_ANUNCIOS_POR_CANAL) : linhas,
    ),
    truncado:
      tetoAplicado && resultados.some((linhas) => linhas.length > TETO_ANUNCIOS_POR_CANAL),
  };
}

export async function buscarAnuncios(
  userId: string,
  f: FiltrosAnuncios,
): Promise<ResultadoAnuncios> {
  const canal = f.canal ?? "ML";
  const accountId = f.accountId ?? f.meliAccountId;
  const incluiMl =
    (canal === "ML" || canal === "todos") &&
    (!f.accountCanal || f.accountCanal === "ML");

  const [{ linhasCruas, truncado }, backfillPendente] = await Promise.all([
    executarAgregacoes(userId, f),
    incluiMl
      ? prisma.meliVenda.count({
          where: {
            userId,
            itemId: null,
            ...(accountId ? { meliAccountId: accountId } : {}),
          },
        })
      : Promise.resolve(0),
  ]);

  let linhas = linhasCruas.map(montar);
  const precisaHierarquia = Boolean(f.hierarquia1) || Boolean(f.hierarquia2);
  if (precisaHierarquia) {
    await comHierarquia(userId, linhas);
    if (f.hierarquia1) linhas = linhas.filter((l) => l.hierarquia1.includes(f.hierarquia1));
    if (f.hierarquia2) linhas = linhas.filter((l) => l.hierarquia2.includes(f.hierarquia2));
  }
  linhas = linhas.filter((l) => passouRelevancia(l, f));

  // Estes filtros chegam preenchidos somente no canal ML; a rota os limpa para
  // Todos/SP/TT. Quando ativos, o dado atual precisa cobrir o conjunto inteiro.
  const precisaTudo = canal === "ML" && (Boolean(f.status) || Boolean(f.estoque));
  if (precisaTudo) {
    linhas = await enriquecerMl(userId, linhas);
    if (f.status) linhas = linhas.filter((l) => l.status === f.status);
    if (f.estoque === "sem") linhas = linhas.filter((l) => l.estoque === 0);
    if (f.estoque === "com") linhas = linhas.filter((l) => (l.estoque ?? 0) > 0);
  }

  ordenar(linhas, f.ordem);
  const total = linhas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / f.porPagina));
  const pagina = Math.min(Math.max(1, f.pagina), totalPaginas);
  const inicio = (pagina - 1) * f.porPagina;
  let daPagina = linhas.slice(inicio, inicio + f.porPagina);

  if (!precisaHierarquia) await comHierarquia(userId, daPagina);
  if (!precisaTudo) daPagina = await enriquecerMl(userId, daPagina);

  return {
    linhas: daPagina,
    resumo: resumir(
      linhas,
      precisaTudo ? linhas : daPagina,
      f.modo,
      precisaTudo ? "total" : "pagina",
    ),
    total,
    pagina,
    totalPaginas,
    backfillPendente,
    truncado,
  };
}
