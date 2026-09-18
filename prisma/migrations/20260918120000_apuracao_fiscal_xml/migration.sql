-- ============================================================================
-- APURAÇÃO FISCAL POR DOCUMENTO — importação de XML e faturamento mensal
--
-- Quatro tabelas NOVAS. Nada existente é alterado, nada é apagado e nenhum dado
-- é reescrito: a migration é inteiramente ADITIVA.
--
--   1. importacao_xml       — a sessão de importação (vem primeiro: é FK da 2)
--   2. documento_fiscal     — uma linha por nota, chaveada pela chave de acesso
--   3. faturamento_mensal   — o número do mês, congelável
--   4. empresa_serie_canal  — mapa série -> canal de venda
--
-- Todo comando é idempotente (IF NOT EXISTS / EXCEPTION duplicate_object)
-- porque o banco de produção tem drift conhecido em relação ao histórico de
-- migrations e o deploy roda `prisma migrate deploy`. Mesmo padrão de
-- 20260830120000_empresa_plano_interno_e_anexos.
--
-- DUAS FUGAS DO PADRÃO DO PROJETO, as duas deliberadas e explicadas onde
-- acontecem: ON DELETE RESTRICT na empresa (em vez de CASCADE) e DECIMAL(14,2)
-- (em vez de 10,2).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. importacao_xml
--
-- Existe para a pergunta "o que entrou naquele dia, e o que foi recusado?" ter
-- resposta depois de a tela fechar. O relatório por arquivo morreria junto com a
-- resposta HTTP.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "importacao_xml" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "arquivos_enviados" INTEGER NOT NULL,
    "importados" INTEGER NOT NULL DEFAULT 0,
    "duplicados" INTEGER NOT NULL DEFAULT 0,
    "ignorados" INTEGER NOT NULL DEFAULT 0,
    "com_erro" INTEGER NOT NULL DEFAULT 0,
    "relatorio" JSONB,
    "situacao" TEXT NOT NULL DEFAULT 'CONCLUIDA',
    "importado_por_id" TEXT NOT NULL,
    "importado_por_nome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacao_xml_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "importacao_xml_empresa_id_created_at_idx" ON "importacao_xml"("empresa_id", "created_at");
CREATE INDEX IF NOT EXISTS "importacao_xml_created_at_idx" ON "importacao_xml"("created_at");

-- SetNull e não Cascade: o histórico de importação sobrevive à exclusão da
-- empresa. A empresa em si não pode ser apagada tendo documento (ver tabela 2),
-- mas um lote de pasta misturada tem empresa_id nulo desde o começo.
DO $$ BEGIN
    ALTER TABLE "importacao_xml" ADD CONSTRAINT "importacao_xml_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "importacao_xml" ADD CONSTRAINT "importacao_xml_contadores_chk"
        CHECK (
            "arquivos_enviados" >= 0 AND "importados" >= 0 AND "duplicados" >= 0
            AND "ignorados" >= 0 AND "com_erro" >= 0
        );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 2. documento_fiscal
