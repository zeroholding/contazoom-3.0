// Frete utilities for frontend

interface FreteAdjustParams {
  shipment_logistic_type: string;
  base_cost: number | null;
  shipment_list_cost: number | null;
  shipping_option_cost: number | null;
  shipment_cost: number | null;
  order_cost: number | null;
  quantity: number;
}

export function calcularFreteAdjust({
  shipment_logistic_type,
  base_cost,
  shipment_list_cost,
  shipping_option_cost,
  shipment_cost,
  order_cost,
  quantity,
}: FreteAdjustParams): number {
  // 1) Se logistic_type for fulfillment, cross_docking ou xd_drop_off
  if (['fulfillment', 'cross_docking', 'xd_drop_off'].includes(shipment_logistic_type)) {
    // a. Se base_cost existir e for diferente de NULL
    if (base_cost !== null) {
      return -base_cost;
    }
    // b. Se base_cost for NULL, usar shipment_list_cost
    if (shipment_list_cost !== null) {
      return -shipment_list_cost;
    }
  }

  // 2) Se logistic_type for self_service
  if (shipment_logistic_type === 'self_service') {
    // a. Se shipping_option_cost existir
    if (shipping_option_cost !== null) {
      return -shipping_option_cost;
    }
    // b. Se shipment_cost existir
    if (shipment_cost !== null) {
      return -shipment_cost;
    }
  }

  // 3) Se logistic_type for drop_off
  if (shipment_logistic_type === 'drop_off') {
    // a. Se base_cost existir
    if (base_cost !== null) {
      return -base_cost;
    }
    // b. Se shipment_list_cost existir
    if (shipment_list_cost !== null) {
      return -shipment_list_cost;
    }
  }

  // 4) Se nenhum dos anteriores, usar order_cost
  if (order_cost !== null) {
    return -order_cost;
  }

  // 5) Se ainda assim for NULL, retornar zero
  return 0;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatarFreteShopee(freteData: any): {
  freteOriginal: number;
  subsidioShopee: number;
  subsidioVendedor: number;
  freteComprador: number;
} {
  const actual_shipping_fee = freteData.actual_shipping_fee || 0;
  const shopee_shipping_rebate = freteData.shopee_shipping_rebate || 0;
  const buyer_paid_shipping_fee = freteData.buyer_paid_shipping_fee || 0;
  const shipping_fee_discount_from_3pl = freteData.shipping_fee_discount_from_3pl || 0;

  const freteOriginal = actual_shipping_fee;
  const subsidioShopee = shopee_shipping_rebate + shipping_fee_discount_from_3pl;
  const subsidioVendedor = Math.max(0, actual_shipping_fee - shopee_shipping_rebate - shipping_fee_discount_from_3pl - buyer_paid_shipping_fee);
  const freteComprador = buyer_paid_shipping_fee;

  return {
    freteOriginal,
    subsidioShopee,
    subsidioVendedor,
    freteComprador,
  };
}

export function detectarSubsidioFrete(freteData: any): {
  temSubsidio: boolean;
  valorSubsidio: number;
  percentualSubsidio: number;
} {
  const resultado = formatarFreteShopee(freteData);
  const totalSubsidio = resultado.subsidioShopee + resultado.subsidioVendedor;

  return {
    temSubsidio: totalSubsidio > 0,
    valorSubsidio: totalSubsidio,
    percentualSubsidio: resultado.freteOriginal > 0
      ? (totalSubsidio / resultado.freteOriginal) * 100
      : 0,
  };
}

export function classifyLogisticType(logisticType: string | undefined): string {
  if (!logisticType) return 'Desconhecido';

  const type = logisticType.toLowerCase();

  if (type.includes('flex') || type === 'self_service') {
    return 'FLEX';
  }
  if (type.includes('drop') || type.includes('agencia') || type === 'xd_drop_off') {
    return 'Agência';
  }
  if (type.includes('coleta')) {
    return 'Coleta';
  }

  return logisticType;
}

export function classifyFrete(logisticTypeOrValue: string | number | undefined): string {
  // Se for um número, classifica pelo valor
  if (typeof logisticTypeOrValue === 'number') {
    if (logisticTypeOrValue === 0) return 'Grátis';
    if (logisticTypeOrValue < 10) return 'Baixo';
    if (logisticTypeOrValue < 20) return 'Médio';
    return 'Alto';
  }

  // Se for string, classifica pelo tipo logístico
  if (!logisticTypeOrValue) return 'Desconhecido';

  const type = logisticTypeOrValue.toLowerCase();

  if (type.includes('flex') || type === 'self_service') {
    return 'FLEX';
  }
  if (type.includes('drop') || type.includes('agencia') || type === 'xd_drop_off') {
    return 'Agência';
  }
  if (type.includes('coleta')) {
    return 'Coleta';
  }

  return logisticTypeOrValue;
}
