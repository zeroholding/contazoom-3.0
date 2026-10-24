# Notificações — regras, auditoria e correções necessárias

> **Estado deste documento:** auditoria registrada em 23/10/2026 sobre o módulo publicado nos commits `2767472` e `4abff64`.
>
> **Importante:** este arquivo documenta os pontos encontrados. As correções abaixo **ainda não foram aplicadas** ao código, conforme solicitado. Não interpretar a lista como concluída.

## 1. Regra principal do produto

Uma notificação deve continuar **viva e não lida** até o próprio cliente reconhecê-la.

### Pode marcar como lida

- O cliente clica em uma notificação individual.
- O cliente usa uma ação explícita como **“Marcar como lida”** ou **“Marcar como vistos”**.
- O cliente abre/baixa o documento e o servidor confirma que o arquivo existe e foi lido com sucesso para montar a resposta.

### Não pode marcar como lida nem apagar

- Apenas abrir ou fechar o sino.
- Polling automático, atualização da página, foco da aba ou troca de tela.
- Chegar à central pelo link do e-mail sem abrir o arquivo.
- Popup bloqueado, erro 404/500 ou arquivo físico ausente.
- O administrador visualizar o documento do cliente.
- O administrador excluir ou substituir o documento.
- Falha, atraso ou falta de configuração da Brevo.
- Reinício/deploy do servidor.
- A notificação ficar antiga ou ultrapassar qualquer limite de paginação.

O campo `lidaEm` é independente de `emailStatus`: enviar ou falhar um e-mail nunca deve alterar a leitura no painel.

## 2. O que já está correto no módulo atual

- Abrir o sino não chama o `PATCH` de leitura.
- Polling, refresh e foco da aba não escrevem em `lidaEm`.
- GET e PATCH usam o usuário da sessão; não aceitam um `userId` arbitrário.
- O administrador abrindo arquivo de cliente não o marca como lido.
- Falha na Brevo não marca a notificação como lida.
- Sino, Dashboard e Drive usam o mesmo store de notificações.
- O e-mail não anexa documentos sensíveis; usa links autenticados para o painel.
- Links externos gravados por engano não são usados no template; caem na central de documentos.
- Textos dinâmicos do e-mail passam por escape HTML.
- O template usa Plus Jakarta Sans, Montserrat como alternativa, e PNGs dos ícones porque Gmail/Outlook não exibem SVG de forma confiável.
- A API da Brevo exige chave `xkeysib-`; senha SMTP `xsmtpsib-` não serve.

## 3. Bugs funcionais confirmados no painel

### P0 — Notificações antigas não lidas podem sumir da lista

**Onde:** `src/app/api/notificacoes/route.ts` e `src/hooks/useNotificacoes.ts`.

O GET atual busca apenas as 30 linhas mais recentes, misturando lidas e não lidas. Se o cliente tiver 31 avisos sem ler:

- o contador pode mostrar 31;
- o sino exibe apenas 30;
- a mais antiga fica inacessível;
- ler as 30 recentes não traz a antiga, porque as linhas lidas continuam ocupando a mesma janela;
- novos uploads podem empurrar outros avisos não lidos para fora da lista.

**Correção necessária:** retornar **todas as não lidas** e limitar apenas o histórico já lido. Ordenar por `criadaEm` e `id` para desempate estável.

### P0 — Excluir o documento apaga a notificação não lida

**Onde:** relação `Notificacao.documento` em `prisma/schema.prisma`.

A FK atual usa `onDelete: Cascade`. Se o administrador envia e depois remove/substitui o arquivo antes do cliente entrar, a linha da notificação é apagada junto.

**Correção necessária:** usar `onDelete: SetNull`, manter `documentoId` opcional e preservar o snapshot em `dados` (`nomeArquivo`, pasta, competência). Ao clicar, mostrar “Este documento não está mais disponível” e manter o aviso até o cliente reconhecê-lo.

### P0 — Alguns caminhos marcam como lida cedo demais

**Onde:**

- `SinoNotificacoes.tsx`;
- `AvisoDocumentosNovos.tsx`;
- `DriveDocumentos.tsx`;
- `api/documents/download/[fileName]/route.ts`.

Problemas atuais:

- chegar ao Drive pelo deep link já marca o documento como visto;
- o Drive marca antes de saber se `window.open` funcionou;
- a rota do arquivo marca antes de executar `readFile`;
- se o arquivo físico estiver ausente, o cliente recebe 500, mas o aviso já foi consumido.

