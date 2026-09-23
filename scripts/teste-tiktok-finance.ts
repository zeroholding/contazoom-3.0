/**
 * Teste puro do financeiro do TikTok Shop.
 *
 * Sem banco e sem rede: alimenta `calculateTiktokEstimatedFinancials` e
 * `applyTiktokSettlement` com payloads montados a partir de pedidos REAIS já
 * conferidos no Seller Center, e exige que a aritmética feche ao centavo.
 *
 * Rodar: npm run test:tiktok:finance
 */
import assert from "node:assert/strict";

import {
  applyTiktokSettlement,
  calculateTiktokEstimatedFinancials,
  summarizeTiktokItems,
  TIKTOK_FINANCIAL_RULE_VERSION,
} from "../src/lib/tiktok-finance";

let passou = 0;

function verifica(rotulo: string, fn: () => void): void {
  fn();
  passou += 1;
  console.log(`  ok  ${rotulo}`);
}

/** Pedido com N unidades a `precoUnitario`, subtotal cheio declarado. */
function pedido(params: {
  unidades: number;
  subtotalCheio: number;
  platformDiscount?: number;
  sellerDiscount?: number;
  subTotal?: number;
  sku?: string;
}) {
  const { unidades, subtotalCheio, platformDiscount = 0, sellerDiscount = 0 } = params;
  return {
    line_items: Array.from({ length: unidades }, (_, i) => ({
      seller_sku: params.sku ?? "SKU-TESTE",
      product_name: "Produto de teste",
      product_id: "1729382",
      sale_price: String(subtotalCheio / unidades),
      sku_id: `sku-${i}`,
    })),
    payment: {
      original_total_product_price: String(subtotalCheio),
      sub_total: String(params.subTotal ?? subtotalCheio - platformDiscount),
      platform_discount: String(platformDiscount),
      seller_discount: String(sellerDiscount),
      shipping_fee: "4.60",
      total_amount: String(subtotalCheio - platformDiscount + 4.6),
    },
    shipping_type: "TIKTOK",
  };
}

console.log("\nTikTok — financeiro estimado\n");

verifica("gabarito 585600610037302600: subtotal 59,00 sem afiliado", () => {
  const f = calculateTiktokEstimatedFinancials(pedido({ unidades: 1, subtotalCheio: 59 }));

  assert.equal(f.quantity, 1);
  assert.equal(f.effectiveProductSubtotal, 59);
  // SFP 6% de 59 = 3,54 | taxa por item 6,00 | total 9,54
  assert.equal(f.breakdown.sfp_service_fee, -3.54);
  assert.equal(f.breakdown.per_item_fee_total, -6);
  assert.equal(f.platformFee, -9.54);
  // Liquidado esperado no Seller Center: 49,46
  assert.equal(f.netRevenue, 49.46);
  // Frete nunca é custo do vendedor no SFP.
  assert.equal(f.freight, 0);
  assert.equal(f.isReal, false);
  assert.equal(f.breakdown.financialRuleVersion, TIKTOK_FINANCIAL_RULE_VERSION);
});

verifica("taxa por item é POR UNIDADE, e line_item é 1 unidade", () => {
  // Três line_items do mesmo SKU = 3 unidades. O TikTok não manda quantidade.
  const f = calculateTiktokEstimatedFinancials(pedido({ unidades: 3, subtotalCheio: 177 }));

  assert.equal(f.quantity, 3);
  assert.equal(f.effectiveProductSubtotal, 177);
  assert.equal(f.breakdown.per_item_fee_total, -18); // 6,00 x 3
  assert.equal(f.breakdown.sfp_service_fee, -10.62); // 6% de 177
  assert.equal(f.platformFee, -28.62);
  assert.equal(f.unitPrice, 59);
});

verifica("base é o subtotal CHEIO: desconto de plataforma não reduz faturamento", () => {
  // Pedido real: cheio 118, platform_discount 2, sub_total 116.
  // O Seller Center declara "Vendas líquidas estimadas R$ 118" e SFP R$ 7,08,
  // que é 6% de 118 — não de 116.
  const f = calculateTiktokEstimatedFinancials(
    pedido({ unidades: 2, subtotalCheio: 118, platformDiscount: 2 }),
  );

  assert.equal(f.effectiveProductSubtotal, 118);
  assert.equal(f.grossProductSubtotal, 118);
  assert.equal(f.breakdown.sfp_service_fee, -7.08);
  assert.equal(f.breakdown.platform_discount, 2);
});

verifica("desconto do VENDEDOR reduz o faturamento", () => {
  const f = calculateTiktokEstimatedFinancials(
    pedido({ unidades: 1, subtotalCheio: 100, sellerDiscount: 10 }),
  );

  assert.equal(f.effectiveProductSubtotal, 90);
  assert.equal(f.grossProductSubtotal, 100);
  assert.equal(f.breakdown.sfp_service_fee, -5.4); // 6% de 90
  assert.equal(f.breakdown.seller_discount, 10);
});

verifica("sem original_total_product_price, reconstrói somando o desconto de plataforma", () => {
  const cru = pedido({ unidades: 1, subtotalCheio: 118, platformDiscount: 2 });
  delete (cru.payment as Record<string, unknown>).original_total_product_price;

  const f = calculateTiktokEstimatedFinancials(cru);
  // sub_total 116 + platform_discount 2 = 118
  assert.equal(f.effectiveProductSubtotal, 118);
});

