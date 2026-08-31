-- ============================================================================
-- REGISTRO DE EXCLUSÃO
--
-- 100% ADITIVA. Cria uma tabela e não toca em nenhuma existente. Nenhum dado é
-- alterado, nenhum é apagado.
--
-- Por que a tabela existe: o módulo passou a permitir excluir empresa,
-- competência e processo. `tarefa_log` é declarado append-only, mas é filho da
-- tarefa com ON DELETE CASCADE — então apagar a tarefa apaga o histórico dela.
-- Sem esta tabela, a exclusão seria a única operação do módulo sem rastro, e é
-- a mais grave de todas.
--
-- SEM chave estrangeira para o registro excluído, de propósito: uma FK faria a
-- linha morrer junto com o alvo, que é exatamente o que se quer evitar.
--
-- Idempotente (IF NOT EXISTS), mesmo padrão das migrations anteriores, porque o
-- banco de produção tem drift conhecido e o deploy roda `prisma migrate deploy`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "registro_exclusao" (
    "id" TEXT NOT NULL,
    -- EMPRESA, APURACAO, PROCESSO_LEGALIZACAO
    "tipo" TEXT NOT NULL,
    -- Id do registro que deixou de existir. Texto solto, sem FK.
    "alvo_id" TEXT NOT NULL,
    -- Como o registro era identificado na tela.
    "descricao" TEXT NOT NULL,
    -- CNPJ, competência, tipo do processo: contexto que sobrevive ao alvo.
    "detalhe" TEXT,
    -- O que o cascade levou, em número.
    "arrastado" TEXT,
    "motivo" TEXT NOT NULL,
    "excluido_por_id" TEXT NOT NULL,
    "excluido_por_nome" TEXT NOT NULL,
    "excluido_por_papel" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_exclusao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "registro_exclusao_tipo_created_at_idx" ON "registro_exclusao"("tipo", "created_at");
CREATE INDEX IF NOT EXISTS "registro_exclusao_alvo_id_idx" ON "registro_exclusao"("alvo_id");
CREATE INDEX IF NOT EXISTS "registro_exclusao_excluido_por_id_idx" ON "registro_exclusao"("excluido_por_id");
CREATE INDEX IF NOT EXISTS "registro_exclusao_created_at_idx" ON "registro_exclusao"("created_at");

-- Motivo em branco não é motivo. A rota exige, e o banco confirma: registro de
-- exclusão sem justificativa não responde a pergunta que se faz três meses
-- depois, que é "por que isso não está mais aqui".
DO $$ BEGIN
    ALTER TABLE "registro_exclusao" ADD CONSTRAINT "registro_exclusao_motivo_chk"
        CHECK (length(btrim("motivo")) >= 3);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
