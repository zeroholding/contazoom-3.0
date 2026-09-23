/**
 * Cálculo financeiro do TikTok Shop (BR).
 *
 * Diferente do ML (calculado na leitura) e da Shopee (escrow por pedido), o
 * TikTok tem DOIS estados para o mesmo pedido:
 *
 *   1. ESTIMADO — enquanto o pedido não liquidou (no BR: entrega + ~7 dias).
 *      É o que o próprio Seller Center mostra como "Vendas líquidas estimadas".
 *      Calculado aqui, a partir do subtotal do pedido e das taxas conhecidas.
 *
 *   2. REAL — depois da liquidação, vindo do extrato
 *      (/finance/202309/orders/{id}/statement_transactions).
 *
 * O sync grava o estimado na hora (senão a tela fica cega por dias) e um
 * segundo passo troca pelo real. `isMargemReal` diz qual dos dois está na linha.
 *
 * ---------------------------------------------------------------------------
 * GABARITO (dois pedidos reais, conferidos no Seller Center):
 *
 *   585600610037302600 — sem afiliado
 *     subtotal 59,00 | SFP -3,54 | taxa por item -6,00 | total taxas -9,54
 *     liquidado = 49,46
 *
 *   585597481084749163 — com afiliado
 *     subtotal 59,00 | SFP -3,54 | taxa por item -6,00 | afiliado -5,61
 *     total taxas -15,15 | liquidado = 43,85
 *
 * Daí saem as fórmulas:
 *   SFP           = 6% do subtotal      (59,00 x 0,06 = 3,54)
 *   taxa por item = R$ 6,00 fixos por unidade
 *   afiliado      = % do subtotal, VARIÁVEL por anúncio (5,61/59,00 = 9,5%)
 *   líquido       = subtotal - taxas
 * ---------------------------------------------------------------------------
 *
 * ⚠️  FRETE: no Programa de Frete (SFP) o frete NÃO é custo do vendedor. No
 * pedido do gabarito o comprador pagou R$ 4,60 de frete (R$ 22,60 menos R$
 * 18,00 de subsídio do TikTok) e NADA disso aparece na liquidação — o vendedor
 * paga o frete via os 6% do SFP. Por isso `freight = 0` e o custo do frete fica
 * dentro de `platformFee`. Jogar os 6% em "frete" faria o KPI de frete do
 * dashboard unificado misturar coisas diferentes e o consolidado parar de fechar
 * com o extrato do TikTok.
 *
 * Convenção de sinais, igual a ML e Shopee: `platformFee` é NEGATIVA, e a margem
 * é `valorTotal + taxaPlataforma + frete - cmv`.
 */
import { toFiniteNumber } from "@/lib/tiktok";

/**
 * A base do faturamento é o subtotal ANTES do desconto de plataforma. Ver
 * `resolveSubtotal()` para o porquê e a prova.
 *
 * A versão fica gravada em cada linha e entra na chave de cache, igual ao
 * `SHOPEE_FINANCIAL_RULE_VERSION`: é ela que permite detectar linha calculada
 * com regra velha e recalculá-la a partir do `raw_data`, sem chamada de API.
 */
export const TIKTOK_FINANCIAL_RULE_VERSION = "tiktok-gross-subtotal-v2";

/**
 * Taxas do BR. Vêm do env para poder corrigir sem deploy: o TikTok já mudou a
 * taxa por item de R$ 4,00 para R$ 6,00 uma vez, e quando mudar de novo o
 * histórico precisa continuar explicável — daí a regra versionada acima.
 */
function feeConfig(): { sfpRate: number; perItemFee: number } {
  const sfpRate = toFiniteNumber(process.env.TIKTOK_SFP_FEE_RATE);
  const perItemFee = toFiniteNumber(process.env.TIKTOK_PER_ITEM_FEE);
  return {
    sfpRate: sfpRate !== null && sfpRate >= 0 ? sfpRate : 0.06,
    perItemFee: perItemFee !== null && perItemFee >= 0 ? perItemFee : 6,
  };
}

export function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

type AnyRec = Record<string, unknown>;

function rec(value: unknown): AnyRec {
  return value !== null && typeof value === "object" ? (value as AnyRec) : {};
}

