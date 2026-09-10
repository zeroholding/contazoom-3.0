# CONTAZOOM — Otimizações de Performance, Dados e Sincronização

> Documento técnico completo de tudo que foi feito nas rodadas de otimização.
> Serve como referência para quem for mexer no sistema depois: o que mudou,
> onde mudou, por que mudou, o que **NÃO** pode ser tocado e por quê.
>
> **Última atualização:** 2026-07-05
> **Branch:** `main` — repo `github.com/zeroholding/contazoom-3.0.git`
> **Deploy:** push na `main` → webhook Coolify → deploy automático (`node server.js`, single-thread).

---

## 0. Contexto do sistema

- **CONTAZOOM** é um ERP de gestão de vendas para marketplaces (**Mercado Livre** + **Shopee**).
- Stack: **Next.js 16 + React 19 + Prisma + PostgreSQL**, rodando em VPS via **Coolify**.
- Produção roda `node server.js` (single-thread, Node 20+).
- Backup do banco já existe (Coolify local storage).

### Dados reais medidos (importante para decisões)
| Métrica | Valor |
|---|---|
| Total de vendas ML | 44.701 |
| Maior conta (vendas) | 13.122 |
| `raw_data` médio por venda | ~4,7 KB |
| Query pesada no banco | **189 ms** (banco **NÃO** é o gargalo) |

> **Conclusão-chave:** o banco não é o gargalo. Os gargalos reais eram:
> 1. Leitura de `rawData` desnecessária em agregações.
> 2. Contadores (`count`) recalculados a cada request.
> 3. Refetch em loop / fetch duplicado no front.
> 4. Scan de catálogo completo em toda sincronização.
> 5. Falta de cache nas rotas de dashboard/financeiro.
> 6. Timer de heartbeat SSE órfão e requests de sync sem timeout.

---

## 1. Regras de ouro (NUNCA violar)

Estas restrições foram definidas pelo dono do projeto e valem para qualquer mudança futura:

1. **NÃO mexer no schema do banco de dados.**
2. **NÃO alterar dados** (nenhuma migração destrutiva, nenhum backfill que reescreva valores).
3. **NÃO quebrar lógicas de cálculo:**
   - Frete Flex / não-Flex (Mercado Livre).
   - CMV (custo da mercadoria vendida) e imposto.
   - Financeiro da Shopee (escrow / order_income / breakdowns).
4. **Real-time obrigatório:** venda nova precisa aparecer mesmo com cache ativo.
   Por isso **toda mudança de dados invalida o cache** (ver seção de cache).
5. **Nunca commitar/pushar sem autorização explícita** do dono.
6. Trabalhar **somente na CONTAZOOM** — a pasta `v2/` é o projeto **Nexus** (repo
   `moraistv/nexusv2.git`), usada só como referência de arquitetura. **Nunca editar.**

### Como validar build
```powershell
npx next build 2>&1 | Select-String -Pattern "Compiled|Failed|Type error|error TS"
```
- O encoding do output do build quebra números/acentos; por isso filtramos com `Select-String`.
- `ESLint` está com `ignoreDuringBuilds: true` no `next.config` → build **não** falha por lint.

---

## 2. Sistema de cache (fundação de quase tudo)

**Arquivo:** `src/lib/cache.ts`

- Cache **em memória** (chave string → valor + timestamp), com TTL configurável por leitura.
- TTL padrão elevado de **60s → 5min (300000 ms)** em todas as rotas de dados.
- Helpers principais:
  - `createCacheKey(prefixo, ...partes)` — monta a chave.
  - `cache.get<T>(chave, ttlMs)` — retorna valor se dentro do TTL, senão `null`.
  - `cache.set(chave, valor)` — grava com timestamp atual.
  - `cache.deletePattern(fragmento)` — apaga todas as chaves que contêm o fragmento.
  - `invalidateVendasCache(userId)` — **invalidação completa**: faz `cache.deletePattern(userId)`,
    limpando tudo daquele usuário (vendas, dashboard, financeiro, counts, etc.).

### Onde a invalidação é chamada (garante real-time)
- Ao final de **toda sincronização** (ML e Shopee) que grava vendas.
- Em **alíquotas de imposto** (POST / PUT / DELETE).
- Em **configuração de frete Flex** (create/update).

