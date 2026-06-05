const rawData = {
  "order": {
    "shipping": {
      "cost": 0,
      "mode": "me2"
    }
  },
  "shipment": {
    "base_cost": 46.3,
    "logistic_type": "xd_drop_off",
    "shipping_option": {
      "cost": 0,
      "list_cost": 18.85
    }
  }
};

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
if (chargedCost !== null) chargedCost = Math.round(chargedCost * 100) / 100;

let freteRecalculado = 0;
if (logisticType === "self_service") {
  if (optCost !== null && optCost > 0) freteRecalculado = optCost;
  else if (baseCost !== null && baseCost > 0) freteRecalculado = baseCost;
  else if (shipCost !== null && shipCost > 0) freteRecalculado = shipCost;
} else if (["fulfillment", "cross_docking", "xd_drop_off", "drop_off"].includes(logisticType ?? "")) {
  if (listCost !== null && chargedCost !== null) {
    const sellerFreightCost = Math.max(Math.round((listCost - chargedCost) * 100) / 100, 0);
    freteRecalculado = sellerFreightCost > 0 ? -(Math.round(sellerFreightCost * 100) / 100) : 0;
  } else if (baseCost !== null && baseCost > 0) {
    freteRecalculado = -baseCost;
  }
} else {
  if (listCost !== null && chargedCost !== null) {
    const sellerFreightCost = Math.max(Math.round((listCost - chargedCost) * 100) / 100, 0);
    freteRecalculado = sellerFreightCost > 0 ? -(Math.round(sellerFreightCost * 100) / 100) : 0;
  } else if (orderCost !== null && orderCost > 0) {
    freteRecalculado = -orderCost;
  }
}

console.log("Frete Recalculado:", freteRecalculado);
