export type ShopeeFinancials = {
  quantity: number;
  grossProductSubtotal: number;
  effectiveProductSubtotal: number;
  unitPrice: number;
  platformFee: number | null;
  freight: number;
  netRevenue: number;
  paymentBreakdown: {
    product_gross_subtotal: number;
    product_effective_subtotal: number;
    product_discount_total: number;
    pix_payment_adjustment: number;
    buyer_coupon_adjustment: number;
    seller_discount: number;
    shopee_discount: number;
    voucher_from_seller: number;
    voucher_from_shopee: number;
    coins: number;
    payment_promotion: number;
    commission_fee: number;
    service_fee: number;
    outros_encargos: number;
    ignored_as_platform_fee: {
      seller_transaction_fee: number;
      drc_adjustable_refund: number;
    };
  };
  shipmentBreakdown: {
    actual_shipping_fee: number;
    reverse_shipping_fee: number;
    shopee_shipping_rebate: number;
    buyer_paid_shipping_fee: number;
    shipping_fee_discount_from_3pl: number;
    custo_vendedor_frete: number;
  };
};

export const SHOPEE_FINANCIAL_RULE_VERSION = "shopee-effective-sale-v2";

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function positive(value: unknown): number {
  const n = toFiniteNumber(value);
  if (n === null || n <= 0) return 0;
  return n;
}

function maxPositive(...values: unknown[]): number {
  let max = 0;
  for (const value of values) {
    const n = positive(value);
    if (n > max) max = n;
  }
  return max;
}

function firstPositive(...values: unknown[]): number | null {
  for (const value of values) {
    const n = toFiniteNumber(value);
    if (n !== null && n > 0) return n;
  }
  return null;
}

function sumOrderQuantities(itemList: any[]): number {
  return itemList.reduce((acc: number, item: any) => {
    const qty = toFiniteNumber(item?.model_quantity_purchased) ?? 0;
    return acc + qty;
  }, 0);
}

function sumItemsSubtotal(itemList: any[], preferDiscounted: boolean): number {
  return itemList.reduce((acc: number, item: any) => {
    const price = preferDiscounted
      ? firstPositive(item?.model_discounted_price, item?.model_original_price)
      : firstPositive(item?.model_original_price, item?.model_discounted_price);
    const qty = toFiniteNumber(item?.model_quantity_purchased) ?? 1;
    return acc + ((price ?? 0) * qty);
  }, 0);
}

