/**
 * Ranking de anúncios: mais vendidos e mortos.
 *
 * As duas telas são a MESMA consulta com ordenação e corte diferentes, e isso é
 * intencional: "mais vendido" e "morto" são os dois extremos de um único eixo —
 * histórico de venda contra tempo desde a última. Duplicar a agregação faria os
 * dois lados divergirem no dia em que alguém corrigisse só um.
 *
 * A DEFINIÇÃO DE MORTO, e por que é assim:
 *   anúncio que JÁ VENDEU, cuja última venda passou de `diasSemVenda`, e que foi
 *   comercialmente relevante (unidades OU faturamento acima do mínimo).
 *
 * Relevância é OU porque as duas medem coisas diferentes: item barato de giro
 * alto aparece por unidades, item caro de giro baixo aparece por faturamento.
 * Exigir os dois esconderia metade dos casos. Inatividade é E, sempre: sem ela
 * a lista viraria "todos os anúncios".
 *
 * Anúncio que nunca vendeu NÃO aparece — a fonte é a tabela de vendas, não o
 * catálogo. Isso é limite conhecido, não descuido: listar o catálogo inteiro
 * exigiria persistir os anúncios, e "nunca vendeu" é uma pergunta diferente de
 * "parou de vender".
 */

import prisma from "@/lib/prisma";
import { ITEM_ID_AUSENTE, ITEM_ID_SQL } from "@/lib/anuncios-backfill";
import { buscarAnuncioInfo, type AnuncioInfo } from "@/lib/meli-anuncio-info";

export type OrdemAnuncio =
  | "faturamento_desc"
  | "unidades_desc"
  | "dias_desc"
  | "dias_asc"
  | "ultima_venda_asc";

export type ModoAnuncio = "mais_vendidos" | "mortos";

export type FiltrosAnuncios = {
  modo: ModoAnuncio;
  /** Janela do histórico, em dias. 0 = desde sempre. */
  janelaDias: number;
  /** Só para o modo "mortos": mínimo de dias sem vender. */
  diasSemVenda: number;
  minUnidades: number;
  minFaturamento: number;
  meliAccountId: string;
  busca: string;
  hierarquia1: string;
  hierarquia2: string;
  /** Filtro pelo status ATUAL no ML. Exige consultar a API. */
  status: string;
  /** `com`, `sem` ou vazio. Também exige a API. */
  estoque: string;
  ordem: OrdemAnuncio;
  pagina: number;
  porPagina: number;
};

export type LinhaAnuncio = {
  itemId: string;
  meliAccountId: string;
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
  /** Vindo do ML. `null` quando a API não respondeu. */
  status: string | null;
  subStatus: string[];
  preco: number | null;
  /** O ESTOQUE REAL. `null` quando a API não respondeu — diferente de 0. */
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
  /** Só no modo "mortos": média de horas sem vender. */
  mediaHoras: number;
  /** Anúncios com estoque zerado entre os que a API respondeu. */
  semEstoque: number;
  /** Anúncios pausados por falta de estoque. Ver observação em meli-anuncio-info. */
  pausadosSemEstoque: number;
  /** Quantos anúncios a API de estoque não respondeu. Honestidade na tela. */
  estoqueIndisponivel: number;
  /**
   * A que conjunto os três contadores acima se referem.
   *
   * `"pagina"` no caminho normal, porque o estoque é consultado só nos anúncios
   * exibidos — consultar os dois mil da lista para mostrar vinte seria cem
   * chamadas de API por carregamento. `"total"` quando a pessoa filtra por
   * status ou estoque, aí a consulta cobre tudo de qualquer forma.
   *
   * O campo existe para a tela poder ESCREVER a diferença. Mostrar "3 sem
   * estoque" quando são 3 de 20 da página, ao lado de um total de 200, é um
   * número que o operador vai ler como sendo do total.
   */
  escopoEstoque: "total" | "pagina";
  /** Quantos anúncios entraram na contagem de estoque. */
  estoqueConsultados: number;
};

export type ResultadoAnuncios = {
  linhas: LinhaAnuncio[];
  resumo: ResumoAnuncios;
  total: number;
  pagina: number;
  totalPaginas: number;
  /** Vendas ainda sem `item_id`. A tela avisa em vez de mostrar número errado. */
  backfillPendente: number;
};

