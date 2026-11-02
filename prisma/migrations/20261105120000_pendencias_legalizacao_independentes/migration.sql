-- ============================================================================
-- PENDÊNCIAS INDEPENDENTES NA LEGALIZAÇÃO
--
-- Demanda: permitir mais de uma pendência simultânea no processo de
-- legalização, cada uma independente. Antes o bloqueio eram três colunas no
-- próprio processo (`bloqueio_motivo`, `bloqueio_desde`, `bloqueio_responsavel`)
-- — modelo de pendência única: registrar outra exigia resolver a atual.
--
-- Esta migration:
--   1. cria `processo_legalizacao_pendencia`
--   2. copia a pendência ativa de cada processo para a tabela nova
--   3. remove as três colunas do modelo antigo — SOMENTE da legalização; a
--      apuração (`tarefa_apuracao`) continua com o bloqueio único dela
--
-- Idempotente (IF NOT EXISTS / DROP IF EXISTS / guarda de coluna) pelo mesmo
-- motivo das demais: produção tem drift conhecido em relação ao histórico de
-- migrations e o deploy roda `prisma migrate deploy`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela nova
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "processo_legalizacao_pendencia" (
    "id" TEXT NOT NULL,
    "processo_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvida_em" TIMESTAMP(3),
    "resolucao_detalhe" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processo_legalizacao_pendencia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "processo_legalizacao_pendencia_processo_id_idx"
    ON "processo_legalizacao_pendencia"("processo_id");

CREATE INDEX IF NOT EXISTS "processo_legalizacao_pendencia_processo_id_resolvida_em_idx"
    ON "processo_legalizacao_pendencia"("processo_id", "resolvida_em");

DO $$ BEGIN
    ALTER TABLE "processo_legalizacao_pendencia" ADD CONSTRAINT "processo_legalizacao_pendencia_processo_id_fkey"
        FOREIGN KEY ("processo_id") REFERENCES "processo_legalizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Migração da pendência única para a tabela nova
--
-- Copia a pendência ATIVA (`bloqueada = true`) preservando desde quando o
-- processo está travado — que é justamente o número que cobra ação. Sem
-- motivo registrado, a linha nasce com texto explícito para não virar card
-- vazio na tela.
--
-- Id gerado em hex de 32 caracteres: o código nunca interpreta o formato do
-- id, só o compara. A guarda NOT EXISTS torna a repetição inofensiva.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'processo_legalizacao' AND column_name = 'bloqueio_motivo'
    ) THEN
        INSERT INTO "processo_legalizacao_pendencia"
            ("id", "processo_id", "motivo", "responsavel", "desde", "created_at", "updated_at")
        SELECT
            md5(random()::text || clock_timestamp()::text || p."id"),
            p."id",
            COALESCE(p."bloqueio_motivo", 'Pendência registrada antes da migração'),
            COALESCE(p."bloqueio_responsavel", 'TERCEIRO'),
            COALESCE(p."bloqueio_desde", CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM "processo_legalizacao" p
        WHERE p."bloqueada" = true
          AND NOT EXISTS (
              SELECT 1 FROM "processo_legalizacao_pendencia" q
              WHERE q."processo_id" = p."id"
          );
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Remove o modelo antigo (somente da legalização)
-- ----------------------------------------------------------------------------
ALTER TABLE "processo_legalizacao" DROP COLUMN IF EXISTS "bloqueio_motivo";
ALTER TABLE "processo_legalizacao" DROP COLUMN IF EXISTS "bloqueio_desde";
ALTER TABLE "processo_legalizacao" DROP COLUMN IF EXISTS "bloqueio_responsavel";
