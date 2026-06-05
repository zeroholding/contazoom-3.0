const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const roundCurrency = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 0;
  return Number(num.toFixed(2));
};

async function test() {
  try {
    const venda = await prisma.venda.findFirst({
      where: { orderId: "2000016689713262" }
    });
    
    if (!venda) {
      console.log("Venda not found in local db");
      return;
    }

    const rawData = venda.rawData && typeof venda.rawData === "object" ? venda.rawData : null;
    const shipment = rawData?.shipment || {};
    const shippingOption = shipment?.shipping_option || {};
    const orderShipping = rawData?.order?.shipping || {};
    
    const logisticTypeRaw = typeof shipment.logistic_type === "string" ? shipment.logistic_type : null;
    const shippingMode = typeof orderShipping.mode === "string" ? orderShipping.mode : null;
    const logisticType = logisticTypeRaw ?? shippingMode ?? null;

    const optCost = typeof shippingOption.cost === "number" ? shippingOption.cost : null;
    const baseCost = typeof shipment.base_cost === "number" ? shipment.base_cost : null;
    const shipCost = typeof shipment.cost === "number" ? shipment.cost : null;
    const listCost = typeof shippingOption.list_cost === "number" ? shippingOption.list_cost : null;
    const orderCost = typeof orderShipping.cost === "number" ? orderShipping.cost : null;

    let chargedCost = optCost !== null ? optCost : shipCost !== null ? shipCost : orderCost !== null ? orderCost : null;
    if (chargedCost !== null) chargedCost = roundCurrency(chargedCost);

    console.log({ logisticType, optCost, baseCost, listCost, chargedCost });

    let freteRecalculado = 0;
    if (logisticType === "self_service") {
      if (optCost !== null && optCost > 0) freteRecalculado = optCost;
      else if (baseCost !== null && baseCost > 0) freteRecalculado = baseCost;
      else if (shipCost !== null && shipCost > 0) freteRecalculado = shipCost;
    } else if (["fulfillment", "cross_docking", "xd_drop_off", "drop_off"].includes(logisticType ?? "")) {
      if (listCost !== null && chargedCost !== null) {
        const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
        freteRecalculado = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
      } else if (baseCost !== null && baseCost > 0) {
        freteRecalculado = -baseCost;
      }
    }

    console.log("Frete Recalculado:", freteRecalculado);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
