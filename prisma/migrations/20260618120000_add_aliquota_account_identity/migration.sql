ALTER TABLE "aliquota_imposto"
ADD COLUMN "account_id" TEXT,
ADD COLUMN "plataforma" TEXT;

CREATE INDEX "aliquota_imposto_user_id_plataforma_account_id_idx"
ON "aliquota_imposto"("user_id", "plataforma", "account_id");
