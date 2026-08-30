-- ============================================================================
-- CADASTRO COMPLETO DE EMPRESA, PLANO INTERNO E ANEXOS DE TAREFA
--
-- Três mudanças, nesta ordem de risco:
--
--   1. ADITIVA — 12 colunas novas em `empresa` (grupo, inscrições, endereço em
--      partes, responsável operacional, sócio administrador, plano interno).
--   2. ADITIVA — tabela `tarefa_anexo`.
--   3. ALTERAÇÃO — `empresa.cnpj` passa de NOT NULL para NULL.
--
-- A terceira é a única que mexe em estrutura existente, e é AFROUXAMENTO: toda
-- linha que hoje existe continua válida, nenhum dado é reescrito e nenhuma
-- consulta que lê CNPJ para de funcionar. O índice único continua no lugar; no
-- Postgres ele aceita vários NULL, que é exatamente o que permite conviverem
-- várias empresas em abertura.
--
-- Nada é apagado. Nenhum dado é modificado, com uma exceção declarada: o
-- backfill de `plano_interno` no fim do arquivo, que preenche o plano das
-- empresas já cadastradas a partir da situação que elas têm hoje. Sem ele, toda
-- a carteira nasceria com o default 'PLANO_SIMPLES', inclusive as suspensas — e
-- aí a próxima abertura de mês criaria competência para cliente que saiu.
--
-- Todo comando é idempotente (IF NOT EXISTS / EXCEPTION duplicate_object)
-- porque o banco de produção tem drift conhecido em relação ao histórico de
-- migrations e o deploy roda `prisma migrate deploy`. Mesmo padrão de
-- 20260828140000_add_tarefas_contabeis.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. empresa — colunas novas
-- ----------------------------------------------------------------------------

-- Grupo econômico do cliente. Texto livre: agrupa visualmente sem exigir
-- cadastro de grupo antes do cadastro de empresa.
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "grupo" TEXT;

ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "inscricao_municipal" TEXT;
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "inscricao_estadual" TEXT;

-- Endereço em partes, não num campo único: CEP e UF são o que se filtra e o que
-- Junta e Prefeitura exigem por campo.
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "cep" VARCHAR(8);
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "logradouro" TEXT;
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "numero" VARCHAR(20);
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "complemento" TEXT;
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "bairro" TEXT;

-- Contato operacional DO CLIENTE, sem login no sistema. Diferente de
-- responsavel_id, que é o responsável interno do escritório.
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "responsavel_operacional" TEXT;

ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "socio_adm_nome" TEXT;
-- Sem UNIQUE: a mesma pessoa é sócia administradora de várias empresas do grupo.
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "socio_adm_cpf" VARCHAR(11);

-- Plano interno ContaZoom: PLANO_SIMPLES, PLANO_PRESUMIDO, PLANO_STANDBY,
-- SEM_PLANO_SUSPENSA. Coluna própria e não reaproveitando `regime`, porque
-- fluxoApuracao() lança exceção em regime desconhecido.
ALTER TABLE "empresa" ADD COLUMN IF NOT EXISTS "plano_interno" TEXT NOT NULL DEFAULT 'PLANO_SIMPLES';

CREATE INDEX IF NOT EXISTS "empresa_plano_interno_idx" ON "empresa"("plano_interno");
CREATE INDEX IF NOT EXISTS "empresa_grupo_idx" ON "empresa"("grupo");

-- ----------------------------------------------------------------------------
-- 2. empresa.cnpj passa a aceitar NULL
--
-- Empresa em abertura não tem CNPJ, e a regra nova é que todo processo de
-- legalização nasce atrelado a uma empresa já cadastrada — inclusive a abertura.
--
-- DROP NOT NULL é idempotente por natureza: rodar de novo num banco onde a
-- coluna já aceita nulo não faz nada e não dá erro.
-- ----------------------------------------------------------------------------
ALTER TABLE "empresa" ALTER COLUMN "cnpj" DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. tarefa_anexo
--
-- Model próprio, não `processoId` pendurado em `document`: `document` é o cofre
-- do CLIENTE (user_id obrigatório, aparece na árvore de pastas dele, upload só
-- de admin). Anexo de tarefa é interno, pertence à tarefa e é enviado por quem
-- trabalha no fluxo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tarefa_anexo" (
    "id" TEXT NOT NULL,
    "apuracao_id" TEXT,
    "processo_id" TEXT,
    "nome_original" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "enviado_por_id" TEXT NOT NULL,
    "enviado_por_nome" TEXT NOT NULL,
    "descricao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_anexo_pkey" PRIMARY KEY ("id")
);

