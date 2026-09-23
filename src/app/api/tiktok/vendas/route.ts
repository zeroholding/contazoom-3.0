/**
 * GET /api/tiktok/vendas
 *
 * Vendas do TikTok Shop do usuário logado, no MESMO formato das rotas de ML e
 * Shopee (as telas consomem os três com o mesmo componente).
 *
 * Igual às outras: paginação OPT-IN (sem `page`/`limit` devolve tudo, porque o
 * front faz filtro e ordenação com a lista completa) e recálculo do financeiro na
 * LEITURA a partir do `rawData` — é o que permite corrigir a regra financeira sem
 * reprocessar o banco.
 *
 * Diferença própria do TikTok: `isMargemReal` NÃO é derivado da existência de
 * CMV, como na Shopee. Aqui ele significa "o extrato já confirmou o valor
 * liquidado", e vem gravado pelo passo 2 do sync. Sobrescrevê-lo com base no CMV
 * apagaria a única informação que distingue faturamento projetado de faturamento
 * confirmado.
 */
import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cache, createCacheKey } from "@/lib/cache";
import {
  applyTiktokSettlement,
  calculateTiktokEstimatedFinancials,
  roundCurrency,
  TIKTOK_FINANCIAL_RULE_VERSION,
} from "@/lib/tiktok-finance";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get("page");
    const limitParam = url.searchParams.get("limit");
    const isPaginated = pageParam !== null || limitParam !== null;

    let page = 1;
    let limit = 50;
    if (isPaginated) {
      const parsedPage = Number.parseInt(pageParam ?? "1", 10);
      const parsedLimit = Number.parseInt(limitParam ?? "50", 10);
      page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 200)
          : 50;
    }

    const cacheKey = createCacheKey(
      "vendas-tiktok",
      session.sub,
      TIKTOK_FINANCIAL_RULE_VERSION,
      isPaginated ? `p${page}-l${limit}` : "all",
    );
    const cachedData = cache.get<unknown>(cacheKey, 300000);
    if (cachedData) {
      console.log("[Cache Hit] Retornando vendas do TikTok Shop do cache");
      return NextResponse.json(cachedData, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    }

    const where = { userId: session.sub };

    const totalCount = isPaginated ? await prisma.tiktokVenda.count({ where }) : 0;

    const vendas = await prisma.tiktokVenda.findMany({
      where,
      ...(isPaginated ? { skip: (page - 1) * limit, take: limit } : {}),
      select: {
        id: true,
        orderId: true,
        dataVenda: true,
        status: true,
        conta: true,
        tiktokAccountId: true,
        valorTotal: true,
        quantidade: true,
        unitario: true,
        taxaPlataforma: true,
        frete: true,
        freteAjuste: true,
        cmv: true,
        margemContribuicao: true,
        isMargemReal: true,
        titulo: true,
        sku: true,
        comprador: true,
        itemId: true,
        logisticType: true,
        envioMode: true,
        shippingStatus: true,
        shippingId: true,
        prazoDespacho: true,
        latitude: true,
        longitude: true,
        plataforma: true,
        canal: true,
        tags: true,
        internalTags: true,
        sincronizadoEm: true,
        paymentDetails: true,
        shipmentDetails: true,
        rawData: true,
      },
      orderBy: { dataVenda: "desc" },
    });

    const skusUnicos = Array.from(
      new Set(vendas.map((v) => v.sku).filter(Boolean) as string[]),
    );

    const { buildHistoricalCostMap } = await import("@/lib/sku-cost-history");
    const costMap = await buildHistoricalCostMap(session.sub, skusUnicos);

    const vendasFormatted = vendas.map((venda) => {
      let cmv: number | null = null;
      if (venda.sku) {
        const custoUnitario = costMap.getCostAtDate(venda.sku, venda.dataVenda);
        if (custoUnitario > 0) {
          cmv = roundCurrency(custoUnitario * venda.quantidade);
        }
      }

      const paymentDetails = (venda.paymentDetails as Record<string, unknown>) ?? {};

      /*
       * Recálculo na leitura, em dois tempos, igual ao que o sync faz:
       *
       *   1. estimado a partir do pedido cru (`rawData`);
       *   2. se o extrato já estiver guardado em `paymentDetails.statement`,
       *      aplica o real por cima.
       *
       * Sem o passo 2, uma venda JÁ LIQUIDADA voltaria ao valor estimado a cada
       * leitura — e a comissão de afiliado, que só existe no extrato,
       * desapareceria da tela.
       */
      const raw = (venda.rawData as Record<string, unknown>) ?? {};
      const estimado = calculateTiktokEstimatedFinancials(raw);
      const statement =
        (paymentDetails.statement as Record<string, unknown> | undefined) ?? null;
      const real = statement ? applyTiktokSettlement(estimado, statement) : null;
      const financials = real ?? estimado;

      const valorTotal = financials.effectiveProductSubtotal;
      const unitario = financials.unitPrice;
      const taxaPlataforma = financials.platformFee;
      const frete = financials.freight;

      const temCmv = cmv !== null && cmv > 0;
      const margemContribuicao = temCmv
        ? roundCurrency(valorTotal + taxaPlataforma + frete - cmv!)
        : roundCurrency(valorTotal + taxaPlataforma + frete);

      const enrichedPaymentDetails = {
        ...paymentDetails,
        ...financials.breakdown,
        financialRuleVersion: TIKTOK_FINANCIAL_RULE_VERSION,
        platformFeeBreakdown: {
          sfp_service_fee: financials.breakdown.sfp_service_fee ?? null,
          per_item_fee_total: financials.breakdown.per_item_fee_total ?? null,
          affiliate_commission: financials.breakdown.affiliate_commission ?? null,
        },
      };

      return {
        id: venda.orderId,
        dataVenda: venda.dataVenda.toISOString(),
        status: venda.status,
        conta: venda.conta,
        tiktokAccountId: venda.tiktokAccountId,
        valorTotal,
        quantidade: venda.quantidade,
        unitario,
        taxaPlataforma,
        frete,
        freteAjuste: venda.freteAjuste ? Number(venda.freteAjuste) : null,
        cmv,
        margemContribuicao,
        // Mesmo significado que em ML e Shopee: a margem embute o custo real do
        // produto. A tabela da tela lê as três plataformas com este campo.
        isMargemReal: temCmv,
        // O estado de LIQUIDAÇÃO é outra coisa: enquanto o pedido não liquida, a
        // taxa é estimada e a comissão de afiliado nem existe no payload.
        financeiroLiquidado: financials.isReal,
        titulo: venda.titulo,
        sku: venda.sku,
        comprador: venda.comprador,
        itemId: venda.itemId,
        logisticType: venda.logisticType,
        envioMode: venda.envioMode,
        shippingStatus: venda.shippingStatus,
        shippingId: venda.shippingId,
        prazoDespacho: venda.prazoDespacho ? venda.prazoDespacho.toISOString() : null,
        // Campos que só existem no ML. Vão nulos para a tabela unificada não
        // precisar saber de qual plataforma a linha veio.
        exposicao: null,
        tipoAnuncio: null,
        ads: null,
        plataforma: venda.plataforma,
        canal: venda.canal,
        tags: venda.tags,
        internalTags: venda.internalTags,
        latitude:
          venda.latitude !== null && venda.latitude !== undefined
            ? Number(venda.latitude)
            : null,
        longitude:
          venda.longitude !== null && venda.longitude !== undefined
            ? Number(venda.longitude)
            : null,
        shipmentDetails: venda.shipmentDetails,
        paymentDetails: enrichedPaymentDetails,
        raw: venda.rawData,
        preco: valorTotal,
      };
    });

    const total = isPaginated ? totalCount : vendas.length;

    console.log(
      `[TikTok API] Retornando ${vendasFormatted.length} vendas (total no banco: ${total})`,
    );

    const response: {
      vendas: typeof vendasFormatted;
      total: number;
      lastSync: string | null;
      financialRuleVersion: string;
      pagination?: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
      };
    } = {
      vendas: vendasFormatted,
      total,
      lastSync: vendas.length > 0 ? vendas[0].sincronizadoEm.toISOString() : null,
      financialRuleVersion: TIKTOK_FINANCIAL_RULE_VERSION,
    };

    if (isPaginated) {
      const totalPages = Math.max(1, Math.ceil(total / limit));
      response.pagination = {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      };
    }

    cache.set(cacheKey, response);

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Erro ao buscar vendas TikTok Shop:", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
}
