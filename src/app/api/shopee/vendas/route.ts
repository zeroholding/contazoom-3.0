import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cache, createCacheKey } from "@/lib/cache";
import {
  calculateShopeeFinancials,
  SHOPEE_FINANCIAL_RULE_VERSION,
} from "@/lib/shopee-finance";

export const runtime = "nodejs";

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function GET(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    // === Paginação OPT-IN ===
    // Se `page` ou `limit` vierem na query string, ativamos paginação server-side
    // (skip/take + count). Caso contrário, mantemos o comportamento atual de
    // retornar TODAS as vendas do usuário — necessário porque o front faz
    // filtros/ordenação/contagens client-side com a lista completa.
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
      // Limitar `limit` entre 1 e 200 para proteger o servidor
      limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 200)
          : 50;
    }

    // Verificar cache primeiro (TTL de 5 minutos)
    // A chave inclui page/limit para não misturar resposta paginada com a completa.
    const cacheKey = createCacheKey(
      "vendas-shopee",
      session.sub,
      SHOPEE_FINANCIAL_RULE_VERSION,
      isPaginated ? `p${page}-l${limit}` : "all",
    );
    const cachedData = cache.get<any>(cacheKey, 300000);
    
    if (cachedData) {
      console.log(`[Cache Hit] Retornando vendas do Shopee do cache`);
      return NextResponse.json(cachedData, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    }

    const where = { userId: session.sub };

    // Contagem total (mesmo where). Só é necessária no modo paginado para montar
    // a metadata de paginação; no modo completo usamos vendas.length.
    const totalCount = isPaginated
      ? await prisma.shopeeVenda.count({ where })
      : 0;

    // Buscar vendas Shopee do usuário.
    // - Modo completo (default): TODAS as vendas (sem filtro de 6 meses, igual ML).
    // - Modo paginado (opt-in): apenas a página solicitada via skip/take.
    const vendas = await prisma.shopeeVenda.findMany({
      where,
      ...(isPaginated ? { skip: (page - 1) * limit, take: limit } : {}),
      select: {
        id: true,
        orderId: true,
        dataVenda: true,
        status: true,
        conta: true,
        shopeeAccountId: true,
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
        logisticType: true,
        envioMode: true,
        shippingStatus: true,
        shippingId: true,
        paymentMethod: true,
        paymentStatus: true,
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

    // === RECÁLCULO DE CMV + MARGEM (espelhando ML GET route) ===
    // Buscar SKUs únicos para construir mapa de custo histórico
    const skusUnicos = Array.from(
      new Set(vendas.map((v) => v.sku).filter(Boolean) as string[]),
    );

    const { buildHistoricalCostMap } = await import("@/lib/sku-cost-history");
    const costMap = await buildHistoricalCostMap(session.sub, skusUnicos);

    // Mapear vendas com recálculo dinâmico de TODOS os valores financeiros a partir do rawData
    const vendasFormatted = vendas.map((venda) => {
      // CMV: buscar custo histórico do SKU na data da venda
      let cmv: number | null = null;
      if (venda.sku) {
        const custoUnitario = costMap.getCostAtDate(venda.sku, venda.dataVenda);
        if (custoUnitario > 0) {
          cmv = roundCurrency(custoUnitario * venda.quantidade);
        }
      }

      // === RECÁLCULO A PARTIR DO rawData + paymentDetails (escrow/order_income) ===
      const rawData = venda.rawData as any;
      const paymentDetails = venda.paymentDetails as any || {};
      const financials = calculateShopeeFinancials(rawData, {
        valorTotal: Number(venda.valorTotal),
        unitario: Number(venda.unitario),
        quantidade: venda.quantidade,
        taxaPlataforma: venda.taxaPlataforma ? Number(venda.taxaPlataforma) : null,
        frete: Number(venda.frete),
        paymentDetails,
      });
      const valorTotal = financials.effectiveProductSubtotal;
      const unitario = financials.unitPrice;
      const taxaPlataforma = financials.platformFee ?? 0;
      const frete = financials.freight;

      // Margem: recalcular com CMV
      let margemContribuicao: number;
      let isMargemReal: boolean;
      if (cmv !== null && cmv > 0) {
        margemContribuicao = roundCurrency(valorTotal + taxaPlataforma + frete - cmv);
        isMargemReal = true;
      } else {
        margemContribuicao = roundCurrency(valorTotal + taxaPlataforma + frete);
        isMargemReal = false;
      }

      // Montar paymentDetails com breakdown para tooltips
      const enrichedPaymentDetails = {
        ...paymentDetails,
        financialRuleVersion: SHOPEE_FINANCIAL_RULE_VERSION,
        productValueBreakdown: financials.paymentBreakdown,
        platformFeeBreakdown: {
          commission_fee: financials.paymentBreakdown.commission_fee,
          service_fee: financials.paymentBreakdown.service_fee,
          outros_encargos: financials.paymentBreakdown.outros_encargos,
          ignored_as_platform_fee:
            financials.paymentBreakdown.ignored_as_platform_fee,
        }
      };

      // Montar shipmentDetails com breakdown para tooltips
      const rawShipmentDetails = venda.shipmentDetails as any || {};
      const enrichedShipmentDetails = {
        ...rawShipmentDetails,
        actual_shipping_fee: financials.shipmentBreakdown.actual_shipping_fee,
        reverse_shipping_fee: financials.shipmentBreakdown.reverse_shipping_fee,
        shopee_shipping_rebate:
          financials.shipmentBreakdown.shopee_shipping_rebate,
        buyer_paid_shipping_fee:
          financials.shipmentBreakdown.buyer_paid_shipping_fee,
        shipping_fee_discount_from_3pl:
          financials.shipmentBreakdown.shipping_fee_discount_from_3pl,
        custo_vendedor_frete:
          financials.shipmentBreakdown.custo_vendedor_frete,
      };

      return {
        id: venda.orderId,
        dataVenda: venda.dataVenda.toISOString(),
        status: venda.status,
        conta: venda.conta,
        shopeeAccountId: venda.shopeeAccountId,
        valorTotal,
        quantidade: venda.quantidade,
        unitario,
        taxaPlataforma,
        frete,
        freteAjuste: venda.freteAjuste ? Number(venda.freteAjuste) : null,
        cmv,
        margemContribuicao,
        isMargemReal,
        titulo: venda.titulo,
        sku: venda.sku,
        comprador: venda.comprador,
        logisticType: venda.logisticType,
        envioMode: venda.envioMode,
        shippingStatus: venda.shippingStatus,
        shippingId: venda.shippingId,
        paymentMethod: venda.paymentMethod,
        paymentStatus: venda.paymentStatus,
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
        shipmentDetails: enrichedShipmentDetails,
        paymentDetails: enrichedPaymentDetails,
        raw: venda.rawData,
        preco: valorTotal,
      };
    });

    // No modo paginado, `total` reflete a contagem completa no banco (mesmo where);
    // no modo completo, é o tamanho da lista retornada (comportamento original).
    const total = isPaginated ? totalCount : vendas.length;

    console.log(`[Shopee API] ✅ Retornando ${vendasFormatted.length} vendas (total no banco: ${total})`);

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
      lastSync:
        vendas.length > 0 ? vendas[0].sincronizadoEm.toISOString() : null,
      financialRuleVersion: SHOPEE_FINANCIAL_RULE_VERSION,
    };

    // Metadata de paginação apenas quando o modo paginado está ativo.
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

    // Armazenar no cache
    cache.set(cacheKey, response);
    console.log(`[Cache Miss] Vendas do Shopee salvas no cache`);

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Erro ao buscar vendas Shopee:", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
}
