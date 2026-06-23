# ⚠️ Nota Importante sobre Arquitetura: APIs V1 vs V2

## O Cenário Atual

O ContaZoom possui duas gerações de rotas de API para listagem de vendas. **A interface do usuário foi migrada para consumir a V2**, mas arquivos da V1 ainda existem no código.

Quando for realizar alterações de regras de negócio, cálculos financeiros ou envio de dados para o frontend, **atenção redobrada para qual rota você está modificando**.

## Mapeamento de Rotas (Mercado Livre)

A tela **Central de Vendas > Vendas Mercado Livre** (que usa o hook `useVendasV2` e o `VendasContext`) consome os dados destas rotas:

### ✅ ROTAS ATIVAS (V2) - Aonde as mudanças devem ser feitas
- **Dashboard Específico (Mercado Livre):** `src/app/api/v2/meli/vendas/route.ts`
- **Dashboard Geral (Todas as Contas):** `src/app/api/v2/geral/vendas/route.ts`
- **Hook do Frontend:** `src/hooks/v2/useVendas.ts`

### ❌ ROTAS LEGADAS (V1) - Não afetam a tela principal
- **Vendas Mercado Livre Antiga:** `src/app/api/meli/vendas/route.ts`
- **Vendas Geral Antiga:** `src/app/api/vendas/route.ts`
- **Hook Antigo:** `src/hooks/useVendas.ts`

> Aviso de Sobrescrita:
> **Sempre atualize a V2.** Se você colocar uma nova lógica na V1 (`api/meli/vendas/route.ts`), o código vai compilar e parecer correto, mas a tela do usuário não vai refletir a mudança, pois ela busca os dados da V2.

## Exemplo Histórico: Implementação do Frete Flex
A implementação do cálculo do frete Flex só surtiu efeito na interface quando injetamos a chamada `calculateMeliFlexShipping()` dentro de `src/app/api/v2/meli/vendas/route.ts`. A modificação isolada na V1 havia sido completamente ignorada pela interface do usuário porque ela usa V2.
