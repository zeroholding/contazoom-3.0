# Mercado Livre - Frete no Sync Inicial

Documento de referencia do ajuste feito em 2026-06-06/2026-06-07 para o calculo de frete das vendas do Mercado Livre.

Este arquivo cobre somente o ajuste de frete no sync inicial do Mercado Livre. Nao cobre Shopee, financeiro geral, CMV, dashboard ou outras partes do sistema.

## Contexto do problema

O sistema estava trazendo frete errado em algumas vendas ao sincronizar. O erro principal era tratar frete Flex como custo negativo ou usar um valor antigo salvo em `rawData.freight.adjustedCost`.

Depois da analise direta na API do Mercado Livre, ficou confirmado:

- Mercado Envios normal, Full, Coleta e Agencia entram como custo do vendedor, valor negativo.
- Flex entra como repasse/estorno/bonus recebido do Mercado Livre, valor positivo.
- O valor do Flex nao e fixo. Pode ser `11`, `10.90`, `1.10`, `1.00`, etc., dependendo do pedido, regiao e regra do ML.
- Produto maior que 79 muda a origem/valor do repasse Flex. Nao pode usar regra fixa.

## Regra correta

### 1. Nao Flex: Full, Coleta, Agencia, Mercado Envios

Para logisticos que nao sao Flex, o frete e custo do vendedor:

```text
frete = -custo_do_vendedor
```

Origem principal:

```text
/shipments/{shipping_id}/costs -> senders[0].cost
```

Fallback quando o endpoint de costs nao resolve sozinho:

```text
shipping_option.list_cost - shipping_option.cost
```

Exemplo real:

```text
Pedido: 2000016790578924
Modalidade: Agencia
Produto: R$ 289,90
Taxa ML: -R$ 55,08
Frete correto: -R$ 26,25
Total ML: R$ 208,57
Conta: DAMADESALTO
```

Calculo:

```text
289,90 - 55,08 - 26,25 = 208,57
```

### 2. Flex: self_service

Para Flex, o frete e receita/repasse positivo do ML para o vendedor:

```text
frete = +repasse_flex
```

Ordem correta para achar o repasse:

```text
1. senders[0].charges.charge_flex, se for maior que 0
2. senders[0].discounts[].promoted_amount, se for maior que 0
3. senders[0].save, se for maior que 0
4. receiver.discounts[].promoted_amount, se for maior que 0
5. receiver.save, se for maior que 0
6. receiver.cost, se for maior que 0
7. gross_amount apenas como fallback quando o vendedor nao tem custo e nao veio repasse melhor
```

Ponto importante: `0` nao pode bloquear outro campo positivo. Por isso a regra usa "primeiro valor positivo", nao `??`.

### 3. Flex menor que 79

Normalmente o repasse vem pelo lado do comprador/receiver.

Exemplo real:

```text
Pedido: 2000016789254790
Modalidade: Flex
Produto: R$ 54,00
Taxa ML: -R$ 13,96
Repasse Flex correto: +R$ 11,00
Total ML: R$ 51,04
Conta: ESTOCOLMO
```

API confirmou:

```text
logistic_type: self_service
receiver.discounts[].promoted_amount: 11
receiver.save: 11
senders[0].cost: 0
senders[0].charges.charge_flex: 0
frete correto no sistema: +11
```

Calculo:

```text
54,00 - 13,96 + 11,00 = 51,04
```

Outro exemplo real:

```text
Pedido: 2000016684751978
Modalidade: Flex
Produto: R$ 65,44
Taxa ML: -R$ 20,18
Repasse Flex correto: +R$ 11,00
Total ML: R$ 56,26
```

Calculo:

```text
65,44 - 20,18 + 11,00 = 56,26
```

### 4. Flex maior que 79

Normalmente o comprador nao paga frete, mas o ML ainda pode repassar um valor pequeno ao vendedor. Esse valor costuma vir no sender.

Exemplo real:

```text
Pedido: 2000016786739024
Modalidade: Flex
Produto: R$ 289,90
Taxa ML: -R$ 55,08
Repasse Flex correto: +R$ 1,10
Total ML: R$ 235,92
Conta: DAMADESALTO
```

API confirmou:

```text
logistic_type: self_service
senders[0].cost: 9,90
senders[0].discounts[].promoted_amount: 1,10
senders[0].save: 1,10
receiver.discounts[].promoted_amount: 11
gross_amount: 22
frete correto no sistema: +1,10
```

Calculo:

```text
289,90 - 55,08 + 1,10 = 235,92
```

Importante: neste caso nao usar `gross_amount = 22` e nao usar `receiver.save = 11` como frete do vendedor. O valor certo e o repasse do sender: `+1,10`.

## Diferenca entre Total ML, Receita Liquida e Margem

O print do Mercado Livre mostra:

```text
Total = produto - taxa + frete/estorno
```

No sistema, quando existe CMV, a coluna de margem pode mostrar:

```text
margem = produto - taxa + frete - CMV
```

Entao um pedido pode bater perfeitamente com o Mercado Livre no financeiro detalhado e ainda aparecer menor na margem porque o CMV foi subtraido. Nao confundir esse caso com erro de frete.

## Endpoints usados para diagnostico

Endpoint criado/ajustado no sistema:

```text
GET /api/test-ml-shipment?orderId={order_id}
```

Ele procura a venda em todas as contas conectadas e consulta:

