-- Persiste CT-e e outros modelos reconhecidos que não entram no faturamento.
-- Sem esta tabela, o painel prometia "822 arquivos lidos" mas só conseguia contar
-- as 458 NF-e; os 361 CT-e desapareciam após a resposta do upload.

CREATE TABLE IF NOT EXISTS "arquivo_fiscal_ignorado" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "importacao_id" TEXT,
  "chave" VARCHAR(44),
  "modelo" VARCHAR(2),
  "cnpj_emitente" VARCHAR(14),
  "nome_emitente" TEXT,
  "emitido_em" TIMESTAMPTZ(3),
  "ano" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "valor_total" DECIMAL(14,2) NOT NULL,
  "motivo_exclusao" TEXT NOT NULL,
  "arquivo" TEXT NOT NULL,
  "arquivo_bytes" INTEGER NOT NULL,
  "arquivo_hash" VARCHAR(64) NOT NULL,
  "importado_por_id" TEXT NOT NULL,
  "importado_por_nome" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "arquivo_fiscal_ignorado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "arquivo_fiscal_ignorado_chave_key"
  ON "arquivo_fiscal_ignorado"("chave");
CREATE UNIQUE INDEX IF NOT EXISTS "arquivo_fiscal_ignorado_arquivo_key"
  ON "arquivo_fiscal_ignorado"("arquivo");
CREATE INDEX IF NOT EXISTS "arquivo_fiscal_ignorado_empresa_competencia_idx"
  ON "arquivo_fiscal_ignorado"("empresa_id", "ano", "mes");
CREATE INDEX IF NOT EXISTS "arquivo_fiscal_ignorado_motivo_idx"
  ON "arquivo_fiscal_ignorado"("motivo_exclusao");
CREATE INDEX IF NOT EXISTS "arquivo_fiscal_ignorado_importacao_id_idx"
  ON "arquivo_fiscal_ignorado"("importacao_id");

DO $$ BEGIN
  ALTER TABLE "arquivo_fiscal_ignorado"
    ADD CONSTRAINT "arquivo_fiscal_ignorado_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "arquivo_fiscal_ignorado"
    ADD CONSTRAINT "arquivo_fiscal_ignorado_importacao_id_fkey"
    FOREIGN KEY ("importacao_id") REFERENCES "importacao_xml"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "arquivo_fiscal_ignorado"
    ADD CONSTRAINT "arquivo_fiscal_ignorado_competencia_chk"
    CHECK ("mes" BETWEEN 1 AND 12 AND "ano" BETWEEN 2000 AND 2100);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "arquivo_fiscal_ignorado"
    ADD CONSTRAINT "arquivo_fiscal_ignorado_arquivo_chk"
    CHECK (
      "valor_total" >= 0 AND "arquivo_bytes" > 0
      AND "arquivo_hash" ~ '^[0-9a-f]{64}$'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
