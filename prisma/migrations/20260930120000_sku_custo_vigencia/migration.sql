-- Gestão SKU: custo usado em vendas passadas ("desde o início" ou um período).
-- Colunas opcionais: as linhas que já existem continuam sendo mudanças comuns
-- de custo (valem da data em que foram feitas em diante).
ALTER TABLE "public"."sku_custo_historico"
  ADD COLUMN "vigencia_inicio" TIMESTAMP(3),
  ADD COLUMN "vigencia_fim" TIMESTAMP(3);
