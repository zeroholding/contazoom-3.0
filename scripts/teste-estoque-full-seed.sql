-- =====================================================================
-- Semente do banco DESCARTÁVEL de teste do Estoque Full.
--
-- NÃO É MIGRATION E NÃO RODA EM PRODUÇÃO. Cria num banco vazio só as tabelas
-- que o módulo lê, e semeia o cenário que importa: um anúncio COM VARIAÇÕES,
-- que é onde o cálculo de cobertura erra se o join não for por variação.
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuario (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT 'Teste',
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL DEFAULT 'x',
  role          TEXT NOT NULL DEFAULT 'USER',
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meli_account (
  id                          TEXT PRIMARY KEY,
  "userId"                    TEXT NOT NULL,
  ml_user_id                  BIGINT NOT NULL,
  nickname                    TEXT,
  access_token                TEXT NOT NULL DEFAULT 'x',
  refresh_token               TEXT NOT NULL DEFAULT 'x',
  expires_at                  TIMESTAMP NOT NULL DEFAULT now() + interval '5 hours',
  refresh_token_invalid_until TIMESTAMP,
  created_at                  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sku (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  sku            TEXT NOT NULL,
  produto        TEXT NOT NULL,
  tipo           TEXT NOT NULL DEFAULT 'filho',
  custo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantidade     INT NOT NULL DEFAULT 0,
  hierarquia_1   TEXT,
  hierarquia_2   TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  tem_estoque    BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMP NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meli_venda (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT UNIQUE NOT NULL,
  user_id             TEXT NOT NULL,
  meli_account_id     TEXT NOT NULL,
  data_venda          TIMESTAMP NOT NULL,
  status              TEXT NOT NULL,
  conta               TEXT NOT NULL,
  valor_total         NUMERIC(10,2) NOT NULL,
  quantidade          INT NOT NULL,
  valor_unitario      NUMERIC(10,2) NOT NULL,
  valor_frete         NUMERIC(10,2) NOT NULL DEFAULT 0,
  titulo              TEXT NOT NULL,
  sku                 TEXT,
  item_id             VARCHAR(32),
  variation_id        VARCHAR(32),
  comprador           TEXT NOT NULL DEFAULT 'Comprador',
  logistic_type       TEXT,
  plataforma          TEXT NOT NULL DEFAULT 'Mercado Livre',
  canal               TEXT NOT NULL DEFAULT 'ML',
  raw_data            JSONB,
  sincronizado_em     TIMESTAMP NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meli_full_stock (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL,
  meli_account_id        TEXT NOT NULL,
  inventory_id           TEXT NOT NULL,
  item_id                VARCHAR(32),
  variation_id           VARCHAR(32),
  user_product_id        TEXT,
  sku                    TEXT,
  titulo                 TEXT,
  thumbnail              TEXT,
  logistic_type          TEXT,
  total                  INTEGER NOT NULL DEFAULT 0,
  available_quantity     INTEGER NOT NULL DEFAULT 0,
  not_available_quantity INTEGER NOT NULL DEFAULT 0,
  transfer_quantity      INTEGER NOT NULL DEFAULT 0,
  not_available_detail   JSONB,
  sincronizado_em        TIMESTAMP(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS meli_full_stock_conta_inventario_idx
  ON meli_full_stock (meli_account_id, inventory_id);

CREATE TABLE IF NOT EXISTS meli_full_stock_history (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  inventory_id       TEXT NOT NULL,
  dia                DATE NOT NULL,
  available_quantity INTEGER NOT NULL,
  total              INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMP(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS meli_full_stock_history_inv_dia_idx
  ON meli_full_stock_history (user_id, inventory_id, dia);

INSERT INTO usuario (id, email) VALUES
  ('u1', 'u1@exemplo.com'), ('u2', 'u2@exemplo.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO meli_account (id, "userId", ml_user_id, nickname) VALUES
  ('acc-u1', 'u1', 1001, 'MOSCOU'),
  ('acc-u2', 'u2', 2001, 'VIZINHO')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sku (id, user_id, sku, produto, hierarquia_1, hierarquia_2) VALUES
  ('s1', 'u1', 'STEP-P',  'Step P',  'Fitness', 'Musculação'),
  ('s2', 'u1', 'STEP-M',  'Step M',  'Fitness', 'Musculação'),
  ('s3', 'u1', 'STEP-G',  'Step G',  'Fitness', 'Musculação'),
  ('s4', 'u1', 'COLCH',   'Colchonete', 'Fitness', 'Acessórios'),
  ('s5', 'u1', 'PARADO',  'Item parado', 'Casa', 'Decoração')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- O CENÁRIO QUE IMPORTA: um anúncio (MLB100) com TRÊS variações em Full.
--
-- Estoque: P=6, M=60, G=90.
-- Vendas em 30 dias: P=30, M=30, G=30 (10 por variação... não: ver abaixo).
--
-- Vendas semeadas por variação: P=30un, M=30un, G=30un → 1 un/dia cada.
-- Cobertura correta:  P = 6 dias  (REPOR)
--                     M = 60 dias (ESTOQUE ALTO)
--                     G = 90 dias (ESTOQUE ALTO)
--
-- Se o join ignorasse a variação, cada linha receberia 90 unidades (a soma do
-- anúncio) = 3 un/dia, e a cobertura viraria P=2, M=20, G=30 — todas as três
-- cairiam em "repor" ou perto disso. É exatamente esse erro que o teste pega.
-- =====================================================================
INSERT INTO meli_full_stock
  (id, user_id, meli_account_id, inventory_id, item_id, variation_id, sku, titulo, available_quantity, not_available_quantity, transfer_quantity, total)
VALUES
  ('f1', 'u1', 'acc-u1', 'INV-P', 'MLB100', '111', 'STEP-P', 'Step Academia — P',  6,  2, 10,  18),
  ('f2', 'u1', 'acc-u1', 'INV-M', 'MLB100', '222', 'STEP-M', 'Step Academia — M', 60,  0,  0,  60),
  ('f3', 'u1', 'acc-u1', 'INV-G', 'MLB100', '333', 'STEP-G', 'Step Academia — G', 90,  5,  0,  95),
  -- Anúncio SIMPLES (sem variação): marcador '-' nas duas pontas.
  ('f4', 'u1', 'acc-u1', 'INV-C', 'MLB200', '-',   'COLCH',  'Colchonete EVA',    30,  0,  0,  30),
  -- Tem estoque e ZERO venda em 30 dias → PARADO.
  ('f5', 'u1', 'acc-u1', 'INV-X', 'MLB300', '-',   'PARADO', 'Item que não vende', 25, 0,  0,  25),
  -- Esgotado e sem venda: nada a fazer → SAUDÁVEL (não é "repor", não há o que repor).
  ('f6', 'u1', 'acc-u1', 'INV-Z', 'MLB400', '-',   NULL,     'Esgotado sem venda',  0, 0,  0,   0),
  -- Do VIZINHO, mesmo inventory_id de um do u1: prova o isolamento.
  ('f7', 'u2', 'acc-u2', 'INV-P', 'MLB100', '111', 'STEP-P', 'Step do vizinho',  999,  0,  0, 999)
ON CONFLICT (id) DO NOTHING;

-- Histórico: 10 dias para INV-M, com média 50. Os outros ficam sem histórico
-- de propósito, para provar que "sem histórico" vira NULL e não zero.
INSERT INTO meli_full_stock_history (id, user_id, inventory_id, dia, available_quantity, total)
SELECT 'h' || g, 'u1', 'INV-M', (CURRENT_DATE - (g || ' days')::interval)::date, 50, 60
FROM generate_series(1, 10) AS g
ON CONFLICT (user_id, inventory_id, dia) DO NOTHING;

-- =====================================================================
-- Vendas. `raw_data` no formato REAL do sync, com variation_id dentro.
-- `variation_id` fica NULL na coluna para o backfill ter o que fazer.
-- =====================================================================

-- 30 vendas da variação P
INSERT INTO meli_venda (id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, item_id, raw_data)
SELECT 'vP' || g, '80100' || g, 'u1', 'acc-u1',
  (NOW() - ((g % 28) || ' days')::interval), 'paid', 'MOSCOU',
  100.00, 1, 100.00, 'Step Academia — P', 'STEP-P', 'MLB100',
  jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
    jsonb_build_object('item', jsonb_build_object('id', 'MLB100', 'variation_id', 111)))))
FROM generate_series(1, 30) AS g
ON CONFLICT (order_id) DO NOTHING;

-- 30 da variação M
INSERT INTO meli_venda (id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, item_id, raw_data)
SELECT 'vM' || g, '80200' || g, 'u1', 'acc-u1',
  (NOW() - ((g % 28) || ' days')::interval), 'paid', 'MOSCOU',
  100.00, 1, 100.00, 'Step Academia — M', 'STEP-M', 'MLB100',
  jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
    jsonb_build_object('item', jsonb_build_object('id', 'MLB100', 'variation_id', 222)))))
FROM generate_series(1, 30) AS g
ON CONFLICT (order_id) DO NOTHING;

-- 30 da variação G
INSERT INTO meli_venda (id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, item_id, raw_data)
SELECT 'vG' || g, '80300' || g, 'u1', 'acc-u1',
  (NOW() - ((g % 28) || ' days')::interval), 'paid', 'MOSCOU',
  100.00, 1, 100.00, 'Step Academia — G', 'STEP-G', 'MLB100',
  jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
    jsonb_build_object('item', jsonb_build_object('id', 'MLB100', 'variation_id', 333)))))