export function calculateShopeeFinancials(
  order: any,
  fallback?: {
    valorTotal?: number | null;
    unitario?: number | null;
    quantidade?: number | null;
    taxaPlataforma?: number | null;
    frete?: number | null;
  },
): ShopeeFinancials {
  const incomeDetails = order?.escrow_details?.order_income || {};
  const itemList: any[] = Array.isArray(order?.item_list) ? order.item_list : [];

  const quantity =
    sumOrderQuantities(itemList) || positive(fallback?.quantidade) || 1;
  const grossItemsSubtotal = sumItemsSubtotal(itemList, false);
  const discountedItemsSubtotal = sumItemsSubtotal(itemList, true);

  const explicitGrossProductSource = firstPositive(
    incomeDetails.original_cost_of_goods_sold,
    grossItemsSubtotal,
  );
  const grossProductSource = firstPositive(
    explicitGrossProductSource,
    incomeDetails.order_selling_price,
  );
  const grossProductSubtotal = roundCurrency(
    firstPositive(
      grossProductSource,
      incomeDetails.cost_of_goods_sold,
      order?.total_amount,
      fallback?.valorTotal,
    ) ?? 0,
  );

  const pixPaymentAdjustment = positive(incomeDetails.seller_transaction_fee);
  const sellerDiscount = maxPositive(
    incomeDetails.seller_discount,
    incomeDetails.voucher_from_seller,
  );
  const shopeeDiscount = maxPositive(
    incomeDetails.shopee_discount,
    incomeDetails.voucher_from_shopee,
    incomeDetails.drc_adjustable_refund,
  );
  const buyerCouponAdjustment = maxPositive(sellerDiscount, shopeeDiscount);
  const voucherFromSeller = positive(incomeDetails.voucher_from_seller);
  const voucherFromShopee = positive(incomeDetails.voucher_from_shopee);
  const coins = positive(incomeDetails.coins);
  const paymentPromotion = maxPositive(
    incomeDetails.payment_promotion,
    incomeDetails.credit_card_promotion,
    incomeDetails.buyer_payment_method_discount,
    incomeDetails.payment_channel_discount,
  );

  const productDiscountTotal = roundCurrency(
    pixPaymentAdjustment +
      buyerCouponAdjustment +
      coins +
      paymentPromotion,
  );

  const directDiscountedSubtotal = firstPositive(
    incomeDetails.order_discounted_price,
    discountedItemsSubtotal,
  );
  const costOfGoodsSold = firstPositive(incomeDetails.cost_of_goods_sold);

  let effectiveProductSubtotal = grossProductSubtotal;
  if (
    explicitGrossProductSource !== null &&
    productDiscountTotal > 0 &&
    grossProductSubtotal > productDiscountTotal
  ) {
    effectiveProductSubtotal = grossProductSubtotal - productDiscountTotal;
  } else if (
    directDiscountedSubtotal !== null &&
    directDiscountedSubtotal > 0 &&
    directDiscountedSubtotal < grossProductSubtotal - 0.005
  ) {
    effectiveProductSubtotal = directDiscountedSubtotal;
  } else if (
    costOfGoodsSold !== null &&
    costOfGoodsSold > 0 &&
    costOfGoodsSold < grossProductSubtotal - 0.005
  ) {
    effectiveProductSubtotal = costOfGoodsSold;
  } else if (fallback?.valorTotal && fallback.valorTotal > 0) {
    effectiveProductSubtotal = fallback.valorTotal;
  }
  effectiveProductSubtotal = roundCurrency(effectiveProductSubtotal);

  const commissionFee = positive(incomeDetails.commission_fee);
  const serviceFee = positive(incomeDetails.service_fee);
  const shippingSellerProtectionFee = positive(
    incomeDetails.shipping_seller_protection_fee_amount,
  );

  const actualShippingFee = positive(incomeDetails.actual_shipping_fee);
  const reverseShippingFee = positive(incomeDetails.reverse_shipping_fee);
  const shopeeShippingRebate = positive(incomeDetails.shopee_shipping_rebate);
  const buyerPaidShippingFee = positive(incomeDetails.buyer_paid_shipping_fee);
  const shippingFeeDiscountFrom3pl = positive(
    incomeDetails.shipping_fee_discount_from_3pl,
  );
  const custoVendedorFrete = roundCurrency(
    actualShippingFee -
      buyerPaidShippingFee -
      shopeeShippingRebate -
      shippingFeeDiscountFrom3pl +
      reverseShippingFee,
  );
  const freight = custoVendedorFrete > 0.005 ? -custoVendedorFrete : 0;

  const directNetRevenue = firstPositive(
    incomeDetails.escrow_amount,
    order?.escrow_details?.escrow_amount,
    incomeDetails.actual_income,
    incomeDetails.estimated_income,
    incomeDetails.seller_income,
    incomeDetails.final_income,
    incomeDetails.net_income,
  );
  const platformFeeFromNet =
    directNetRevenue !== null
      ? roundCurrency(directNetRevenue - effectiveProductSubtotal - freight)
      : null;
  const platformFeeRaw = roundCurrency(
    commissionFee + serviceFee + shippingSellerProtectionFee,
  );
  const platformFee =
    platformFeeFromNet !== null && platformFeeFromNet < -0.005
      ? platformFeeFromNet
      : platformFeeRaw > 0
        ? -platformFeeRaw
        : null;

  const unitPrice = roundCurrency(
    (grossProductSubtotal || effectiveProductSubtotal) / quantity,
  );
  const netRevenue =
    directNetRevenue !== null
      ? roundCurrency(directNetRevenue)
      : roundCurrency(effectiveProductSubtotal + (platformFee ?? 0) + freight);

  return {
    quantity,
    grossProductSubtotal,
    effectiveProductSubtotal,
    unitPrice,
    platformFee,
    freight,
    netRevenue,
    paymentBreakdown: {
      product_gross_subtotal: grossProductSubtotal,
      product_effective_subtotal: effectiveProductSubtotal,
      product_discount_total: productDiscountTotal,
      pix_payment_adjustment: pixPaymentAdjustment,
      buyer_coupon_adjustment: buyerCouponAdjustment,
      seller_discount: sellerDiscount,
      shopee_discount: shopeeDiscount,
      voucher_from_seller: voucherFromSeller,
      voucher_from_shopee: voucherFromShopee,
      coins,
      payment_promotion: roundCurrency(paymentPromotion),
      commission_fee: commissionFee,
      service_fee: serviceFee,
      outros_encargos: shippingSellerProtectionFee,
      ignored_as_platform_fee: {
        seller_transaction_fee: pixPaymentAdjustment,
        drc_adjustable_refund: buyerCouponAdjustment,
      },
    },
    shipmentBreakdown: {
      actual_shipping_fee: actualShippingFee,
      reverse_shipping_fee: reverseShippingFee,
      shopee_shipping_rebate: shopeeShippingRebate,
      buyer_paid_shipping_fee: buyerPaidShippingFee,
      shipping_fee_discount_from_3pl: shippingFeeDiscountFrom3pl,
      custo_vendedor_frete: custoVendedorFrete,
    },
  };
}