-- Nome no disco é único: o upload monta timestamp + aleatório + nome
-- higienizado, e o índice é a garantia de que dois envios de "contrato.pdf"
-- nunca apontam para o mesmo arquivo.
CREATE UNIQUE INDEX IF NOT EXISTS "tarefa_anexo_arquivo_key" ON "tarefa_anexo"("arquivo");
CREATE INDEX IF NOT EXISTS "tarefa_anexo_apuracao_id_created_at_idx" ON "tarefa_anexo"("apuracao_id", "created_at");
CREATE INDEX IF NOT EXISTS "tarefa_anexo_processo_id_created_at_idx" ON "tarefa_anexo"("processo_id", "created_at");
CREATE INDEX IF NOT EXISTS "tarefa_anexo_enviado_por_id_idx" ON "tarefa_anexo"("enviado_por_id");

-- Cascade: apagar a tarefa apaga a linha do anexo. O arquivo no disco fica
-- órfão de propósito — apagar bytes em cascata de banco é irreversível, e um
-- arquivo sem linha só ocupa espaço.
DO $$ BEGIN
    ALTER TABLE "tarefa_anexo" ADD CONSTRAINT "tarefa_anexo_apuracao_id_fkey"
        FOREIGN KEY ("apuracao_id") REFERENCES "tarefa_apuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tarefa_anexo" ADD CONSTRAINT "tarefa_anexo_processo_id_fkey"
        FOREIGN KEY ("processo_id") REFERENCES "processo_legalizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Exatamente uma das duas FKs preenchida.
--
-- No banco e não só na aplicação: anexo com as duas apontando apareceria em duas
-- tarefas, e anexo com nenhuma seria invisível para sempre, ocupando disco. É a
-- mesma regra que TarefaLog tem por convenção — aqui ela é imposta, porque anexo
-- entra por upload e um multipart montado à mão passaria por qualquer validação
-- de formulário.
DO $$ BEGIN
    ALTER TABLE "tarefa_anexo" ADD CONSTRAINT "tarefa_anexo_uma_tarefa_chk"
        CHECK (
            ("apuracao_id" IS NOT NULL AND "processo_id" IS NULL)
            OR ("apuracao_id" IS NULL AND "processo_id" IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Tamanho declarado tem de ser positivo. Arquivo de 0 byte é upload que falhou
-- no meio, e gravar a linha faria a tela oferecer um download vazio.
DO $$ BEGIN
    ALTER TABLE "tarefa_anexo" ADD CONSTRAINT "tarefa_anexo_tamanho_chk"
        CHECK ("tamanho_bytes" > 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Backfill do plano interno
--
-- A ÚNICA escrita de dado desta migration, e ela é necessária: sem o backfill,
-- toda empresa já cadastrada assume o default 'PLANO_SIMPLES', inclusive as
-- suspensas e encerradas, e a próxima abertura de mês criaria competência para
-- cliente que não é mais cliente.
--
-- O mapa vai da situação atual para o plano, que é a melhor informação
-- disponível hoje:
--
--   SUSPENSA / ENCERRADA -> SEM_PLANO_SUSPENSA  (não gera competência)
--   ATIVA + LUCRO_PRESUMIDO -> PLANO_PRESUMIDO
--   ATIVA + Simples        -> PLANO_SIMPLES
--   EM_ABERTURA            -> PLANO_STANDBY     (não gera competência; ainda não
--                                                há CNPJ para apurar)
--
-- O regime é a fonte para separar Simples de Presumido porque é o único dado que
-- o cadastro tem sobre o tipo de trabalho contratado. Não é a mesma coisa que o
-- plano — plano é comercial, regime é fiscal — mas erra menos que jogar todo
-- mundo no mesmo plano, e o escritório corrige na tela empresa por empresa.
--
-- `WHERE plano_interno = 'PLANO_SIMPLES'` faz o UPDATE ser idempotente E
-- respeitar ajuste manual: quem já foi corrigido para outro plano não é
-- sobrescrito se a migration rodar de novo.
-- ----------------------------------------------------------------------------
UPDATE "empresa"
SET "plano_interno" = CASE
    WHEN "situacao" IN ('SUSPENSA', 'ENCERRADA') THEN 'SEM_PLANO_SUSPENSA'
    WHEN "situacao" = 'EM_ABERTURA' THEN 'PLANO_STANDBY'
    WHEN "regime" = 'LUCRO_PRESUMIDO' THEN 'PLANO_PRESUMIDO'
    ELSE 'PLANO_SIMPLES'
END
WHERE "plano_interno" = 'PLANO_SIMPLES';