FROM generate_series(1, 30) AS g
ON CONFLICT (order_id) DO NOTHING;

-- 15 do anúncio SIMPLES (sem variation_id no JSON) → cobertura 30/(15/30)=60 dias
INSERT INTO meli_venda (id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, item_id, raw_data)
SELECT 'vC' || g, '80400' || g, 'u1', 'acc-u1',
  (NOW() - ((g % 28) || ' days')::interval), 'paid', 'MOSCOU',
  50.00, 1, 50.00, 'Colchonete EVA', 'COLCH', 'MLB200',
  jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
    jsonb_build_object('item', jsonb_build_object('id', 'MLB200')))))
FROM generate_series(1, 15) AS g
ON CONFLICT (order_id) DO NOTHING;

-- Venda CANCELADA da variação P: não pode contar. Se contasse, P teria 40 un.
INSERT INTO meli_venda (id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, item_id, raw_data)
VALUES ('vCancel', '8090001', 'u1', 'acc-u1', NOW() - interval '2 days', 'cancelled', 'MOSCOU',
  1000.00, 10, 100.00, 'Step Academia — P', 'STEP-P', 'MLB100',
  jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
    jsonb_build_object('item', jsonb_build_object('id', 'MLB100', 'variation_id', 111))))))
ON CONFLICT (order_id) DO NOTHING;