> **Regra prática:** se você criar uma rota que altera dados que aparecem em
> tela, **chame `invalidateVendasCache(userId)`** ao final, ou o usuário verá
> dados velhos por até 5 minutos.

### Wrapper para cachear `null`
`loadActiveFlexShippingConfig` foi encapsulado num objeto `{ v }` antes de cachear,
porque o cache trata `null` como "miss". Sem o wrapper, uma config Flex ausente
(null) seria buscada no banco a cada request.

---

## 3. Otimizações de DADOS (dashboard / vendas / financeiro)

### 3.1 `buildPendingSkuSummary` — o "hoje lento" (maior ganho de dados)
**Arquivo:** `src/lib/sku-pending.ts`

- **Antes:** lia `rawData` de todas as vendas para montar o resumo de SKUs pendentes.
  Como `rawData` tem ~4,7 KB/venda, isso era o gargalo do "hoje" lento.
- **Depois:** reescrito para usar **`groupBy` SQL** — agrega direto no banco sem
  trazer `rawData`. Resultado cacheado por 5 min.

### 3.2 Cache em todas as rotas de dashboard/financeiro
Rotas com cache de 5 min adicionado:
- `/api/dashboard/*` (todas)
- `/api/financeiro/dre/series`
- `/api/financeiro/dashboard/stats`

### 3.3 Gráficos "faturamento-por-*" migrados para SQL
- 5 gráficos que iteravam vendas em memória passaram a usar **`groupBy` SQL**.

### 3.4 Cache dos contadores do ML (rodada da auditoria)
**Arquivo:** `src/app/api/v2/meli/vendas/route.ts` — commit `bfd729b`

- **Antes:** a cada troca de página, 4 `count()` eram recalculados
  (total + abas Todas/Pagas/Canceladas), cada um varrendo todas as vendas do usuário.
- **Depois:** os counts são cacheados por **usuário + filtros** (chave
  `meli-vendas-counts` + `JSON.stringify(where)`), TTL 5 min, invalidados no sync.
- O `findMany` da página **continua** rodando por página (muda com skip/take).
- Detalhe técnico: `JSON.stringify(options.where ?? {})` como parte da chave —
  `Date` vira ISO string, então a chave é estável para os mesmos filtros.

### 3.5 Correções pontuais de dados
- Bug de contagem em `/vendas/geral` corrigido.
- **N+1** em `/api/sku/com-status-vendas` corrigido.
- Paginação **opt-in** na Shopee (`?page=&limit=`) — ver seção 6.

---

## 4. Otimizações de FRONT (navegação / loop de refetch)

### 4.1 Loop de refetch em `/vendas/geral` (maior ganho de front)
**Arquivo:** `src/hooks/v2/useVendas.ts` — commit `bfd729b`

- `loadVendasFromDatabase` agora é **memoizado com `useCallback([platform])`**.
- Adicionada **guarda de dedupe** via `inFlightLoadKeyRef`:
  - A chave é `` `${platform}::${JSON.stringify(filters)}` ``.
  - Se já existe uma carga idêntica em andamento, a segunda chamada retorna sem fazer nada.
  - A ref é liberada (`null`) no `finally`, então reloads legítimos depois continuam funcionando.
- **Por quê:** o `useEffect` do próprio hook e o `useEffect` da view disparavam a
  **mesma** busca no mount → fetch duplicado + loop. Resolvido.

### 4.2 Navegação entre páginas / login lentos
- `PageTransitionFramer` sem `mode="wait"` (não bloqueia a transição esperando a saída).
- `console.log` de auth removidos (poluíam e custavam em cada navegação).
- `/api/admin/check` cacheado por sessão (commit `e1aae93`) — evitava refetch a cada navegação.

### 4.3 Layout do topo cortado
- `pt-16 p-3 sm:p-6` → `pt-16 px-3 pb-3 sm:px-6 sm:pb-6` em **13 views**.
- Corrigiu o topo sendo cortado / entrando por baixo do header em todas as páginas.

---

## 5. Otimizações de SINCRONIZAÇÃO (ML e Shopee)

### 5.1 Sync incremental REAL no Mercado Livre
- **Antes:** janela fixa de 15 dias em toda sync.
- **Depois:** janela desde o **último sync + buffer de 2 dias**.
- Log de exemplo: `Modo Incremental REAL: atualizações desde <data> (base: último sync <data>)`.

