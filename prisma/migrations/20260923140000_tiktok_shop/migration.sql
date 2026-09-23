-- =====================================================================
-- TikTok Shop — terceiro canal, depois de Mercado Livre e Shopee
-- =====================================================================
--
-- Tabelas NOVAS e ADITIVAS: nada de `meli_*`, `shopee_*` ou do módulo fiscal
-- é tocado. Rodar antes do deploy que usa as tabelas.
--
-- Duas colunas não têm equivalente nas outras plataformas:
--
--   `shop_cipher`        o TikTok exige esse identificador em toda chamada com
--                        escopo de loja, e ele entra no cálculo da assinatura
--                        HMAC. Sem ele guardado não se busca um pedido. Vem de
--                        /authorization/202309/shops, não do OAuth.
--
--   `refresh_expires_at` a API informa o prazo do refresh token. O valor
--                        observado é de ~100 anos, mas guardamos o que ela diz
--                        em vez de assumir que é eterno.
--
-- Sobre `is_margem_real`: no TikTok o financeiro só fica DEFINITIVO quando o
-- pedido liquida (entrega + ~7 dias no Brasil). O sync grava primeiro o
-- ESTIMADO (false), para a venda aparecer na hora, e um segundo passo troca
-- pelo valor do extrato e marca true.
--
-- Não há `tiktok_oauth_state`: `meli_oauth_state` e `shopee_oauth_state`
-- existem e estão órfãs (o state viaja em cookie HttpOnly). Criar a terceira
-- só acrescentaria tabela morta.
-- =====================================================================

-- CreateTable
CREATE TABLE "tiktok_account" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "shop_cipher" TEXT,
    "shop_name" TEXT,
    "seller_name" TEXT,
    "region" TEXT,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3),
    "refresh_token_invalid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_venda" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tiktok_account_id" TEXT NOT NULL,
    "data_venda" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "valor_total" DECIMAL(10,2) NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valor_unitario" DECIMAL(10,2) NOT NULL,
    "taxa_plataforma" DECIMAL(10,2),
    "valor_frete" DECIMAL(10,2) NOT NULL,
    "frete_ajuste" DECIMAL(12,2),
    "cmv" DECIMAL(10,2),
    "margem_contribuicao" DECIMAL(10,2),
    "is_margem_real" BOOLEAN NOT NULL DEFAULT false,
    "titulo" TEXT NOT NULL,
    "sku" TEXT,
    "comprador" TEXT NOT NULL,
    "item_id" VARCHAR(64),
    "logistic_type" TEXT,
    "envio_mode" TEXT,
    "shipping_status" TEXT,
    "shipping_id" TEXT,
    "prazo_despacho" TIMESTAMPTZ(3),
    "prazo_despacho_origem" VARCHAR(32),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "shipment_details" JSONB,
    "payment_details" JSONB,
    "plataforma" TEXT NOT NULL DEFAULT 'TikTok Shop',
    "canal" TEXT NOT NULL DEFAULT 'TT',
    "tags" JSONB,
    "internal_tags" JSONB,
    "raw_data" JSONB,
    "sincronizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_venda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_account_user_id_shop_id_key" ON "tiktok_account"("user_id", "shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_venda_order_id_key" ON "tiktok_venda"("order_id");

-- CreateIndex
CREATE INDEX "tiktok_venda_user_id_idx" ON "tiktok_venda"("user_id");

-- CreateIndex
CREATE INDEX "tiktok_venda_tiktok_account_id_idx" ON "tiktok_venda"("tiktok_account_id");

-- CreateIndex
CREATE INDEX "tiktok_venda_data_venda_idx" ON "tiktok_venda"("data_venda");

-- CreateIndex
CREATE INDEX "tiktok_venda_order_id_idx" ON "tiktok_venda"("order_id");

-- CreateIndex
CREATE INDEX "tiktok_venda_user_id_data_venda_idx" ON "tiktok_venda"("user_id", "data_venda" DESC);

-- CreateIndex
CREATE INDEX "tiktok_venda_sku_idx" ON "tiktok_venda"("sku");

-- CreateIndex
CREATE INDEX "tiktok_venda_status_idx" ON "tiktok_venda"("status");

-- CreateIndex
CREATE INDEX "tiktok_venda_user_id_prazo_despacho_idx" ON "tiktok_venda"("user_id", "prazo_despacho");

-- CreateIndex
CREATE INDEX "tiktok_venda_tiktok_account_id_is_margem_real_idx" ON "tiktok_venda"("tiktok_account_id", "is_margem_real");

-- AddForeignKey
ALTER TABLE "tiktok_account" ADD CONSTRAINT "tiktok_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_venda" ADD CONSTRAINT "tiktok_venda_tiktok_account_id_fkey" FOREIGN KEY ("tiktok_account_id") REFERENCES "tiktok_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_venda" ADD CONSTRAINT "tiktok_venda_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
