import prisma from "@/lib/prisma";
import { normalizeDiscoveredSku } from "@/lib/sku-discovery";
import { cache, createCacheKey } from "@/lib/cache";

// TTL do cache do resumo de SKUs pendentes.
// Essa função varre TODAS as vendas do usuário (operação cara). Como o
// resultado só muda quando há novo sync de vendas ou alteração de custo de
// SKU, um TTL curto elimina o reprocessamento repetido dentro da mesma
// sessão (ex: dashboard chama via /api/dashboard/stats e /api/sku/stats ao
// mesmo tempo) sem entregar dado velho por muito tempo.
const PENDING_SKU_CACHE_TTL = 300_000; // 5 min (invalidado em sync/SKU)

type Plataforma = "Mercado Livre" | "Shopee";

export type PendingSkuEntry = {
  sku: string;
  produto: string;
  plataforma: string;
  primeiraVenda?: string;
  ultimaVenda?: string;
  cadastrado: boolean;
  skuId?: string;
  custoUnitario?: number;
  situacao: "Sem custo" | "Nao cadastrado";
  estatisticas: {
    totalVendas: number;
    totalQuantidadeVendida: number;
    totalValorVendido: number;
    statusPorPlataforma: Record<
      string,
      {
        vendas: number;
        quantidade: number;
        valor: number;
      }
    >;
  };
};

type MutablePendingSkuEntry = Omit<
  PendingSkuEntry,
  "primeiraVenda" | "ultimaVenda"
> & {
  primeiraVenda?: Date;
  ultimaVenda?: Date;
};

