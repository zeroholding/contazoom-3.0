-- =====================================================================
-- Módulo Estoque Full (Mercado Envíos Full / fulfillment)
-- =====================================================================
--
-- Cria duas tabelas novas e acrescenta uma coluna em `meli_venda`.
--
-- ⚠️  NADA AQUI APAGA, RESETA OU REESCREVE DADO.
--     São dois CREATE TABLE IF NOT EXISTS, um ADD COLUMN IF NOT EXISTS
--     nullable sem DEFAULT, e índices IF NOT EXISTS. Não existe DROP,
--     TRUNCATE, DELETE nem UPDATE neste arquivo. Rodar duas vezes não faz
--     efeito nenhum.
--
-- Aplicar com `prisma migrate deploy` (que é o que `scripts/build.js` já faz
-- no passo 3 do deploy). Nunca `migrate dev` nem `db push`.
--
--
-- POR QUE A COLUNA `variation_id` EM meli_venda
--
-- A tela mostra o estoque por INVENTÁRIO, e no Mercado Livre um anúncio com
-- variações (P/M/G) tem um inventário e um estoque por variação. A cobertura
-- ("quantos dias o estoque aguenta") é estoque ÷ venda diária, então ela só
-- faz sentido se as vendas também forem por variação.
--
-- Sem esta coluna, o join só poderia ser por anúncio, e as 3 variações de um
-- anúncio receberiam as vendas do anúncio INTEIRO. Numa loja com P/M/G isso
-- multiplica a venda diária por 3 em cada linha e a tela diria "repor" em tudo
-- ao mesmo tempo — ou, no sentido contrário, esconderia a variação que está
-- realmente acabando atrás do volume das outras. Um número errado com cara de
-- número certo é pior do que não ter a coluna.
--
-- O dado já está no banco: `raw_data.order_items[0].item.variation_id`, do
-- mesmo lugar de onde o `item_id` foi extraído. O preenchimento é por lotes na
-- aplicação (`src/lib/estoque-full-backfill.ts`), sem chamar a API.
--
--
-- ONDE ESTE MÓDULO DIVERGE DO PROJETO IRMÃO, DE PROPÓSITO
--
-- No NEXUS V2 a chave primária de `ml_full_stock` é o próprio `inventory_id`,
-- porque lá existe um único usuário. Aqui NÃO dá: o CONTAZOOM é multiusuário e
-- `meli_account` permite a mesma conta do Mercado Livre ligada a usuários
-- diferentes (a unicidade lá é `(user_id, ml_user_id)`). Com `inventory_id`
-- como chave, o sync do segundo usuário sobrescreveria a linha do primeiro e os
-- dois passariam a ver o mesmo registro. Por isso a chave aqui é sintética e a
-- unicidade real é `(meli_account_id, inventory_id)`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vendas: variação do anúncio
-- ---------------------------------------------------------------------
ALTER TABLE "meli_venda"
  ADD COLUMN IF NOT EXISTS "variation_id" VARCHAR(32);

-- Casa com o join de vendas 30d da tela (usuário + anúncio + variação).
CREATE INDEX IF NOT EXISTS "meli_venda_user_item_variacao_idx"
  ON "meli_venda" ("user_id", "item_id", "variation_id");

-- Fila do backfill. Índice PARCIAL: encolhe conforme o backfill avança e vira
-- vazio no fim, em vez de pesar para sempre num predicado que não interessa mais.
CREATE INDEX IF NOT EXISTS "meli_venda_variacao_pendente_idx"
  ON "meli_venda" ("id")
  WHERE "variation_id" IS NULL;

-- ---------------------------------------------------------------------
-- 2. Snapshot do estoque Full, por inventário
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "meli_full_stock" (
  "id"                     TEXT PRIMARY KEY,
  "user_id"                TEXT NOT NULL,
  "meli_account_id"        TEXT NOT NULL,
  "inventory_id"           TEXT NOT NULL,
  "item_id"                VARCHAR(32),
  "variation_id"           VARCHAR(32),
  "user_product_id"        TEXT,
  "sku"                    TEXT,
  "titulo"                 TEXT,
  "thumbnail"              TEXT,
  "logistic_type"          TEXT,
  "total"                  INTEGER NOT NULL DEFAULT 0,
  "available_quantity"     INTEGER NOT NULL DEFAULT 0,
  -- Já LÍQUIDO do "a caminho". Ver o comentário em estoque-full-sync.ts: o ML
  -- devolve as unidades em transferência dentro de not_available, mas o painel
  -- dele mostra como "A caminho". Somar os dois faria "não aptas" ficar maior
  -- aqui do que no painel do ML, sem ninguém entender por quê.
  "not_available_quantity" INTEGER NOT NULL DEFAULT 0,
  "transfer_quantity"      INTEGER NOT NULL DEFAULT 0,
  "not_available_detail"   JSONB,
  "sincronizado_em"        TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "meli_full_stock_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE CASCADE,
  CONSTRAINT "meli_full_stock_conta_fk"
    FOREIGN KEY ("meli_account_id") REFERENCES "meli_account"("id") ON DELETE CASCADE
);

-- A unicidade que garante o isolamento entre inquilinos. Ver o cabeçalho.
CREATE UNIQUE INDEX IF NOT EXISTS "meli_full_stock_conta_inventario_idx"
  ON "meli_full_stock" ("meli_account_id", "inventory_id");

CREATE INDEX IF NOT EXISTS "meli_full_stock_user_idx"
  ON "meli_full_stock" ("user_id");
CREATE INDEX IF NOT EXISTS "meli_full_stock_user_item_variacao_idx"
  ON "meli_full_stock" ("user_id", "item_id", "variation_id");
CREATE INDEX IF NOT EXISTS "meli_full_stock_sku_idx"
  ON "meli_full_stock" ("sku");

-- ---------------------------------------------------------------------
-- 3. Histórico diário, para o "estoque médio"
-- ---------------------------------------------------------------------
--
-- Sem FK para `meli_full_stock` de propósito: o sync APAGA as linhas de
-- inventário que saíram do Full, e uma FK em cascata levaria o histórico junto.
-- A série de estoque médio precisa sobreviver a um produto sair e voltar ao
-- Full, senão o gráfico reinicia do zero e a média de 30 dias mente.
CREATE TABLE IF NOT EXISTS "meli_full_stock_history" (
  "id"                 TEXT PRIMARY KEY,
  "user_id"            TEXT NOT NULL,
  "inventory_id"       TEXT NOT NULL,
  "dia"                DATE NOT NULL,
  "available_quantity" INTEGER NOT NULL,
  "total"              INTEGER NOT NULL DEFAULT 0,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

-- Uma linha por inventário por dia: o snapshot do dia é sobrescrito, não
-- acumulado. Rodar o sync cinco vezes num dia não infla a média.
CREATE UNIQUE INDEX IF NOT EXISTS "meli_full_stock_history_inv_dia_idx"
  ON "meli_full_stock_history" ("user_id", "inventory_id", "dia");

CREATE INDEX IF NOT EXISTS "meli_full_stock_history_inv_idx"
  ON "meli_full_stock_history" ("inventory_id");

-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'meli_venda' AND column_name = 'variation_id') AS coluna_variacao,
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name IN ('meli_full_stock', 'meli_full_stock_history')) AS tabelas_criadas_de_2,
  (SELECT COUNT(*) FROM meli_venda WHERE variation_id IS NULL) AS vendas_pendentes_de_backfill;
