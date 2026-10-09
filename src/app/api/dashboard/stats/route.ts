import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canalIncluiPlataforma, getDashboardFiltersWhere, getStatusWhere } from "@/lib/dashboard-filters";
import {
  buildPendingSkuSummary,
  filterPendingSkuSummaryBySoldSkus,
} from "@/lib/sku-pending";
import { calculateMeliFlexShipping } from "@/lib/flex-shipping";
import { loadActiveFlexShippingConfig } from "@/lib/flex-shipping-config";
import { cache, createCacheKey } from "@/lib/cache";

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
    const canalParam = url.searchParams.get("canal"); // mercado_livre | shopee | tiktok
    const statusParam = url.searchParams.get("status"); // pagos | cancelados | todos
    const tipoAnuncioParam = url.searchParams.get("tipoAnuncio"); // catalogo | proprio
    const modalidadeParam = url.searchParams.get("modalidade"); // me | full | flex
    const now = new Date();
    const accountPlatformParam = url.searchParams.get("accountPlatform"); // 'meli' | 'shopee' | 'tiktok'
    const accountIdParam = url.searchParams.get("accountId");

    // Cache em memória por usuário + combinação de filtros (TTL 60s)
    const cacheKey = createCacheKey(
      "dashboard-stats",
      session.sub,
      startParam ?? "",
      endParam ?? "",
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
    const cached = url.searchParams.has("refresh")
      ? null
      : cache.get(cacheKey, 60000);
    if (cached) {
      return NextResponse.json(cached);
    }
    // Uma invalidação durante as consultas não pode permitir que este GET lento
    // recoloque no cache a fotografia anterior ao sync/cadastro.
    const cacheGeneration = cache.getGeneration();

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
          break;
        }
        case "ultimos_7d": {
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
    // TikTok Shop não tem tipoAnuncio nem modalidade (exclusivos do ML)
    const dashboardWhereTiktok = getDashboardFiltersWhere({
      status: statusParam,
      canal: canalParam,
    });

    // Conta específica e canal formam uma INTERSEÇÃO. Sem estes guards, limpar
    // apenas o canal depois de escolher uma conta ML carregava a conta ML mais
    // todas as vendas da Shopee/TikTok, contaminando cards e SKUs pendentes.
    const accountScope =
      accountIdParam && ["meli", "shopee", "tiktok"].includes(accountPlatformParam || "")
        ? accountPlatformParam
        : null;
    const shouldLoadMeli =
      canalIncluiPlataforma(canalParam, "meli") && (!accountScope || accountScope === "meli");
    const shouldLoadShopee =
      canalIncluiPlataforma(canalParam, "shopee") && (!accountScope || accountScope === "shopee");
    const shouldLoadTiktok =
      canalIncluiPlataforma(canalParam, "tiktok") && (!accountScope || accountScope === "tiktok");

    // Helper for trend calculations (apenas vendas pagas/completas)
    const paidOnly = getStatusWhere('pagos');

    const aliquotasPromise = (async (): Promise<any[]> => {
      try {
        if (!prisma.aliquotaImposto) return [];
        return await prisma.aliquotaImposto.findMany({
          where: { userId: session.sub, ativo: true },
          orderBy: { updatedAt: "desc" },
        });
      } catch {
        console.log('[Dashboard Stats] Modelo AliquotaImposto não disponível, impostos não serão calculados');
        return [];
      }
    })();

    // Buscar vendas do Mercado Livre, Shopee e TikTok Shop em PARALELO para melhor performance
    //
    // O guard é por INCLUSÃO. O `canalParam === "shopee" ? [] : ...` de antes
    // funcionava com duas plataformas porque "não é Shopee" equivalia a "é ML";
    // com três, filtrar por `tiktok` não exclui o ML e o painel somaria Mercado
    // Livre dentro de um filtro de TikTok.
    const [
      vendasMeli,
      vendasShopee,
      vendasTiktok,
      pendingSkuSummary,
      flexConfig,
      aliquotas,
    ] = await Promise.all([
      shouldLoadMeli ? prisma.meliVenda.findMany({
        where: useRange
          ? { userId: session.sub, dataVenda: { gte: start, lte: end }, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli }
          : { userId: session.sub, ...(accountPlatformParam === 'meli' && accountIdParam ? { meliAccountId: accountIdParam } : {}), ...dashboardWhereMeli },
        select: {
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
        orderBy: { dataVenda: "desc" },
      }) : [],
      shouldLoadShopee ? prisma.shopeeVenda.findMany({
        where: useRange
          ? { userId: session.sub, dataVenda: { gte: start, lte: end }, ...(accountPlatformParam === 'shopee' && accountIdParam ? { shopeeAccountId: accountIdParam } : {}), ...dashboardWhereShopee }
          : { userId: session.sub, ...(accountPlatformParam === 'shopee' && accountIdParam ? { shopeeAccountId: accountIdParam } : {}), ...dashboardWhereShopee },
        select: {
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
        orderBy: { dataVenda: "desc" },
      }) : [],
      shouldLoadTiktok ? prisma.tiktokVenda.findMany({
        where: useRange
          ? { userId: session.sub, dataVenda: { gte: start, lte: end }, ...(accountPlatformParam === 'tiktok' && accountIdParam ? { tiktokAccountId: accountIdParam } : {}), ...dashboardWhereTiktok }
          : { userId: session.sub, ...(accountPlatformParam === 'tiktok' && accountIdParam ? { tiktokAccountId: accountIdParam } : {}), ...dashboardWhereTiktok },
        select: {
          tiktokAccountId: true,
          valorTotal: true,
          taxaPlataforma: true,
          frete: true,
          quantidade: true,
          sku: true,
          conta: true,
          plataforma: true,
          dataVenda: true,
        },
        orderBy: { dataVenda: "desc" },
      }) : [],
      buildPendingSkuSummary(session.sub),
      loadActiveFlexShippingConfig(session.sub),
      aliquotasPromise,
    ]);

    // Consolidar as vendas das plataformas incluídas no filtro de canal
    // (as excluídas já vieram como lista vazia do guard acima)
    const vendas = [...vendasMeli, ...vendasShopee, ...vendasTiktok];

    // O resumo-base continua histórico para não duplicar a varredura cara das
    // vendas. Aqui ele é recortado pelos SKUs das próprias vendas do Dashboard,
    // que já respeitam período, canal, status, conta e demais filtros acima.
    // Assim, SKU sem custo mas sem venda no filtro atual não contamina CMV/lucro.
    const pendingSkuSummaryDoDashboard = filterPendingSkuSummaryBySoldSkus(
      pendingSkuSummary,
      vendas.map((venda) => venda.sku),
    );
    // A assinatura identifica a COMPOSIÇÃO, não só a quantidade. Assim, dispensar
    // um alerta não esconde outro conjunto futuro com o mesmo total, nem mistura
    // usuários no mesmo navegador.
    const pendingSkuSignature = createHash("sha256")
      .update(session.sub)
      .update("\0")
      .update(
        pendingSkuSummaryDoDashboard.skusPendentes
          .map((entry) =>
            `${entry.sku.trim().toLocaleLowerCase("pt-BR")}:${entry.situacao}`,
          )
          .sort()
          .join("\0"),
      )
      .digest("hex");

    // Unique SKUs for CMV calculation
    const skusUnicos = Array.from(
      new Set(vendas.map((v) => v.sku).filter((s): s is string => Boolean(s)))
    );

    const costMap = await import("@/lib/sku-cost-history").then(
      ({ buildHistoricalCostMap }) =>
        buildHistoricalCostMap(session.sub, skusUnicos),
    );

    // Aggregate current period
    let faturamentoTotal = 0;
    let receitaLiquida = 0;
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

      // Flex é só do Mercado Livre: Shopee e TikTok Shop usam o frete original
      const fr =
        v.plataforma === "Shopee" || v.plataforma === "TikTok Shop"
          ? freteOriginal
          : calculateMeliFlexShipping({
              frete: freteOriginal,
              quantidade: qtd,
              logisticType: (v as any).logisticType,
              config: flexConfig,
            }).freteLiquidoFlex;

      faturamentoTotal += vt;
      receitaLiquida += vt + tp + fr;
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
    
    // Alíquotas foram carregadas em paralelo com as vendas acima.

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
          plataforma: "meli" | "shopee" | "tiktok";
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
        const isShopee = "shopeeAccountId" in v;
        const accountId = isMeli
          ? v.meliAccountId
          : isShopee
            ? v.shopeeAccountId
            : v.tiktokAccountId;
        const plataforma: "meli" | "shopee" | "tiktok" = isMeli
          ? "meli"
          : isShopee
            ? "shopee"
            : "tiktok";
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

    // Trend: faturamento do último mês vs penúltimo mês.
    // Só a soma é consumida, então o banco agrega sem materializar vendas.
    const [
      vendasMeliUltimoMes,
      vendasShopeeUltimoMes,
      vendasTiktokUltimoMes,
      vendasMeliPenultimoMes,
      vendasShopeePenultimoMes,
      vendasTiktokPenultimoMes,
    ] = await Promise.all([
      prisma.meliVenda.aggregate({
        where: { userId: session.sub, dataVenda: { gte: prevStart, lte: prevEnd }, ...paidOnly },
        _sum: { valorTotal: true },
      }),
      prisma.shopeeVenda.aggregate({
        where: { userId: session.sub, dataVenda: { gte: prevStart, lte: prevEnd }, ...paidOnly },
        _sum: { valorTotal: true },
      }),
      prisma.tiktokVenda.aggregate({
        where: { userId: session.sub, dataVenda: { gte: prevStart, lte: prevEnd }, ...paidOnly },
        _sum: { valorTotal: true },
      }),
      prisma.meliVenda.aggregate({
        where: { userId: session.sub, dataVenda: { gte: penultStart, lte: penultEnd }, ...paidOnly },
        _sum: { valorTotal: true },
      }),
      prisma.shopeeVenda.aggregate({
        where: { userId: session.sub, dataVenda: { gte: penultStart, lte: penultEnd }, ...paidOnly },
        _sum: { valorTotal: true },
      }),
      prisma.tiktokVenda.aggregate({
        where: { userId: session.sub, dataVenda: { gte: penultStart, lte: penultEnd }, ...paidOnly },
        _sum: { valorTotal: true },
      }),
    ]);

    const faturamentoPrev =
      toNumber(vendasMeliPenultimoMes._sum.valorTotal) +
      toNumber(vendasShopeePenultimoMes._sum.valorTotal) +
      toNumber(vendasTiktokPenultimoMes._sum.valorTotal);
    const faturamentoUltimo =
      toNumber(vendasMeliUltimoMes._sum.valorTotal) +
      toNumber(vendasShopeeUltimoMes._sum.valorTotal) +
      toNumber(vendasTiktokUltimoMes._sum.valorTotal);
    const faturamentoTendencia = faturamentoPrev > 0
      ? ((faturamentoUltimo - faturamentoPrev) / Math.abs(faturamentoPrev)) * 100
      : 0;

    // Separar taxas e frete por plataforma
    const mercadoLivreTaxa = taxasPorPlataforma.get("Mercado Livre") || 0;
    const shopeeTaxa = taxasPorPlataforma.get("Shopee") || 0;
    const tiktokTaxa = taxasPorPlataforma.get("TikTok Shop") || 0;
    const mercadoLivreFrete = fretePorPlataforma.get("Mercado Livre") || 0;
    const shopeeFrete = fretePorPlataforma.get("Shopee") || 0;
    const tiktokFrete = fretePorPlataforma.get("TikTok Shop") || 0;

    // Garantir que todos os valores são números válidos (não NaN, Infinity, etc)
    const safeNumber = (val: number) => {
      if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
      return val;
    };

    const response = {
      faturamentoTotal: safeNumber(faturamentoTotal),
      faturamentoTendencia: safeNumber(faturamentoTendencia),
      impostos: safeNumber(impostosTotal),
      taxasPlataformas: {
        total: safeNumber(taxasTotalAbs),
        mercadoLivre: safeNumber(mercadoLivreTaxa),
        shopee: safeNumber(shopeeTaxa),
        tiktok: safeNumber(tiktokTaxa),
      },
      custoFrete: {
        total: safeNumber(freteTotalLiquido),
        mercadoLivre: safeNumber(mercadoLivreFrete),
        shopee: safeNumber(shopeeFrete),
        tiktok: safeNumber(tiktokFrete),
      },
      margemContribuicao: safeNumber(receitaLiquida), // Receita líquida após taxas e frete
      cmv: safeNumber(cmvTotal),
      lucroBruto: safeNumber(lucroBruto - (Number.isFinite(impostosTotal) ? impostosTotal : 0)),
      vendasRealizadas: safeNumber(vendasRealizadas),
      unidadesVendidas: safeNumber(unidadesVendidas),
      skusSemCusto: safeNumber(pendingSkuSummaryDoDashboard.total),
      semCusto: safeNumber(pendingSkuSummaryDoDashboard.semCusto),
      naoCadastrados: safeNumber(pendingSkuSummaryDoDashboard.naoCadastrados),
      pendingSkuSignature,
      periodo: useRange ? { start: start.toISOString(), end: end.toISOString() } : null,
    };

    cache.setIfGeneration(cacheKey, response, cacheGeneration);

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
