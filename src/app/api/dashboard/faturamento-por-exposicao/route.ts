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
  } catch (error) {
    console.error('[FaturamentoPorExposicao] Erro de autenticação:', error);
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
      "dashboard-faturamento-por-exposicao",
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

    // WhereClause para Mercado Livre (com tipoAnuncio e modalidade)
    const whereClauseMeli = usarTodasVendas
      ? { userId: session.sub, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli }
      : { userId: session.sub, dataVenda: { gte: start, lte: end }, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli };

    // Agregação no banco via groupBy por exposicao (substitui findMany + loop).
    // orderId é @unique, então não há duplicatas a deduplicar.
    const gruposExposicao = await prisma.meliVenda.groupBy({
      by: ['exposicao'],
      where: whereClauseMeli,
      _sum: { valorTotal: true },
      _count: { _all: true },
    });

    // Agrupar por tipo de exposição (Premium vs Clássico) - apenas Mercado Livre
    let faturamentoPremium = 0;
    let faturamentoClassico = 0;
    let quantidadePremium = 0;
    let quantidadeClassico = 0;

    // Bucketizar os grupos do Mercado Livre (com exposição)
    for (const grupo of gruposExposicao) {
      const valor = toNumber(grupo._sum.valorTotal);
      const qtd = grupo._count._all;
      const isPremium = grupo.exposicao &&
                       grupo.exposicao.toString().toLowerCase().includes('premium');

      if (isPremium) {
        faturamentoPremium += valor;
        quantidadePremium += qtd;
      } else {
        faturamentoClassico += valor;
        quantidadeClassico += qtd;
      }
    }

    const faturamentoTotal = faturamentoPremium + faturamentoClassico;
    const quantidadeTotal = quantidadePremium + quantidadeClassico;

    // Calcular percentuais de faturamento
    const percentualFaturamentoPremium = faturamentoTotal > 0 ? (faturamentoPremium / faturamentoTotal) * 100 : 0;
    const percentualFaturamentoClassico = faturamentoTotal > 0 ? (faturamentoClassico / faturamentoTotal) * 100 : 0;

    // Calcular percentuais de quantidade
    const percentualQuantidadePremium = quantidadeTotal > 0 ? (quantidadePremium / quantidadeTotal) * 100 : 0;
    const percentualQuantidadeClassico = quantidadeTotal > 0 ? (quantidadeClassico / quantidadeTotal) * 100 : 0;

    // Montar resultado
    const resultado = [];

    if (faturamentoPremium > 0) {
      resultado.push({
        exposicao: "Premium",
        faturamento: Math.round(faturamentoPremium * 100) / 100,
        quantidade: quantidadePremium,
        percentual: Math.round(percentualFaturamentoPremium * 100) / 100,
        percentualFaturamento: Math.round(percentualFaturamentoPremium * 100) / 100,
        percentualQuantidade: Math.round(percentualQuantidadePremium * 100) / 100,
      });
    }

    if (faturamentoClassico > 0) {
      resultado.push({
        exposicao: "Clássico",
        faturamento: Math.round(faturamentoClassico * 100) / 100,
        quantidade: quantidadeClassico,
        percentual: Math.round(percentualFaturamentoClassico * 100) / 100,
        percentualFaturamento: Math.round(percentualFaturamentoClassico * 100) / 100,
        percentualQuantidade: Math.round(percentualQuantidadeClassico * 100) / 100,
      });
    }

    cache.set(cacheKey, resultado);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[FaturamentoPorExposicao] Erro ao calcular faturamento por exposição:", err);
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    console.error("[FaturamentoPorExposicao] Detalhes do erro:", {
      message: errorMessage,
      stack: errorStack,
      name: err instanceof Error ? err.name : 'Unknown'
    });
    
    return NextResponse.json({ 
      error: "Erro interno",
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined 
    }, { status: 500 });
  }
}
