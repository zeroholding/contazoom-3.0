-- ============================================================================
-- DECLARAÇÃO DE FATURAMENTO — snapshot imutável de 12 meses
--
-- Uma tabela nova. Nada existente é apagado ou reescrito. A emissão congela
-- `faturamento_mensal` pela aplicação, dentro da mesma transação que cria o
-- snapshot; migration apenas cria a estrutura.
--
-- Correção gera NOVA declaração e marca a anterior SUBSTITUIDA. UPDATE existe
-- somente para essa situação/referência; `linhas`, valores e snapshot da empresa
-- nunca são reescritos pela aplicação.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "declaracao_faturamento" (
  "id" TEXT NOT NULL,
  "protocolo" VARCHAR(20) NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "ano_inicio" INTEGER NOT NULL,
  "mes_inicio" INTEGER NOT NULL,
  "ano_fim" INTEGER NOT NULL,
  "mes_fim" INTEGER NOT NULL,
  "linhas" JSONB NOT NULL,
  "valor_total" DECIMAL(14,2) NOT NULL,
  "media_mensal" DECIMAL(14,2) NOT NULL,
  "razao_social_na_emissao" TEXT NOT NULL,
  "cnpj_na_emissao" VARCHAR(14) NOT NULL,
  "regime_na_emissao" TEXT NOT NULL,
  "finalidade" TEXT,
  "situacao" TEXT NOT NULL DEFAULT 'VIGENTE',
  "substituida_por_id" TEXT,
  "emitida_por_id" TEXT NOT NULL,
  "emitida_por_nome" TEXT NOT NULL,
  "conteudo_hash" VARCHAR(64) NOT NULL,
  "versao_template" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "declaracao_faturamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "declaracao_faturamento_protocolo_key"
  ON "declaracao_faturamento"("protocolo");
CREATE UNIQUE INDEX IF NOT EXISTS "declaracao_faturamento_idempotency_key_key"
  ON "declaracao_faturamento"("idempotency_key");
CREATE INDEX IF NOT EXISTS "declaracao_faturamento_empresa_id_created_at_idx"
  ON "declaracao_faturamento"("empresa_id", "created_at");
CREATE INDEX IF NOT EXISTS "declaracao_faturamento_periodo_idx"
  ON "declaracao_faturamento"("empresa_id", "ano_inicio", "mes_inicio", "ano_fim", "mes_fim");
CREATE INDEX IF NOT EXISTS "declaracao_faturamento_situacao_idx"
  ON "declaracao_faturamento"("situacao");

-- RESTRICT: declaração emitida é histórico fiscal e impede apagar a empresa.
DO $$ BEGIN
  ALTER TABLE "declaracao_faturamento"
    ADD CONSTRAINT "declaracao_faturamento_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "declaracao_faturamento"
    ADD CONSTRAINT "declaracao_faturamento_substituida_por_id_fkey"
    FOREIGN KEY ("substituida_por_id") REFERENCES "declaracao_faturamento"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "declaracao_faturamento"
    ADD CONSTRAINT "declaracao_faturamento_competencias_chk"
    CHECK (
      "mes_inicio" BETWEEN 1 AND 12 AND "mes_fim" BETWEEN 1 AND 12
      AND "ano_inicio" BETWEEN 2000 AND 2100
      AND "ano_fim" BETWEEN 2000 AND 2100
      AND ("ano_fim" * 12 + "mes_fim") - ("ano_inicio" * 12 + "mes_inicio") = 11
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "declaracao_faturamento"
    ADD CONSTRAINT "declaracao_faturamento_valores_chk"
    CHECK ("valor_total" >= 0 AND "media_mensal" >= 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "declaracao_faturamento"
    ADD CONSTRAINT "declaracao_faturamento_situacao_chk"
    CHECK (
      ("situacao" = 'VIGENTE' AND "substituida_por_id" IS NULL)
      OR ("situacao" = 'SUBSTITUIDA' AND "substituida_por_id" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "declaracao_faturamento"
    ADD CONSTRAINT "declaracao_faturamento_hash_chk"
    CHECK ("conteudo_hash" ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "declaracao_faturamento"
    ADD CONSTRAINT "declaracao_faturamento_linhas_chk"
    CHECK (jsonb_typeof("linhas") = 'array' AND jsonb_array_length("linhas") = 12);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
