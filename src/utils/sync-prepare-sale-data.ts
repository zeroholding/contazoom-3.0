import { Decimal } from "@prisma/client/runtime/library";
import { toFiniteNumber } from "./numeric-functions";
import { roundCurrency, truncateJsonData, truncateString } from "./string-utils";
import { calculateMargemContribuicao } from "./calc-margem-contribuicao";
import { adsTags, mapListingTypeToExposure } from "./meli-functions";

type SkuCacheEntry = {
  custoUnitario: number | null;
  tipo: string | null;
};

type FreightSource = "shipment" | "order" | "shipping_option" | null;

type MeliOrderFreight = {
  logisticType: string | null;
  logisticTypeSource: FreightSource | null;
  shippingMode: string | null;

  baseCost: number | null;
  listCost: number | null;
  shippingOptionCost: number | null;
  shipmentCost: number | null;
  orderCostFallback: number | null;
  finalCost: number | null;
  finalCostSource: FreightSource;
  chargedCost: number | null;
  chargedCostSource: FreightSource;

  discount: number | null;
  totalAmount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  diffBaseList: number | null;

  adjustedCost: number | null;
  adjustmentSource: string | null;

  sellerShippingCost: number | null;
  sellerShippingSave: number | null; // senders[0].save do /costs endpoint
  costsGrossAmount: number | null; // gross_amount do /costs endpoint
};

type MeliOrderPayload = {
  accountId: string;
  accountNickname: string | null | undefined;
  mlUserId: number | bigint;
  order: unknown;
  shipment?: unknown;
  freight: MeliOrderFreight;
};

export function extractOrderIdFromPayload(order: MeliOrderPayload): string | null {
  const rawOrder = (order?.order ?? null) as any;
  if (!rawOrder || rawOrder.id === undefined || rawOrder.id === null) {
    return null;
  }
  const id = String(rawOrder.id).trim();
  return id.length === 0 ? null : id;
}

