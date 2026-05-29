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

    // Mapear vendas com recálculo dinâmico de CMV e margem (igual ML faz)
    const vendasFormatted = vendas.map((venda) => {
      // CMV: buscar custo histórico do SKU na data da venda
      let cmv: number | null = null;
      if (venda.sku) {
        const custoUnitario = costMap.getCostAtDate(venda.sku, venda.dataVenda);
        if (custoUnitario > 0) {
          cmv = roundCurrency(custoUnitario * venda.quantidade);
        }
      }

      const valorTotal = Number(venda.valorTotal);
      // Forçar taxaPlataforma para ser sempre negativa (custo), compatível com dados antigos (positivos) e novos (negativos)
      const taxaPlataforma = venda.taxaPlataforma
        ? -Math.abs(Number(venda.taxaPlataforma))
        : 0;
      const frete = Number(venda.frete);

      // Margem: recalcular com CMV (igual ML)
      // valorTotal + taxaPlataforma(negativo) + frete(negativo) - cmv
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
        shopeeAccountId: venda.shopeeAccountId,
        valorTotal,
        quantidade: venda.quantidade,
        unitario: Number(venda.unitario),
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
        // Dados extras para o frontend (shipment/payment details)
        shipmentDetails: venda.shipmentDetails,
        paymentDetails: venda.paymentDetails,
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
