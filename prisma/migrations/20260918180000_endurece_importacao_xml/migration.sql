-- ============================================================================
-- ENDURECE A IMPORTAÇÃO FISCAL
--
-- Migration corretiva da 20260918120000. Ela pode já ter sido aplicada em
-- produção, portanto NENHUMA correção foi colocada retroativamente no arquivo
-- antigo: deploy não executa migration já marcada como concluída.
--
-- Corrige seis falhas encontradas na auditoria antes do primeiro uso real:
--
--   1. Evento de cancelamento passa a ser persistido e sobrevive a lote/ordem.
--   2. Documento registra se a empresa é EMITENTE ou DESTINATARIO.
--   3. Importação ganha PROCESSANDO/PARCIAL/FALHA e todos os contadores.
--   4. Timestamps fiscais passam a timestamptz; competência continua ano/mês civil.
--   5. Série fica canônica ("2", nunca "002"), igual ao mapa de canal.
--   6. Hash, situação e vínculos ganham CHECKs que espelham a aplicação.
--
-- Tudo idempotente. Nada é apagado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. documento_fiscal
-- ----------------------------------------------------------------------------
ALTER TABLE "documento_fiscal"
  ADD COLUMN IF NOT EXISTS "vinculo_empresa" TEXT NOT NULL DEFAULT 'EMITENTE',
  ADD COLUMN IF NOT EXISTS "assinatura_valida" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "documento_fiscal"
  ALTER COLUMN "assinatura_valida" SET DEFAULT false;

-- Linhas eventualmente importadas pela versão anterior não foram verificadas
-- criptograficamente. Elas deixam de somar até o mesmo XML ser reenviado; o retry
-- valida a assinatura e reclassifica sem duplicar a nota.
UPDATE "documento_fiscal"
   SET "conta_faturamento" = false,
       "motivo_exclusao" = 'ASSINATURA_NAO_VALIDADA'
 WHERE "assinatura_valida" = false
   AND "conta_faturamento" = true;

-- O agregado mensal da versão anterior pode continuar carregando valor dessas
-- linhas. Zera apenas a origem XML; MANUAL/MISTO preservam o valor declarado e
-- passam a mostrar valor_apurado 0 até os XMLs serem reenviados e validados.
UPDATE "faturamento_mensal"
   SET "valor_apurado" = 0,
       "documentos" = 0,
       "valor" = CASE WHEN "origem" = 'XML' THEN 0 ELSE "valor" END,
       "apurado_em" = CURRENT_TIMESTAMP,
       "updated_at" = CURRENT_TIMESTAMP
 WHERE EXISTS (
   SELECT 1
     FROM "documento_fiscal" d
    WHERE d."empresa_id" = "faturamento_mensal"."empresa_id"
      AND d."ano" = "faturamento_mensal"."ano"
      AND d."mes" = "faturamento_mensal"."mes"
      AND d."assinatura_valida" = false
 );

