CREATE TABLE "sku_estoque_movimento" (
    "id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" BIGINT NOT NULL,
    "data_base" DATE NOT NULL,
    "canal" TEXT,
    "pedido_id" TEXT,
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sku_estoque_movimento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sku_estoque_movimento_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sku_estoque_movimento_tipo_check" CHECK (
        ("tipo" = 'inicial' AND "quantidade" >= 0 AND "canal" IS NULL AND "pedido_id" IS NULL)
        OR ("tipo" = 'entrada' AND "quantidade" > 0 AND "canal" IS NULL AND "pedido_id" IS NULL)
        OR ("tipo" = 'saida' AND "quantidade" < 0 AND "canal" IS NULL AND "pedido_id" IS NULL)
        OR ("tipo" = 'venda' AND "quantidade" < 0 AND "canal" IN ('ML', 'SP', 'TT') AND "canal" IS NOT NULL AND "pedido_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "sku_estoque_movimento_sku_id_canal_pedido_id_key"
    ON "sku_estoque_movimento" ("sku_id", "canal", "pedido_id");
CREATE UNIQUE INDEX "sku_estoque_movimento_inicial_key"
    ON "sku_estoque_movimento" ("sku_id") WHERE "tipo" = 'inicial';
CREATE INDEX "sku_estoque_movimento_sku_id_created_at_id_idx"
    ON "sku_estoque_movimento" ("sku_id", "created_at" DESC, "id" DESC);
