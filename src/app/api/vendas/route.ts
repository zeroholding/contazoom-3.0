import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import { cache, createCacheKey } from "@/lib/cache";
import {
  calculateShopeeFinancials,
  SHOPEE_FINANCIAL_RULE_VERSION,
} from "@/lib/shopee-finance";
import {
  calculateMeliFlexShipping,
  flexConfigVersion,
} from "@/lib/flex-shipping";
import { loadActiveFlexShippingConfig } from "@/lib/flex-shipping-config";
import {
  applyTiktokSettlement,
  calculateTiktokEstimatedFinancials,
  TIKTOK_FINANCIAL_RULE_VERSION,
} from "@/lib/tiktok-finance";

export const runtime = "nodejs";

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

type JsonRecord = Record<string, unknown>;

type OrderItem = {
  item?: {
    listing_type_id?: string | null;
  } | null;
};

type RawDataWithOrder = JsonRecord & {
  order?: JsonRecord;
  freight?: JsonRecord;
  shipment?: JsonRecord | null;
};

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const flexConfig = await loadActiveFlexShippingConfig(session.sub);
    // A versão de regra de CADA plataforma entra na chave: sem a do TikTok, uma
    // correção na regra dele continuaria servindo o número antigo do cache até o
    // TTL vencer.
    const cacheKey = createCacheKey(
      "vendas-geral",
      session.sub,
      SHOPEE_FINANCIAL_RULE_VERSION,
      TIKTOK_FINANCIAL_RULE_VERSION,
      flexConfigVersion(flexConfig),
    );
    const cachedData = cache.get<any>(cacheKey, 300000);
    
    if (cachedData) {
      console.log(`[Cache Hit] Retornando vendas gerais do cache`);
      return NextResponse.json(cachedData, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    }

    // Calcular data de início: 6 meses atrás (alinhado com ML e Shopee)
    const hoje = new Date();
    const dataInicio = new Date(hoje);
    dataInicio.setMonth(dataInicio.getMonth() - 6); // Voltar 6 meses
    
    console.log(`[Vendas Gerais] Filtrando vendas a partir de: ${dataInicio.toISOString()}`);
    console.log(`[Vendas Gerais] Buscando vendas para userId: ${session.sub}`);

    // Buscar vendas das três plataformas em PARALELO para melhor performance
    const [vendasMeli, vendasShopee, vendasTiktok] = await Promise.all([
      prisma.meliVenda.findMany({
        where: { 
          userId: session.sub,
          dataVenda: {
            gte: dataInicio, // Filtrar vendas >= data de início (últimos 6 meses)
          }
        },
        select: {
          orderId: true,
          dataVenda: true,
          status: true,
          conta: true,
          meliAccountId: true,
          valorTotal: true,
          quantidade: true,
          unitario: true,
          taxaPlataforma: true,
          frete: true,
          freteAjuste: true,
          cmv: true,
          titulo: true,
          sku: true,
          comprador: true,
          logisticType: true,
          envioMode: true,
          shippingStatus: true,
          shippingId: true,
          exposicao: true,
          tipoAnuncio: true,
          ads: true,
          plataforma: true,
          canal: true,
          tags: true,
          internalTags: true,
          latitude: true,
          longitude: true,
          rawData: true,
          sincronizadoEm: true,
          meliAccount: {
            select: { nickname: true, ml_user_id: true },
          },
        },
        orderBy: { dataVenda: "desc" },
      }),
      prisma.shopeeVenda.findMany({
        where: { 
          userId: session.sub,
          dataVenda: {
            gte: dataInicio, // Filtrar vendas >= data de início (últimos 6 meses)
          }
        },
        select: {
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
          titulo: true,
          sku: true,
          comprador: true,
          logisticType: true,
          envioMode: true,
          shippingStatus: true,
          shippingId: true,
          plataforma: true,
          canal: true,
          tags: true,
          internalTags: true,
          sincronizadoEm: true,
          latitude: true,
          longitude: true,
          paymentDetails: true,
          shipmentDetails: true,
          rawData: true,
        },
        orderBy: { dataVenda: "desc" },
      }),
      prisma.tiktokVenda.findMany({
        where: {
          userId: session.sub,
          dataVenda: {
            gte: dataInicio, // Filtrar vendas >= data de início (últimos 6 meses)
          }
        },
        select: {
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
          titulo: true,
          sku: true,
          comprador: true,
          logisticType: true,
          envioMode: true,
          shippingStatus: true,
          shippingId: true,
          plataforma: true,
          canal: true,
          tags: true,
          internalTags: true,
          sincronizadoEm: true,
          latitude: true,
          longitude: true,
          paymentDetails: true,
          shipmentDetails: true,
          rawData: true,
        },
        orderBy: { dataVenda: "desc" },
      })
    ]);

    console.log(`[Vendas Gerais] ✅ Mercado Livre: ${vendasMeli.length} vendas encontradas`);
    console.log(`[Vendas Gerais] ✅ Shopee: ${vendasShopee.length} vendas encontradas`);
    console.log(`[Vendas Gerais] ✅ TikTok Shop: ${vendasTiktok.length} vendas encontradas`);

    // Buscar SKUs únicos para cálculo de CMV
    const skusUnicos = Array.from(
      new Set([
        ...vendasMeli.map((v) => v.sku).filter(Boolean) as string[],
        ...vendasShopee.map((v) => v.sku).filter(Boolean) as string[],
        ...vendasTiktok.map((v) => v.sku).filter(Boolean) as string[],
      ]),
    );

    const { buildHistoricalCostMap } = await import("@/lib/sku-cost-history");
    const costMap = await buildHistoricalCostMap(session.sub, skusUnicos);

    // Formatar vendas do Mercado Livre
    const vendasMeliFormatted = vendasMeli.map((venda) => {
      let cmv: number | null = null;
      if (venda.sku) {
        const custoUnitario = costMap.getCostAtDate(venda.sku, venda.dataVenda);
        if (custoUnitario > 0) {
          cmv = roundCurrency(custoUnitario * venda.quantidade);
        }
      }

      const valorTotal = Number(venda.valorTotal);
      const taxaPlataforma = venda.taxaPlataforma
        ? Number(venda.taxaPlataforma)
        : 0;
      const frete = Number(venda.frete);
      const flex = calculateMeliFlexShipping({
        frete,
        quantidade: venda.quantidade,
        logisticType: venda.logisticType,
        config: flexConfig,
      });

      let margemContribuicao: number;
      let isMargemReal: boolean;
      if (cmv !== null && cmv > 0) {
        margemContribuicao = roundCurrency(
          valorTotal + taxaPlataforma + flex.freteLiquidoFlex - cmv,
        );
        isMargemReal = true;
      } else {
        margemContribuicao = roundCurrency(
          valorTotal + taxaPlataforma + flex.freteLiquidoFlex,
        );
        isMargemReal = false;
      }

      const rawData =
        venda.rawData && typeof venda.rawData === "object"
          ? (venda.rawData as RawDataWithOrder)
          : null;

      const freightData =
        rawData && rawData.freight && typeof rawData.freight === "object"
          ? (rawData.freight as JsonRecord)
          : {};

      const shipmentData =
        rawData && rawData.shipment && typeof rawData.shipment === "object"
          ? (rawData.shipment as JsonRecord)
          : null;

      const receiverAddress =
        shipmentData &&
        typeof (shipmentData as JsonRecord).receiver_address === "object"
          ? ((shipmentData as JsonRecord).receiver_address as JsonRecord)
          : null;

      const rawOrder =
        rawData && rawData.order && typeof rawData.order === "object"
          ? (rawData.order as JsonRecord)
          : null;

      let orderItems: OrderItem[] = [];
      if (rawOrder && "order_items" in rawOrder) {
        const maybeItems = (rawOrder as { order_items?: unknown }).order_items;
        if (Array.isArray(maybeItems)) {
          orderItems = maybeItems.filter(
            (entry): entry is OrderItem =>
              typeof entry === "object" && entry !== null,
          );
        }
      }

      const firstOrderItem = orderItems[0] ?? null;
      const listingTypeId =
        firstOrderItem && typeof firstOrderItem === "object"
          ? ((firstOrderItem.item?.listing_type_id as string | undefined) ??
            null)
          : null;

      return {
        id: venda.orderId,
        dataVenda: venda.dataVenda.toISOString(),
        status: venda.status,
        conta: venda.conta,
        meliAccountId: venda.meliAccountId,
        valorTotal,
        quantidade: venda.quantidade,
        unitario: Number(venda.unitario),
        taxaPlataforma: venda.taxaPlataforma
          ? Number(venda.taxaPlataforma)
          : null,
        frete,
        freteAjuste: venda.freteAjuste ? Number(venda.freteAjuste) : null,
        cmv,
        margemContribuicao,
        isMargemReal,
        // O ML fecha o repasse junto com o pedido, então não existe estado
        // "estimado" a acompanhar. Ver o campo em TikTok Shop.
        financeiroLiquidado: true,
        titulo: venda.titulo,
        sku: venda.sku,
        comprador: venda.comprador,
        logisticType: venda.logisticType,
        envioMode: venda.envioMode,
        shippingStatus: venda.shippingStatus,
        shippingId: venda.shippingId,
        exposicao: venda.exposicao,
        tipoAnuncio: venda.tipoAnuncio,
        ads: venda.ads,
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
        raw: {
          listing_type_id: listingTypeId,
          tags: venda.tags,
          internal_tags: venda.internalTags,
        },
        preco: valorTotal,
        shipping: freightData,
        shipment: shipmentData,
        receiverAddress,
        sincronizadoEm: venda.sincronizadoEm.toISOString(),
      };
    });

    // Formatar vendas do Shopee
    const vendasShopeeFormatted = vendasShopee.map((venda) => {
      let cmv: number | null = null;
      if (venda.sku) {
        const custoUnitario = costMap.getCostAtDate(venda.sku, venda.dataVenda);
        if (custoUnitario > 0) {
          cmv = roundCurrency(custoUnitario * venda.quantidade);
        }
      }

      const rawData = venda.rawData as any;
      const paymentDetails = (venda as any).paymentDetails || {};
      const financials = calculateShopeeFinancials(rawData, {
        valorTotal: Number(venda.valorTotal),
        unitario: Number(venda.unitario),
        quantidade: venda.quantidade,
        taxaPlataforma: venda.taxaPlataforma ? Number(venda.taxaPlataforma) : null,
        frete: Number(venda.frete),
        paymentDetails,
      });

      const valorTotal = financials.effectiveProductSubtotal;
      const taxaPlataforma = financials.platformFee ?? 0;
      const frete = financials.freight;

      let margemContribuicao: number;
      let isMargemReal: boolean;
      if (cmv !== null && cmv > 0) {
        margemContribuicao = roundCurrency(
          valorTotal + taxaPlataforma + frete - cmv,
        );
        isMargemReal = true;
      } else {
        margemContribuicao = roundCurrency(valorTotal + taxaPlataforma + frete);
        isMargemReal = false;
      }

      return {
        id: venda.orderId,
        dataVenda: venda.dataVenda.toISOString(),
        status: venda.status,
        conta: venda.conta,
        valorTotal,
        quantidade: venda.quantidade,
        unitario: financials.unitPrice,
        taxaPlataforma: financials.platformFee,
        frete,
        freteAjuste: venda.freteAjuste ? Number(venda.freteAjuste) : null,
        receitaFlex: null,
        custoFlex: null,
        freteLiquidoFlex: null,
        cobrancasFlex: null,
        flexConfigApplied: false,
        cmv,
        margemContribuicao,
        isMargemReal,
        // O escrow da Shopee já é o valor final do repasse, então não existe
        // estado "estimado" a acompanhar. Ver o campo em TikTok Shop.
        financeiroLiquidado: true,
        titulo: venda.titulo,
        sku: venda.sku,
        comprador: venda.comprador,
        logisticType: venda.logisticType,
        envioMode: venda.envioMode,
        shippingStatus: venda.shippingStatus,
        shippingId: venda.shippingId,
        exposicao: null, // Shopee não tem exposição
        tipoAnuncio: null, // Shopee não tem tipo de anúncio
        ads: null, // Shopee não tem ADS
        plataforma: venda.plataforma,
        canal: venda.canal,
        tags: venda.tags,
        internalTags: venda.internalTags,
        latitude: venda.latitude !== null && venda.latitude !== undefined
          ? Number(venda.latitude)
          : null,
        longitude: venda.longitude !== null && venda.longitude !== undefined
          ? Number(venda.longitude)
          : null,
        raw: {
          listing_type_id: null,
          tags: venda.tags,
          internal_tags: venda.internalTags,
          paymentDetails: {
            ...paymentDetails,
            financialRuleVersion: SHOPEE_FINANCIAL_RULE_VERSION,
            productValueBreakdown: financials.paymentBreakdown,
            platformFeeBreakdown: {
              commission_fee: financials.paymentBreakdown.commission_fee,
              service_fee: financials.paymentBreakdown.service_fee,
              outros_encargos: financials.paymentBreakdown.outros_encargos,
              ignored_as_platform_fee:
                financials.paymentBreakdown.ignored_as_platform_fee,
            },
          },
          shipmentDetails: {
            ...((venda as any).shipmentDetails || {}),
            ...financials.shipmentBreakdown,
          },
        },
        paymentDetails: {
          ...paymentDetails,
          financialRuleVersion: SHOPEE_FINANCIAL_RULE_VERSION,
          productValueBreakdown: financials.paymentBreakdown,
          platformFeeBreakdown: {
            commission_fee: financials.paymentBreakdown.commission_fee,
            service_fee: financials.paymentBreakdown.service_fee,
            outros_encargos: financials.paymentBreakdown.outros_encargos,
            ignored_as_platform_fee:
              financials.paymentBreakdown.ignored_as_platform_fee,
          },
        },
        shipmentDetails: {
          ...((venda as any).shipmentDetails || {}),
          ...financials.shipmentBreakdown,
        },
        preco: valorTotal,
        shipping: {},
        shipment: null,
        receiverAddress: null,
        sincronizadoEm: venda.sincronizadoEm.toISOString(),
      };
    });

    // Formatar vendas do TikTok Shop
    const vendasTiktokFormatted = vendasTiktok.map((venda) => {
      let cmv: number | null = null;
      if (venda.sku) {
        const custoUnitario = costMap.getCostAtDate(venda.sku, venda.dataVenda);
        if (custoUnitario > 0) {
          cmv = roundCurrency(custoUnitario * venda.quantidade);
        }
      }

      const rawData = (venda.rawData as Record<string, unknown>) ?? {};
      const paymentDetails = (venda.paymentDetails as Record<string, unknown>) ?? {};

      /*
       * Dois tempos, igual à rota `/api/tiktok/vendas`: estimado a partir do
       * pedido cru e, se o extrato já estiver guardado, o real por cima. Sem o
       * segundo passo uma venda JÁ LIQUIDADA voltaria ao valor estimado aqui, e o
       * consolidado divergiria da tela do TikTok justamente nos pedidos com
       * comissão de afiliado — que só existe no extrato.
       */
      const estimado = calculateTiktokEstimatedFinancials(rawData);
      const statement =
        (paymentDetails.statement as Record<string, unknown> | undefined) ?? null;
      const financials = (statement ? applyTiktokSettlement(estimado, statement) : null) ?? estimado;

      const valorTotal = financials.effectiveProductSubtotal;
      const taxaPlataforma = financials.platformFee;
      // Sempre 0 no Programa de Frete: o frete não é custo do vendedor, ele já
      // está dentro dos 6% de SFP que entram em `taxaPlataforma`.
      const frete = financials.freight;

      const temCmv = cmv !== null && cmv > 0;
      const margemContribuicao = temCmv
        ? roundCurrency(valorTotal + taxaPlataforma + frete - cmv!)
        : roundCurrency(valorTotal + taxaPlataforma + frete);

      const paymentDetailsEnriquecido = {
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
        valorTotal,
        quantidade: venda.quantidade,
        unitario: financials.unitPrice,
        taxaPlataforma,
        frete,
        freteAjuste: venda.freteAjuste ? Number(venda.freteAjuste) : null,
        receitaFlex: null,
        custoFlex: null,
        freteLiquidoFlex: null,
        cobrancasFlex: null,
        flexConfigApplied: false,
        cmv,
        margemContribuicao,
        /*
         * `isMargemReal` segue o significado que ML e Shopee já dão nesta rota:
         * "a margem embute o custo real do produto". Manter igual importa porque a
         * mesma tabela na tela lê as três plataformas com este campo.
         */
        isMargemReal: temCmv,
        /*
         * O estado de LIQUIDAÇÃO é outra coisa, e é exclusividade do TikTok:
         * enquanto o pedido não liquida, a taxa da plataforma é estimada e a
         * comissão de afiliado nem existe no payload. ML e Shopee já entregam
         * número final na primeira leitura, então para eles isto é sempre `true`.
         *
         * Campo separado, e não um segundo sentido para `isMargemReal`, porque os
         * dois podem divergir: um pedido liquidado sem custo cadastrado tem
         * financeiro confirmado e margem incompleta.
         */
        financeiroLiquidado: financials.isReal,
        titulo: venda.titulo,
        sku: venda.sku,
        comprador: venda.comprador,
        logisticType: venda.logisticType,
        envioMode: venda.envioMode,
        shippingStatus: venda.shippingStatus,
        shippingId: venda.shippingId,
        exposicao: null, // TikTok Shop não tem exposição
        tipoAnuncio: null, // TikTok Shop não tem tipo de anúncio
        ads: null, // TikTok Shop não tem ADS
        plataforma: venda.plataforma,
        canal: venda.canal,
        tags: venda.tags,
        internalTags: venda.internalTags,
        latitude: venda.latitude !== null && venda.latitude !== undefined
          ? Number(venda.latitude)
          : null,
        longitude: venda.longitude !== null && venda.longitude !== undefined
          ? Number(venda.longitude)
          : null,
        raw: {
          listing_type_id: null,
          tags: venda.tags,
          internal_tags: venda.internalTags,
          paymentDetails: paymentDetailsEnriquecido,
          shipmentDetails: venda.shipmentDetails ?? {},
        },
        paymentDetails: paymentDetailsEnriquecido,
        shipmentDetails: venda.shipmentDetails ?? {},
        preco: valorTotal,
        shipping: {},
        shipment: null,
        receiverAddress: null,
        sincronizadoEm: venda.sincronizadoEm.toISOString(),
      };
    });

    // Combinar e ordenar todas as vendas por data
    const todasVendas = [
      ...vendasMeliFormatted,
      ...vendasShopeeFormatted,
      ...vendasTiktokFormatted,
    ].sort(
      (a, b) => new Date(b.dataVenda).getTime() - new Date(a.dataVenda).getTime()
    );

    /*
     * Última sincronização geral: a mais recente entre as plataformas.
     *
     * Virou redução em vez da cadeia de `if/else if`: com duas fontes a cadeia
     * tinha três ramos, com três teria sete, e o ramo que falta é invisível —
     * produz uma data velha, não um erro.
     */
    const ultimaSyncGeral = [
      vendasMeli[0]?.sincronizadoEm,
      vendasShopee[0]?.sincronizadoEm,
      vendasTiktok[0]?.sincronizadoEm,
    ].reduce<Date | null>(
      (maior, atual) => (atual && (!maior || atual > maior) ? atual : maior),
      null,
    );

    /*
     * Consolidar e deduplicar vendas.
     *
     * A chave é CANAL + orderId, não o orderId solto. `order_id` é `@unique` em
     * cada tabela, então duplicata dentro de uma plataforma não existe — o único
     * caso em que um Set global de orderId disparava era com o MESMO número em
     * plataformas DIFERENTES, e aí ele descartava uma venda real. Com duas
     * plataformas isso já era possível; com três fica mais provável, porque cada
     * uma numera do seu jeito.
     */
    const vendasDeduplicadas: typeof todasVendas = [];
    const chavesVistas = new Set<string>();

    for (const venda of todasVendas) {
      if (!venda.id) {
        vendasDeduplicadas.push(venda);
        continue;
      }

      const chave = `${venda.canal ?? "?"}:${venda.id}`;
      if (!chavesVistas.has(chave)) {
        chavesVistas.add(chave);
        vendasDeduplicadas.push(venda);
      }
    }

    // Ordenar vendas deduplicadas por data (mais recente primeiro)
    vendasDeduplicadas.sort((a, b) => new Date(b.dataVenda).getTime() - new Date(a.dataVenda).getTime());

    const response = {
      vendas: vendasDeduplicadas,
      total: vendasDeduplicadas.length,
      lastSync: ultimaSyncGeral?.toISOString() || null,
      financialRuleVersion: SHOPEE_FINANCIAL_RULE_VERSION,
      flexConfigVersion: flexConfigVersion(flexConfig),
    };

    // Armazenar no cache
    cache.set(cacheKey, response);
    console.log(`[Cache Miss] Vendas gerais (${todasVendas.length} vendas) salvas no cache`);
    console.log(`[Vendas Gerais] ✅ Retornando ${vendasDeduplicadas.length} vendas combinadas (ML: ${vendasMeliFormatted.length}, Shopee: ${vendasShopeeFormatted.length}, TikTok: ${vendasTiktokFormatted.length})`);

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Erro ao buscar vendas gerais:", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
}
