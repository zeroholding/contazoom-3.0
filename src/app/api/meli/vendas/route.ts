import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import { cache, createCacheKey } from "@/lib/cache";

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
  console.log("[API_MELI_VENDAS] Inciando busca de vendas");
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
    console.log(`[API_MELI_VENDAS] Usuário autenticado: ${session.sub}`);
  } catch (e) {
    console.error("[API_MELI_VENDAS] Erro de autenticação:", e);
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // Verificar cache primeiro (TTL de 5 minutos)
    const cacheKey = createCacheKey("vendas-meli", session.sub);
    const cachedData = cache.get<any>(cacheKey, 300000);
    
    if (cachedData) {
      console.log(`[API_MELI_VENDAS] [Cache Hit] Retornando vendas do Mercado Livre do cache. Total: ${cachedData.total}`);
      return NextResponse.json(cachedData);
    }
    console.log("[API_MELI_VENDAS] Cache Miss - Buscando no banco de dados...");

    const vendas = await prisma.meliVenda.findMany({
      where: { userId: session.sub },
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
    });

    console.log(`[API_MELI_VENDAS] Encontradas ${vendas.length} vendas no banco.`);

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

      const valorTotal = Number(venda.valorTotal);
      const taxaPlataforma = venda.taxaPlataforma ? Number(venda.taxaPlataforma) : 0;

      // === RECÁLCULO DINÂMICO DO FRETE ===
      const rawData = venda.rawData && typeof venda.rawData === "object" ? (venda.rawData as any) : null;
      const freightData = rawData && rawData.freight && typeof rawData.freight === "object" ? (rawData.freight as JsonRecord) : {};

      const toNum = (val: unknown) => {
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          const parsed = parseFloat(val);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };

      const logisticType = typeof freightData.logisticType === "string" ? freightData.logisticType : null;
      const optCost = toNum(freightData.shippingOptionCost);
      const baseCost = toNum(freightData.baseCost);
      const shipCost = toNum(freightData.shipmentCost);
      const listCost = toNum(freightData.listCost);
      const orderCost = toNum(freightData.orderCostFallback);

      let chargedCost = toNum(freightData.chargedCost);
      if (chargedCost === null) {
        chargedCost = optCost !== null ? optCost : shipCost !== null ? shipCost : orderCost !== null ? orderCost : null;
      }
      if (chargedCost !== null) chargedCost = roundCurrency(chargedCost);

      let freteRecalculado = Number(venda.frete) || 0;
      let calculated = 0;

      if (logisticType === "self_service") {
        if (optCost !== null && optCost > 0) calculated = optCost;
        else if (baseCost !== null && baseCost > 0) calculated = baseCost;
        else if (shipCost !== null && shipCost > 0) calculated = shipCost;
      } else if (["fulfillment", "cross_docking", "xd_drop_off", "drop_off"].includes(logisticType ?? "")) {
        if (listCost !== null && chargedCost !== null) {
          const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
          calculated = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
        } else if (baseCost !== null && baseCost > 0) {
          calculated = -baseCost;
        }
      } else {
        if (listCost !== null && chargedCost !== null) {
          const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
          calculated = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
        } else if (orderCost !== null && orderCost > 0) {
          calculated = -orderCost;
        }
      }

      // Se a nossa lógica nova achou um valor diferente de zero, usamos ele.
      // Caso contrário, mantemos o frete do banco (que pode ter sido atualizado pelo sync).
      const frete = calculated !== 0 ? calculated : freteRecalculado;

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

      // `rawData` já foi declarado no recálculo acima.

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

      // Conversão segura de ml_user_id para string
      const contaId = venda.meliAccount?.ml_user_id 
        ? String(venda.meliAccount.ml_user_id) 
        : "";

      return {
        id: venda.orderId,
        dataVenda: venda.dataVenda.toISOString(),
        status: venda.status,
        conta: venda.conta,
        meliAccountId: venda.meliAccountId,
        contaId, // Usar a versão stringificada
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
      };
    });

    const response = {
      vendas: vendasFormatted,
      total: vendas.length,
      lastSync:
        vendas.length > 0 ? vendas[0].sincronizadoEm.toISOString() : null,
    };

    // Armazenar no cache
    cache.set(cacheKey, response);
    console.log(`[API_MELI_VENDAS] [Cache Miss] Vendas salvas no cache e retornadas.`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API_MELI_VENDAS] Erro fatal ao buscar vendas:", error);
    return new NextResponse(`Erro interno do servidor: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}