**Correção necessária:**

- deep link deve apenas localizar/destacar o arquivo;
- popup bloqueado não pode consumir o aviso;
- na rota, ler o arquivo primeiro e só então registrar a leitura;
- clique individual no aviso continua sendo uma confirmação explícita válida.

### P0 — “Marcar todas” pode atingir aviso que chegou depois do clique

O PATCH atual com `{ todas: true }` atualiza tudo que estiver não lido no instante do SQL. Uma nova notificação criada entre o clique e o update pode ser marcada sem nunca ter aparecido para o cliente.

**Correção necessária:** a interface deve congelar e enviar os **IDs exatos** que estavam visíveis no clique, em lotes de até 200. Não usar horário do navegador como corte, pois uma transação iniciada antes pode confirmar depois.

Para compatibilidade com versões antigas, o servidor pode continuar aceitando `{ todas: true }`, mas deve primeiro selecionar os IDs existentes e atualizar somente aquele conjunto.

### P1 — Falha de PATCH pode esconder aviso só na interface

O hook atual faz leitura otimista antes da resposta. Se o PATCH e a consulta de reconciliação falharem, o sino diminui localmente mesmo que o banco ainda tenha `lidaEm = NULL`.

**Correção necessária:** alterar o estado local somente depois de resposta 2xx; em falha, preservar os avisos e mostrar/reter o erro. Toda requisição precisa de timeout e deve ser abortada ao trocar de usuário.

### P1 — Troca de usuário e fetch preso

Existe um único request global em voo. Uma busca antiga pode atrasar a carga da conta seguinte; sem timeout, uma resposta pendurada também bloqueia novas tentativas.

**Correção necessária:** `AbortController`, timeout de 15 segundos, descarte por usuário/versão e nova busca obrigatória após troca de identidade.

## 4. Bugs confirmados na criação do aviso

### P0 — Documento pode ser salvo sem notificação

**Onde:** `POST /api/documents`.

O documento é salvo primeiro; depois `notificarDocumentoNovo` roda num `try/catch`. Se essa segunda etapa falha, a rota ainda devolve sucesso e não existe evento/outbox para recuperar. O documento fica no Drive para sempre sem sino nem e-mail.

**Correção necessária:** criar `Document`, `DocumentLog` e `Notificacao` na mesma transação de banco. Se a notificação falhar, o documento não confirma.

### P0 — Retry do upload pode duplicar documento, aviso e e-mail

Se a resposta 201 se perde e a tela repete o POST, cada requisição cria outro nome de arquivo e outro documento.

**Correção necessária:**

- a tela gera `operationKey` estável com `crypto.randomUUID()`;
- o servidor mantém `uploadOperationKey` único no documento;
- retry com os mesmos dados devolve o documento existente;
- reutilizar a chave com dados diferentes retorna 409;
- serializar concorrentes com advisory lock por chave;
- usar nome físico estável derivado da chave;
- em commit ambíguo, consultar a chave sob o mesmo lock antes de apagar arquivo;
- criar índice único em `Notificacao.documentoId`, garantindo um aviso por documento.

### Risco residual do disco local

O arquivo fica em disco e o banco em PostgreSQL; não existe transação atômica entre os dois. Mesmo com lock e recuperação, uma queda brusca do processo pode deixar arquivo órfão. O desenho ideal inclui estado de staging e reconciliador, ou armazenamento de objeto transacional/idempotente (S3/R2). No deploy atual, nome físico estável e retry reduzem bastante o risco.

## 5. Bugs confirmados na fila de e-mail/Brevo

### P0 — Retry pode ser misturado com documento novo

**Onde:** `src/lib/notificacoes/criar.ts` e `despacho.ts`.

A criação atual altera `emailEnviarApos` de todas as linhas `PENDENTE`, inclusive as que voltaram de uma falha. Isso causa dois problemas:

1. Um upload novo fura o backoff de 15 minutos/1 hora de um retry antigo.
2. O conjunto `[A, B]` pode virar `[A, B, C]`; a chave de idempotência muda. Se a Brevo recebeu a primeira tentativa e só a resposta se perdeu, A e B podem sair novamente.

**Correção necessária:** separar:

- `emailGrupo`: identidade persistente e imutável do conjunto;
- `emailLote`: lease/token temporário do worker.