```text
GET /orders/{order_id}
GET /shipments/{shipping_id}
GET /shipments/{shipping_id}/costs
GET /shipments/{shipping_id}/billing_info
GET /shipments/{shipping_id}/items/costs
```

O endpoint `/shipments/{shipping_id}/items/costs` pode retornar `404`. Isso e normal para alguns pedidos e nao deve quebrar o diagnostico.

## Arquivos principais envolvidos

Regra principal do calculo v2:

```text
src/lib/v2/services/meli-sync.service.ts
```

Rota antiga de sync, mantida espelhada para nao divergir:

```text
src/app/api/meli/vendas/sync/route.ts
```

Preparacao dos dados salvos:

```text
src/utils/sync-prepare-sale-data.ts
```

Worker de salvamento Redis/PostgreSQL e fallback direto:

```text
src/lib/sync-worker.ts
```

Builders do sync v2:

```text
src/lib/v2/builders/meli/download-meli-orders.builder.ts
src/lib/v2/builders/meli/save-meli-orders.builder.ts
```

Rota v2 do sync:

```text
src/app/api/v2/meli/vendas/sync/route.ts
```

Diagnostico:

```text
src/app/api/test-ml-shipment/route.ts
```

Correcao retroativa focada no frete:

```text
src/app/api/fix-flex/route.ts
```

Rota antiga perigosa, desativada:

```text
src/app/api/meli/vendas/fix-frete/route.ts
```

## O que foi corrigido

### Busca dos custos reais do Mercado Livre

O sync passou a enriquecer o shipment com dados do endpoint:

```text
/shipments/{shipping_id}/costs
```

Campos usados:

```text
_charge_flex
_seller_shipping_cost
_seller_shipping_save
_seller_shipping_discount
_seller_shipping_compensation
_receiver_shipping_cost
_receiver_shipping_save
_receiver_shipping_discount
_costs_gross_amount
```

### Flex usa primeiro valor positivo

Antes existia risco de um campo `0` bloquear outro valor positivo.

Errado:

```text
sellerDiscount ?? sellerSave
```

Correto:

```text
firstPositive(sellerDiscount, sellerSave)
```

Mesma logica para receiver.

### Fallback direto quando Redis falha

O sync v2 baixava vendas e tentava processar via Redis. Se Redis estivesse indisponivel/vazio, havia risco de baixar e nao persistir o lote.

Foi criado fallback:

```text
processSalesDirect(userId, sales)
```

Agora:

```text
Se Redis enfileirou com sucesso:
  processa do Redis

Se Redis falhou ou o lote ainda ficou em memoria:
  salva direto no PostgreSQL
```

### Cache de SKU por lote/usuario

O worker nao deve usar cache global antigo de SKU para todas as contas/usuarios. O cache agora e montado a partir das vendas do lote e do `userId`.

Isso evita CMV/margem errada por SKU stale.

### Rota antiga `fix-frete` foi bloqueada

A rota abaixo era perigosa:

```text
/api/meli/vendas/fix-frete
```

Ela usava `rawData.freight.adjustedCost` antigo como verdade e podia desfazer calculo correto.

Agora ela retorna:

```text
410 Gone
```

Mensagem:

```text
Rota desativada: ela usava rawData.freight.adjustedCost antigo e podia desfazer o calculo correto de frete. Use a sincronizacao normal ou /api/fix-flex.
```

## Cuidados para nunca quebrar de novo

Nao fazer:

```text
frete Flex = -sender.cost
frete Flex = gross_amount sempre
frete Flex = receiver.save sempre
frete Agencia = receiver.discount
frete = rawData.freight.adjustedCost antigo
hardcode de 11, 10.90, 1.10, 26.25 etc.
```

Fazer:

```text
Se logistic_type/self_service/FLEX:
  tratar como repasse positivo
  priorizar charge_flex positivo
  depois sender discount/save positivo
  depois receiver discount/save/cost positivo
  gross_amount so como fallback seguro

Se nao for Flex:
  tratar como custo negativo do vendedor
  usar sender cost/list cost
```

## Como investigar um pedido novo

1. Pegar o `orderId`.
2. Chamar:

```text
https://app.contazoom.com.br/api/test-ml-shipment?orderId={orderId}
```

3. Ver `logistic_type`.
4. Se for `self_service`, e Flex:

```text
charge_flex > sender discount/save > receiver discount/save/cost > gross_amount fallback
```

5. Se nao for Flex:

```text
sender cost/list cost como valor negativo
```

6. Conferir o total:

```text
produto - taxa + frete = total do Mercado Livre
```

7. Se a margem do sistema estiver menor, checar CMV antes de concluir que o frete esta errado.

## Validacoes reais feitas online

Em 2026-06-06, depois do deploy:

```text
/api/meli/vendas/fix-frete -> 410 Gone
```

Pedidos conferidos:

```text
2000016789254790
Flex < 79
Resultado API: vendedor recebe +R$ 11,00

2000016786739024
Flex > 79
Resultado API: vendedor recebe +R$ 1,10

2000016790578924
Agencia > 79
Resultado API: vendedor paga -R$ 26,25
```

Validacao local:

```text
npx eslint nos arquivos alterados -> 0 erros
```

Observacao:

```text
npm run build local parou por falta de DATABASE_URL.
npx tsc --noEmit mostra erros antigos fora deste ajuste.
```

## Commits relacionados

```text
80bb66d Add Mercado Livre shipment diagnostics
194d70e Fix Mercado Livre Flex freight rebates
9d494b3 Harden Mercado Livre freight sync
```