export type PendingSkuSummary = {
  skusPendentes: PendingSkuEntry[];
  total: number;
  semCusto: number;
  naoCadastrados: number;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function skuLookupKey(value: unknown): string {
  return (normalizeDiscoveredSku(value) || "").toLocaleLowerCase("pt-BR");
}

function platformFromTags(tags: unknown): Plataforma {
  if (Array.isArray(tags) && tags.some((tag) => String(tag) === "Shopee")) {
    return "Shopee";
  }
  return "Mercado Livre";
}

function ensureEntry(
  map: Map<string, MutablePendingSkuEntry>,
  input: {
    sku: string;
    produto?: string | null;
    plataforma: Plataforma;
    cadastrado: boolean;
    skuId?: string;
    custoUnitario?: number;
    situacao: "Sem custo" | "Nao cadastrado";
  },
) {
  const key = skuLookupKey(input.sku);
  const existing = map.get(key);
  if (existing) {
    if (!existing.produto && input.produto) existing.produto = input.produto;
    if (input.cadastrado) {
      existing.cadastrado = true;
      existing.skuId = input.skuId;
      existing.custoUnitario = input.custoUnitario;
      existing.situacao = "Sem custo";
    }
    return existing;
  }

  const created: MutablePendingSkuEntry = {
    sku: input.sku,
    produto: input.produto || `SKU ${input.sku}`,
    plataforma: input.plataforma,
    cadastrado: input.cadastrado,
    skuId: input.skuId,
    custoUnitario: input.custoUnitario,
    situacao: input.situacao,
    estatisticas: {
      totalVendas: 0,
      totalQuantidadeVendida: 0,
      totalValorVendido: 0,
      statusPorPlataforma: {},
    },
  };

  map.set(key, created);
  return created;
}

function serializeEntry(entry: MutablePendingSkuEntry): PendingSkuEntry {
  return {
    ...entry,
    primeiraVenda: entry.primeiraVenda?.toISOString(),
    ultimaVenda: entry.ultimaVenda?.toISOString(),
    estatisticas: {
      totalVendas: entry.estatisticas.totalVendas,
      totalQuantidadeVendida: entry.estatisticas.totalQuantidadeVendida,
      totalValorVendido: Number(entry.estatisticas.totalValorVendido.toFixed(2)),
      statusPorPlataforma: entry.estatisticas.statusPorPlataforma,
    },
  };
}

/**
 * Resumo de SKUs pendentes (sem custo / não cadastrados) do usuário.
 *
 * Usa cache em memória com TTL curto porque a computação é cara (varre
 * todas as vendas). Passe `forceRefresh: true` logo após um sync ou edição
 * de custo de SKU para invalidar e recalcular.
 */
export async function buildPendingSkuSummary(
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<PendingSkuSummary> {
  const cacheKey = createCacheKey("sku-pending-summary", userId);

  if (!options?.forceRefresh) {
    const cached = cache.get<PendingSkuSummary>(cacheKey, PENDING_SKU_CACHE_TTL);
    if (cached) {
      return cached;
    }
  }

  const summary = await computePendingSkuSummary(userId);
  cache.set(cacheKey, summary);
  return summary;
}

/**
 * Invalida o cache do resumo de SKUs pendentes de um usuário.
 * Chamar após sync de vendas ou alteração de custo/cadastro de SKU.
 */
export function invalidatePendingSkuSummary(userId: string): void {
  cache.delete(createCacheKey("sku-pending-summary", userId));
}

type SaleSkuGroup = {
  sku: string | null;
  _count: { _all: number };
  _sum: { quantidade: number | null; valorTotal: unknown };
  _min: { dataVenda: Date | null };
  _max: { dataVenda: Date | null };
};

async function computePendingSkuSummary(
  userId: string,
): Promise<PendingSkuSummary> {
  // Agregação feita no BANCO (groupBy pela coluna `sku`), em vez de trazer
  // todas as vendas com `rawData` e iterar em JS. O resultado é ~1 linha por
  // SKU distinto (centenas), não dezenas de milhares de linhas com JSON.
  // Usa a coluna `sku` — a mesma que o restante do sistema (CMV, tabela de
  // vendas) trata como o SKU da venda —, mantendo consistência total.
  const [registeredSkusRows, meliGroups, shopeeGroups] = await Promise.all([
    prisma.sKU.findMany({
      where: { userId },
      select: {
        id: true,
        sku: true,
        produto: true,
        custoUnitario: true,
        ativo: true,
        tipo: true,
        tags: true,
      },
    }),
    prisma.meliVenda.groupBy({
      by: ["sku"],
      where: { userId, sku: { not: null } },
      _count: { _all: true },
      _sum: { quantidade: true, valorTotal: true },
      _min: { dataVenda: true },
      _max: { dataVenda: true },
    }),
    prisma.shopeeVenda.groupBy({
      by: ["sku"],
      where: { userId, sku: { not: null } },
      _count: { _all: true },
      _sum: { quantidade: true, valorTotal: true },
      _min: { dataVenda: true },
      _max: { dataVenda: true },
    }),
  ]);

  const registeredSkus = new Map(
    registeredSkusRows.map((sku) => [skuLookupKey(sku.sku), sku]),
  );
  const pending = new Map<string, MutablePendingSkuEntry>();

  // 1) SKUs cadastrados como "filho", ativos e sem custo → pendentes "Sem custo"
  for (const sku of registeredSkusRows) {
    const custoUnitario = toNumber(sku.custoUnitario);
    if (sku.tipo !== "filho" || !sku.ativo || custoUnitario > 0) continue;

    ensureEntry(pending, {
      sku: sku.sku,
      produto: sku.produto,
      plataforma: platformFromTags(sku.tags),
      cadastrado: true,
      skuId: sku.id,
      custoUnitario,
      situacao: "Sem custo",
    });
  }

  // 2) SKUs que aparecem em vendas: pendentes se não cadastrados, ou
  //    cadastrados sem custo. SKUs com custo/ inativos são ignorados.
  const addGroup = (group: SaleSkuGroup, plataforma: Plataforma) => {
    const sku = normalizeDiscoveredSku(group.sku);
    if (!sku) return;

    const registered = registeredSkus.get(skuLookupKey(sku));
    const custoUnitario = registered ? toNumber(registered.custoUnitario) : 0;

    // Cadastrado com custo (>0) ou inativo → não é pendente.
    if (registered && (!registered.ativo || custoUnitario > 0)) return;

    const entry = ensureEntry(pending, {
      sku,
      produto: registered?.produto,
      plataforma,
      cadastrado: Boolean(registered),
      skuId: registered?.id,
      custoUnitario,
      situacao: registered ? "Sem custo" : "Nao cadastrado",
    });

    const vendas = group._count._all;
    const quantidade = toNumber(group._sum.quantidade);
    const valor = toNumber(group._sum.valorTotal);

    entry.estatisticas.totalVendas += vendas;
    entry.estatisticas.totalQuantidadeVendida += quantidade;
    entry.estatisticas.totalValorVendido += valor;

    const st = entry.estatisticas.statusPorPlataforma[plataforma] || {
      vendas: 0,
      quantidade: 0,
      valor: 0,
    };
    st.vendas += vendas;
    st.quantidade += quantidade;
    st.valor += valor;
    entry.estatisticas.statusPorPlataforma[plataforma] = st;

    const min = toDate(group._min.dataVenda);
    const max = toDate(group._max.dataVenda);
    if (min && (!entry.primeiraVenda || min < entry.primeiraVenda)) {
      entry.primeiraVenda = min;
    }
    if (max && (!entry.ultimaVenda || max > entry.ultimaVenda)) {
      entry.ultimaVenda = max;
    }
  };

  for (const group of meliGroups) addGroup(group as SaleSkuGroup, "Mercado Livre");
  for (const group of shopeeGroups) addGroup(group as SaleSkuGroup, "Shopee");

  // 3) Nome do produto para SKUs pendentes NÃO cadastrados (que ficaram com o
  //    placeholder "SKU x"). Busca um título representativo apenas para esse
  //    conjunto pequeno (SKUs pendentes), não para todas as vendas.
  const semTitulo = Array.from(pending.values()).filter(
    (e) => !e.cadastrado && e.produto === `SKU ${e.sku}`,
  );
  if (semTitulo.length > 0) {
    const skuCodes = semTitulo.map((e) => e.sku);
    const [meliTitles, shopeeTitles] = await Promise.all([
      prisma.meliVenda.findMany({
        where: { userId, sku: { in: skuCodes } },
        select: { sku: true, titulo: true },
        distinct: ["sku"],
      }),
      prisma.shopeeVenda.findMany({
        where: { userId, sku: { in: skuCodes } },
        select: { sku: true, titulo: true },
        distinct: ["sku"],
      }),
    ]);
    const titleBySku = new Map<string, string>();
    for (const row of [...meliTitles, ...shopeeTitles]) {
      if (row.sku && row.titulo && !titleBySku.has(skuLookupKey(row.sku))) {
        titleBySku.set(skuLookupKey(row.sku), row.titulo);
      }
    }
    for (const entry of semTitulo) {
      const titulo = titleBySku.get(skuLookupKey(entry.sku));
      if (titulo) entry.produto = titulo;
    }
  }

  const skusPendentes = Array.from(pending.values())
    .map(serializeEntry)
    .sort((a, b) => {
      if (a.cadastrado !== b.cadastrado) return a.cadastrado ? -1 : 1;
      const aTime = a.ultimaVenda ? new Date(a.ultimaVenda).getTime() : 0;
      const bTime = b.ultimaVenda ? new Date(b.ultimaVenda).getTime() : 0;
      return bTime - aTime || a.sku.localeCompare(b.sku);
    });

  return {
    skusPendentes,
    total: skusPendentes.length,
    semCusto: skusPendentes.filter((sku) => sku.cadastrado).length,
    naoCadastrados: skusPendentes.filter((sku) => !sku.cadastrado).length,
  };
}