type LinhaCrua = {
  item_id: string;
  meli_account_id: string;
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

/**
 * Agrega `meli_venda` por anúncio.
 *
 * `$queryRawUnsafe` porque `ITEM_ID_SQL` é uma expressão SQL montada no código
 * (constante, sem entrada de usuário) e o Prisma não interpola expressão em
 * template. Todo VALOR continua indo por parâmetro numerado — nada de dado do
 * usuário entra na string.
 */
async function agregar(userId: string, f: FiltrosAnuncios): Promise<LinhaCrua[]> {
  const params: unknown[] = [userId];
  const cond: string[] = [`v.user_id = $1`];

  // Cancelada não é venda. Sem isto um anúncio cheio de cancelamento passaria
  // por campeão de vendas.
  cond.push(`LOWER(v.status) NOT IN ('cancelled', 'invalid')`);

  if (f.janelaDias > 0) {
    params.push(f.janelaDias);
    cond.push(`v.data_venda >= (NOW() - ($${params.length}::int * INTERVAL '1 day'))`);
  }
  if (f.meliAccountId) {
    params.push(f.meliAccountId);
    cond.push(`v.meli_account_id = $${params.length}`);
  }
  if (f.busca) {
    params.push(`%${f.busca}%`);
    const i = params.length;
    cond.push(`(v.titulo ILIKE $${i} OR v.sku ILIKE $${i} OR v.item_id ILIKE $${i})`);
  }

  // O marcador do backfill não é anúncio: é "olhei o JSON e não havia MLB".
  params.push(ITEM_ID_AUSENTE);
  const iAusente = params.length;

  const tendo: string[] = [];
  if (f.modo === "mortos") {
    params.push(f.diasSemVenda);
    tendo.push(`(CURRENT_DATE - MAX(v.data_venda)::date) >= $${params.length}`);

    const relevancia: string[] = [];
    if (f.minUnidades > 0) {
      params.push(f.minUnidades);
      relevancia.push(`COALESCE(SUM(v.quantidade), 0) >= $${params.length}`);
    }
    if (f.minFaturamento > 0) {
      params.push(f.minFaturamento);
      relevancia.push(`COALESCE(SUM(v.valor_total), 0) >= $${params.length}`);
    }
    if (relevancia.length > 0) tendo.push(`(${relevancia.join(" OR ")})`);
  }

  const ordenacao =
    f.modo === "mortos" && (f.ordem === "dias_desc" || f.ordem === "dias_asc")
      ? `MAX(v.data_venda) ${f.ordem === "dias_desc" ? "ASC" : "DESC"}`
      : f.ordem === "unidades_desc"
        ? `SUM(v.quantidade) DESC NULLS LAST`
        : f.ordem === "ultima_venda_asc"
          ? `MAX(v.data_venda) ASC`
          : `SUM(v.valor_total) DESC NULLS LAST`;

  // Teto de sanidade. A ordenação e o corte já acontecem aqui no banco, então a
  // página certa está sempre dentro do teto; ele só existe para uma conta com
  // dezenas de milhares de anúncios não carregar tudo na memória do Node.
  const TETO = 2000;

  const sql = `
    SELECT
      ${ITEM_ID_SQL} AS item_id,
      MIN(v.meli_account_id) AS meli_account_id,
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
        AS horas_sem_venda
    FROM meli_venda v
    WHERE ${cond.join(" AND ")}
    GROUP BY ${ITEM_ID_SQL}
    HAVING ${ITEM_ID_SQL} IS NOT NULL
      AND ${ITEM_ID_SQL} <> ''
      AND ${ITEM_ID_SQL} <> $${iAusente}
      ${tendo.length > 0 ? `AND ${tendo.join(" AND ")}` : ""}
    ORDER BY ${ordenacao}
    LIMIT ${TETO}
  `;

  return prisma.$queryRawUnsafe<LinhaCrua[]>(sql, ...params);
}

function montar(c: LinhaCrua): LinhaAnuncio {
  const pedidos = Number(c.pedidos);
  const faturamento = arred(num(c.faturamento));
  return {
    itemId: c.item_id,
    meliAccountId: c.meli_account_id,
    titulo: c.titulo ?? "Anúncio sem título",
    conta: c.conta ?? "—",
    skus: c.skus ?? [],
    hierarquia1: [],
    hierarquia2: [],
    pedidos,
    unidades: Number(c.unidades),
    faturamento,
    ticketMedio: pedidos > 0 ? arred(faturamento / pedidos) : 0,
    margem: c.margem === null ? null : arred(num(c.margem)),
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
    thumbnailUrl: null,
    permalink: null,
  };
}

/** Junta a hierarquia do cadastro de SKU, numa consulta só. */
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
    thumbnailUrl: info.thumbnailUrl ?? null,
    permalink: info.permalink ?? null,
  };
}