### 5.2 Scan de catálogo só na PRIMEIRA sync (maior ganho de sync)
**Funções:** `fetchMeliCatalogSkuCandidates` / `fetchShopeeCatalogSkuCandidates`

- **Gargalo confirmado:** o scan de catálogo do ML levava **~2min47s**
  (`found 407, created 0`) enquanto a busca de vendas levava **~1s**.
  Era isso que fazia o sync demorar 2–3 minutos "só pra vir 1 venda".
- **Gate aplicado (commit `bf2fdc3`):**
  - ML: `if (jaTemVendasMeli === 0)` — só escaneia catálogo se a conta nunca teve vendas.
  - Shopee: `if (jaTemVendasShopee === 0)` — idem.
- Ou seja: catálogo é escaneado **uma vez** (primeira sync da conta). Nas syncs
  seguintes, só busca vendas novas/atualizadas → **rápido**.

### 5.3 Contas em paralelo + barra de progresso ao vivo
- Contas sincronizadas em paralelo no modal (`Promise.all`).
- Barra de progresso via **SSE** ao vivo no modal (quanto falta, em tempo real).

### 5.4 Bug do heartbeat SSE "Controller is already closed" (commit `ea3729d`)
**Arquivo:** `src/app/api/meli/vendas/sync-progress/route.ts`

- **Sintoma nos logs:** `Erro ao enviar heartbeat: TypeError: Invalid state: Controller is already closed`.
- **Causa:** o `cancel()` do `ReadableStream` (disparado quando o cliente desconecta)
  **não** limpava o `setInterval` do heartbeat — ele estava fora de escopo. O timer
  órfão continuava disparando a cada 30s e tentava `enqueue` num controller já fechado.
- **Correção:** referências compartilhadas (`heartbeatInterval`, `cleanup`, `closed`)
  + função `teardown()` chamada em **todos** os caminhos de fechamento
  (`abort`, `cancel`, e erro no próprio heartbeat). Guarda `if (closed) return` no timer.
- O SSE é **compartilhado** (`src/lib/sse-progress.ts`), então essa correção cobre ML e Shopee.

### 5.5 Timeout por tentativa no fetch de sync (commit `ea3729d`)
**Arquivo:** `src/lib/v2/utils/fetch-with-retry.ts`

- **Antes:** um request pendurado ao ML/Shopee travava o sync **indefinidamente** (cauda de latência).
- **Depois:** cada tentativa tem **timeout de 30s** via `AbortSignal.timeout(30000)`,
  combinado com o `signal` do chamador (se houver) via `AbortSignal.any`.
  Há fallback com `AbortController` manual para ambientes sem essas APIs.
- O mecanismo de **retry + backoff exponencial** já existente cuida da recuperação.
- Assinatura nova: `fetchWithRetry(url, options, maxRetries=3, userId?, timeoutMs=30000)`.

---

## 6. Shopee — estado atual e por que está como está

**Arquivo:** `src/app/api/shopee/vendas/route.ts`

- Tem **cache de 5 min** (chave inclui `SHOPEE_FINANCIAL_RULE_VERSION` e o modo).
- Tem **paginação OPT-IN**: se vier `?page=` ou `?limit=` na query, ativa `skip/take + count`;
  senão retorna **todas** as vendas (comportamento original).
- **Por que ainda retorna tudo por padrão:** o front faz **filtro, ordenação e
  contagens client-side** com a lista completa. Paginar de verdade no servidor
  exige reescrever essa lógica no front.
- **Recálculo financeiro:** para cada venda, `calculateShopeeFinancials(rawData, ...)`
  recompõe valores a partir de `rawData` + `paymentDetails` (escrow/order_income).
  Isso é **lógica de cálculo protegida** — não pode ser alterada.

> **Gargalo remanescente da Shopee** (não resolvido, exige decisão do dono):
> a rota carrega toda a lista com `rawData` e recalcula o financeiro de cada venda.
> Para deixar rápido de verdade seria preciso **mover filtro/ordenação/contagem
> para o servidor com paginação real**, o que mexe em exibição e no caminho de
> cálculo. Ficou **fora de escopo** por respeitar as regras de ouro (seção 1).

---

## 7. Itens avaliados e DELIBERADAMENTE NÃO alterados