-- Venda ANTIGA (fora dos 30 dias) da variação M: não pode contar.
INSERT INTO meli_venda (id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, item_id, raw_data)
VALUES ('vVelha', '8090002', 'u1', 'acc-u1', NOW() - interval '120 days', 'paid', 'MOSCOU',
  5000.00, 50, 100.00, 'Step Academia — M', 'STEP-M', 'MLB100',
  jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
    jsonb_build_object('item', jsonb_build_object('id', 'MLB100', 'variation_id', 222))))))
ON CONFLICT (order_id) DO NOTHING;

-- Venda do VIZINHO na mesma variação: prova o isolamento por usuário.
INSERT INTO meli_venda (id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, item_id, raw_data)
VALUES ('vViz', '8090003', 'u2', 'acc-u2', NOW() - interval '1 day', 'paid', 'VIZINHO',
  9999.00, 300, 33.33, 'Step do vizinho', 'STEP-P', 'MLB100',
  jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
    jsonb_build_object('item', jsonb_build_object('id', 'MLB100', 'variation_id', 111))))))
ON CONFLICT (order_id) DO NOTHING;

SELECT
  (SELECT COUNT(*) FROM meli_venda)                              AS vendas,
  (SELECT COUNT(*) FROM meli_venda WHERE variation_id IS NULL)   AS sem_variacao,
  (SELECT COUNT(*) FROM meli_full_stock)                         AS inventarios,
  (SELECT COUNT(*) FROM meli_full_stock_history)                 AS historico;
