-- ============================================================================
-- MÓDULO DE TAREFAS CONTÁBEIS
--
-- Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md
--
-- Esta migration é 100% ADITIVA. Ela:
--   - cria 7 tabelas novas
--   - NÃO altera nenhuma tabela existente
--   - NÃO apaga nem modifica nenhum dado
--
-- Todo comando é idempotente (IF NOT EXISTS / EXCEPTION duplicate_object)
-- porque o banco de produção tem drift conhecido em relação ao histórico de
-- migrations: a coluna `usuario.role` não aparece em nenhuma migration, ou seja
-- foi aplicada por `db push` ou SQL manual. O deploy roda `prisma migrate
-- deploy`, então esta migration precisa tolerar rodar num banco fora de
-- sincronia sem abortar. Mesmo padrão de 20260520165058_add_subfolder_support.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- empresa
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "empresa" (
    "id" TEXT NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "regime" TEXT NOT NULL,
    "uf" VARCHAR(2),
    "municipio" TEXT,
    "inicio_atividade" TIMESTAMP(3),
    "situacao" TEXT NOT NULL DEFAULT 'ATIVA',
    "tributo_local" TEXT NOT NULL DEFAULT 'AMBOS',
    "user_id" TEXT,
    "responsavel_id" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- Colunas adicionadas depois entram aqui, para banco que já tinha a tabela.
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "tributo_local" TEXT NOT NULL DEFAULT 'AMBOS';
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "responsavel_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "empresa_cnpj_key" ON "empresa"("cnpj");
CREATE INDEX IF NOT EXISTS "empresa_user_id_idx" ON "empresa"("user_id");
CREATE INDEX IF NOT EXISTS "empresa_regime_idx" ON "empresa"("regime");
CREATE INDEX IF NOT EXISTS "empresa_situacao_idx" ON "empresa"("situacao");
CREATE INDEX IF NOT EXISTS "empresa_razao_social_idx" ON "empresa"("razao_social");

-- SetNull e não Cascade: apagar o login nunca pode apagar o histórico fiscal.
DO $$ BEGIN
    ALTER TABLE "empresa" ADD CONSTRAINT "empresa_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "empresa" ADD CONSTRAINT "empresa_responsavel_id_fkey"
        FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- empresa_regime_historico
--
-- Linha do tempo do regime. Sem ela, desenquadramento reescreveria o passado.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "empresa_regime_historico" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "vigencia_inicio" TIMESTAMP(3) NOT NULL,
    "vigencia_fim" TIMESTAMP(3),
    "motivo" TEXT,
    "registrado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_regime_historico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "empresa_regime_historico_empresa_id_idx" ON "empresa_regime_historico"("empresa_id");
CREATE INDEX IF NOT EXISTS "empresa_regime_historico_vigencia_inicio_idx" ON "empresa_regime_historico"("vigencia_inicio");

DO $$ BEGIN
    ALTER TABLE "empresa_regime_historico" ADD CONSTRAINT "empresa_regime_historico_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- tarefa_apuracao
--
-- ano/mes como INTEGER, não DateTime: competência não sofre fuso horário.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tarefa_apuracao" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "regime" TEXT NOT NULL,
    "etapa_atual" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_DOCUMENTACAO',
    "bloqueada" BOOLEAN NOT NULL DEFAULT false,
    "bloqueio_motivo" TEXT,
    "bloqueio_desde" TIMESTAMP(3),
    "bloqueio_responsavel" TEXT,
    "prazo_entrega" TIMESTAMP(3),
    "iniciada_em" TIMESTAMP(3),
    "concluida_em" TIMESTAMP(3),
    "responsavel_id" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_apuracao_pkey" PRIMARY KEY ("id")
);

-- Uma apuração por empresa por competência. É a trava que torna a abertura
-- do mês idempotente: clicar duas vezes não cria competência duplicada.
CREATE UNIQUE INDEX IF NOT EXISTS "empresa_competencia" ON "tarefa_apuracao"("empresa_id", "ano", "mes");
CREATE INDEX IF NOT EXISTS "tarefa_apuracao_status_idx" ON "tarefa_apuracao"("status");
CREATE INDEX IF NOT EXISTS "tarefa_apuracao_ano_mes_idx" ON "tarefa_apuracao"("ano", "mes");
CREATE INDEX IF NOT EXISTS "tarefa_apuracao_bloqueada_idx" ON "tarefa_apuracao"("bloqueada");
CREATE INDEX IF NOT EXISTS "tarefa_apuracao_prazo_entrega_idx" ON "tarefa_apuracao"("prazo_entrega");
CREATE INDEX IF NOT EXISTS "tarefa_apuracao_responsavel_id_idx" ON "tarefa_apuracao"("responsavel_id");

