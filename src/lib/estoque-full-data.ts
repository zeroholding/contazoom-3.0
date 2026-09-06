/**
 * Leitura do Estoque Full: linhas, resumo e opções de filtro.
 *
 * Os números de estoque vêm do snapshot (`meli_full_stock`, gravado pelo sync).
 * As vendas de 30 dias e a cobertura vêm de `meli_venda` e são calculadas na
 * LEITURA, não materializadas — porque é preciso filtrar e ordenar por elas, e
 * coluna materializada em snapshot ficaria velha a cada venda nova.
 *
 * O JOIN DE VENDAS É POR (usuário, anúncio, VARIAÇÃO), e a variação é o ponto
 * que mais importa: no Mercado Livre um anúncio com variações tem estoque
 * separado por variação. Comparar o estoque da variação P com as vendas do
 * anúncio inteiro multiplicaria a venda diária pelo número de variações e a tela
 * diria "repor" em tudo ao mesmo tempo.
 *
 * `$queryRawUnsafe` com parâmetros numerados: todo VALOR vai por `$n`; só
 * expressões constantes do próprio código (aliases, a fórmula de cobertura) são
 * interpoladas. Nada vindo do usuário entra na string.
 */

import prisma from "@/lib/prisma";
import {
  coberturaEmDias,
  rotuloCobertura,
  situacaoDoEstoque,
  sqlCobertura,
  sqlSituacao,
  type SituacaoEstoque,
} from "@/lib/estoque-full-cobertura";

export type OrdemFull =
  | "aptas"
  | "vendas"
  | "medio"
  | "caminho"
  | "naoaptas"
  | "cobertura";

export type FiltrosFull = {
  /** Ids de `meli_account`. Vazio = todas as contas do usuário. */
  contas: string[];
  /** Busca em título, SKU, código do inventário e MLB. */
  busca: string;
  situacao: "" | SituacaoEstoque;
  /** `com` = disponível > 0, `sem` = disponível = 0. */
  estoque: "" | "com" | "sem";
  hierarquia1: string;
  hierarquia2: string;
  ordem: OrdemFull;
  direcao: "asc" | "desc";
  pagina: number;
  porPagina: number;
};

export type LinhaFull = {
  inventoryId: string;
  meliAccountId: string;
  conta: string | null;
  itemId: string | null;
  variationId: string | null;
  sku: string | null;
  titulo: string;
  thumbnail: string | null;
  logisticType: string | null;
  /** Prontas para venda. */
  disponivel: number;
  /** Não aptas, já líquido do "a caminho". */
  naoDisponivel: number;
  /** "A caminho": em transferência para o centro de distribuição. */
  transferencia: number;
  total: number;
  vendas30dUnidades: number;
  vendas30dReceita: number;
  /** Média das aptas nos últimos 30 dias. `null` sem histórico. */
  estoqueMedio: number | null;
  /** Dias que o estoque aguenta. `null` sem vendas. */
  cobertura: number | null;
  rotuloCobertura: string;
  situacao: SituacaoEstoque;
  hierarquia1: string | null;
  hierarquia2: string | null;
  sincronizadoEm: string;
};

export type ResumoFull = {
  itens: number;
  aptas: number;
  naoAptas: number;
  aCaminho: number;
  aRepor: number;
  parados: number;
  vendasUnidades: number;
  vendasReceita: number;
  /** `null` quando nunca sincronizou. */
  ultimaAtualizacao: string | null;
};

export type ResultadoFull = {
  linhas: LinhaFull[];
  resumo: ResumoFull;
  total: number;
  pagina: number;
  totalPaginas: number;
  /** `true` quando o usuário nunca rodou o sync. Distingue de "filtro vazio". */
  nuncaSincronizou: boolean;
  /** Vendas sem `variation_id`, que deixam a cobertura incompleta. */
  backfillPendente: number;
  contasDisponiveis: { id: string; nickname: string | null }[];
  hierarquias1: string[];
  hierarquias2: string[];
};

/**
 * Vendas dos últimos 30 dias, por conta + anúncio + variação.
 *
 * Cancelada e inválida ficam fora: um anúncio cheio de cancelamento não tem
 * demanda real, e contá-las faria a cobertura parecer curta e disparar reposição
 * de um produto que não vende.
 *
 * A janela usa `NOW()` e não `CURRENT_DATE` para casar com o `dia` do histórico,
 * que o sync grava em horário de São Paulo.
 */
