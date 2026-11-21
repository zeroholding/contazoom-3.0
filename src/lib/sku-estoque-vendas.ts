import { Prisma } from "@prisma/client";
import { SHOPEE_PAGO, TIKTOK_PAGO } from "./vendasStatus";

type Canal = "ML" | "SP" | "TT";
const canais = {
  ML: {
    tabela: Prisma.sql`meli_venda`,
    itens: Prisma.sql`v.raw_data->'order'->'order_items'`,
    sku: Prisma.sql`COALESCE(NULLIF(TRIM(i.item->'item'->>'seller_sku'), ''), NULLIF(TRIM(i.item->'item'->>'sku'), ''))`,
    quantidades: [Prisma.sql`i.item->>'quantity'`],
    status: ["paid", "pago", "completed"],
  },
  SP: {
    tabela: Prisma.sql`shopee_venda`,
    itens: Prisma.sql`v.raw_data->'item_list'`,
    sku: Prisma.sql`COALESCE(NULLIF(TRIM(i.item->>'model_sku'), ''), NULLIF(TRIM(i.item->>'item_sku'), ''), NULLIF(TRIM(i.item->>'variation_sku'), ''))`,
    quantidades: ["model_quantity_purchased", "quantity_purchased", "quantity"].map((key) => Prisma.sql`i.item->>${key}::text`),
    status: SHOPEE_PAGO,
  },
  TT: {
    tabela: Prisma.sql`tiktok_venda`,
    itens: Prisma.sql`v.raw_data->'line_items'`,
    sku: Prisma.sql`NULLIF(TRIM(i.item->>'seller_sku'), '')`,
    quantidades: ["quantity", "sku_quantity"].map((key) => Prisma.sql`i.item->>${key}::text`),
    status: TIKTOK_PAGO,
  },
} satisfies Record<Canal, { tabela: Prisma.Sql; itens: Prisma.Sql; sku: Prisma.Sql; quantidades: Prisma.Sql[]; status: readonly string[] }>;

/** Expande os itens do pedido. O SKU resumido só é seguro em pedidos de item único ou na ausência do payload. */
export function linhasVendasEstoque(userId: string, inicio: Date, fim: Date): Prisma.Sql {
  const consultas = (Object.keys(canais) as Canal[]).map((canal) => {
    const origem = canais[canal];
    const quantidades = origem.quantidades.map((campo) => Prisma.sql`
      CASE WHEN (${campo}) ~ '^[1-9][0-9]{0,8}$' THEN (${campo})::bigint END
    `);

    return Prisma.sql`
      SELECT ${canal}::text AS canal, v.order_id AS pedido_id, v.data_venda,
        COALESCE(${origem.sku}, CASE WHEN jsonb_array_length(itens.lista) <= 1 THEN NULLIF(TRIM(v.sku), '') END) AS sku,
        COALESCE(${Prisma.join(quantidades)},
          CASE WHEN jsonb_array_length(itens.lista) <= 1 THEN v.quantidade::bigint END,
          ${canal === "ML" ? null : 1}::bigint) AS quantidade
      FROM ${origem.tabela} v
      CROSS JOIN LATERAL (
        SELECT CASE WHEN jsonb_typeof(${origem.itens}) = 'array'
          THEN ${origem.itens} ELSE '[]'::jsonb END AS lista
      ) itens
      LEFT JOIN LATERAL jsonb_array_elements(itens.lista) i(item) ON true
      WHERE v.user_id = ${userId}
        AND v.data_venda >= ${inicio}
        AND v.data_venda < ${fim}
        AND LOWER(v.status) IN (${Prisma.join(origem.status)})
    `;
  });
  return Prisma.join(consultas, " UNION ALL ");
}
