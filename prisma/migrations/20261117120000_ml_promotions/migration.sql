CREATE TABLE IF NOT EXISTS ml_promotion (
  -- uid = "{account_id}:{ml_user_id}:{type}:{id}" — o mesmo id não se repete entre tipos,
  -- mas a chave composta evita depender disso.
  uid            TEXT PRIMARY KEY,
  promotion_id   TEXT        NOT NULL,
  promotion_type TEXT        NOT NULL,
  account_id TEXT NOT NULL REFERENCES meli_account(id) ON DELETE CASCADE,
  name           TEXT,
  status         TEXT,
  start_at       TIMESTAMPTZ,
  finish_at      TIMESTAMPTZ,
  deadline_at    TIMESTAMPTZ,
  benefits       JSONB,
  -- true = veio na última sincronização desta conta; false = histórico.
  is_current     BOOLEAN     NOT NULL DEFAULT true,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_promotion_user_idx    ON ml_promotion (account_id);
CREATE INDEX IF NOT EXISTS ml_promotion_current_idx ON ml_promotion (is_current);
CREATE INDEX IF NOT EXISTS ml_promotion_finish_idx  ON ml_promotion (finish_at);
CREATE INDEX IF NOT EXISTS ml_promotion_pid_idx     ON ml_promotion (promotion_id);

CREATE TABLE IF NOT EXISTS ml_promotion_item (
  uid             TEXT PRIMARY KEY,
  promotion_uid   TEXT          NOT NULL,
  promotion_id    TEXT          NOT NULL,
  promotion_type  TEXT          NOT NULL,
  account_id TEXT NOT NULL REFERENCES meli_account(id) ON DELETE CASCADE,
  item_id         TEXT          NOT NULL,
  status          TEXT,
  -- Preço que o comprador paga.
  price           NUMERIC(14,2),
  -- Preço "de" da campanha (o que aparece riscado). É o par do `price`.
  original_price  NUMERIC(14,2),
  -- Preço de tabela do anúncio (GET /items). NÃO reflete promoção.
  table_price     NUMERIC(14,2),
  discount_amount NUMERIC(14,2),
  discount_pct    NUMERIC(8,4),
  -- Quem banca o desconto (só SMART/SMART_LIGHTNING informam).
  meli_pct        NUMERIC(8,4),
  seller_pct      NUMERIC(8,4),
  start_at        TIMESTAMPTZ,
  -- Fim do item quando existe; senão, o fim da campanha.
  finish_at       TIMESTAMPTZ,
  offer_id        TEXT,
  title           TEXT,
  thumbnail       TEXT,
  permalink       TEXT,
  is_current      BOOLEAN       NOT NULL DEFAULT true,
  last_seen_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_promotion_item_puid_idx    ON ml_promotion_item (promotion_uid);
CREATE INDEX IF NOT EXISTS ml_promotion_item_pid_idx     ON ml_promotion_item (promotion_id);
CREATE INDEX IF NOT EXISTS ml_promotion_item_item_idx    ON ml_promotion_item (item_id);
CREATE INDEX IF NOT EXISTS ml_promotion_item_user_idx    ON ml_promotion_item (account_id);
CREATE INDEX IF NOT EXISTS ml_promotion_item_current_idx ON ml_promotion_item (is_current);
CREATE INDEX IF NOT EXISTS ml_promotion_item_finish_idx  ON ml_promotion_item (finish_at);

CREATE TABLE IF NOT EXISTS ml_promotion_sync (
  account_id TEXT PRIMARY KEY REFERENCES meli_account(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMPTZ,
  last_error     TEXT,
  promotions     INTEGER NOT NULL DEFAULT 0,
  items          INTEGER NOT NULL DEFAULT 0
);
