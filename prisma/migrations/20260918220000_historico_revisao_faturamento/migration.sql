-- Histórico append-only do valor mensal e revisão de competência congelada.

CREATE TABLE IF NOT EXISTS "faturamento_mensal_historico" (
  "id" TEXT NOT NULL,
  "faturamento_id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "acao" TEXT NOT NULL,
  "origem_anterior" TEXT,
  "origem_nova" TEXT NOT NULL,
  "valor_anterior" DECIMAL(14,2),
  "valor_novo" DECIMAL(14,2) NOT NULL,
  "detalhe" TEXT,
  "autor_id" TEXT NOT NULL,
  "autor_nome" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "faturamento_mensal_historico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "faturamento_mensal_historico_faturamento_id_created_at_idx"
  ON "faturamento_mensal_historico"("faturamento_id", "created_at");
CREATE INDEX IF NOT EXISTS "faturamento_mensal_historico_empresa_competencia_idx"
  ON "faturamento_mensal_historico"("empresa_id", "ano", "mes", "created_at");

DO $$ BEGIN
  ALTER TABLE "faturamento_mensal_historico"
    ADD CONSTRAINT "faturamento_mensal_historico_faturamento_id_fkey"
    FOREIGN KEY ("faturamento_id") REFERENCES "faturamento_mensal"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "faturamento_mensal_historico"
    ADD CONSTRAINT "faturamento_mensal_historico_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "faturamento_mensal_historico"
    ADD CONSTRAINT "faturamento_mensal_historico_acao_chk"
    CHECK ("acao" IN ('DEFINIDO', 'ALTERADO', 'LIBERADO_PARA_REVISAO'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "faturamento_mensal_historico"
    ADD CONSTRAINT "faturamento_mensal_historico_competencia_chk"
    CHECK ("mes" BETWEEN 1 AND 12 AND "ano" BETWEEN 2000 AND 2100);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