export async function prepareSaleData(
  order: MeliOrderPayload,
  userId: string,
  skuCache: Map<string, SkuCacheEntry>
): Promise<{ orderId: string; createData: any; updateData: any } | null> {
  const extractedOrderId = extractOrderIdFromPayload(order);

  if (!extractedOrderId) {
    console.error(`[Sync] Venda sem ID valido, pulando...`);
    return null;
  }

  const orderId = extractedOrderId;

  try {
    const o: any = order.order ?? {};
    const freight = order.freight;
    const normalizedMlUserId =
      (order as any)?.mlUserId ??
      (order as any)?.ml_user_id ??
      (typeof o?.seller?.id === "number" ? o.seller.id : null);

    const orderItems: any[] = Array.isArray(o.order_items) ? o.order_items : [];
    const firstItem = orderItems[0] ?? {};
    const orderItem =
      typeof firstItem === "object" && firstItem !== null ? firstItem : {};
    const itemData =
      typeof orderItem?.item === "object" && orderItem.item !== null
        ? orderItem.item
        : {};

    const firstItemTitle =
      itemData?.title ??
      orderItems.find((entry: any) => entry?.item?.title)?.item?.title ??
      o.title ??
      "Pedido";

    const quantity = orderItems.reduce((sum, item) => {
      const qty = toFiniteNumber(item?.quantity) ?? 0;
      return sum + qty;
    }, 0);

    const totalAmount =
      toFiniteNumber(o.total_amount) ??
      orderItems.reduce((acc, item) => {
        const qty = toFiniteNumber(item?.quantity) ?? 0;
        const price = toFiniteNumber(item?.unit_price) ?? 0;
        return acc + qty * price;
      }, 0);

    const buyerName =
      o?.buyer?.nickname ||
      [o?.buyer?.first_name, o?.buyer?.last_name].filter(Boolean).join(" ") ||
      "Comprador";

    const dateString = o.date_closed || o.date_created || o.date_last_updated;

    const tags: string[] = Array.isArray(o.tags)
      ? o.tags.map((t: unknown) => String(t))
      : [];

    const internalTags: string[] = Array.isArray(o.internal_tags)
      ? o.internal_tags.map((t: unknown) => String(t))
      : [];

    const shippingStatus =
      (order.shipment as any)?.status || o?.shipping?.status || undefined;
    const shippingId =
      (order.shipment as any)?.id?.toString() || o?.shipping?.id?.toString();

    const receiverAddress =
      (order.shipment as any)?.receiver_address ??
      (o?.shipping && typeof o.shipping === "object"
        ? (o as any).shipping?.receiver_address
        : undefined) ??
      undefined;
    const latitude = toFiniteNumber(
      (receiverAddress as any)?.latitude ??
        (receiverAddress as any)?.geo?.latitude
    );
    const longitude = toFiniteNumber(
      (receiverAddress as any)?.longitude ??
        (receiverAddress as any)?.geo?.longitude
    );

    const saleFee = orderItems.reduce((acc, item) => {
      const fee = toFiniteNumber(item?.sale_fee) ?? 0;
      const qty = toFiniteNumber(item?.quantity) ?? 1;
      return acc + fee * qty;
    }, 0);

    const unitario =
      toFiniteNumber(orderItem?.unit_price) ??
      (quantity > 0 && totalAmount !== null
        ? roundCurrency(totalAmount / quantity)
        : 0);

    const taxaPlataforma = saleFee > 0 ? -roundCurrency(saleFee) : null;
    
    // ── Cálculo do frete ────────────────────────────────────────────────────
    // FLEX (self_service): receita = gross_amount - (senders.cost - senders.save)
    //   • Produto < R$79:  cost=0, save=0  → receita = gross_amount (+R$11)
    //   • Produto >= R$79: cost=9.9, save=1.1 → receita = 22 - 8.8 = +R$13.20
    // Outros: vendedor PAGA (senders.cost - senders.save) líquido (negativo)
    let frete: number;

    const isFlex =
      freight.logisticType === "FLEX" &&
      freight.costsGrossAmount !== null &&
      freight.costsGrossAmount > 0;

    if (isFlex) {
      const senderCost  = freight.sellerShippingCost  ?? 0;
      const senderSave  = freight.sellerShippingSave  ?? 0;
      const netSenderCost = Math.max(senderCost - senderSave, 0);
      frete = roundCurrency(freight.costsGrossAmount! - netSenderCost);
      console.log(`[Sync] FLEX — gross=${freight.costsGrossAmount} cost=${senderCost} save=${senderSave} → frete=+${frete}`);
    } else if (freight.sellerShippingCost !== null && freight.sellerShippingCost !== undefined) {
      // Custo real extraído de /shipments/{id}/costs -> senders[0].cost (normal)
      const senderSave = freight.sellerShippingSave ?? 0;
      frete = -roundCurrency(Math.max(freight.sellerShippingCost - senderSave, 0));
    } else {
      // Fallback para lógica antiga quando /costs não disponível
      frete = freight.adjustedCost ?? 0;
    }

    const skuVendaRaw = itemData?.seller_sku || itemData?.sku || null;
    const skuVenda = skuVendaRaw
      ? truncateString(String(skuVendaRaw), 255) || null
      : null;
    let cmv: number | null = null;

    if (skuVenda) {
      const cachedSku = skuCache.get(skuVenda);

      if (cachedSku) {
        if (cachedSku.custoUnitario !== null) {
          cmv = roundCurrency(cachedSku.custoUnitario * quantity);
        }
      }
    }

    const { valor: margemContribuicao, isMargemReal } =
      calculateMargemContribuicao(totalAmount, taxaPlataforma, frete, cmv);

    const contaLabel = truncateString(
      order.accountNickname ?? String(normalizedMlUserId ?? order.accountId),
      255
    );

    const vendaBaseData = {
      dataVenda: dateString ? new Date(dateString) : new Date(),
      status: truncateString(
        String(o.status ?? "desconhecido").replace(/_/g, " "),
        100
      ),
      conta: contaLabel,
      valorTotal: new Decimal(totalAmount),
      quantidade: quantity > 0 ? quantity : 1,
      unitario: new Decimal(unitario),
      taxaPlataforma: taxaPlataforma ? new Decimal(taxaPlataforma) : null,
      frete: new Decimal(frete),
      cmv: cmv !== null ? new Decimal(cmv) : null,
      margemContribuicao: new Decimal(margemContribuicao),
      isMargemReal,
      titulo: truncateString(firstItemTitle, 500) || "Produto sem titulo",
      sku: skuVenda,
      comprador: truncateString(buyerName, 255) || "Comprador",
      logisticType: truncateString(freight.logisticType, 100) || null,
      envioMode: truncateString(freight.shippingMode, 100) || null,
      shippingStatus: truncateString(shippingStatus, 100) || null,
      shippingId: truncateString(shippingId, 255) || null,
      exposicao: (() => {
        const listingTypeId =
          orderItem?.listing_type_id ?? itemData?.listing_type_id ?? null;
        return mapListingTypeToExposure(listingTypeId);
      })(),
      tipoAnuncio: tags.includes("catalog") ? "Catalogo" : "Proprio",
      ads: internalTags.includes("ads") ? "ADS" : null,
      plataforma: "Mercado Livre",
      canal: "ML",
      tags: truncateJsonData(tags),
      internalTags: truncateJsonData(internalTags),
      rawData: truncateJsonData({
        order: o,
        shipment: order.shipment as any,
        freight: freight,
      }),
    };

    // Tentar incluir geo se dispon�vel
    const geoData =
      latitude !== null && longitude !== null
        ? {
            latitude: new Decimal(latitude),
            longitude: new Decimal(longitude),
          }
        : {};

    const createData = {
      orderId: truncateString(orderId, 255),
      userId: truncateString(userId, 50),
      meliAccountId: truncateString(order.accountId, 25),
      ...vendaBaseData,
      ...geoData,
    };

    const updateData = {
      ...vendaBaseData,
      ...geoData,
    };

    return { orderId, createData, updateData };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Sync] Erro ao preparar venda ${orderId}:`, errorMsg);
    return null;
  }
}