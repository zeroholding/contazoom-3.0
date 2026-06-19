-- CreateTable
CREATE TABLE "flex_shipping_config" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "custo_por_pacote" DECIMAL(10,2) NOT NULL,
    "unidades_por_cobranca" INTEGER NOT NULL DEFAULT 1,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flex_shipping_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flex_shipping_config_user_id_idx" ON "flex_shipping_config"("user_id");

-- AddForeignKey
ALTER TABLE "flex_shipping_config" ADD CONSTRAINT "flex_shipping_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
