-- =====================================================================
-- Módulo Expedição — prazo de despacho (SLA) em vendas ML e Shopee
-- =====================================================================
--
-- Acrescenta DUAS colunas nullable em `meli_venda` e as MESMAS duas em
-- `shopee_venda`, mais índices.
--
-- ⚠️  NADA AQUI APAGA, RESETA OU REESCREVE DADO.
--     São quatro ADD COLUMN IF NOT EXISTS, todos nullable e sem DEFAULT, e
--     índices IF NOT EXISTS. Não existe DROP, TRUNCATE, DELETE nem UPDATE
--     neste arquivo. Rodar duas vezes não faz efeito nenhum.
--
-- Aplicar com `prisma migrate deploy`. Nunca `migrate dev` nem `db push`.
--
--
-- POR QUE ESTAS COLUNAS EXISTEM
--
-- A tela de Expedição responde a UMA pergunta: "o que eu tenho de despachar, e
-- em que ordem". A ordem é o PRAZO, não a data da venda. Uma venda de ontem com
-- prazo para hoje é mais urgente que uma venda de hoje com prazo para semana que
-- vem, e ordenar por `data_venda` inverte exatamente as duas.
--
-- Nenhuma coluna do banco carregava esse prazo. Ele já CHEGAVA no sync e era
-- descartado: no Mercado Livre vem do `/shipments/{id}` que o sync de vendas já
-- chama (`shipping_option.estimated_handling_limit.date`, com o `sla.expected_date`
-- como reserva); na Shopee vem do `get_order_detail`, em `ship_by_date`, que é
-- campo padrão da resposta e não precisa ser pedido. Os dois ficam guardados
-- dentro de `raw_data`, então o histórico é recuperável sem chamar API — é o que
-- `src/lib/prazo-despacho-backfill.ts` faz, em lotes.
--
--
-- POR QUE TIMESTAMPTZ E NÃO TIMESTAMP
--
-- O resto da tabela usa `TIMESTAMP(3)` (o padrão do Prisma), que guarda um
-- instante sem fuso e obriga quem consulta a saber, por fora, que aquilo é UTC.
-- A classificação de urgência desta tela é uma comparação de DATA CIVIL em
-- São Paulo ("o prazo cai hoje?"), escrita em SQL como
-- `(prazo_despacho AT TIME ZONE 'America/Sao_Paulo')::date`.
--
-- Com `TIMESTAMPTZ` essa expressão está correta. Com `TIMESTAMP` ela silenciosamente
-- interpreta o valor como já sendo horário local e desloca tudo em 3 horas — o que
-- move todo prazo entre 21h e 00h para o dia seguinte e faz a linha aparecer como
-- "amanhã" quando vence hoje. Errar por 3h numa tela cujo propósito é não perder
-- o corte da transportadora é errar no único ponto que importa.
--
--
-- POR QUE UMA SEGUNDA COLUNA SÓ PARA A ORIGEM
--
-- `prazo_despacho_origem` é o marcador de "já olhei". O backfill precisa
-- distinguir três situações que, com uma coluna só, seriam todas NULL:
--
--   1. ainda não processei esta linha         -> origem IS NULL
--   2. processei e achei o prazo              -> origem = 'ml_handling_limit', 'sp_ship_by_date', ...
--   3. processei e o JSON não tinha prazo     -> origem = 'ausente'
--
-- Sem o caso 3, toda venda antiga sem prazo no JSON (venda FULL, retirada em
-- agência, pedido cancelado antes de gerar envio) voltaria à fila em cada
-- rodada, o backfill nunca chegaria a zero e releria o mesmo JSON para sempre.
-- É o mesmo raciocínio do marcador `'-'` de `variation_id`, que não cabe aqui
-- porque a coluna é temporal e não aceita sentinela textual.
--
-- De quebra, a origem responde "por que esta venda está sem prazo" sem abrir o
-- JSON, o que é a primeira pergunta de qualquer suporte nesta tela.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mercado Livre
-- ---------------------------------------------------------------------
ALTER TABLE "meli_venda"
  ADD COLUMN IF NOT EXISTS "prazo_despacho" TIMESTAMPTZ(3);

ALTER TABLE "meli_venda"
  ADD COLUMN IF NOT EXISTS "prazo_despacho_origem" VARCHAR(32);

-- A fila da tela: filtra por usuário e ordena por prazo crescente.
CREATE INDEX IF NOT EXISTS "meli_venda_user_prazo_idx"
  ON "meli_venda" ("user_id", "prazo_despacho");

-- Fila do backfill. Índice PARCIAL: encolhe conforme o backfill avança e vira
-- vazio no fim, em vez de pesar para sempre num predicado que não interessa mais.
CREATE INDEX IF NOT EXISTS "meli_venda_prazo_pendente_idx"
  ON "meli_venda" ("id")
  WHERE "prazo_despacho_origem" IS NULL;

-- ---------------------------------------------------------------------
-- 2. Shopee
-- ---------------------------------------------------------------------
ALTER TABLE "shopee_venda"
  ADD COLUMN IF NOT EXISTS "prazo_despacho" TIMESTAMPTZ(3);

ALTER TABLE "shopee_venda"
  ADD COLUMN IF NOT EXISTS "prazo_despacho_origem" VARCHAR(32);

CREATE INDEX IF NOT EXISTS "shopee_venda_user_prazo_idx"
  ON "shopee_venda" ("user_id", "prazo_despacho");

CREATE INDEX IF NOT EXISTS "shopee_venda_prazo_pendente_idx"
  ON "shopee_venda" ("id")
  WHERE "prazo_despacho_origem" IS NULL;

-- ---------------------------------------------------------------------
-- 3. Apoio à fila de expedição
-- ---------------------------------------------------------------------
--
-- A fila agrupa por PACOTE, e no Mercado Livre um pacote é o `shipping_id`
-- (várias vendas do mesmo comprador saem numa etiqueta só). Sem este índice o
-- agrupamento vira varredura da tabela inteira.
--
-- Parcial em `shipping_id IS NOT NULL` porque venda sem envio cai no
-- agrupamento por `order_id` e nunca é procurada por aqui.
CREATE INDEX IF NOT EXISTS "meli_venda_user_shipping_idx"
  ON "meli_venda" ("user_id", "shipping_id")
  WHERE "shipping_id" IS NOT NULL;

-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name IN ('meli_venda', 'shopee_venda')
      AND column_name IN ('prazo_despacho', 'prazo_despacho_origem'))
    AS colunas_criadas_de_4,
  (SELECT COUNT(*) FROM meli_venda   WHERE prazo_despacho_origem IS NULL)
    AS ml_pendentes_de_backfill,
  (SELECT COUNT(*) FROM shopee_venda WHERE prazo_despacho_origem IS NULL)
    AS shopee_pendentes_de_backfill;
