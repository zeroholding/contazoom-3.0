-- Estado durável do OAuth TikTok Shop.
--
-- `contazoom.com.br` (site) e `app.contazoom.com.br` (painel) servem o app, mas
-- cookies são host-only. O Partner Center tem uma callback fixa; se ela volta no
-- outro host, o state no banco diz em qual origem o fluxo começou e o callback
-- redireciona para lá antes de conferir cookie e sessão.
--
-- Guarda somente SHA-256 do nonce, nunca o state bruto nem auth_code/tokens.

CREATE TABLE "tiktok_oauth_state" (
    "id" TEXT NOT NULL,
    "state_hash" CHAR(64) NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "origin" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiktok_oauth_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tiktok_oauth_state_state_hash_key"
    ON "tiktok_oauth_state"("state_hash");

CREATE INDEX "tiktok_oauth_state_expires_at_idx"
    ON "tiktok_oauth_state"("expires_at");

CREATE INDEX "tiktok_oauth_state_user_id_created_at_idx"
    ON "tiktok_oauth_state"("user_id", "created_at");

ALTER TABLE "tiktok_oauth_state"
    ADD CONSTRAINT "tiktok_oauth_state_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "usuario"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