DO $$ BEGIN
  ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_vinculo_empresa_chk"
    CHECK ("vinculo_empresa" IN ('EMITENTE', 'DESTINATARIO'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- O código antigo guardou o instante UTC numa coluna sem fuso. `AT TIME ZONE
-- 'UTC'` preserva esse instante ao transformar o tipo; não interpreta como fuso
-- da sessão do banco, que varia por ambiente.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'documento_fiscal'
       AND column_name = 'emitido_em'
       AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "documento_fiscal"
      ALTER COLUMN "emitido_em" TYPE TIMESTAMPTZ(3)
      USING "emitido_em" AT TIME ZONE 'UTC';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'documento_fiscal'
       AND column_name = 'cancelado_em'
       AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "documento_fiscal"
      ALTER COLUMN "cancelado_em" TYPE TIMESTAMPTZ(3)
      USING "cancelado_em" AT TIME ZONE 'UTC';
  END IF;
END $$;

-- NF-e admite série numérica. Canonizar antes do CHECK é o que mantém a consulta
-- por canal igual ao resumo: sem isto, mapa "2" casa em memória com nota "002",
-- mas `WHERE serie IN ('2')` não a encontra.
UPDATE "documento_fiscal"
   SET "serie" = ("serie"::INTEGER)::TEXT
 WHERE "serie" ~ '^\d{1,3}$'
   AND "serie" <> ("serie"::INTEGER)::TEXT;

DO $$ BEGIN
  ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_serie_canonica_chk"
    CHECK ("serie" ~ '^(0|[1-9][0-9]{0,2})$');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_situacao_chk"
    CHECK ("situacao" IN ('AUTORIZADA', 'CANCELADA', 'DENEGADA', 'NAO_AUTORIZADA'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_hash_chk"
    CHECK ("arquivo_hash" ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Alinha o default já existente no banco com o schema Prisma explícito.
ALTER TABLE "documento_fiscal"
  ALTER COLUMN "cfops" SET DEFAULT ARRAY[]::TEXT[];

-- ----------------------------------------------------------------------------
-- 2. importacao_xml
-- ----------------------------------------------------------------------------
ALTER TABLE "importacao_xml"
  ADD COLUMN IF NOT EXISTS "sessao_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "lotes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lotes_ativos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "encerrar_quando_ociosa" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "finalizado_em" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nao_processados" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "eventos_aplicados" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "importacao_xml" ALTER COLUMN "situacao" SET DEFAULT 'PROCESSANDO';

CREATE UNIQUE INDEX IF NOT EXISTS "importacao_xml_sessao_id_key"
  ON "importacao_xml"("sessao_id");

DO $$ BEGIN
  ALTER TABLE "importacao_xml" ADD CONSTRAINT "importacao_xml_situacao_chk"
    CHECK ("situacao" IN ('PROCESSANDO', 'CONCLUIDA', 'PARCIAL', 'FALHA', 'INTERROMPIDA'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "importacao_xml" ADD CONSTRAINT "importacao_xml_contadores_v2_chk"
    CHECK (
      "nao_processados" >= 0 AND "eventos_aplicados" >= 0 AND "lotes" >= 0
      AND "lotes_ativos" >= 0
      AND "importados" + "duplicados" + "ignorados" + "com_erro" + "nao_processados"
          <= "arquivos_enviados"
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 3. empresa_serie_canal — mesma representação canônica das notas
-- ----------------------------------------------------------------------------
UPDATE "empresa_serie_canal"
   SET "serie" = ("serie"::INTEGER)::TEXT
 WHERE "serie" ~ '^\d{1,3}$'
   AND "serie" <> ("serie"::INTEGER)::TEXT;

DO $$ BEGIN
  ALTER TABLE "empresa_serie_canal" ADD CONSTRAINT "empresa_serie_canal_serie_canonica_chk"
    CHECK ("serie" ~ '^(0|[1-9][0-9]{0,2})$');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 4. evento_fiscal
--
-- Append-only no conteúdo. A situação muda de PENDENTE para APLICADO quando a
-- nota chega depois; bytes, hash, tipo, sequência e cStat nunca são reescritos.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "evento_fiscal" (
  "id" TEXT NOT NULL,
  "evento_id" TEXT NOT NULL,
  "chave_documento" VARCHAR(44) NOT NULL,
  "ano" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "tipo_evento" VARCHAR(6) NOT NULL,
  "sequencia" INTEGER NOT NULL,
  "status_sefaz" VARCHAR(3),
  "ambiente" VARCHAR(1) NOT NULL,
  "documento_autor" VARCHAR(14),
  "assinatura_valida" BOOLEAN NOT NULL DEFAULT false,
  "registrado_em" TIMESTAMPTZ(3),
  "justificativa" TEXT,
  "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
  "motivo" TEXT,
  "empresa_id" TEXT,
  "documento_id" TEXT,
  "importacao_id" TEXT,
  "arquivo" TEXT NOT NULL,
  "arquivo_bytes" INTEGER NOT NULL,
  "arquivo_hash" VARCHAR(64) NOT NULL,
  "importado_por_id" TEXT NOT NULL,
  "importado_por_nome" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "evento_fiscal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evento_fiscal"
  ALTER COLUMN "assinatura_valida" SET DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "evento_fiscal_evento_id_key"
  ON "evento_fiscal"("evento_id");
CREATE UNIQUE INDEX IF NOT EXISTS "evento_fiscal_arquivo_key"
  ON "evento_fiscal"("arquivo");
CREATE UNIQUE INDEX IF NOT EXISTS "evento_fiscal_identidade"
  ON "evento_fiscal"("chave_documento", "tipo_evento", "sequencia");
CREATE INDEX IF NOT EXISTS "evento_fiscal_empresa_competencia_idx"
  ON "evento_fiscal"("empresa_id", "ano", "mes");
CREATE INDEX IF NOT EXISTS "evento_fiscal_chave_documento_situacao_idx"
  ON "evento_fiscal"("chave_documento", "situacao");
CREATE INDEX IF NOT EXISTS "evento_fiscal_empresa_id_created_at_idx"
  ON "evento_fiscal"("empresa_id", "created_at");
CREATE INDEX IF NOT EXISTS "evento_fiscal_documento_id_idx"
  ON "evento_fiscal"("documento_id");
CREATE INDEX IF NOT EXISTS "evento_fiscal_importacao_id_idx"
  ON "evento_fiscal"("importacao_id");

DO $$ BEGIN
  ALTER TABLE "evento_fiscal" ADD CONSTRAINT "evento_fiscal_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "evento_fiscal" ADD CONSTRAINT "evento_fiscal_documento_id_fkey"
    FOREIGN KEY ("documento_id") REFERENCES "documento_fiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "evento_fiscal" ADD CONSTRAINT "evento_fiscal_importacao_id_fkey"
    FOREIGN KEY ("importacao_id") REFERENCES "importacao_xml"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "evento_fiscal" ADD CONSTRAINT "evento_fiscal_chave_chk"
    CHECK ("chave_documento" ~ '^[0-9]{44}$');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "evento_fiscal" ADD CONSTRAINT "evento_fiscal_competencia_chk"
    CHECK ("mes" BETWEEN 1 AND 12 AND "ano" BETWEEN 2000 AND 2100);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "evento_fiscal" ADD CONSTRAINT "evento_fiscal_tipo_chk"
    CHECK ("tipo_evento" ~ '^[0-9]{6}$' AND "sequencia" > 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "evento_fiscal" ADD CONSTRAINT "evento_fiscal_situacao_chk"
    CHECK ("situacao" IN ('PENDENTE', 'APLICADO', 'IGNORADO', 'REJEITADO'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "evento_fiscal" ADD CONSTRAINT "evento_fiscal_arquivo_chk"
    CHECK ("arquivo_bytes" > 0 AND "arquivo_hash" ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