const CTE_VENDAS = `
  vendas AS (
    SELECT
      v.meli_account_id,
      v.item_id,
      v.variation_id,
      SUM(COALESCE(v.quantidade, 0))::bigint AS unidades,
      SUM(COALESCE(v.valor_total, 0))        AS receita
    FROM meli_venda v
    WHERE v.user_id = $1
      AND v.data_venda >= (NOW() - INTERVAL '30 days')
      AND LOWER(COALESCE(v.status, '')) NOT IN ('cancelled', 'invalid')
    GROUP BY v.meli_account_id, v.item_id, v.variation_id
  )
`;

/**
 * Média das aptas nos últimos 30 dias.
 *
 * É a média das linhas QUE EXISTEM, não dividida por 30: com três dias de
 * histórico, é a média desses três. Dividir por 30 daria um número
 * artificialmente baixo enquanto a série não completa um mês, e a tela pareceria
 * dizer que o estoque despencou.
 */
const CTE_MEDIA = `
  media AS (
    SELECT h.inventory_id, AVG(h.available_quantity)::numeric AS estoque_medio
    FROM meli_full_stock_history h
    WHERE h.user_id = $1
      AND h.dia >= (CURRENT_DATE - INTERVAL '30 days')
    GROUP BY h.inventory_id
  )
`;

/**
 * As junções.
 *
 * O join de vendas casa a variação por igualdade simples porque as duas pontas
 * usam o marcador `"-"` para "anúncio sem variação" em vez de NULL. Em SQL
 * `NULL = NULL` não é verdadeiro, então com NULL o join perderia silenciosamente
 * todo anúncio simples — foi o cuidado extra que o projeto irmão precisou ter.
 *
 * A hierarquia vem do cadastro de SKU do próprio usuário, pelo código do SKU.
 */
const JOINS = `
  FROM meli_full_stock f
  LEFT JOIN vendas v
         ON v.meli_account_id = f.meli_account_id
        AND v.item_id = f.item_id
        AND v.variation_id = f.variation_id
  LEFT JOIN media m ON m.inventory_id = f.inventory_id
  LEFT JOIN meli_account c ON c.id = f.meli_account_id
  LEFT JOIN (
    SELECT DISTINCT ON (s.sku) s.sku, s.hierarquia_1, s.hierarquia_2
    FROM sku s
    WHERE s.user_id = $1 AND s.ativo = true
    ORDER BY s.sku, s.updated_at DESC
  ) k ON k.sku = f.sku
`;

/** Monta o WHERE. `params` já começa com o `userId` em `$1`. */
function montarWhere(
  f: FiltrosFull,
  params: unknown[],
  opcoes: { ignorarHierarquia1?: boolean; ignorarHierarquia2?: boolean } = {},
): string {
  const cond: string[] = [`f.user_id = $1`];

  if (f.contas.length > 0) {
    const marcadores = f.contas.map((c) => {
      params.push(c);
      return `$${params.length}`;
    });
    cond.push(`f.meli_account_id IN (${marcadores.join(", ")})`);
  }

  if (f.busca) {
    params.push(`%${f.busca}%`);
    const i = params.length;
    cond.push(
      `(f.titulo ILIKE $${i} OR f.sku ILIKE $${i} OR f.inventory_id ILIKE $${i} OR f.item_id ILIKE $${i})`,
    );
  }

  if (f.estoque === "com") cond.push(`f.available_quantity > 0`);
  else if (f.estoque === "sem") cond.push(`f.available_quantity = 0`);

  if (f.situacao && f.situacao !== "saudavel") {
    cond.push(sqlSituacao(f.situacao, "f", "v"));
  } else if (f.situacao === "saudavel") {
    // "Saudável" é a ausência dos outros três, então a condição é a negação.
    // Escrever assim, e não como uma quarta faixa, é o que garante que os quatro
    // filtros somados dão exatamente o total — sem linha em duas faixas nem
    // linha em nenhuma.
    const outros = (["parado", "repor", "alto"] as const)
      .map((s) => sqlSituacao(s, "f", "v"))
      .join(" OR ");
    cond.push(`NOT (${outros})`);
  }

  if (!opcoes.ignorarHierarquia1 && f.hierarquia1) {
    params.push(f.hierarquia1);
    cond.push(`k.hierarquia_1 = $${params.length}`);
  }
  if (!opcoes.ignorarHierarquia2 && f.hierarquia2) {
    params.push(f.hierarquia2);
    cond.push(`k.hierarquia_2 = $${params.length}`);
  }

  return `WHERE ${cond.join(" AND ")}`;
}