/**
 * Resumo.
 *
 * `todas` dá as contagens do histórico (vêm do banco, então são sempre do
 * conjunto inteiro) e `comEstoque` dá as de estoque — que só valem para as
 * linhas efetivamente consultadas na API. Separar os dois conjuntos aqui é o que
 * evita apresentar um número de página como se fosse do total.
 */
function resumir(
  todas: LinhaAnuncio[],
  comEstoque: LinhaAnuncio[],
  modo: ModoAnuncio,
  escopoEstoque: "total" | "pagina",
): ResumoAnuncios {
  let unidades = 0;
  let faturamento = 0;
  let horas = 0;
  for (const l of todas) {
    unidades += l.unidades;
    faturamento += l.faturamento;
    horas += l.horasSemVenda;
  }

  let semEstoque = 0;
  let pausadosSemEstoque = 0;
  let indisponivel = 0;
  for (const l of comEstoque) {
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
    estoqueConsultados: comEstoque.length,
  };
}

export async function buscarAnuncios(
  userId: string,
  f: FiltrosAnuncios,
): Promise<ResultadoAnuncios> {
  const [cruas, backfillPendente] = await Promise.all([
    agregar(userId, f),
    prisma.meliVenda.count({ where: { userId, itemId: null } }),
  ]);

  let linhas = cruas.map(montar);

  // Filtro por status ou estoque obriga a consultar TODOS antes de cortar: o
  // dado que decide quem entra vem da API, não do banco. É o caminho caro, e a
  // tela só o paga quando a pessoa pede um desses dois filtros.
  const precisaTudo = Boolean(f.status) || Boolean(f.estoque);

  if (precisaTudo) {
    const info = await buscarAnuncioInfo(
      userId,
      linhas.map((l) => ({ itemId: l.itemId, meliAccountId: l.meliAccountId })),
    );
    linhas = linhas.map((l) => aplicarInfo(l, info.get(l.itemId)));

    if (f.status) linhas = linhas.filter((l) => l.status === f.status);
    if (f.estoque === "sem") linhas = linhas.filter((l) => l.estoque === 0);
    if (f.estoque === "com") linhas = linhas.filter((l) => (l.estoque ?? 0) > 0);
  }

  if (f.hierarquia1 || f.hierarquia2) {
    await comHierarquia(userId, linhas);
    if (f.hierarquia1) linhas = linhas.filter((l) => l.hierarquia1.includes(f.hierarquia1));
    if (f.hierarquia2) linhas = linhas.filter((l) => l.hierarquia2.includes(f.hierarquia2));
  }

  const total = linhas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / f.porPagina));
  const pagina = Math.min(Math.max(1, f.pagina), totalPaginas);
  const inicio = (pagina - 1) * f.porPagina;
  let daPagina = linhas.slice(inicio, inicio + f.porPagina);

  // Caminho normal: enriquece SÓ a página. Vinte anúncios é uma chamada de
  // multiget; enriquecer os dois mil da lista seriam cem, para mostrar vinte.
  if (!precisaTudo) {
    const info = await buscarAnuncioInfo(
      userId,
      daPagina.map((l) => ({ itemId: l.itemId, meliAccountId: l.meliAccountId })),
    );
    daPagina = daPagina.map((l) => aplicarInfo(l, info.get(l.itemId)));
    await comHierarquia(userId, daPagina);
  }

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
  };
}
