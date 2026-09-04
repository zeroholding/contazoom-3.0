-- =====================================================================
-- Semente do banco DESCARTÁVEL de teste da tela de Anúncios.
--
-- NÃO É MIGRATION E NÃO RODA EM PRODUÇÃO. Cria num banco vazio só as tabelas
-- que a tela lê, com as colunas que importam, e insere vendas com `raw_data`
-- no formato REAL do sync — que é o ponto: o backfill extrai o MLB de dentro
-- desse JSON, então um JSON de mentira testaria outra coisa.
--
-- Serve para provar o backfill e a agregação contra Postgres de verdade sem
-- encostar no banco de produção.
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

-- Todas as colunas que o model Prisma `MeliAccount` declara.
--
-- `buscarAnuncioInfo` chama `prisma.meliAccount.findMany()` sem `select`, porque
-- `smartRefreshMeliAccountToken` recebe o registro inteiro. O Prisma então
-- SELECIONA todas as colunas do model, e uma que falte aqui derruba a consulta
-- com P2022 — mesmo que o código não use aquele campo.
CREATE TABLE IF NOT EXISTS meli_account (
  id                          TEXT PRIMARY KEY,
  "userId"                    TEXT NOT NULL,
  ml_user_id                  BIGINT NOT NULL,
  nickname                    TEXT,
  access_token                TEXT NOT NULL DEFAULT 'x',
  refresh_token               TEXT NOT NULL DEFAULT 'x',
  expires_at                  TIMESTAMP NOT NULL DEFAULT now(),
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
  margem_contribuicao NUMERIC(10,2),
  titulo              TEXT NOT NULL,
  sku                 TEXT,
  item_id             VARCHAR(32),
  comprador           TEXT NOT NULL DEFAULT 'Comprador',
  logistic_type       TEXT,
  plataforma          TEXT NOT NULL DEFAULT 'Mercado Livre',
  canal               TEXT NOT NULL DEFAULT 'ML',
  raw_data            JSONB,
  sincronizado_em     TIMESTAMP NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO usuario (id, email) VALUES
  ('user-teste-1', 'teste1@exemplo.com'),
  ('user-teste-2', 'teste2@exemplo.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO meli_account (id, "userId", ml_user_id, nickname) VALUES
  ('acc-moscou', 'user-teste-1', 1001, 'MOSCOU'),
  ('acc-tokyo',  'user-teste-1', 1002, 'TOKYO'),
  ('acc-outro',  'user-teste-2', 2001, 'OUTRO_INQUILINO')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sku (id, user_id, sku, produto, hierarquia_1, hierarquia_2) VALUES
  ('sku-1', 'user-teste-1', 'STEP60', 'Step 60cm', 'Fitness', 'Musculação'),
  ('sku-2', 'user-teste-1', 'COLCH100', 'Colchonete 100x50', 'Fitness', 'Acessórios')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- CAMPEÃO DE VENDAS: 40 vendas recentes, MLB4321098765.
-- raw_data no formato do sync: { order: { order_items: [...] }, ... }
-- ---------------------------------------------------------------------
INSERT INTO meli_venda (
  id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, margem_contribuicao,
  titulo, sku, logistic_type, raw_data
)
SELECT
  'v-camp-' || g,
  '900100' || g,
  'user-teste-1', 'acc-moscou',
  (NOW() - ((g % 20) || ' days')::interval),
  'paid', 'MOSCOU',
  153.48, 1, 153.48, 42.10,
  'Step Para Academia Fitness 60cm', 'STEP60', 'cross_docking',
  jsonb_build_object('order', jsonb_build_object(
    'id', 900100 + g,
    'order_items', jsonb_build_array(jsonb_build_object(
      'item', jsonb_build_object('id', 'MLB4321098765', 'title', 'Step Para Academia Fitness 60cm', 'seller_sku', 'STEP60')
    ))
  ))
FROM generate_series(1, 40) AS g
ON CONFLICT (order_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- MORTO: 25 vendas, todas com mais de 120 dias. MLB9999888877.
-- ---------------------------------------------------------------------
INSERT INTO meli_venda (
  id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, margem_contribuicao,
  titulo, sku, logistic_type, raw_data
)
SELECT
  'v-morto-' || g,
  '900200' || g,
  'user-teste-1', 'acc-tokyo',
  (NOW() - ((120 + g) || ' days')::interval),
  'paid', 'TOKYO',
  89.90, 2, 44.95, 20.00,
  'Colchonete EVA Academia 100x50', 'COLCH100', 'fulfillment',
  jsonb_build_object('order', jsonb_build_object(
    'id', 900200 + g,
    'order_items', jsonb_build_array(jsonb_build_object(
      'item', jsonb_build_object('id', 'MLB9999888877', 'title', 'Colchonete EVA Academia 100x50', 'seller_sku', 'COLCH100')
    ))
  ))
FROM generate_series(1, 25) AS g
ON CONFLICT (order_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- FORMATO ANTIGO do raw_data: o pedido na RAIZ, sem a chave `order`.
-- O COALESCE do backfill existe por causa disto; sem ele estas vendas
-- ficariam de fora e o anúncio pareceria não ter vendido.
-- ---------------------------------------------------------------------
INSERT INTO meli_venda (
  id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, raw_data
)
SELECT
  'v-antigo-' || g, '900300' || g, 'user-teste-1', 'acc-moscou',
  (NOW() - (g || ' days')::interval), 'paid', 'MOSCOU',
  153.48, 1, 153.48, 'Step Para Academia Fitness 60cm', 'STEP60',
  jsonb_build_object(
    'order_items', jsonb_build_array(jsonb_build_object(
      'item', jsonb_build_object('id', 'MLB4321098765', 'seller_sku', 'STEP60')
    ))
  )
FROM generate_series(1, 5) AS g
ON CONFLICT (order_id) DO NOTHING;

-- Venda com raw_data SEM MLB: precisa sair da fila do backfill com o marcador
-- '-', senão o backfill nunca converge e relê este JSON para sempre.
INSERT INTO meli_venda (
  id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, raw_data
) VALUES
  ('v-semmlb-1', '9004001', 'user-teste-1', 'acc-moscou', NOW() - interval '2 days',
   'paid', 'MOSCOU', 50.00, 1, 50.00, 'Venda sem item', NULL,
   '{"order": {"id": 9004001}}'::jsonb)
ON CONFLICT (order_id) DO NOTHING;

-- Venda CANCELADA do campeão: não pode entrar em nenhuma conta.
INSERT INTO meli_venda (
  id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, raw_data
) VALUES
  ('v-cancel-1', '9005001', 'user-teste-1', 'acc-moscou', NOW() - interval '1 day',
   'cancelled', 'MOSCOU', 999.00, 9, 111.00, 'Step Para Academia Fitness 60cm', 'STEP60',
   jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
     jsonb_build_object('item', jsonb_build_object('id', 'MLB4321098765'))))))
ON CONFLICT (order_id) DO NOTHING;

-- Venda de OUTRO INQUILINO, mesmo MLB do campeão. É o teste de vazamento:
-- não pode aparecer nem somar nada para o user-teste-1.
INSERT INTO meli_venda (
  id, order_id, user_id, meli_account_id, data_venda, status, conta,
  valor_total, quantidade, valor_unitario, titulo, sku, raw_data
) VALUES
  ('v-outro-1', '9006001', 'user-teste-2', 'acc-outro', NOW() - interval '1 day',
   'paid', 'OUTRO_INQUILINO', 5000.00, 50, 100.00, 'Step Para Academia Fitness 60cm', 'STEP60',
   jsonb_build_object('order', jsonb_build_object('order_items', jsonb_build_array(
     jsonb_build_object('item', jsonb_build_object('id', 'MLB4321098765'))))))
ON CONFLICT (order_id) DO NOTHING;

SELECT
  (SELECT COUNT(*) FROM meli_venda) AS total_vendas,
  (SELECT COUNT(*) FROM meli_venda WHERE user_id = 'user-teste-1') AS do_inquilino_1,
  (SELECT COUNT(*) FROM meli_venda WHERE item_id IS NULL) AS sem_item_id;
