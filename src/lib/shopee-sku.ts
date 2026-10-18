import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * SKU de um item de pedido da Shopee: o primeiro PREENCHIDO entre `item_sku`
 * (SKU do produto), `model_sku` (SKU da variação) e `variation_sku`.
 *
 * Anúncio com variações costuma ter o SKU só na variação, e a Shopee manda
 * `item_sku: ""`. Com `??` o texto vazio "ganhava" (ele só pula null/undefined),
 * a venda era gravada sem SKU e ficava sem CMV. A mesma ordem é usada em
 * anuncios-data, expedicao-data e sku-discovery.
 */
export function skuDoItemShopee(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const campos = item as Record<string, unknown>;
  for (const campo of ["item_sku", "model_sku", "variation_sku"]) {
    const valor = campos[campo];
    if (valor === null || valor === undefined) continue;
    const texto = String(valor).trim();
    if (texto) return texto;
  }
  return null;
}

/**
 * Devolve o SKU às vendas da conta que foram gravadas sem ele, lendo o pedido
 * cru já guardado em `raw_data` (sem chamar a API da Shopee).
 *
 * Conserta o que o sync gravou enquanto lia o SKU com `??`: pedido que a Shopee
 * não devolve de novo (sem mudança) não passaria pelo sync e ficaria sem SKU
 * para sempre. Só toca venda sem SKU que tem SKU no pedido cru, então é
 * idempotente: depois da primeira vez não encontra mais nada.
 */
export async function repararSkuVazioShopee(accountId: string, userId: string): Promise<number> {
  const sku = (campo: string) =>
    Prisma.sql`NULLIF(TRIM(v."raw_data"->'item_list'->0->>${campo}), '')`;

  return prisma.$executeRaw(Prisma.sql`
    UPDATE "shopee_venda" AS v
    -- "atualizado_em" fica como está de propósito: a cura financeira do sync
    -- escolhe os pedidos pelo atualizado_em mais antigo, e este conserto não
    -- pode empurrar esses pedidos para o fim da fila.
    SET "sku" = LEFT(COALESCE(${sku("item_sku")}, ${sku("model_sku")}, ${sku("variation_sku")}), 255)
    WHERE v."shopee_account_id" = ${accountId}
      AND v."user_id" = ${userId}
      AND (v."sku" IS NULL OR TRIM(v."sku") = '')
      AND jsonb_typeof(v."raw_data"->'item_list') = 'array'
      AND COALESCE(${sku("item_sku")}, ${sku("model_sku")}, ${sku("variation_sku")}) IS NOT NULL
  `);
}