export type TiktokFinancials = {
  quantity: number;
  /** Subtotal antes dos descontos, quando a API informa. */
  grossProductSubtotal: number;
  /** Faturamento: subtotal dos itens (é o "Vendas líquidas estimadas"). */
  effectiveProductSubtotal: number;
  unitPrice: number;
  /** NEGATIVA, igual a ML e Shopee. Inclui SFP + taxa por item + afiliado. */
  platformFee: number;
  /** Zero no SFP: o frete não é custo do vendedor. Ver aviso no topo. */
  freight: number;
  /** subtotal + platformFee. É o "Valor total a ser liquidado". */
  netRevenue: number;
  /** true = veio do extrato; false = estimado. */
  isReal: boolean;
  breakdown: AnyRec;
};

/**
 * Quantidade, SKU e título de um pedido do TikTok.
 *
 * ⚠️  No TikTok cada `line_item` é UMA UNIDADE — não existe campo de quantidade
 * por item. Um pedido de 3 unidades do mesmo SKU vem como 3 line_items. Por isso
 * a quantidade é a CONTAGEM de line_items, não uma soma de `quantity`, ao
 * contrário do que `sumOrderQuantities` faz na Shopee.
 */
function summarizeItems(order: AnyRec): {
  quantity: number;
  sku: string | null;
  title: string;
  productId: string | null;
  skuBreakdown: Array<{ sku: string | null; units: number }>;
} {
  const items = Array.isArray(order.line_items) ? (order.line_items as AnyRec[]) : [];
  const bySku = new Map<string, { sku: string | null; units: number }>();

  for (const item of items) {
    const sku =
      typeof item.seller_sku === "string" && item.seller_sku !== ""
        ? item.seller_sku
        : typeof item.sku_id === "string" && item.sku_id !== ""
          ? item.sku_id
          : null;
    const key = sku ?? "__sem_sku__";
    const current = bySku.get(key) ?? { sku, units: 0 };
    current.units += 1;
    bySku.set(key, current);
  }

  const first = items[0] ?? {};
  const skuBreakdown = Array.from(bySku.values()).sort((a, b) => b.units - a.units);

  return {
    quantity: Math.max(1, items.length),
    sku: skuBreakdown[0]?.sku ?? null,
    title:
      typeof first.product_name === "string" && first.product_name !== ""
        ? first.product_name
        : "Pedido",
    productId:
      typeof first.product_id === "string" && first.product_id !== ""
        ? first.product_id
        : null,
    skuBreakdown,
  };
}

export type TiktokOrderSummary = ReturnType<typeof summarizeItems>;

export function summarizeTiktokItems(order: AnyRec): TiktokOrderSummary {
  return summarizeItems(order);
}

/**
 * Base do faturamento do pedido.
 *
 * ⚠️  NÃO é o `sub_total`, e essa distinção vale dinheiro.
 *
 * O `sub_total` vem já descontado do `platform_discount` — cupom bancado pelo
 * TikTok, não pelo vendedor. Num pedido real:
 *
 *   original_total_product_price  118,00
 *   platform_discount               2,00   <- quem paga é o TikTok
 *   sub_total                     116,00
 *
 * E o Seller Center, no detalhamento da liquidação DESSE pedido, declara
 * "Vendas líquidas estimadas R$ 118" e "Subtotal do item antes dos descontos
 * R$ 118", com taxa de SFP de R$ 7,08 — que é 6% de 118, não de 116. Ou seja: a
 * base é a CHEIA, e usar `sub_total` subestimava o faturamento e a taxa em todo
 * pedido com cupom.
 *
 * Já o `seller_discount` é desconto dado pelo VENDEDOR: esse sai do bolso dele e
 * portanto reduz o faturamento.
 *
 * Regra: faturamento = valor cheio - desconto do vendedor. Descontos da
 * plataforma são ignorados, porque não saem do bolso de quem vende.
 */
