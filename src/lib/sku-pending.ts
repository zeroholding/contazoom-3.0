import prisma from "@/lib/prisma";
import { normalizeDiscoveredSku } from "@/lib/sku-discovery";

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
  const existing = map.get(input.sku);
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

  map.set(input.sku, created);
  return created;
}

function addSaleToEntry(
  entry: MutablePendingSkuEntry,
  sale: {
    plataforma: Plataforma;
    dataVenda: Date | null;
    quantidade: number;
    valor: number;
  },
) {
  entry.estatisticas.totalVendas += 1;
  entry.estatisticas.totalQuantidadeVendida += sale.quantidade;
  entry.estatisticas.totalValorVendido += sale.valor;

  const status =
    entry.estatisticas.statusPorPlataforma[sale.plataforma] || {
      vendas: 0,
      quantidade: 0,
      valor: 0,
    };
  status.vendas += 1;
  status.quantidade += sale.quantidade;
  status.valor += sale.valor;
  entry.estatisticas.statusPorPlataforma[sale.plataforma] = status;

  if (sale.dataVenda) {
    if (!entry.primeiraVenda || sale.dataVenda < entry.primeiraVenda) {
      entry.primeiraVenda = sale.dataVenda;
    }
    if (!entry.ultimaVenda || sale.dataVenda > entry.ultimaVenda) {
      entry.ultimaVenda = sale.dataVenda;
    }
  }
}

function addSaleCandidate(
  map: Map<string, MutablePendingSkuEntry>,
  registeredSkus: Map<
    string,
    { id: string; produto: string; custoUnitario: unknown; ativo: boolean }
  >,
  input: {
    sku: unknown;
    produto?: string | null;
    plataforma: Plataforma;
    dataVenda: Date | null;
    quantidade: number;
    valor: number;
  },
) {
  const sku = normalizeDiscoveredSku(input.sku);
  if (!sku) return;

  const registered = registeredSkus.get(sku);
  const custoUnitario = registered ? toNumber(registered.custoUnitario) : 0;

  if (registered && (!registered.ativo || custoUnitario > 0)) {
    return;
  }

  const entry = ensureEntry(map, {
    sku,
    produto: registered?.produto || input.produto,
    plataforma: input.plataforma,
    cadastrado: Boolean(registered),
    skuId: registered?.id,
    custoUnitario,
    situacao: registered ? "Sem custo" : "Nao cadastrado",
  });

  addSaleToEntry(entry, input);
}

function extractMeliSaleCandidates(venda: any) {
  const candidates: Array<{
    sku: unknown;
    produto?: string | null;
    quantidade: number;
    valor: number;
  }> = [];

  const rawOrder = venda?.rawData?.order;
  const orderItems = Array.isArray(rawOrder?.order_items)
    ? rawOrder.order_items
    : [];

  for (const orderItem of orderItems) {
    const item = orderItem?.item || {};
    const quantidade = toNumber(orderItem?.quantity) || 1;
    const unitario = toNumber(orderItem?.unit_price);

    candidates.push({
      sku:
        item?.seller_sku ??
        item?.sku ??
        orderItem?.seller_sku ??
        orderItem?.sku,
      produto: item?.title || venda?.titulo,
      quantidade,
      valor: unitario > 0 ? unitario * quantidade : toNumber(venda?.valorTotal),
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      sku: venda?.sku,
      produto: venda?.titulo,
      quantidade: toNumber(venda?.quantidade) || 1,
      valor: toNumber(venda?.valorTotal),
    });
  }

  return candidates;
}

function extractShopeeSaleCandidates(venda: any) {
  const candidates: Array<{
    sku: unknown;
    produto?: string | null;
    quantidade: number;
    valor: number;
  }> = [];

  const itemList = Array.isArray(venda?.rawData?.item_list)
    ? venda.rawData.item_list
    : [];

  for (const item of itemList) {
    const quantidade = toNumber(item?.model_quantity_purchased) || 1;
    const unitario =
      toNumber(item?.model_discounted_price) ||
      toNumber(item?.model_original_price) ||
      toNumber(item?.item_price);

    candidates.push({
      sku: item?.item_sku ?? item?.model_sku ?? item?.variation_sku,
      produto: item?.item_name || venda?.titulo,
      quantidade,
      valor: unitario > 0 ? unitario * quantidade : toNumber(venda?.valorTotal),
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      sku: venda?.sku,
      produto: venda?.titulo,
      quantidade: toNumber(venda?.quantidade) || 1,
      valor: toNumber(venda?.valorTotal),
    });
  }

  return candidates;
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

export async function buildPendingSkuSummary(
  userId: string,
): Promise<PendingSkuSummary> {
  const [registeredSkusRows, meliVendas, shopeeVendas] = await Promise.all([
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
    prisma.meliVenda.findMany({
      where: { userId },
      select: {
        sku: true,
        titulo: true,
        dataVenda: true,
        quantidade: true,
        valorTotal: true,
        rawData: true,
      },
    }),
    prisma.shopeeVenda.findMany({
      where: { userId },
      select: {
        sku: true,
        titulo: true,
        dataVenda: true,
        quantidade: true,
        valorTotal: true,
        rawData: true,
      },
    }),
  ]);

  const registeredSkus = new Map(
    registeredSkusRows.map((sku) => [sku.sku, sku]),
  );
  const pending = new Map<string, MutablePendingSkuEntry>();

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

  for (const venda of meliVendas) {
    const seenInSale = new Set<string>();
    for (const candidate of extractMeliSaleCandidates(venda)) {
      const sku = normalizeDiscoveredSku(candidate.sku);
      if (!sku || seenInSale.has(sku)) continue;
      seenInSale.add(sku);

      addSaleCandidate(pending, registeredSkus, {
        ...candidate,
        sku,
        plataforma: "Mercado Livre",
        dataVenda: toDate(venda.dataVenda),
      });
    }
  }

  for (const venda of shopeeVendas) {
    const seenInSale = new Set<string>();
    for (const candidate of extractShopeeSaleCandidates(venda)) {
      const sku = normalizeDiscoveredSku(candidate.sku);
      if (!sku || seenInSale.has(sku)) continue;
      seenInSale.add(sku);

      addSaleCandidate(pending, registeredSkus, {
        ...candidate,
        sku,
        plataforma: "Shopee",
        dataVenda: toDate(venda.dataVenda),
      });
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