DO $$ BEGIN
    ALTER TABLE "tarefa_apuracao" ADD CONSTRAINT "tarefa_apuracao_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tarefa_apuracao" ADD CONSTRAINT "tarefa_apuracao_responsavel_id_fkey"
        FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- tarefa_apuracao_etapa
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tarefa_apuracao_etapa" (
    "id" TEXT NOT NULL,
    "tarefa_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "responsavel_tipo" TEXT NOT NULL,
    "opcional" BOOLEAN NOT NULL DEFAULT false,
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "iniciada_em" TIMESTAMP(3),
    "concluida_em" TIMESTAMP(3),
    "concluida_por" TEXT,
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_apuracao_etapa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tarefa_apuracao_etapa_tarefa_id_numero_key" ON "tarefa_apuracao_etapa"("tarefa_id", "numero");
CREATE INDEX IF NOT EXISTS "tarefa_apuracao_etapa_tarefa_id_idx" ON "tarefa_apuracao_etapa"("tarefa_id");
CREATE INDEX IF NOT EXISTS "tarefa_apuracao_etapa_situacao_idx" ON "tarefa_apuracao_etapa"("situacao");

DO $$ BEGIN
    ALTER TABLE "tarefa_apuracao_etapa" ADD CONSTRAINT "tarefa_apuracao_etapa_tarefa_id_fkey"
        FOREIGN KEY ("tarefa_id") REFERENCES "tarefa_apuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- processo_legalizacao
--
-- empresa_id é NULO por necessidade: abertura de CNPJ não tem CNPJ ainda.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "processo_legalizacao" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "identificacao_provisoria" TEXT,
    "tipo" TEXT NOT NULL,
    "etapa_atual" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_DOCUMENTACAO',
    "bloqueada" BOOLEAN NOT NULL DEFAULT false,
    "bloqueio_motivo" TEXT,
    "bloqueio_desde" TIMESTAMP(3),
    "bloqueio_responsavel" TEXT,
    "protocolo_externo" TEXT,
    "orgao_externo" TEXT,
    "prazo_estimado" TIMESTAMP(3),
    "aberto_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMP(3),
    "responsavel_id" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processo_legalizacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "processo_legalizacao_empresa_id_idx" ON "processo_legalizacao"("empresa_id");
CREATE INDEX IF NOT EXISTS "processo_legalizacao_tipo_idx" ON "processo_legalizacao"("tipo");
CREATE INDEX IF NOT EXISTS "processo_legalizacao_status_idx" ON "processo_legalizacao"("status");
CREATE INDEX IF NOT EXISTS "processo_legalizacao_bloqueada_idx" ON "processo_legalizacao"("bloqueada");
CREATE INDEX IF NOT EXISTS "processo_legalizacao_aberto_em_idx" ON "processo_legalizacao"("aberto_em");

DO $$ BEGIN
    ALTER TABLE "processo_legalizacao" ADD CONSTRAINT "processo_legalizacao_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "processo_legalizacao" ADD CONSTRAINT "processo_legalizacao_responsavel_id_fkey"
        FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- processo_legalizacao_etapa
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "processo_legalizacao_etapa" (
    "id" TEXT NOT NULL,
    "processo_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "responsavel_tipo" TEXT NOT NULL,
    "opcional" BOOLEAN NOT NULL DEFAULT false,
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "iniciada_em" TIMESTAMP(3),
    "concluida_em" TIMESTAMP(3),
    "concluida_por" TEXT,
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processo_legalizacao_etapa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "processo_legalizacao_etapa_processo_id_numero_key" ON "processo_legalizacao_etapa"("processo_id", "numero");
CREATE INDEX IF NOT EXISTS "processo_legalizacao_etapa_processo_id_idx" ON "processo_legalizacao_etapa"("processo_id");

DO $$ BEGIN
    ALTER TABLE "processo_legalizacao_etapa" ADD CONSTRAINT "processo_legalizacao_etapa_processo_id_fkey"
        FOREIGN KEY ("processo_id") REFERENCES "processo_legalizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- tarefa_log
--
-- APPEND-ONLY. A aplicação nunca faz UPDATE nem DELETE aqui.
-- autor_nome é congelado: nome de funcionário muda, log não.
-- FK do autor é RESTRICT: excluir usuário não apaga o histórico do que ele fez.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tarefa_log" (
    "id" TEXT NOT NULL,
    "apuracao_id" TEXT,
    "processo_id" TEXT,
    "acao" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "detalhe" TEXT,
    "autor_id" TEXT NOT NULL,
    "autor_nome" TEXT NOT NULL,
    "autor_papel" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tarefa_log_apuracao_id_created_at_idx" ON "tarefa_log"("apuracao_id", "created_at");
CREATE INDEX IF NOT EXISTS "tarefa_log_processo_id_created_at_idx" ON "tarefa_log"("processo_id", "created_at");
CREATE INDEX IF NOT EXISTS "tarefa_log_autor_id_idx" ON "tarefa_log"("autor_id");
CREATE INDEX IF NOT EXISTS "tarefa_log_created_at_idx" ON "tarefa_log"("created_at");
CREATE INDEX IF NOT EXISTS "tarefa_log_acao_idx" ON "tarefa_log"("acao");

DO $$ BEGIN
    ALTER TABLE "tarefa_log" ADD CONSTRAINT "tarefa_log_apuracao_id_fkey"
        FOREIGN KEY ("apuracao_id") REFERENCES "tarefa_apuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tarefa_log" ADD CONSTRAINT "tarefa_log_processo_id_fkey"
        FOREIGN KEY ("processo_id") REFERENCES "processo_legalizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tarefa_log" ADD CONSTRAINT "tarefa_log_autor_id_fkey"
        FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