Documento novo só entra em grupo `PENDENTE_V2`, ainda sem tentativa (`emailTentativas = 0`). Depois da primeira chamada à Brevo, o grupo nunca aceita novos itens.

### P0 — Configuração ausente abandona e-mails definitivamente

Hoje o worker faz claim e converte linhas para `NAO_CONFIGURADO`. Corrigir a chave/remetente depois não as recoloca na fila.

**Correção necessária:** se `BREVO_API_KEY` ou `BREVO_SENDER_EMAIL` estiver ausente/inválido, não fazer claim nem mudar a linha; ela permanece pendente. Erros de chave, IP autorizado ou remetente devem ir para `AGUARDANDO_CONFIGURACAO` e voltar automaticamente.

Linhas antigas em `NAO_CONFIGURADO` devem ser recuperadas depois que a configuração ficar válida.

### P0 — Sucesso na Brevo + falha ao atualizar banco é tratado incorretamente

O mesmo `try/catch` envolve a chamada externa e o update para `ENVIADO`. Se a Brevo aceita o e-mail e somente o update do banco falha, o código pode marcar `FALHOU` ou reenviar.

**Correção necessária:** separar os dois efeitos:

1. chamar a Brevo;
2. fora do catch da Brevo, persistir `ENVIADO`.

Se só a persistência falhar, manter `ENVIANDO`. O lease abandonado volta usando o mesmo `emailGrupo` e a mesma chave de idempotência.

### P1 — Timeout não cobre o corpo da resposta

O timer atual é cancelado logo após os headers. Se o servidor envia headers e deixa o body pendurado, um lote bloqueia toda a fila sequencial.

**Correção necessária:** manter o `AbortController` ativo até terminar `response.text()`.

### P1 — Claims interrompidos gastam tentativas

A tentativa é incrementada já no claim. Um crash antes de chamar a Brevo pode consumir as cinco tentativas sem cinco envios reais.

**Correção necessária:** incrementar imediatamente antes da chamada do provedor. Lease abandonado volta sem desistência baseada apenas no número de claims.

### P1 — Starvation no backlog

Os 50 usuários são escolhidos por `userId`, e não pelo lote vencido mais antigo. Com backlog sustentado, IDs maiores podem esperar indefinidamente; réplicas também disputam os mesmos primeiros IDs.

**Correção necessária:** selecionar `emailGrupo` por `MIN(emailEnviarApos)`, mais antigo primeiro.

### P1 — Retry HTTP incompleto

Só 429 e 5xx são retentáveis. HTTP 408 e 425 também são temporários.

**Correção necessária:** retry para 408, 425, 429, 5xx e erros de rede/timeout. Depois das tentativas rápidas, manter recuperação espaçada em vez de descartar por instabilidade longa.

### P1 — JSON ruim pode derrubar lote inteiro

Um `dados.nomeArquivo` ou `mimeType` com tipo inesperado pode lançar e marcar todas as linhas do grupo como falha.

**Correção necessária:** validar/sanitizar cada campo em runtime e usar fallbacks (`Documento`, formato vazio, pasta nula).

### Semântica de “enviado”

`ENVIADO` significa que a Brevo respondeu 2xx e aceitou a mensagem, não que ela chegou à caixa postal. Entrega, bounce e spam exigiriam webhook da Brevo. A interface não deve prometer confirmação de leitura do e-mail.

## 6. Deploy sem mistura de workers

Uma alteração direta de protocolo pode quebrar durante o intervalo em que código antigo e novo convivem.

### Riscos

- Coluna nova obrigatória sem default de banco faz escritor antigo falhar.
- Worker antigo ignora `emailGrupo` e pode juntar um retry novo por `userId`.
- Reagrupar linhas antigas muda a chave de idempotência.

### Migração segura recomendada

1. Adicionar campos de forma expansiva e compatível.
2. `email_grupo` deve ter default **no PostgreSQL** (`gen_random_uuid()::text`), não só `cuid()` no Prisma.
3. Preservar grupos legados conhecidos:
   - `email_lote` para linhas `ENVIANDO`;
   - `email_message_id` para linhas já aceitas;
   - assinatura de usuário/status/horário/tentativas para lote legado recuperável.
4. Consolidar duplicatas sem perder `lidaEm = NULL` e sem perder um estado `ENVIADO` já confirmado.
5. Novos escritores usam `PENDENTE_V2`/`ENVIANDO_V2`; worker antigo não conhece esses estados e não os captura.
6. Worker novo drena tanto o protocolo antigo quanto o V2, sem misturá-los.
7. Só depois de retirar instâncias antigas, considerar endurecer/remover compatibilidade.