--
-- A chave de acesso (44 dígitos) é a chave natural e por isso é UNIQUE: ela
-- carrega UF, AAMM, CNPJ, modelo, série e número, e não repete em lugar nenhum do
-- país. É o índice único dela que faz reenviar a mesma pasta ser um no-op — e
-- isso não é otimização, é requisito: o contador VAI subir a mesma pasta duas
-- vezes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "documento_fiscal" (
    "id" TEXT NOT NULL,
    "chave" VARCHAR(44) NOT NULL,
    "empresa_id" TEXT,
    "cnpj_emitente" VARCHAR(14) NOT NULL,
    "nome_emitente" TEXT,
    "documento_destinatario" VARCHAR(14),
    "tipo_documento_destinatario" VARCHAR(4),
    "nome_destinatario" TEXT,
    "modelo" VARCHAR(2) NOT NULL,
    "serie" VARCHAR(3) NOT NULL,
    "numero" INTEGER NOT NULL,
    "emitido_em" TIMESTAMP(3) NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipo_operacao" VARCHAR(1) NOT NULL,
    "finalidade" VARCHAR(1) NOT NULL,
    "natureza_operacao" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'AUTORIZADA',
    "status_sefaz" VARCHAR(3),
    "protocolo" VARCHAR(20),
    -- DECIMAL(14,2) e não (10,2), que é o padrão do projeto: (10,2) estoura em
    -- R$ 99.999.999,99 e nota fiscal de indústria passa disso.
    "valor_total" DECIMAL(14,2) NOT NULL,
    "valor_produtos" DECIMAL(14,2),
    -- Array: nota com itens de CFOP diferente existe, e é exatamente a que
    -- precisa de conferência humana. Guardar só o primeiro esconderia esse caso.
    "cfops" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "conta_faturamento" BOOLEAN NOT NULL DEFAULT false,
    "motivo_exclusao" TEXT,
    "precisa_conferencia" BOOLEAN NOT NULL DEFAULT false,
    "cancelado_em" TIMESTAMP(3),
    "justificativa_cancelamento" TEXT,
    "pedido_marketplace" TEXT,
    "arquivo" TEXT NOT NULL,
    "arquivo_bytes" INTEGER NOT NULL,
    "arquivo_hash" VARCHAR(64) NOT NULL,
    "importado_por_id" TEXT NOT NULL,
    "importado_por_nome" TEXT NOT NULL,
    "importado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importacao_id" TEXT,
    "versao_regra" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_fiscal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "documento_fiscal_chave_key" ON "documento_fiscal"("chave");
CREATE UNIQUE INDEX IF NOT EXISTS "documento_fiscal_arquivo_key" ON "documento_fiscal"("arquivo");

CREATE INDEX IF NOT EXISTS "documento_fiscal_empresa_id_ano_mes_idx" ON "documento_fiscal"("empresa_id", "ano", "mes");
-- Índice da consulta mais quente: a soma do faturamento de uma competência.
CREATE INDEX IF NOT EXISTS "documento_fiscal_empresa_id_conta_faturamento_ano_mes_idx" ON "documento_fiscal"("empresa_id", "conta_faturamento", "ano", "mes");
CREATE INDEX IF NOT EXISTS "documento_fiscal_cnpj_emitente_ano_mes_idx" ON "documento_fiscal"("cnpj_emitente", "ano", "mes");
CREATE INDEX IF NOT EXISTS "documento_fiscal_situacao_idx" ON "documento_fiscal"("situacao");
CREATE INDEX IF NOT EXISTS "documento_fiscal_emitido_em_idx" ON "documento_fiscal"("emitido_em");
-- Reclassificação em lote quando a regra de faturamento mudar.
CREATE INDEX IF NOT EXISTS "documento_fiscal_versao_regra_idx" ON "documento_fiscal"("versao_regra");
CREATE INDEX IF NOT EXISTS "documento_fiscal_pedido_marketplace_idx" ON "documento_fiscal"("pedido_marketplace");
CREATE INDEX IF NOT EXISTS "documento_fiscal_importacao_id_idx" ON "documento_fiscal"("importacao_id");
CREATE INDEX IF NOT EXISTS "documento_fiscal_precisa_conferencia_idx" ON "documento_fiscal"("precisa_conferencia");

-- RESTRICT, e não CASCADE.
--
-- Todo o resto do bloco contábil usa CASCADE. Aqui seria errado: apagar uma
-- empresa apagaria as notas fiscais dela, que têm retenção legal de 5 anos e
-- sustentam um número já declarado ao banco. RESTRICT faz a exclusão FALHAR, e
-- falhar com mensagem é a resposta certa para "quero apagar uma empresa com 4 mil
-- notas importadas".
--
-- O módulo já tem `registro_exclusao` justamente porque exclusão física apagava
-- histórico.
DO $$ BEGIN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- SetNull: apagar o registro do lote não pode apagar a nota. O lote é
-- rastreabilidade da operação; a nota é o documento fiscal.
DO $$ BEGIN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_importacao_id_fkey"
        FOREIGN KEY ("importacao_id") REFERENCES "importacao_xml"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- A chave TEM de ser 44 dígitos.
--
-- No banco e não só no parser: a conferência da chave contra as tags é o que
-- detecta XML editado à mão, e ela só funciona se a chave for numérica de 44
-- posições. Um INSERT por outro caminho que gravasse chave curta quebraria a
-- idempotência em silêncio — passaria a existir "a mesma nota" duas vezes.
DO $$ BEGIN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_chave_chk"
        CHECK ("chave" ~ '^[0-9]{44}$');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_competencia_chk"
        CHECK ("mes" BETWEEN 1 AND 12 AND "ano" BETWEEN 2000 AND 2100);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_valor_chk"
        CHECK ("valor_total" >= 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_bytes_chk"
        CHECK ("arquivo_bytes" > 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Coerência entre somar e o motivo de não somar.
--
-- Esta é a invariante que sustenta a tela: o painel "Fora do faturamento" lista
-- os documentos que não entraram AGRUPADOS PELO MOTIVO. Uma linha que não conta e
-- não diz por quê desapareceria desse painel e a soma de 822 arquivos deixaria de
-- fechar com a contagem exibida — o operador concluiria que o sistema comeu nota.
--
-- O inverso (conta E tem motivo de exclusão) é contradição pura.
DO $$ BEGIN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_conta_motivo_chk"
        CHECK (
            ("conta_faturamento" = true AND "motivo_exclusao" IS NULL)
            OR ("conta_faturamento" = false AND "motivo_exclusao" IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Tipo do documento do destinatário só pode ser CPF ou CNPJ.
--
-- 71,8% dos destinatários da base real são CPF, então a coluna aceita 11 e 14
-- dígitos; o tipo é o que desambigua. Sem o CHECK, um valor torto aqui faria a
-- tela mostrar "CPF" para um CNPJ.
DO $$ BEGIN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_tipo_doc_dest_chk"
        CHECK ("tipo_documento_destinatario" IS NULL OR "tipo_documento_destinatario" IN ('CPF', 'CNPJ'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 3. faturamento_mensal
--
-- Separado da soma dos documentos, e NÃO é view, por dois motivos que view
-- nenhuma resolve: o valor pode ser DIGITADO (mês anterior à adoção do sistema,
-- receita sem nota, empresa de serviço antes da NFS-e), e o valor usado numa
-- declaração assinada tem de ficar CONGELADO — senão a declaração de janeiro muda
-- de valor quando alguém importa um XML atrasado de janeiro.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "faturamento_mensal" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'XML',
    "valor" DECIMAL(14,2) NOT NULL,
    "valor_apurado" DECIMAL(14,2),
    "documentos" INTEGER NOT NULL DEFAULT 0,
    "apurado_em" TIMESTAMP(3),
    "observacao" TEXT,
    "congelado_em" TIMESTAMP(3),
    "congelado_por" TEXT,
    "definido_por_id" TEXT NOT NULL,
    "definido_por_nome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faturamento_mensal_pkey" PRIMARY KEY ("id")
);

-- Nome do constraint espelha `empresa_competencia` de tarefa_apuracao de
-- propósito: é a mesma linguagem de competência do módulo.
CREATE UNIQUE INDEX IF NOT EXISTS "empresa_competencia_faturamento" ON "faturamento_mensal"("empresa_id", "ano", "mes");
CREATE INDEX IF NOT EXISTS "faturamento_mensal_empresa_id_ano_mes_idx" ON "faturamento_mensal"("empresa_id", "ano", "mes");
CREATE INDEX IF NOT EXISTS "faturamento_mensal_origem_idx" ON "faturamento_mensal"("origem");
CREATE INDEX IF NOT EXISTS "faturamento_mensal_congelado_em_idx" ON "faturamento_mensal"("congelado_em");

-- RESTRICT pelo mesmo motivo de documento_fiscal: este é o número que foi (ou
-- vai ser) declarado.
--
-- E NÃO existe FK para tarefa_apuracao, embora a competência seja a mesma:
-- aquela tabela cascateia nos filhos, então excluir uma competência apagaria o
-- faturamento. Faturamento sobrevive à competência — mês anterior à adoção do
-- sistema não tem tarefa_apuracao nenhuma. O casamento é pela chave natural
-- (empresa_id, ano, mes), que é a mesma dos dois lados.
DO $$ BEGIN
    ALTER TABLE "faturamento_mensal" ADD CONSTRAINT "faturamento_mensal_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "faturamento_mensal" ADD CONSTRAINT "faturamento_mensal_competencia_chk"
        CHECK ("mes" BETWEEN 1 AND 12 AND "ano" BETWEEN 2000 AND 2100);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "faturamento_mensal" ADD CONSTRAINT "faturamento_mensal_origem_chk"
        CHECK ("origem" IN ('XML', 'MANUAL', 'MISTO'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "faturamento_mensal" ADD CONSTRAINT "faturamento_mensal_valor_chk"
        CHECK ("valor" >= 0 AND ("valor_apurado" IS NULL OR "valor_apurado" >= 0));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 4. empresa_serie_canal
--
-- A NF-e NÃO TEM CAMPO DE MARKETPLACE. O canal ("veio do Mercado Livre") é
-- convenção do emissor, que costuma reservar uma série por canal — na base
-- analisada, 100% das notas são série 2.
--
-- Sem esta tabela a única forma de mostrar canal na tela seria deduzir do nome do
-- arquivo ou do CFOP, e as duas erram em silêncio. Com ela, o escritório DECLARA
-- a convenção e a tela mostra um dado que alguém afirmou.
--
-- Por empresa, não global: cada cliente numera as séries como quiser, e a série 2
-- de um não tem relação com a série 2 do outro.
--
-- CASCADE aqui, diferente das outras três: isto é configuração de exibição, não
-- documento fiscal. Apagar a empresa pode levar o mapa dela.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "empresa_serie_canal" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "serie" VARCHAR(3) NOT NULL,
    "canal" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_serie_canal_pkey" PRIMARY KEY ("id")
);

-- Uma série aponta para um canal só: duas linhas para a mesma série fariam a
-- mesma nota ser contada em dois canais, e o total por canal deixaria de fechar
-- com o total da competência.
CREATE UNIQUE INDEX IF NOT EXISTS "empresa_serie" ON "empresa_serie_canal"("empresa_id", "serie");
CREATE INDEX IF NOT EXISTS "empresa_serie_canal_empresa_id_idx" ON "empresa_serie_canal"("empresa_id");

DO $$ BEGIN
    ALTER TABLE "empresa_serie_canal" ADD CONSTRAINT "empresa_serie_canal_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "empresa_serie_canal" ADD CONSTRAINT "empresa_serie_canal_canal_chk"
        CHECK ("canal" IN ('ML', 'SHOPEE', 'TIKTOK', 'SITE', 'OUTRO'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "empresa_serie_canal" ADD CONSTRAINT "empresa_serie_canal_serie_chk"
        CHECK (btrim("serie") <> '');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
