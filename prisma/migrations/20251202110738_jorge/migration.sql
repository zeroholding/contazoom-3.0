-- AlterTable
ALTER TABLE "bling_account" ADD COLUMN     "refresh_token_invalid_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "conta_pagar" ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "conta_receber" ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "meli_account" ADD COLUMN     "refresh_token_invalid_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "shopee_account" ADD COLUMN     "refresh_token_invalid_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "aliquota_imposto" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "aliquota" DECIMAL(5,2) NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aliquota_imposto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aliquota_imposto_user_id_idx" ON "aliquota_imposto"("user_id");

-- CreateIndex
CREATE INDEX "aliquota_imposto_conta_idx" ON "aliquota_imposto"("conta");

-- CreateIndex
CREATE INDEX "aliquota_imposto_data_inicio_data_fim_idx" ON "aliquota_imposto"("data_inicio", "data_fim");

-- CreateIndex
CREATE INDEX "aliquota_imposto_ativo_idx" ON "aliquota_imposto"("ativo");

-- CreateIndex
CREATE INDEX "conta_pagar_origem_idx" ON "conta_pagar"("origem");

-- CreateIndex
CREATE INDEX "conta_receber_origem_idx" ON "conta_receber"("origem");

-- CreateIndex
CREATE INDEX "meli_venda_user_id_data_venda_idx" ON "meli_venda"("user_id", "data_venda" DESC);

-- CreateIndex
CREATE INDEX "meli_venda_sku_idx" ON "meli_venda"("sku");

-- CreateIndex
CREATE INDEX "meli_venda_status_idx" ON "meli_venda"("status");

-- CreateIndex
CREATE INDEX "shopee_venda_user_id_data_venda_idx" ON "shopee_venda"("user_id", "data_venda" DESC);

-- CreateIndex
CREATE INDEX "shopee_venda_sku_idx" ON "shopee_venda"("sku");

-- CreateIndex
CREATE INDEX "shopee_venda_status_idx" ON "shopee_venda"("status");

-- AddForeignKey
ALTER TABLE "aliquota_imposto" ADD CONSTRAINT "aliquota_imposto_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