function resolveSubtotal(order: AnyRec): {
  effectiveSubtotal: number;
  grossSubtotal: number;
  platformDiscount: number;
  sellerDiscount: number;
} {
  const payment = rec(order.payment);

  const subTotal = toFiniteNumber(payment.sub_total);
  const originalTotal = toFiniteNumber(payment.original_total_product_price);
  const platformDiscount = toFiniteNumber(payment.platform_discount) ?? 0;
  const sellerDiscount = toFiniteNumber(payment.seller_discount) ?? 0;

  // Soma dos itens como último recurso, se o bloco `payment` vier incompleto.
  const itemsSum = (
    Array.isArray(order.line_items) ? (order.line_items as AnyRec[]) : []
  ).reduce(
    (sum, item) =>
      sum + (toFiniteNumber(item.sale_price) ?? toFiniteNumber(item.original_price) ?? 0),
    0,
  );

  // Preferimos o valor cheio declarado. Sem ele, reconstruímos devolvendo ao
  // sub_total o desconto que a plataforma bancou.
  const gross =
    originalTotal ?? (subTotal !== null ? subTotal + platformDiscount : null) ?? itemsSum;

  return {
    effectiveSubtotal: roundCurrency(gross - sellerDiscount),
    grossSubtotal: roundCurrency(gross),
    platformDiscount: roundCurrency(platformDiscount),
    sellerDiscount: roundCurrency(sellerDiscount),
  };
}

/**
 * Financeiro ESTIMADO, a partir do próprio pedido.
 *
 * ⚠️  A comissão de afiliado NÃO existe no payload do pedido — só aparece no
 * extrato. Então, para pedido com afiliado, o estimado é OTIMISTA (no gabarito:
 * 49,46 estimado contra 43,85 real). É exatamente por isso que a linha nasce
 * com `isMargemReal = false` e o passo de liquidação corrige depois.
 */
export function calculateTiktokEstimatedFinancials(order: AnyRec): TiktokFinancials {
  const { sfpRate, perItemFee } = feeConfig();
  const payment = rec(order.payment);
  const { quantity } = summarizeItems(order);

  const { effectiveSubtotal, grossSubtotal, platformDiscount, sellerDiscount } =
    resolveSubtotal(order);

  const sfpFee = roundCurrency(effectiveSubtotal * sfpRate);
  const itemFee = roundCurrency(perItemFee * quantity);
  const platformFee = roundCurrency(-(sfpFee + itemFee));

  const netRevenue = roundCurrency(effectiveSubtotal + platformFee);

  return {
    quantity,
    grossProductSubtotal: grossSubtotal,
    effectiveProductSubtotal: effectiveSubtotal,
    unitPrice: roundCurrency(effectiveSubtotal / Math.max(1, quantity)),
    platformFee,
    freight: 0,
    netRevenue,
    isReal: false,
    breakdown: {
      financialRuleVersion: TIKTOK_FINANCIAL_RULE_VERSION,
      source: "estimated",
      sfp_fee_rate: sfpRate,
      sfp_service_fee: -sfpFee,
      per_item_fee_unit: perItemFee,
      per_item_fee_total: -itemFee,
      // Só o extrato conhece a comissão de afiliado.
      affiliate_commission: null,
      buyer_shipping_fee: toFiniteNumber(payment.shipping_fee),
      buyer_total: toFiniteNumber(payment.total_amount),
      // Registrado para auditoria: é o valor que NÃO descontamos do
      // faturamento, porque quem banca é a plataforma.
      platform_discount: platformDiscount,
      seller_discount: sellerDiscount,
      gross_subtotal: grossSubtotal,
      shipping_type: order.shipping_type ?? null,
    },
  };
}

/**
 * Chaves candidatas do valor liquidado.
 *
 * Buscamos por candidatos em vez de ler um campo fixo porque as tabelas de campo
 * do extrato variam por mercado e por versão do endpoint (202309 x 202501). Ler
 * o valor liquidado e DERIVAR a taxa (taxa = liquidado - faturamento) é robusto:
 * pega a comissão de afiliado de graça, sem depender do nome do campo dela.
 */
const SETTLEMENT_KEYS = [
  "settlement_amount",
  "total_settlement_amount",
  "settlement_amount_value",
  "net_settlement_amount",
];

/**
 * Primeira transação do extrato.
 *
 * O extrato do BR (confirmado com um pedido real) vem como
 * `{ order_id, statement_transactions: [ { ...campos } ] }`, e é nessa transação
 * que estão os valores nomeados. Um pedido pode ter mais de uma transação
 * (ajuste, reembolso) — pegamos a primeira porque é a da venda, e o payload
 * inteiro fica guardado no breakdown para conferência.
 */