/** Whitelist de ordenação. Nada vindo do usuário entra na string. */
function montarOrderBy(f: FiltrosFull): string {
  const colunas: Record<OrdemFull, string> = {
    aptas: `f.available_quantity`,
    vendas: `COALESCE(v.unidades, 0)`,
    medio: `m.estoque_medio`,
    caminho: `f.transfer_quantity`,
    naoaptas: `f.not_available_quantity`,
    cobertura: sqlCobertura("f", "v"),
  };
  const dir = f.direcao === "asc" ? "ASC" : "DESC";
  // `NULLS LAST` sempre: cobertura nula é "sem vendas", e ela não deve encabeçar
  // a lista nem quando se ordena crescente por cobertura.
  // O desempate por `inventory_id` é o que torna a paginação ESTÁVEL — sem ele,
  // linhas empatadas trocam de página entre carregamentos.
  return `ORDER BY ${colunas[f.ordem]} ${dir} NULLS LAST, f.inventory_id ASC`;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function arred(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

type LinhaCrua = {
  inventory_id: string;
  meli_account_id: string;
  conta: string | null;
  item_id: string | null;
  variation_id: string | null;
  sku: string | null;
  titulo: string | null;
  thumbnail: string | null;
  logistic_type: string | null;
  available_quantity: number;
  not_available_quantity: number;
  transfer_quantity: number;
  total: number;
  vendas_unidades: string | number | null;
  vendas_receita: string | number | null;
  estoque_medio: string | number | null;
  hierarquia_1: string | null;
  hierarquia_2: string | null;
  sincronizado_em: Date;
};

export async function buscarEstoqueFull(
  userId: string,
  f: FiltrosFull,
): Promise<ResultadoFull> {
  // Contagem total do snapshot, SEM filtro: é o que distingue "nunca
  // sincronizou" de "o filtro não achou nada". O projeto irmão mostra a mesma
  // mensagem nos dois casos e manda a pessoa sincronizar quando na verdade
  // bastava limpar o filtro.
  const [totalSnapshot, backfillPendente, contasDisponiveis] = await Promise.all([
    prisma.meliFullStock.count({ where: { userId } }),
    prisma.meliVenda.count({ where: { userId, variationId: null } }),
    prisma.meliAccount.findMany({
      where: { userId },
      select: { id: true, nickname: true },
      orderBy: { nickname: "asc" },
    }),
  ]);

  const paramsContagem: unknown[] = [userId];
  const whereContagem = montarWhere(f, paramsContagem);
  const contagem = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
    `WITH ${CTE_VENDAS}, ${CTE_MEDIA}
     SELECT COUNT(*)::bigint AS total ${JOINS} ${whereContagem}`,
    ...paramsContagem,
  );
  const total = Number(contagem[0]?.total ?? 0);

  const totalPaginas = Math.max(1, Math.ceil(total / f.porPagina));
  const pagina = Math.min(Math.max(1, f.pagina), totalPaginas);
  const offset = (pagina - 1) * f.porPagina;

  const paramsResumo: unknown[] = [userId];
  const whereResumo = montarWhere(f, paramsResumo);
  const resumoCru = await prisma.$queryRawUnsafe<
    Array<{
      itens: bigint;
      aptas: bigint;
      nao_aptas: bigint;
      a_caminho: bigint;
      a_repor: bigint;
      parados: bigint;
      vendas_unidades: bigint;
      vendas_receita: string | number | null;
      ultima_atualizacao: Date | null;
    }>
  >(
    `WITH ${CTE_VENDAS}, ${CTE_MEDIA}
     SELECT
       COUNT(*)::bigint                                          AS itens,
       COALESCE(SUM(f.available_quantity), 0)::bigint            AS aptas,
       COALESCE(SUM(f.not_available_quantity), 0)::bigint        AS nao_aptas,
       COALESCE(SUM(f.transfer_quantity), 0)::bigint             AS a_caminho,
       COALESCE(SUM(CASE WHEN ${sqlSituacao("repor", "f", "v")} THEN 1 ELSE 0 END), 0)::bigint  AS a_repor,
       COALESCE(SUM(CASE WHEN ${sqlSituacao("parado", "f", "v")} THEN 1 ELSE 0 END), 0)::bigint AS parados,
       COALESCE(SUM(COALESCE(v.unidades, 0)), 0)::bigint         AS vendas_unidades,
       COALESCE(SUM(COALESCE(v.receita, 0)), 0)                  AS vendas_receita,
       MAX(f.sincronizado_em)                                    AS ultima_atualizacao
     ${JOINS} ${whereResumo}`,
    ...paramsResumo,
  );
  const r = resumoCru[0];

  const paramsPagina: unknown[] = [userId];
  const wherePagina = montarWhere(f, paramsPagina);
  paramsPagina.push(f.porPagina);
  const iLimit = paramsPagina.length;
  paramsPagina.push(offset);
  const iOffset = paramsPagina.length;

  const cruas = await prisma.$queryRawUnsafe<LinhaCrua[]>(
    `WITH ${CTE_VENDAS}, ${CTE_MEDIA}
     SELECT
       f.inventory_id, f.meli_account_id, c.nickname AS conta,
       f.item_id, f.variation_id, f.sku, f.titulo, f.thumbnail, f.logistic_type,
       f.available_quantity, f.not_available_quantity, f.transfer_quantity, f.total,
       v.unidades AS vendas_unidades, v.receita AS vendas_receita,
       m.estoque_medio,
       k.hierarquia_1, k.hierarquia_2,
       f.sincronizado_em
     ${JOINS} ${wherePagina}
     ${montarOrderBy(f)}
     LIMIT $${iLimit} OFFSET $${iOffset}`,
    ...paramsPagina,
  );

  // As listas de hierarquia ignoram o PRÓPRIO nível: senão, ao escolher
  // "Fitness" o seletor passaria a oferecer só "Fitness" e a pessoa não teria
  // como trocar sem limpar o filtro antes.
  const [h1, h2] = await Promise.all([
    (async () => {
      const p: unknown[] = [userId];
      const w = montarWhere(f, p, { ignorarHierarquia1: true });
      const rows = await prisma.$queryRawUnsafe<Array<{ valor: string }>>(
        `WITH ${CTE_VENDAS}, ${CTE_MEDIA}
         SELECT DISTINCT k.hierarquia_1 AS valor ${JOINS} ${w}
           AND k.hierarquia_1 IS NOT NULL AND k.hierarquia_1 <> ''
         ORDER BY valor`,
        ...p,
      );
      return rows.map((x) => x.valor);
    })(),
    (async () => {
      const p: unknown[] = [userId];
      const w = montarWhere(f, p, { ignorarHierarquia2: true });
      const rows = await prisma.$queryRawUnsafe<Array<{ valor: string }>>(
        `WITH ${CTE_VENDAS}, ${CTE_MEDIA}
         SELECT DISTINCT k.hierarquia_2 AS valor ${JOINS} ${w}
           AND k.hierarquia_2 IS NOT NULL AND k.hierarquia_2 <> ''
         ORDER BY valor`,
        ...p,
      );
      return rows.map((x) => x.valor);
    })(),
  ]);

  const linhas: LinhaFull[] = cruas.map((c) => {
    const disponivel = num(c.available_quantity);
    const unidades = num(c.vendas_unidades);
    const cobertura = coberturaEmDias(disponivel, unidades);
    return {
      inventoryId: c.inventory_id,
      meliAccountId: c.meli_account_id,
      conta: c.conta,
      itemId: c.item_id,
      variationId: c.variation_id,
      sku: c.sku,
      titulo: c.titulo ?? "Produto sem título",
      thumbnail: c.thumbnail,
      logisticType: c.logistic_type,
      disponivel,
      naoDisponivel: num(c.not_available_quantity),
      transferencia: num(c.transfer_quantity),
      total: num(c.total),
      vendas30dUnidades: unidades,
      vendas30dReceita: arred(num(c.vendas_receita)),
      estoqueMedio: c.estoque_medio === null ? null : Math.round(num(c.estoque_medio)),
      cobertura,
      rotuloCobertura: rotuloCobertura(cobertura),
      situacao: situacaoDoEstoque(cobertura, unidades, disponivel),
      hierarquia1: c.hierarquia_1,
      hierarquia2: c.hierarquia_2,
      sincronizadoEm: c.sincronizado_em.toISOString(),
    };
  });

  return {
    linhas,
    resumo: {
      itens: Number(r?.itens ?? 0),
      aptas: Number(r?.aptas ?? 0),
      naoAptas: Number(r?.nao_aptas ?? 0),
      aCaminho: Number(r?.a_caminho ?? 0),
      aRepor: Number(r?.a_repor ?? 0),
      parados: Number(r?.parados ?? 0),
      vendasUnidades: Number(r?.vendas_unidades ?? 0),
      vendasReceita: arred(num(r?.vendas_receita)),
      ultimaAtualizacao: r?.ultima_atualizacao?.toISOString() ?? null,
    },
    total,
    pagina,
    totalPaginas,
    nuncaSincronizou: totalSnapshot === 0,
    backfillPendente,
    contasDisponiveis,
    hierarquias1: h1,
    hierarquias2: h2,
  };
}
