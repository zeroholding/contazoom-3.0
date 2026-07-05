import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDashboardFiltersWhere } from "@/lib/dashboard-filters";
import { cache, createCacheKey } from "@/lib/cache";

export const runtime = "nodejs";

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getNowInBrazil(): { year: number; month: number; day: number } {
  const now = new Date();
  const s = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [month, day, year] = s.split('/').map(Number);
  return { year, month, day };
}

function getDateRange(periodo: string): { start: Date; end: Date } {
  const b = getNowInBrazil();
  const now = new Date();
  switch (periodo) {
    case 'hoje': {
      const start = new Date(Date.UTC(b.year, b.month - 1, b.day, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999));
      return { start, end };
    }
    case 'ontem': {
      const start = new Date(Date.UTC(b.year, b.month - 1, b.day - 1, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day, 2, 59, 59, 999));
      return { start, end };
    }
    case 'ultimos_7d': {
      const start = new Date(Date.UTC(b.year, b.month - 1, b.day - 6, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999));
      return { start, end };
    }
    case 'ultimos_30d': {
      const start = new Date(Date.UTC(b.year, b.month - 1, b.day - 29, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999));
      return { start, end };
    }
    case 'ultimos_12m': {
      const ref = new Date(b.year, b.month - 13, b.day);
      const start = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, b.day + 1, 2, 59, 59, 999));
      return { start, end };
    }
    case 'este_mes': {
      const lastDay = new Date(b.year, b.month, 0).getDate();
      const start = new Date(Date.UTC(b.year, b.month - 1, 1, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, lastDay + 1, 2, 59, 59, 999));
      return { start, end };
    }
    case 'mes_passado': {
      const lastMonth = new Date(b.year, b.month - 2, 1);
      const lastDayOfLastMonth = new Date(b.year, b.month - 1, 0).getDate();
      const start = new Date(Date.UTC(lastMonth.getFullYear(), lastMonth.getMonth(), 1, 3, 0, 0, 0));
      const end = new Date(Date.UTC(lastMonth.getFullYear(), lastMonth.getMonth(), lastDayOfLastMonth + 1, 2, 59, 59, 999));
      return { start, end };
    }
    case 'ultimos_3_meses': {
      const ref = new Date(b.year, b.month - 2, 1);
      const start = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), 1, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, 1, 2, 59, 59, 999));
      return { start, end };
    }
    case 'ultimos_6_meses': {
      const ref = new Date(b.year, b.month - 5, 1);
      const start = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), 1, 3, 0, 0, 0));
      const end = new Date(Date.UTC(b.year, b.month - 1, 1, 2, 59, 59, 999));
      return { start, end };
    }
    case 'todos':
    default: {
      return { start: new Date(0), end: now };
    }
  }
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const periodoParam = url.searchParams.get("periodo") || "todos";
    const dataInicioParam = url.searchParams.get("dataInicio");
    const dataFimParam = url.searchParams.get("dataFim");
    const canalParam = url.searchParams.get("canal");
    const statusParam = url.searchParams.get("status");
    const tipoAnuncioParam = url.searchParams.get("tipoAnuncio");
    const modalidadeParam = url.searchParams.get("modalidade");
    const accountPlatformParam = url.searchParams.get("accountPlatform");
    const accountIdParam = url.searchParams.get("accountId");

    // Cache em memória por usuário + combinação de filtros (TTL 60s)
    const cacheKey = createCacheKey(
      "dashboard-faturamento-por-origem",
      session.sub,
      periodoParam ?? "",
      dataInicioParam ?? "",
      dataFimParam ?? "",
      canalParam ?? "",
      statusParam ?? "",
      tipoAnuncioParam ?? "",
      modalidadeParam ?? "",
      accountPlatformParam ?? "",
      accountIdParam ?? "",
    );
    const cached = cache.get(cacheKey, 60000);
    if (cached) {
      return NextResponse.json(cached);
    }

    let start: Date;
    let end: Date;
    let usarTodasVendas = false;

    if (dataInicioParam && dataFimParam) {
      // Período personalizado
      // Incluir o dia final completamente, independente do fuso
      start = new Date(dataInicioParam);
      const endBase = new Date(dataFimParam);
      end = new Date(endBase.getTime() + (24 * 60 * 60 * 1000 - 1));
    } else if (periodoParam === "todos") {
      // Para "todos", buscar todas as vendas
      usarTodasVendas = true;
      start = new Date(0);
      end = new Date();
    } else {
      const range = getDateRange(periodoParam);
      start = range.start;
      end = range.end;
    }

    // Buscar vendas no período
    const dashboardWhereMeli = getDashboardFiltersWhere({
      status: statusParam,
      canal: canalParam,
      tipoAnuncio: tipoAnuncioParam,
      modalidade: modalidadeParam,
    });
    const dashboardWhereShopee = getDashboardFiltersWhere({
      status: statusParam,
      canal: canalParam,
    });

    // WhereClause para Mercado Livre (com tipoAnuncio e modalidade)
    const whereClauseMeli = usarTodasVendas
      ? { userId: session.sub, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli }
      : { userId: session.sub, dataVenda: { gte: start, lte: end }, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli };

    // WhereClause para Shopee (sem tipoAnuncio e modalidade)
    const whereClauseShopee = usarTodasVendas
      ? { userId: session.sub, ...dashboardWhereShopee }
      : { userId: session.sub, dataVenda: { gte: start, lte: end }, ...dashboardWhereShopee };

    // Agregação no banco. Mercado Livre: groupBy por `ads` (bucketizado em JS).
    // Shopee: sempre "Sem ADS", então basta um aggregate (soma + contagem).
    // orderId é @unique em cada tabela, então não há duplicatas a deduplicar.
    // Respeita o filtro de canal para evitar queries desnecessárias.
    const [gruposMeliAds, aggShopee] = await Promise.all([
      canalParam === 'shopee'
        ? []
        : prisma.meliVenda.groupBy({
            by: ['ads'],
            where: whereClauseMeli,
            _sum: { valorTotal: true },
            _count: { _all: true },
          }),
      canalParam === 'mercado_livre'
        ? null
        : prisma.shopeeVenda.aggregate({
            where: whereClauseShopee,
            _sum: { valorTotal: true },
            _count: { _all: true },
          }),
    ]);

    // Agrupar por origem (Com ADS vs Sem ADS)
    let faturamentoComAds = 0;
    let faturamentoSemAds = 0;
    let quantidadeComAds = 0;
    let quantidadeSemAds = 0;

    // Bucketizar grupos do Mercado Livre pela mesma regra de ADS de antes
    for (const grupo of gruposMeliAds) {
      const valor = toNumber(grupo._sum.valorTotal);
      const qtd = grupo._count._all;

      const temAds = grupo.ads &&
                    grupo.ads !== null &&
                    grupo.ads.toString().toLowerCase() !== 'null' &&
                    grupo.ads.toString().trim() !== '';

      if (temAds) {
        faturamentoComAds += valor;
        quantidadeComAds += qtd;
      } else {
        faturamentoSemAds += valor;
        quantidadeSemAds += qtd;
      }
    }

    // Shopee sempre entra como "Sem ADS"
    if (aggShopee) {
      faturamentoSemAds += toNumber(aggShopee._sum.valorTotal);
      quantidadeSemAds += aggShopee._count._all;
    }

    const faturamentoTotal = faturamentoComAds + faturamentoSemAds;
    const quantidadeTotal = quantidadeComAds + quantidadeSemAds;

    // Calcular percentuais de faturamento
    const percentualFaturamentoComAds = faturamentoTotal > 0 ? (faturamentoComAds / faturamentoTotal) * 100 : 0;
    const percentualFaturamentoSemAds = faturamentoTotal > 0 ? (faturamentoSemAds / faturamentoTotal) * 100 : 0;

    // Calcular percentuais de quantidade
    const percentualQuantidadeComAds = quantidadeTotal > 0 ? (quantidadeComAds / quantidadeTotal) * 100 : 0;
    const percentualQuantidadeSemAds = quantidadeTotal > 0 ? (quantidadeSemAds / quantidadeTotal) * 100 : 0;

    // Montar resultado
    const resultado = [];

    if (faturamentoComAds > 0) {
      resultado.push({
        origem: "Com ADS",
        faturamento: Math.round(faturamentoComAds * 100) / 100,
        quantidade: quantidadeComAds,
        percentual: Math.round(percentualFaturamentoComAds * 100) / 100,
        percentualFaturamento: Math.round(percentualFaturamentoComAds * 100) / 100,
        percentualQuantidade: Math.round(percentualQuantidadeComAds * 100) / 100,
      });
    }

    if (faturamentoSemAds > 0) {
      resultado.push({
        origem: "Sem ADS",
        faturamento: Math.round(faturamentoSemAds * 100) / 100,
        quantidade: quantidadeSemAds,
        percentual: Math.round(percentualFaturamentoSemAds * 100) / 100,
        percentualFaturamento: Math.round(percentualFaturamentoSemAds * 100) / 100,
        percentualQuantidade: Math.round(percentualQuantidadeSemAds * 100) / 100,
      });
    }

    cache.set(cacheKey, resultado);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("Erro ao calcular faturamento por origem:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