verifica("bloco payment vazio: cai na soma dos line_items", () => {
  const f = calculateTiktokEstimatedFinancials({
    line_items: [
      { seller_sku: "A", sale_price: "30.00", product_name: "X" },
      { seller_sku: "A", sale_price: "30.00", product_name: "X" },
    ],
  });

  assert.equal(f.effectiveProductSubtotal, 60);
  assert.equal(f.quantity, 2);
});

console.log("\nTikTok — liquidação (troca estimado por real)\n");

verifica("gabarito 585597481084749163: afiliado aparece só no extrato", () => {
  const estimado = calculateTiktokEstimatedFinancials(
    pedido({ unidades: 1, subtotalCheio: 59 }),
  );
  // Estimado é OTIMISTA: não conhece a comissão de afiliado.
  assert.equal(estimado.netRevenue, 49.46);

  const real = applyTiktokSettlement(estimado, {
    order_id: "585597481084749163",
    statement_transactions: [
      {
        fee_amount: "-15.15",
        affiliate_commission_amount: "-5.61",
        revenue_amount: "59.00",
        settlement_amount: "43.85",
      },
    ],
  });

  assert.ok(real, "extrato com fee_amount deve produzir resultado");
  assert.equal(real.isReal, true);
  assert.equal(real.platformFee, -15.15);
  assert.equal(real.netRevenue, 43.85);
  assert.equal(real.breakdown.affiliate_commission, -5.61);
  // Faturamento não muda: o que muda é a taxa.
  assert.equal(real.effectiveProductSubtotal, 59);
  // valor_total + taxa_plataforma fecha com o liquidado do TikTok.
  assert.equal(
    Math.round((real.effectiveProductSubtotal + real.platformFee) * 100) / 100,
    43.85,
  );
  assert.equal(real.breakdown.revenue_mismatch, null);
});

verifica("sem fee_amount, deriva a taxa do valor liquidado", () => {
  const estimado = calculateTiktokEstimatedFinancials(
    pedido({ unidades: 1, subtotalCheio: 59 }),
  );
  const real = applyTiktokSettlement(estimado, {
    statement_transactions: [{ settlement_amount: "43.85" }],
  });

  assert.ok(real);
  // 43,85 - 59,00 = -15,15
  assert.equal(real.platformFee, -15.15);
  assert.equal(real.netRevenue, 43.85);
});

verifica("divergência de receita fica registrada, não virá ajuste silencioso", () => {
  const estimado = calculateTiktokEstimatedFinancials(
    pedido({ unidades: 1, subtotalCheio: 59 }),
  );
  const real = applyTiktokSettlement(estimado, {
    statement_transactions: [
      { fee_amount: "-9.54", revenue_amount: "57.00", settlement_amount: "49.46" },
    ],
  });

  assert.ok(real);
  assert.equal(real.breakdown.revenue_mismatch, -2);
});

verifica("extrato vazio preserva o estimado em vez de inventar número", () => {
  const estimado = calculateTiktokEstimatedFinancials(
    pedido({ unidades: 1, subtotalCheio: 59 }),
  );

  assert.equal(applyTiktokSettlement(estimado, {}), null);
  assert.equal(applyTiktokSettlement(estimado, { statement_transactions: [] }), null);
  assert.equal(
    applyTiktokSettlement(estimado, { statement_transactions: [{ irrelevante: 1 }] }),
    null,
  );
});

verifica("valor monetário aninhado em { amount } é reconhecido", () => {
  const estimado = calculateTiktokEstimatedFinancials(
    pedido({ unidades: 1, subtotalCheio: 59 }),
  );
  const real = applyTiktokSettlement(estimado, {
    statement_transactions: [{ settlement_amount: { amount: "43.85", currency: "BRL" } }],
  });

  assert.ok(real);
  assert.equal(real.netRevenue, 43.85);
});

console.log("\nTikTok — leitura de itens\n");

verifica("SKU dominante ganha, e a contagem de unidades é por line_item", () => {
  const resumo = summarizeTiktokItems({
    line_items: [
      { seller_sku: "AAA", product_name: "Camisa", product_id: "1" },
      { seller_sku: "BBB", product_name: "Calca", product_id: "2" },
      { seller_sku: "AAA", product_name: "Camisa", product_id: "1" },
    ],
  });

  assert.equal(resumo.quantity, 3);
  assert.equal(resumo.sku, "AAA");
  assert.equal(resumo.skuBreakdown[0].units, 2);
  assert.equal(resumo.title, "Camisa");
  assert.equal(resumo.productId, "1");
});

verifica("pedido sem item não quebra nem zera quantidade", () => {
  const resumo = summarizeTiktokItems({});
  assert.equal(resumo.quantity, 1);
  assert.equal(resumo.sku, null);
  assert.equal(resumo.title, "Pedido");
});

verifica("cai para sku_id quando não há seller_sku", () => {
  const resumo = summarizeTiktokItems({
    line_items: [{ sku_id: "sku-999", product_name: "Sem SKU do vendedor" }],
  });
  assert.equal(resumo.sku, "sku-999");
});

console.log(`\n${passou} verificações passaram.\n`);