function firstTransaction(statement: AnyRec): AnyRec {
  const list = statement.statement_transactions;
  if (Array.isArray(list) && list.length > 0) return rec(list[0]);
  return {};
}

function deepFindNumber(node: unknown, keys: string[], depth = 0): number | null {
  if (depth > 6 || node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = deepFindNumber(child, keys, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  const obj = node as AnyRec;
  for (const key of keys) {
    if (key in obj) {
      const direct = toFiniteNumber(obj[key]);
      if (direct !== null) return direct;
      // Alguns campos monetários vêm como { amount, currency }.
      const nested = toFiniteNumber(rec(obj[key]).amount);
      if (nested !== null) return nested;
    }
  }
  for (const value of Object.values(obj)) {
    const found = deepFindNumber(value, keys, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Troca o estimado pelo REAL usando o extrato do pedido.
 *
 * O faturamento continua sendo o subtotal do pedido (dado confiável e já
 * gravado); a taxa passa a ser a diferença até o valor liquidado. Assim o
 * "Valor total a ser liquidado" do TikTok fecha 1:1 com
 * `valor_total + taxa_plataforma` da nossa linha.
 *
 * Devolve `null` quando o extrato não tem o que precisa — e nesse caso o
 * estimado é preservado, em vez de gravar um número inventado.
 */
export function applyTiktokSettlement(
  estimated: TiktokFinancials,
  statement: AnyRec,
): TiktokFinancials | null {
  const tx = firstTransaction(statement);

  /*
   * Campos confirmados com um extrato real do BR (pedido 585503462773131121):
   *
   *   fee_amount                  -15,15  -> TOTAL de taxas, já com tudo dentro
   *   affiliate_commission_amount  -5,61  -> comissão de afiliado, discriminada
   *   revenue_amount / net_sales    59,00 -> receita reconhecida pelo TikTok
   *   settlement_amount            43,85  -> o que cai na conta
   *
   * `fee_amount` é preferido à derivação (liquidado - faturamento) porque é o
   * número que o TikTok afirma, não o que a gente conclui: se um dia entrar
   * imposto ou ajuste no meio, a derivação embutiria isso na taxa sem avisar.
   * A derivação fica como reserva — e a conferência abaixo garante que as duas
   * contas não divirjam em silêncio.
   */
  const feeAmount = toFiniteNumber(tx.fee_amount);
  const settled = deepFindNumber(statement, SETTLEMENT_KEYS);
  if (feeAmount === null && settled === null) return null;

  const platformFee =
    feeAmount !== null
      ? roundCurrency(feeAmount)
      : roundCurrency((settled as number) - estimated.effectiveProductSubtotal);

  const netRevenue =
    settled !== null
      ? roundCurrency(settled)
      : roundCurrency(estimated.effectiveProductSubtotal + platformFee);

  const affiliate = toFiniteNumber(tx.affiliate_commission_amount);
  const revenue =
    toFiniteNumber(tx.revenue_amount) ?? toFiniteNumber(tx.net_sales_amount);

  // Divergência entre a receita do extrato e o subtotal que usamos como
  // faturamento. Nos pedidos conferidos batem; num pedido com desconto de
  // plataforma podem não bater, e é isso que decide se a nossa base está certa.
  // Fica gravado em vez de virar um ajuste silencioso na taxa.
  const revenueMismatch =
    revenue !== null && Math.abs(revenue - estimated.effectiveProductSubtotal) >= 0.01
      ? roundCurrency(revenue - estimated.effectiveProductSubtotal)
      : null;

  return {
    ...estimated,
    platformFee,
    freight: 0,
    netRevenue,
    isReal: true,
    breakdown: {
      ...estimated.breakdown,
      source: "settlement",
      settlement_amount: netRevenue,
      statement_fee_amount: feeAmount,
      statement_revenue_amount: revenue,
      revenue_mismatch: revenueMismatch,
      // Agora é o valor REAL do extrato, não mais null.
      affiliate_commission: affiliate,
      derived_platform_fee: platformFee,
      statement,
    },
  };
}
