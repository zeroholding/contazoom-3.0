-- ============================================================================
-- FORMULÁRIO PÚBLICO DE ABERTURA DE CNPJ
--
-- 100% ADITIVA. Cria duas tabelas e não toca em nenhuma existente. Nenhum dado
-- é alterado, nenhum é apagado, nenhuma coluna é removida.
--
-- Por que as tabelas existem: a legalização coletava os dados de abertura por
-- Google Forms, que exige conta Google do cliente para anexar arquivo (cliente
-- sem Gmail não conseguia enviar documento), devolvia os campos pluralizados
-- num blob de texto e não validava nada. A tela `/formulario` substitui aquilo,
-- e agora precisa guardar o que recebe.
--
-- `dados` é JSONB e não trinta colunas porque o conteúdo é uma árvore de tamanho
-- variável (N sócios, cada um com endereço, regime de bens e participação em
-- outra empresa) e porque o formulário é um DOCUMENTO RECEBIDO: o que valia no
-- dia do envio tem de continuar legível depois de a tela mudar de perguntas. As
-- colunas ao lado dele são só o que a LISTA do admin precisa para buscar e
-- ordenar, porque filtro dentro de JSONB não usa índice comum.
--
-- ON DELETE RESTRICT no documento, e não CASCADE: documento entregue pelo
-- cliente nunca é excluído. Enquanto houver documento, o banco RECUSA apagar o
-- formulário. É o oposto de `tarefa_anexo`, que é CASCADE e tem rota de remoção
-- — lá é material de trabalho interno, aqui é o RG que sustenta um contrato
-- social. A garantia fica no banco, e não só na aplicação, para sobreviver a um
-- `prisma studio` aberto às onze da noite.
--
-- Idempotente (IF NOT EXISTS), mesmo padrão das migrations anteriores, porque o
-- banco de produção tem drift conhecido e o deploy roda `prisma migrate deploy`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "formulario_abertura" (
    "id" TEXT NOT NULL,

    -- Protocolo legível, o que o cliente lê no telefone: "CZ-7H2KQ4".
    -- Sem 0/O e sem 1/I/L, que é o que faz a pessoa ditar errado.
    "protocolo" TEXT NOT NULL,

    -- Segredo da URL de consulta pública. Separado do protocolo de propósito: o
    -- protocolo é curto para ser ditado, e curto o bastante para ser adivinhado
    -- por tentativa. Quem tem o token vê o formulário; o protocolo não abre nada.
    "token" TEXT NOT NULL,

    -- Snapshot do envio inteiro.
    "dados" JSONB NOT NULL,

    -- Desnormalizados, só para a lista do admin buscar e ordenar.
    "razao_social_pretendida" TEXT NOT NULL,
    "nome_fantasia" TEXT NOT NULL,
    "socio_principal_nome" TEXT NOT NULL,
    "socio_principal_cpf" TEXT NOT NULL,
    "socio_principal_email" TEXT NOT NULL,
    "socio_principal_telefone" TEXT NOT NULL,
    "quantidade_socios" INTEGER NOT NULL,
    "capital_total_centavos" INTEGER NOT NULL,

    -- RECEBIDO, EM_ANALISE, APROVADO, DEVOLVIDO. Único campo que o escritório
    -- altera: é o andamento DA ANÁLISE, não o conteúdo declarado pelo cliente.
    "situacao" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "observacao_interna" TEXT,

    -- De onde veio o envio. Serve para achar abuso na rota pública, que não tem
    -- login e aceita arquivo.
    "ip_origem" TEXT,
    "navegador_info" TEXT,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formulario_abertura_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "formulario_abertura_protocolo_key"
    ON "formulario_abertura"("protocolo");
CREATE UNIQUE INDEX IF NOT EXISTS "formulario_abertura_token_key"
    ON "formulario_abertura"("token");

CREATE INDEX IF NOT EXISTS "formulario_abertura_created_at_idx"
    ON "formulario_abertura"("created_at");
CREATE INDEX IF NOT EXISTS "formulario_abertura_situacao_created_at_idx"
    ON "formulario_abertura"("situacao", "created_at");
CREATE INDEX IF NOT EXISTS "formulario_abertura_socio_principal_cpf_idx"
    ON "formulario_abertura"("socio_principal_cpf");
CREATE INDEX IF NOT EXISTS "formulario_abertura_socio_principal_nome_idx"
    ON "formulario_abertura"("socio_principal_nome");

-- Formulário sem sócio nenhum não é formulário, e capital negativo não existe.
-- A rota já valida; o banco confirma, porque a rota é pública.
DO $$ BEGIN
    ALTER TABLE "formulario_abertura" ADD CONSTRAINT "formulario_abertura_socios_chk"
        CHECK ("quantidade_socios" >= 1 AND "quantidade_socios" <= 10);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "formulario_abertura" ADD CONSTRAINT "formulario_abertura_capital_chk"
        CHECK ("capital_total_centavos" >= 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Token curto seria adivinhável, e ele é a única coisa que protege a consulta
-- pública. 24 caracteres é o piso do que a aplicação gera (32).
DO $$ BEGIN
    ALTER TABLE "formulario_abertura" ADD CONSTRAINT "formulario_abertura_token_chk"
        CHECK (length("token") >= 24);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================================

CREATE TABLE IF NOT EXISTS "formulario_abertura_documento" (
    "id" TEXT NOT NULL,
    "formulario_id" TEXT NOT NULL,

    -- Chave do slot: `socio.0.identidade`, `empresa.iptu`. Amarra o arquivo à
    -- PESSOA certa, que é o defeito central do formulário antigo ("até 5
    -- arquivos" numa caixa comum, sem dono).
    "slot" TEXT NOT NULL,

    -- Nome de quem entregou, congelado. Ler o dono a partir do índice do slot
    -- exigiria abrir o JSON a cada linha da lista, e se a ordem dos sócios no
    -- JSON mudar, o arquivo trocaria de dono em silêncio.
    "dono" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,

    "nome_original" TEXT NOT NULL,
    -- Nome no disco: timestamp + aleatório + higienizado, com o dono no prefixo.
    "arquivo" TEXT NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formulario_abertura_documento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "formulario_abertura_documento_arquivo_key"
    ON "formulario_abertura_documento"("arquivo");
CREATE INDEX IF NOT EXISTS "formulario_abertura_documento_formulario_id_slot_idx"
    ON "formulario_abertura_documento"("formulario_id", "slot");

-- RESTRICT, não CASCADE. Ver o cabeçalho: documento do cliente nunca é
-- excluído, e enquanto existir documento o formulário não pode ser apagado.
DO $$ BEGIN
    ALTER TABLE "formulario_abertura_documento"
        ADD CONSTRAINT "formulario_abertura_documento_formulario_id_fkey"
        FOREIGN KEY ("formulario_id") REFERENCES "formulario_abertura"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Arquivo de 0 byte é upload que morreu no meio: a linha faria a tela oferecer
-- um download vazio para sempre.
DO $$ BEGIN
    ALTER TABLE "formulario_abertura_documento"
        ADD CONSTRAINT "formulario_abertura_documento_tamanho_chk"
        CHECK ("tamanho_bytes" > 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