| Item | Onde | Motivo de não mexer |
|---|---|---|
| UPDATE item-a-item → upsert em massa | `src/lib/sync-worker.ts` (~linha 368) | Salvamento já é instantâneo nos logs; batch limitado a 50/transação; banco não é gargalo. SQL raw tocaria no caminho de escrita de dados com risco real e ganho ~zero. |
| Paginação real no front da Shopee | `src/app/api/shopee/vendas/route.ts` + views | Front faz filtro/ordenação/contagem client-side; mexer arrisca quebrar exibição e cálculo financeiro. |
| `React.memo` na `VendasTable` | `src/app/components/views/ui/VendasTable.tsx` | Baixo impacto: o DOM renderiza só ~10 linhas por página. |

> **Se for atacar o gargalo da Shopee no futuro:** o caminho é paginação
> server-side de verdade + mover filtro/ordenação/contagem para o backend.
> É a única grande vitória que sobra, mas mexe em exibição — precisa de validação
> cuidadosa e autorização explícita.

---

## 8. Histórico de commits relevantes (na `main`)

Do mais recente para o mais antigo:

| Commit | Descrição |
|---|---|
| `ea3729d` | `fix(sync)`: encerra heartbeat SSE ao fechar conexão + timeout por tentativa no `fetch-with-retry` |
| `bfd729b` | `perf(vendas)`: corrige loop de refetch em `/vendas/geral` + cacheia counts do ML |
| `bf2fdc3` | `perf(sync)`: pula scan de catálogo em sync incremental (ML e Shopee) |
| `0bc09b3` | `perf(dados)`: cache do flex-config + TTL 60s→5min + invalidação completa |
| `e1aae93` | `perf`: cacheia `/api/admin/check` por sessão (evita refetch a cada navegação) |

> **Nota histórica:** houve um episódio em que melhorias de "dashboard interativo"
> foram commitadas por engano na CONTAZOOM (deveriam ir para o Nexus). Foram
> **revertidas via `git revert` + push**; o código voltou 100% ao estado anterior.

---

## 9. Arquivos-chave (mapa rápido para quem for mexer)

| Arquivo | Papel |
|---|---|
| `src/lib/cache.ts` | Cache em memória + `createCacheKey` + `invalidateVendasCache` |
| `src/lib/sku-pending.ts` | `buildPendingSkuSummary` (agregação via `groupBy` SQL) |
| `src/app/api/v2/meli/vendas/route.ts` | Listagem + counts cacheados do ML |
| `src/app/api/shopee/vendas/route.ts` | Listagem Shopee (cache + paginação opt-in + recálculo financeiro) |
| `src/hooks/v2/useVendas.ts` | Hook de vendas do front (loop fix + dedupe + SSE) |
| `src/lib/sync-worker.ts` | Worker Redis → PostgreSQL (batch create/update) |
| `src/lib/v2/utils/fetch-with-retry.ts` | Fetch com retry + backoff + **timeout** |
| `src/lib/sse-progress.ts` | SSE compartilhado (conexões por usuário) |
| `src/app/api/meli/vendas/sync-progress/route.ts` | Endpoint SSE (heartbeat corrigido) |
| `src/lib/flex-shipping-config.ts` | `loadActiveFlexShippingConfig` (cacheado com wrapper) |
| `src/lib/flex-shipping.ts` | `calculateMeliFlexShipping` — **cálculo protegido** |
| `src/lib/shopee-finance.ts` | `calculateShopeeFinancials` — **cálculo protegido** |

---

## 10. Checklist para a próxima mudança de performance

Antes de mexer, pergunte:

- [ ] Isso altera **schema** do banco? → **PARE.**
- [ ] Isso altera **dados** existentes? → **PARE.**
- [ ] Isso muda **cálculo** de Flex / CMV / imposto / financeiro Shopee? → **PARE.**
- [ ] Isso quebra a exibição atual (filtro/ordenação/contagem client-side)? → cuidado, valide muito.
- [ ] A mudança altera dados que aparecem em tela? → **chame `invalidateVendasCache(userId)`.**
- [ ] Rodou `npx next build` e passou? → só então commitar.
- [ ] Tem autorização explícita do dono para commitar/pushar? → só então `git push origin main`.

---

*Fim do documento. Mantenha atualizado a cada rodada de otimização.*
