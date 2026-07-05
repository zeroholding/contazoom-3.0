import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDashboardFiltersWhere, getStatusWhere } from "@/lib/dashboard-filters";
import { calculateMeliFlexShipping } from "@/lib/flex-shipping";
import { loadActiveFlexShippingConfig } from "@/lib/flex-shipping-config";
import { cache, createCacheKey } from "@/lib/cache";

const CACHE_TTL_MS = 60000; // 60 segundos

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 segundos para planos Pro/Enterprise da Vercel

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 🌍 Função para obter a data/hora atual no timezone do Brasil
function getNowInBrazil(): { year: number; month: number; day: number } {
  const now = new Date();
  const brazilDateString = now.toLocaleString('en-US', { 
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const [month, day, year] = brazilDateString.split('/').map(Number);
  return { year, month, day };
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch (error) {
    console.error('[Dashboard Stats] ❌ Erro de autenticação:', error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const periodoParam = url.searchParams.get("periodo");
    const dataInicioParam = url.searchParams.get("dataInicio");
    const dataFimParam = url.searchParams.get("dataFim");
    const canalParam = url.searchParams.get("canal"); // mercado_livre | shopee
    const statusParam = url.searchParams.get("status"); // pagos | cancelados | todos
    const tipoAnuncioParam = url.searchParams.get("tipoAnuncio"); // catalogo | proprio
    const modalidadeParam = url.searchParams.get("modalidade"); // me | full | flex
    const tipoVisualizacao = url.searchParams.get("tipo") || "caixa"; // caixa | competencia
    const now = new Date();
    const accountPlatformParam = url.searchParams.get("accountPlatform"); // 'meli' | 'shopee'
    const accountIdParam = url.searchParams.get("accountId");

    // 🔑 Cache em memória por usuário + combinação de filtros (período/canal/status/conta)
    const cacheKey = createCacheKey(
      "financeiro-dashboard-stats",
      session.sub,
      startParam || "",
      endParam || "",
      periodoParam || "",
      dataInicioParam || "",
      dataFimParam || "",
      canalParam || "",
      statusParam || "",
      tipoAnuncioParam || "",
      modalidadeParam || "",
      tipoVisualizacao,
      accountPlatformParam || "",
      accountIdParam || ""
    );
    const cachedStats = cache.get<Record<string, unknown>>(cacheKey, CACHE_TTL_MS);
    if (cachedStats) {
      return NextResponse.json(cachedStats);
    }

    // Determinar período baseado nos parâmetros
    let start: Date;
    let end: Date;
    let useRange = false;

    if (dataInicioParam && dataFimParam) {
      // Período personalizado
      // Incluir o dia final completo: soma 24h - 1ms no fim
      start = new Date(dataInicioParam);
      const endBase = new Date(dataFimParam);
      end = new Date(endBase.getTime() + (24 * 60 * 60 * 1000 - 1));
      useRange = true;
    } else if (periodoParam) {
      // Período pré-definido
      switch (periodoParam) {
        case "hoje": {
          // 🌍 Usar data ATUAL do Brasil, não do servidor
          const brazilToday = getNowInBrazil();
          // Criar datas UTC que representam meia-noite e fim do dia no Brasil
          start = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day, 3, 0, 0, 0)); // +3h para UTC
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day + 1, 2, 59, 59, 999)); // +3h para UTC
          useRange = true;
          break;
        }
        case "ontem": {
          // 🌍 Usar data ATUAL do Brasil para calcular ontem
          const brazilToday = getNowInBrazil();
          const brazilYesterday = { ...brazilToday, day: brazilToday.day - 1 };
          
          // Criar datas UTC que representam ontem no horário do Brasil
          // Brasil 00:00 = UTC 03:00 (adicionar 3h)
          // Brasil 23:59 = UTC 02:59 do dia seguinte (adicionar 3h)
          start = new Date(Date.UTC(brazilYesterday.year, brazilYesterday.month - 1, brazilYesterday.day, 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilYesterday.year, brazilYesterday.month - 1, brazilYesterday.day + 1, 2, 59, 59, 999));
          useRange = true;
          
          // Log detalhado para debug de timezone
          console.log('[Dashboard Stats] 📅 Calculando ONTEM (Brasil):', {
            serverNowUTC: now.toISOString(),
            brazilNow: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            brazilYesterday: `${brazilYesterday.day}/${brazilYesterday.month}/${brazilYesterday.year}`,
            periodoUTC: {
              start: start.toISOString(),
              end: end.toISOString(),
            },
            explicacao: 'Ontem no Brasil, buscando em UTC com offset +3h',
            isVercel: process.env.VERCEL === '1',
          });
          
          break;
        }
        case "ultimos_7d": {
          // 🌍 Usar data do Brasil
          const brazilToday = getNowInBrazil();
          const sevenDaysAgo = new Date(brazilToday.year, brazilToday.month - 1, brazilToday.day - 6);
          start = new Date(Date.UTC(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate(), 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "ultimos_30d": {
          // 🌍 Usar data do Brasil
          const brazilToday = getNowInBrazil();
          const thirtyDaysAgo = new Date(brazilToday.year, brazilToday.month - 1, brazilToday.day - 29);
          start = new Date(Date.UTC(thirtyDaysAgo.getFullYear(), thirtyDaysAgo.getMonth(), thirtyDaysAgo.getDate(), 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "ultimos_12m": {
          // 🌍 Usar data do Brasil
          const brazilToday = getNowInBrazil();
          const twelveMonthsAgo = new Date(brazilToday.year, brazilToday.month - 13, brazilToday.day);
          start = new Date(Date.UTC(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth(), twelveMonthsAgo.getDate(), 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, brazilToday.day + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "mes_passado": {
          // 🌍 Usar data do Brasil
          const brazilToday = getNowInBrazil();
          const lastMonthDate = new Date(brazilToday.year, brazilToday.month - 2, 1); // Mês passado
          const lastDayOfLastMonth = new Date(brazilToday.year, brazilToday.month - 1, 0).getDate();
          start = new Date(Date.UTC(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 1, 3, 0, 0, 0));
          end = new Date(Date.UTC(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), lastDayOfLastMonth + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "este_mes": {
          // 🌍 Usar data do Brasil
          const brazilToday = getNowInBrazil();
          const lastDayOfMonth = new Date(brazilToday.year, brazilToday.month, 0).getDate();
          start = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, 1, 3, 0, 0, 0));
          end = new Date(Date.UTC(brazilToday.year, brazilToday.month - 1, lastDayOfMonth + 1, 2, 59, 59, 999));
          useRange = true;
          break;
        }
        case "todos":
        default: {
          // Sem filtro de período - todos os dados
          start = new Date(0); // Data muito antiga
          end = new Date(); // Data atual
          useRange = false;
          break;
        }
      }
    } else if (startParam || endParam) {
      // Parâmetros legacy
      start = startParam ? new Date(startParam) : startOfMonth(now);
      end = endParam ? new Date(endParam) : endOfMonth(now);
      useRange = true;
    } else {
      // Sem filtros - todos os dados
      start = new Date(0);
      end = new Date();
      useRange = false;
    }

    // Previous month period for trend calculation (always last month vs penultimate)
    const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevStart = startOfMonth(lastMonthRef);
    const prevEnd = endOfMonth(lastMonthRef);
    const penultimateRef = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const penultStart = startOfMonth(penultimateRef);
    const penultEnd = endOfMonth(penultimateRef);

    // Aplicar filtros usando helpers centralizados
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

    // Helper for trend calculations (apenas vendas pagas/completas)
    const paidOnly = getStatusWhere('pagos');

    // Buscar vendas do Mercado Livre e Shopee em PARALELO para melhor performance
    const [vendasMeli, vendasShopee] = await Promise.all([
      prisma.meliVenda.findMany({
        where: useRange
          ? { userId: session.sub, dataVenda: { gte: start, lte: end }, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli }
          : { userId: session.sub, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli },
        select: {
          orderId: true, // ⚠️ IMPORTANTE: Necessário para distinct e deduplicação
          meliAccountId: true,
          valorTotal: true,
          taxaPlataforma: true,
          frete: true,
          quantidade: true,
          sku: true,
          conta: true,
          plataforma: true,
          logisticType: true,
          dataVenda: true,
        },
        distinct: ['orderId'],
        orderBy: { dataVenda: "desc" },
      }),
      prisma.shopeeVenda.findMany({
        where: useRange
          ? { userId: session.sub, dataVenda: { gte: start, lte: end }, ...(accountPlatformParam === 'shopee' && accountIdParam ? { shopeeAccountId: accountIdParam } : {}), ...dashboardWhereShopee }
          : { userId: session.sub, ...(accountPlatformParam === 'shopee' && accountIdParam ? { shopeeAccountId: accountIdParam } : {}), ...dashboardWhereShopee },
        select: {
          orderId: true, // ⚠️ IMPORTANTE: Necessário para distinct e deduplicação
          shopeeAccountId: true,
          valorTotal: true,
          taxaPlataforma: true,
          frete: true,
          quantidade: true,
          sku: true,
          conta: true,
          plataforma: true,
          dataVenda: true,
        },
        distinct: ['orderId'],
        orderBy: { dataVenda: "desc" },
      })
    ]);

    // Consolidar vendas baseado no filtro de canal
    let vendas;
    if (canalParam === 'mercado_livre') {
      vendas = vendasMeli;
    } else if (canalParam === 'shopee') {
      vendas = vendasShopee;
    } else {
      // Se 'todos' ou não especificado, combinar ambas
      vendas = [...vendasMeli, ...vendasShopee];
    }

    // ⚠️ DEDUPLICAÇÃO ADICIONAL: Garantir que nenhum orderId seja contado duas vezes
    // O distinct do Prisma pode não funcionar perfeitamente em todos os casos
    const vendasDeduplicadas: typeof vendas = [];
    const orderIdsVistos = new Set<string>();
    
    for (const venda of vendas) {
      const orderId = (venda as any).orderId;
      
      if (!orderId) {
        // Se não tiver orderId, incluir sempre (caso raro)
        vendasDeduplicadas.push(venda);
        continue;
      }
      
      if (!orderIdsVistos.has(orderId)) {
        orderIdsVistos.add(orderId);
        vendasDeduplicadas.push(venda);
      }
    }

    vendas = vendasDeduplicadas;

    // Unique SKUs for CMV calculation
    const skusUnicos = Array.from(
      new Set(vendas.map((v) => v.sku).filter((s): s is string => Boolean(s)))
    );

    const { buildHistoricalCostMap } = await import("@/lib/sku-cost-history");
    const costMap = await buildHistoricalCostMap(session.sub, skusUnicos);

    const flexConfig = await loadActiveFlexShippingConfig(session.sub);

    // Aggregate current period
    let faturamentoTotal = 0;
    let receitaLiquida = 0; // valorTotal + taxas + frete
    let cmvTotal = 0;
    let vendasRealizadas = 0;
    let unidadesVendidas = 0;
    let taxasTotalAbs = 0;
    let freteTotalLiquido = 0;

    // Breakdown by plataforma
    const taxasPorPlataforma = new Map<string, number>();
    const fretePorPlataforma = new Map<string, number>();

    for (const v of vendas) {
      const vt = toNumber(v.valorTotal);
      const tp = toNumber(v.taxaPlataforma);
      const freteOriginal = toNumber(v.frete) || 0;
      const qtd = toNumber(v.quantidade);
      const custoUnit = v.sku ? costMap.getCostAtDate(v.sku, v.dataVenda) : 0;
      const cmv = custoUnit * qtd;

      const fr =
        v.plataforma === "Shopee"
          ? freteOriginal
          : calculateMeliFlexShipping({
              frete: freteOriginal,
              quantidade: qtd,
              logisticType: (v as any).logisticType,
              config: flexConfig,
            }).freteLiquidoFlex;

      faturamentoTotal += vt;
      receitaLiquida += vt + tp + fr; // taxa/frete podem ser negativos no banco
      cmvTotal += cmv;
      vendasRealizadas += 1;
      unidadesVendidas += qtd;

      const plataforma = v.plataforma || "Mercado Livre";
      const taxaAbs = Math.abs(tp);
      taxasTotalAbs += taxaAbs;
      freteTotalLiquido += fr;

      taxasPorPlataforma.set(
        plataforma,
        (taxasPorPlataforma.get(plataforma) || 0) + taxaAbs,
      );
      fretePorPlataforma.set(
        plataforma,
        (fretePorPlataforma.get(plataforma) || 0) + fr,
      );
    }

    const lucroBruto = receitaLiquida - cmvTotal;

    // Calcular impostos baseado nas alíquotas cadastradas
    let impostosTotal = 0;
    
    // Buscar alíquotas ativas do usuário (com fallback se modelo não existir)
    let aliquotas: any[] = [];
    try {
      if (prisma.aliquotaImposto) {
        aliquotas = await prisma.aliquotaImposto.findMany({
          where: {
            userId: session.sub,
            ativo: true,
          },
          orderBy: { updatedAt: "desc" },
        });
      }
    } catch {
      // Modelo AliquotaImposto não existe no schema - ignorar silenciosamente
      aliquotas = [];
    }

    // Se não houver alíquotas, pular o cálculo
    if (aliquotas.length > 0) {
      // A alíquota pertence a uma conta e a um período. Agrupar somente por mês
      // misturaria contas com percentuais diferentes.
      const faturamentoPorContaMes = new Map<
        string,
        {
          mesAno: string;
          conta: string;
          accountId: string;
          plataforma: "meli" | "shopee";
          faturamento: number;
        }
      >();
      
      for (const v of vendas) {
        if (!v.dataVenda) continue; // Pular vendas sem data
        
        const dataVenda = new Date(v.dataVenda);
        // Chave no formato YYYY-MM
        const mesAno = `${dataVenda.getUTCFullYear()}-${String(dataVenda.getUTCMonth() + 1).padStart(2, '0')}`;
        const conta = v.conta.trim();
        if (!conta) continue;
        const isMeli = "meliAccountId" in v;
        const accountId = isMeli ? v.meliAccountId : v.shopeeAccountId;
        const plataforma = isMeli ? "meli" : "shopee";
        const valorTotal = toNumber(v.valorTotal);

        const key = `${mesAno}\u0000${plataforma}\u0000${accountId}`;
        const current = faturamentoPorContaMes.get(key);
        faturamentoPorContaMes.set(key, {
          mesAno,
          conta,
          accountId,
          plataforma,
          faturamento: (current?.faturamento || 0) + valorTotal,
        });
      }

      for (const {
        mesAno,
        conta,
        accountId,
        plataforma,
        faturamento,
      } of faturamentoPorContaMes.values()) {
        const [year, month] = mesAno.split('-').map(Number);
        const primeiroDiaMes = new Date(Date.UTC(year, month - 1, 1));
        const ultimoDiaMes = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        const contaNormalizada = conta.toLocaleLowerCase("pt-BR");
        
        const aliquotaMes = aliquotas.find((aliq: any) => {
          const aliqInicio = new Date(aliq.dataInicio);
          const aliqFim = new Date(aliq.dataFim);
          const matchesStableAccount =
            aliq.accountId === accountId && aliq.plataforma === plataforma;
          const matchesLegacyAccount =
            !aliq.accountId &&
            String(aliq.conta).trim().toLocaleLowerCase("pt-BR") === contaNormalizada;

          return (
            (matchesStableAccount || matchesLegacyAccount) &&
            primeiroDiaMes <= aliqFim &&
            ultimoDiaMes >= aliqInicio
          );
        });

        if (aliquotaMes) {
          const aliquotaDecimal = toNumber(aliquotaMes.aliquota) / 100;
          const impostoMes = faturamento * aliquotaDecimal;
          impostosTotal += impostoMes;
        }
      }
    }

    // Trend: faturamento do último mês vs penúltimo mês (TODAS AS QUERIES EM PARALELO)
    const [
      vendasMeliUltimoMes,
      vendasShopeeUltimoMes,
      vendasMeliPenultimoMes,
      vendasShopeePenultimoMes
    ] = await Promise.all([
      prisma.meliVenda.findMany({
        where: { userId: session.sub, dataVenda: { gte: prevStart, lte: prevEnd }, ...paidOnly },
        select: { valorTotal: true },
        distinct: ['orderId'],
      }),
      prisma.shopeeVenda.findMany({
        where: { userId: session.sub, dataVenda: { gte: prevStart, lte: prevEnd }, ...paidOnly },
        select: { valorTotal: true },
        distinct: ['orderId'],
      }),
      prisma.meliVenda.findMany({
        where: { userId: session.sub, dataVenda: { gte: penultStart, lte: penultEnd }, ...paidOnly },
        select: { valorTotal: true },
        distinct: ['orderId'],
      }),
      prisma.shopeeVenda.findMany({
        where: { userId: session.sub, dataVenda: { gte: penultStart, lte: penultEnd }, ...paidOnly },
        select: { valorTotal: true },
        distinct: ['orderId'],
      })
    ]);

    // Buscar Despesas Operacionais em paralelo (sem depender do await Promise.all de vendas)
    const contasPagarQuery = useRange
      ? tipoVisualizacao === "caixa"
        ? { userId: session.sub, dataPagamento: { gte: start, lte: end }, status: "pago", categoria: { tipo: "DESPESA" } }
        : { userId: session.sub, OR: [{ dataCompetencia: { gte: start, lte: end } }, { dataCompetencia: null, dataVencimento: { gte: start, lte: end } }], categoria: { tipo: "DESPESA" } }
      : tipoVisualizacao === "caixa"
        ? { userId: session.sub, status: "pago", categoria: { tipo: "DESPESA" } }
        : { userId: session.sub, categoria: { tipo: "DESPESA" } };

    const contasPagar = await prisma.contaPagar.findMany({
      where: contasPagarQuery as any,
      select: { valor: true },
    });

    const despesasOperacionais = contasPagar.reduce((acc, cp) => acc + toNumber(cp.valor), 0);

    const faturamentoPrev =
      vendasMeliPenultimoMes.reduce((acc, it) => acc + toNumber(it.valorTotal), 0) +
      vendasShopeePenultimoMes.reduce((acc, it) => acc + toNumber(it.valorTotal), 0);
    const faturamentoUltimo =
      vendasMeliUltimoMes.reduce((acc, it) => acc + toNumber(it.valorTotal), 0) +
      vendasShopeeUltimoMes.reduce((acc, it) => acc + toNumber(it.valorTotal), 0);
    const faturamentoTendencia = faturamentoPrev > 0
      ? ((faturamentoUltimo - faturamentoPrev) / Math.abs(faturamentoPrev)) * 100
      : 0;

    // Separar taxas e frete por plataforma
    const mercadoLivreTaxa = taxasPorPlataforma.get("Mercado Livre") || 0;
    const shopeeTaxa = taxasPorPlataforma.get("Shopee") || 0;
    const mercadoLivreFrete = fretePorPlataforma.get("Mercado Livre") || 0;
    const shopeeFrete = fretePorPlataforma.get("Shopee") || 0;

    // Garantir que todos os valores são números válidos (não NaN, Infinity, etc)
    const safeNumber = (val: number) => {
      if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
      return val;
    };

    const response = {
      faturamentoBruto: safeNumber(faturamentoTotal),
      faturamentoTendencia: safeNumber(faturamentoTendencia),
      impostos: safeNumber(impostosTotal),
      taxasPlataformas: {
        total: safeNumber(taxasTotalAbs),
        mercadoLivre: safeNumber(mercadoLivreTaxa),
        shopee: safeNumber(shopeeTaxa),
      },
      custoFrete: {
        total: safeNumber(freteTotalLiquido),
        mercadoLivre: safeNumber(fretePorPlataforma.get("Mercado Livre") || 0),
        shopee: safeNumber(fretePorPlataforma.get("Shopee") || 0),
      },
      receitaLiquida: safeNumber(receitaLiquida), // Receita líquida após taxas e frete
      cmv: safeNumber(cmvTotal),
      lucroBruto: safeNumber(lucroBruto - (Number.isFinite(impostosTotal) ? impostosTotal : 0)),
      despesasOperacionais: safeNumber(despesasOperacionais),
      lucroLiquido: safeNumber((lucroBruto - (Number.isFinite(impostosTotal) ? impostosTotal : 0)) - despesasOperacionais),
      vendasRealizadas: safeNumber(vendasRealizadas),
      unidadesVendidas: safeNumber(unidadesVendidas),
      periodo: useRange ? { start: start.toISOString(), end: end.toISOString() } : null,
    };

    cache.set(cacheKey, response);

    return NextResponse.json(response);
  } catch (err) {
    console.error("❌ [Dashboard Stats] Erro ao calcular stats:", err);
    console.error("❌ [Dashboard Stats] Stack trace:", err instanceof Error ? err.stack : 'N/A');
    console.error("❌ [Dashboard Stats] Mensagem:", err instanceof Error ? err.message : String(err));
    
    return NextResponse.json({ 
      error: "Erro ao calcular estatísticas",
      message: err instanceof Error ? err.message : "Erro desconhecido",
      // Não enviar stack trace em produção por segurança
    }, { status: 500 });
  }
}
