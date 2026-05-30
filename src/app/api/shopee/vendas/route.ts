import { NextRequest, NextResponse } from "next/server";
import { assertSessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cache, createCacheKey } from "@/lib/cache";

export const runtime = "nodejs";

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function GET(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    // Verificar cache primeiro (TTL de 5 minutos)
    const cacheKey = createCacheKey("vendas-shopee", session.sub);
    const cachedData = cache.get<any>(cacheKey, 300000);
    
    if (cachedData) {
      console.log(`[Cache Hit] Retornando vendas do Shopee do cache`);
      return NextResponse.json(cachedData);
    }

    // Buscar TODAS as vendas Shopee do usuário (sem filtro de 6 meses, igual ML)
    const vendas = await prisma.shopeeVenda.findMany({
      where: { userId: session.sub },
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

      // === RECÁLCULO A PARTIR DO rawData (escrow_details) ===
      const rawData = venda.rawData as any;
      const incomeDetails = rawData?.escrow_details?.order_income || {};
      const itemList: any[] = Array.isArray(rawData?.item_list) ? rawData.item_list : [];

      // Valor Total = subtotal do produto (SEM frete)
      let valorTotal = Number(venda.valorTotal); // fallback
      const costOfGoodsSold = incomeDetails.cost_of_goods_sold 
        || incomeDetails.order_discounted_price 
        || incomeDetails.order_selling_price 
        || 0;
      if (costOfGoodsSold > 0) {
        valorTotal = roundCurrency(costOfGoodsSold);
      } else if (itemList.length > 0) {
        const itemSubtotal = itemList.reduce((acc: number, it: any) => {
          const price = it?.model_discounted_price || it?.model_original_price || 0;
          const qty = it?.model_quantity_purchased || 1;
          return acc + (price * qty);
        }, 0);
        if (itemSubtotal > 0) valorTotal = roundCurrency(itemSubtotal);
      }

      // Unitário
      const unitario = venda.quantidade > 0 
        ? roundCurrency(valorTotal / venda.quantidade) 
        : valorTotal;

      // Taxa da Plataforma (incluindo Devolução Fácil)
      const commissionFee = incomeDetails.commission_fee || 0;
      const serviceFee = incomeDetails.service_fee || 0;
      const shippingSellerProtectionFee = incomeDetails.shipping_seller_protection_fee_amount || 0;
      const sellerTransactionFee = incomeDetails.seller_transaction_fee || 0;
      const drcAdjustableRefund = incomeDetails.drc_adjustable_refund || 0;
      const devolucaoFacilOuOutros = shippingSellerProtectionFee + sellerTransactionFee + drcAdjustableRefund;
      const taxaPlataformaRaw = commissionFee + serviceFee + devolucaoFacilOuOutros;
      const taxaPlataforma = taxaPlataformaRaw > 0 ? -roundCurrency(taxaPlataformaRaw) : 0;

      // Frete (custo líquido do vendedor)
      const actualShippingFee = incomeDetails.actual_shipping_fee || 0;
      const reverseShippingFee = incomeDetails.reverse_shipping_fee || 0;
      const shopeeShippingRebate = incomeDetails.shopee_shipping_rebate || 0;
      const buyerPaidShippingFee = incomeDetails.buyer_paid_shipping_fee || 0;
      const shippingFeeDiscountFrom3pl = incomeDetails.shipping_fee_discount_from_3pl || 0;
      const custoVendedorFrete = actualShippingFee - buyerPaidShippingFee - shopeeShippingRebate - shippingFeeDiscountFrom3pl + reverseShippingFee;
      const frete = custoVendedorFrete > 0.005 ? -roundCurrency(custoVendedorFrete) : 0;

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
      const paymentDetails = venda.paymentDetails as any || {};
      const enrichedPaymentDetails = {
        ...paymentDetails,
        platformFeeBreakdown: {
          commission_fee: commissionFee,
          service_fee: serviceFee,
          outros_encargos: devolucaoFacilOuOutros
        }
      };

      // Montar shipmentDetails com breakdown para tooltips
      const rawShipmentDetails = venda.shipmentDetails as any || {};
      const enrichedShipmentDetails = {
        ...rawShipmentDetails,
        actual_shipping_fee: actualShippingFee,
        reverse_shipping_fee: reverseShippingFee,
        shopee_shipping_rebate: shopeeShippingRebate,
        buyer_paid_shipping_fee: buyerPaidShippingFee,
        shipping_fee_discount_from_3pl: shippingFeeDiscountFrom3pl,
        custo_vendedor_frete: custoVendedorFrete,
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

    console.log(`[Shopee API] ✅ Retornando ${vendasFormatted.length} vendas (total no banco: ${vendas.length})`);

    const response = {
      vendas: vendasFormatted,
      total: vendas.length,
      lastSync:
        vendas.length > 0 ? vendas[0].sincronizadoEm.toISOString() : null,
    };

    // Armazenar no cache
    cache.set(cacheKey, response);
    console.log(`[Cache Miss] Vendas do Shopee salvas no cache`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Erro ao buscar vendas Shopee:", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
}
