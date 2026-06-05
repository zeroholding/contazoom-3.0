const venda = {
  frete: 0,
  rawData: {
    freight: {
      "baseCost": 46.3,
      "discount": 18.85,
      "listCost": 18.85,
      "quantity": 1,
      "finalCost": 0,
      "unitPrice": 127.49,
      "chargedCost": 0,
      "totalAmount": 127.49,
      "adjustedCost": -18.85,
      "diffBaseList": 27.45,
      "logisticType": "Agência",
      "shipmentCost": null,
      "shippingMode": null,
      "finalCostSource": "shipping_option",
      "adjustmentSource": "shipping_option",
      "costsGrossAmount": 84,
      "chargedCostSource": "shipping_option",
      "orderCostFallback": null,
      "logisticTypeSource": "shipment",
      "sellerShippingCost": 18.85,
      "sellerShippingSave": 18.85,
      "shippingOptionCost": 0
    }
  }
};

function roundCurrency(value) {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const rawData = venda.rawData && typeof venda.rawData === "object" ? venda.rawData : null;
const freightData = rawData && rawData.freight && typeof rawData.freight === "object" ? rawData.freight : {};

const toNum = (val) => {
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

const frete = calculated !== 0 ? calculated : freteRecalculado;
console.log("CALCULATED:", calculated);
console.log("FRETE:", frete);
