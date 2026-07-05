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
      "dashboard-faturamento-por-tipo-anuncio",
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
    const cached = cache.get(cacheKey, 300000);
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

    // WhereClause para Mercado Livre (com tipoAnuncio e modalidade)
    const whereClauseMeli = usarTodasVendas
      ? { userId: session.sub, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli }
      : { userId: session.sub, dataVenda: { gte: start, lte: end }, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli };

    // Agregação no banco via groupBy por tipoAnuncio (substitui findMany + loop).
    // orderId é @unique, então não há duplicatas a deduplicar.
    const gruposTipoAnuncio = await prisma.meliVenda.groupBy({
      by: ['tipoAnuncio'],
      where: whereClauseMeli,
      _sum: { valorTotal: true },
      _count: { _all: true },
    });

    // Agrupar por tipo de anúncio (Catálogo vs Próprio) - apenas Mercado Livre
    let faturamentoCatalogo = 0;
    let faturamentoProprio = 0;
    let quantidadeCatalogo = 0;
    let quantidadeProprio = 0;

    // Bucketizar os grupos do Mercado Livre (com tipoAnuncio)
    for (const grupo of gruposTipoAnuncio) {
      const valor = toNumber(grupo._sum.valorTotal);
      const qtd = grupo._count._all;
      const isCatalogo = grupo.tipoAnuncio &&
                        grupo.tipoAnuncio.toString().toLowerCase().includes('catalogo');

      if (isCatalogo) {
        faturamentoCatalogo += valor;
        quantidadeCatalogo += qtd;
      } else {
        faturamentoProprio += valor;
        quantidadeProprio += qtd;
      }
    }

    const faturamentoTotal = faturamentoCatalogo + faturamentoProprio;
    const quantidadeTotal = quantidadeCatalogo + quantidadeProprio;

    // Calcular percentuais de faturamento
    const percentualFaturamentoCatalogo = faturamentoTotal > 0 ? (faturamentoCatalogo / faturamentoTotal) * 100 : 0;
    const percentualFaturamentoProprio = faturamentoTotal > 0 ? (faturamentoProprio / faturamentoTotal) * 100 : 0;

    // Calcular percentuais de quantidade
    const percentualQuantidadeCatalogo = quantidadeTotal > 0 ? (quantidadeCatalogo / quantidadeTotal) * 100 : 0;
    const percentualQuantidadeProprio = quantidadeTotal > 0 ? (quantidadeProprio / quantidadeTotal) * 100 : 0;

    // Montar resultado
    const resultado = [];

    if (faturamentoCatalogo > 0) {
      resultado.push({
        tipoAnuncio: "Catálogo",
        faturamento: Math.round(faturamentoCatalogo * 100) / 100,
        quantidade: quantidadeCatalogo,
        percentual: Math.round(percentualFaturamentoCatalogo * 100) / 100,
        percentualFaturamento: Math.round(percentualFaturamentoCatalogo * 100) / 100,
        percentualQuantidade: Math.round(percentualQuantidadeCatalogo * 100) / 100,
      });
    }

    if (faturamentoProprio > 0) {
      resultado.push({
        tipoAnuncio: "Próprio",
        faturamento: Math.round(faturamentoProprio * 100) / 100,
        quantidade: quantidadeProprio,
        percentual: Math.round(percentualFaturamentoProprio * 100) / 100,
        percentualFaturamento: Math.round(percentualFaturamentoProprio * 100) / 100,
        percentualQuantidade: Math.round(percentualQuantidadeProprio * 100) / 100,
      });
    }

    cache.set(cacheKey, resultado);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("Erro ao calcular faturamento por tipo de anúncio:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
