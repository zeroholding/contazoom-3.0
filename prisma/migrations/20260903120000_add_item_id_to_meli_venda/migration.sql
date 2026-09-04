-- =====================================================================
-- item_id (MLB do anúncio) em meli_venda
-- =====================================================================
--
-- POR QUE: a tela "Anúncios Mais Vendidos e Mortos" agrupa vendas por
-- ANÚNCIO. Hoje `meli_venda` guarda título e SKU, mas não o id do anúncio —
-- ele só existe dentro de `raw_data.order_items[0].item.id`. Sem coluna
-- própria, agrupar por anúncio exigiria abrir o JSON de cada venda em toda
-- consulta, o que não escala e não indexa.
--
-- ⚠️  NADA AQUI APAGA, RESETA OU REESCREVE DADO.
--     É um ADD COLUMN IF NOT EXISTS, nullable, sem DEFAULT e sem NOT NULL,
--     mais dois índices IF NOT EXISTS. Não existe DROP, TRUNCATE, DELETE
--     nem UPDATE neste arquivo. Rodar duas vezes não faz efeito nenhum.
--
--     O preenchimento das linhas antigas NÃO acontece aqui de propósito:
--     um UPDATE em tabela grande dentro de migration segura a transação e
--     trava escrita durante o deploy. O backfill roda em lotes, pela
--     aplicação, e é retomável — ver `src/lib/anuncios-backfill.ts`.
--
-- Aplicar com `prisma migrate deploy` (nunca `migrate dev` nem `db push`,
-- que podem propor recriar o banco).
-- =====================================================================

ALTER TABLE "meli_venda"
  ADD COLUMN IF NOT EXISTS "item_id" VARCHAR(32);

-- Ranking por anúncio: agrupa por (usuário, anúncio) e corta por data.
CREATE INDEX IF NOT EXISTS "meli_venda_user_item_data_idx"
  ON "meli_venda" ("user_id", "item_id", "data_venda" DESC)
  WHERE "item_id" IS NOT NULL;

-- Fila do backfill. Índice PARCIAL: ele encolhe conforme o backfill avança e
-- vira vazio no fim, em vez de ficar pesando para sempre num predicado que
-- não interessa mais.
CREATE INDEX IF NOT EXISTS "meli_venda_item_id_pendente_idx"
  ON "meli_venda" ("id")
  WHERE "item_id" IS NULL;

-- Verificação: a coluna existe e quantas linhas ainda faltam preencher.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'meli_venda' AND column_name = 'item_id') AS coluna_criada,
  (SELECT COUNT(*) FROM meli_venda WHERE item_id IS NULL) AS linhas_pendentes;
