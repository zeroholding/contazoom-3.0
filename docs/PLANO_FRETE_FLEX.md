# Plano tecnico - Frete Flex Mercado Livre

## Objetivo

Aplicar o custo real pago pelo usuario a transportadora em todas as vendas Flex do Mercado Livre, sem sobrescrever o repasse original recebido do marketplace.

Para uma venda com repasse Flex de R$ 1,10 e custo configurado de R$ 11,90:

- receita Flex do Mercado Livre: `+R$ 1,10`;
- custo da transportadora: `-R$ 11,90`;
- resultado liquido do frete: `-R$ 10,80`.

O resultado liquido deve participar da receita liquida, margem, indicadores e DRE. O detalhamento da tabela deve preservar e exibir separadamente a receita e a despesa.

## Problemas encontrados

1. A configuracao e salva, mas as vendas antigas nao sao recalculadas nem persistidas. A tela afirma que o comportamento e retroativo, mas o backend apenas tenta remover um cache em memoria.
2. `/api/meli/vendas` consulta um cache de cinco minutos antes de consultar a configuracao Flex. Uma resposta criada antes da configuracao continua exibindo apenas o repasse do ML.
3. A invalidacao atual depende de memoria local do processo. Ela nao e confiavel entre instancias, reinicios ou bundles de rotas diferentes.
4. O calculo foi duplicado em algumas rotas e nao existe em outras. Tabela ML, tabela geral, dashboard, series, rankings e DRE podem apresentar resultados diferentes.
5. O campo persistido `frete` representa o repasse original do Mercado Livre e nao deve ser substituido pelo custo da transportadora.
6. O detalhamento expansivel depende de propriedades opcionais sem tipagem formal (`custoFlex` e `freteLiquidoFlex`). Quando elas nao chegam, a tabela volta silenciosamente ao repasse original.
7. O salvamento desativa configuracoes anteriores e cria a nova configuracao em operacoes separadas. Uma falha entre as duas operacoes pode deixar o usuario sem configuracao ativa.
8. O endpoint de edicao nao aplica a mesma validacao do endpoint de criacao.

## Regra central

Uma unica funcao sera responsavel por:

1. identificar a modalidade Flex (`FLEX` ou `self_service`);
2. preservar `receitaFlex = frete`;
3. calcular cobrancas com `ceil(quantidade / unidadesPorCobranca)`;
4. calcular `custoFlex = cobrancas * custoPorPacote`;
5. calcular `freteLiquidoFlex = receitaFlex - custoFlex`;
6. arredondar valores monetarios para duas casas;
7. retornar zero custo quando nao houver configuracao ativa ou a venda nao for Flex.

## Implementacao

### 1. Dominio e configuracao

- Criar helper compartilhado para identificacao e calculo do Flex.
- Validar custo finito e maior que zero.
- Validar unidades como inteiro maior ou igual a um.
- Salvar desativacao e criacao em uma transacao.
- Fazer a chave do cache depender da identidade/atualizacao da configuracao ativa. Assim uma nova configuracao nunca reutiliza uma resposta anterior.

### 2. Tabelas e APIs

- Aplicar o helper em `/api/meli/vendas`.
- Aplicar o helper nas APIs de vendas gerais, sem alterar vendas Shopee.
- Retornar explicitamente `receitaFlex`, `custoFlex`, `freteLiquidoFlex` e dados da configuracao aplicada.
- Calcular margem usando o frete liquido, mantendo o frete bruto para auditoria.

### 3. Indicadores financeiros

- Aplicar a mesma regra nos dois endpoints de estatisticas do dashboard.
- Aplicar em series temporais, ranking de margem e DRE.
- Evitar ler a margem persistida como verdade quando ela depender da configuracao Flex dinamica.

### 4. Interface

- Tipar os campos Flex no tipo de venda.
- Exibir o valor liquido na linha da tabela.
- Ao clicar, mostrar receita ML, custo da transportadora, quantidade de cobrancas e resultado liquido.
- Manter comportamento Shopee inalterado.

## Criterios de aceite

1. `R$ 1,10 - R$ 11,90 = -R$ 10,80` para uma unidade.
2. `R$ 0,89 - R$ 11,90 = -R$ 11,01` para uma unidade.
3. Venda nao Flex mantem o frete original.
4. Sem configuracao ativa, venda Flex mantem o repasse original e custo zero.
5. Alterar a configuracao muda imediatamente vendas antigas e novas, sem aguardar expirar cache.
6. Tabela ML, tabela geral, dashboard, series, ranking e DRE usam a mesma regra.
7. O dropdown mostra os componentes e fecha a conta exatamente com o valor exibido na linha.
8. Nenhum dado bruto recebido do Mercado Livre e sobrescrito.

## Validacao final

- Testes unitarios do helper com valores positivos, negativos, multiplas unidades e ausencia de configuracao.
- Lint dos arquivos alterados.
- Build de producao.
- Busca global para confirmar que nenhum consumidor financeiro relevante continua calculando margem Flex diretamente com o frete bruto.