## 7. Estados recomendados do e-mail

```text
PENDENTE (legado) ──┐
                    ├─> ENVIANDO/ENVIANDO_V2 ─> ENVIADO
PENDENTE_V2 ────────┘              │
                                   ├─ erro transitório ─> PENDENTE_V2 (backoff)
                                   ├─ chave/IP/remetente ─> AGUARDANDO_CONFIGURACAO
                                   ├─ payload/destinatário inválido ─> FALHOU
                                   └─ processo morreu ─> PENDENTE do mesmo protocolo
```

- `FALHOU` deve ser dead-letter somente para erro não recuperável de dado/destinatário.
- Ausência de configuração e instabilidade de infraestrutura não podem descartar e-mail.
- Estado de e-mail nunca apaga ou lê a notificação no painel.

## 8. Segurança e configuração da Brevo

Variáveis:

```env
BREVO_API_KEY="xkeysib-..."
BREVO_SENDER_EMAIL="contato@contazoom.com.br"
BREVO_SENDER_NAME="ContaZoom"
BREVO_REPLY_TO="contato@contazoom.com.br"
APP_URL="https://app.contazoom.com.br"
NOTIFICACOES_EMAIL_ESPERA_SEGUNDOS="90"
```

- `BREVO_API_KEY` deve começar com `xkeysib-`.
- Nunca usar `xsmtpsib-` na API HTTP.
- O remetente precisa estar validado na Brevo.
- O IP de saída do servidor precisa estar autorizado se a allowlist estiver ativa.
- `BREVO_SANDBOX=1` valida e **descarta** o e-mail; não deixar ligado em produção.
- Nunca gravar chave real no repositório, teste ou documentação.
- A chave utilizada durante os testes apareceu na conversa e deve ser rotacionada ao final da configuração.

## 9. Testes obrigatórios antes de considerar resolvido

### Painel

- 31, 100 e mais notificações não lidas: todas permanecem acessíveis.
- Abrir/fechar sino não altera banco.
- Polling, refresh, foco e navegação não alteram `lidaEm`.
- Deep link localiza, mas não lê.
- Arquivo físico ausente: 500 e notificação continua não lida.
- Exclusão administrativa: notificação continua viva e mostra indisponibilidade.
- “Marcar todas” simultâneo a novo upload: o novo aviso fica não lido.
- PATCH 500/timeout: aviso não some da interface.
- Troca de usuário durante GET/PATCH: nenhum estado cruza contas.

### Upload/outbox

- Documento, log e notificação confirmam juntos.
- Falha da notificação reverte o documento.
- Duas requisições com a mesma `operationKey` geram um documento e um aviso.
- Mesma chave com dados diferentes retorna 409.
- Commit ambíguo não apaga arquivo confirmado.
- Duas requisições concorrentes não sobrescrevem conteúdo diferente.

### E-mail

- Configuração ausente mantém linhas pendentes.
- Corrigir configuração recupera linhas antigas.
- Dois workers não capturam a mesma linha.
- Documento novo não entra num grupo que já teve tentativa.
- Timeout ambíguo repete a mesma chave de idempotência.
- Sucesso da Brevo + falha no update não vira `FALHOU`.
- Lease abandonado recupera o grupo.
- Backoffs: 1 min, 5 min, 15 min e 1 h.
- 408, 425, 429, 5xx e rede são retentáveis.
- 400 de destinatário inválido vai para dead-letter sem afetar o sino.
- Reinício do container recolhe fila vencida imediatamente.
- Template continua legível com imagens/fontes bloqueadas.

## 10. Critério final de aceite

O módulo só está concluído quando estes invariantes forem demonstrados:

1. **Nenhuma notificação não lida desaparece da interface ou do banco.**
2. **Nenhum erro de arquivo marca leitura antes de entregar conteúdo válido.**
3. **Nenhum upload confirmado fica sem uma notificação correspondente.**
4. **Retry do mesmo upload não gera duplicata.**
5. **E-mail sem configuração ou com falha transitória permanece recuperável.**
6. **Retry ambíguo usa o mesmo conjunto e a mesma chave de idempotência.**
7. **Ações/deletes do administrador não consomem avisos do cliente.**
8. **Leitura é sempre ação explícita do cliente ou acesso bem-sucedido ao arquivo.**
