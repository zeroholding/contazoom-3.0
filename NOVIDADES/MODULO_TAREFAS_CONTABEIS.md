# Módulo de Tarefas Contábeis — ContaZoom

Documento de entendimento e especificação. Escrito a partir de:

- `NOVIDADES/Modelo de Controle de Tarefas - sugestão.pdf` (apresentação do escritório contábil, 5 slides)
- `NOVIDADES/Tarefas SN e LP.pdf` (documento Word com as etapas detalhadas, 2 páginas)
- Conversa com o Gianluca sobre o uso real e os processos de legalização
- Leitura do código do CONTAZOOM (schema, autenticação, área admin, design system)

Nada foi implementado ainda. Este documento é para revisão antes de escrever código.

---

## 1. O que é isto, em uma frase

Um ambiente **interno** da ContaZoom onde a gestão/comercial e o escritório contábil da casa
acompanham juntos, cliente por cliente, o andamento de dois tipos de trabalho: a **apuração
fiscal mensal** (rotina, todo mês) e os **processos de legalização** (pontuais, quando
acontecem).

O que ele responde, a qualquer momento, sem ninguém precisar perguntar no WhatsApp:

- em que etapa está a apuração de cada cliente neste mês
- o que está travado, e travado esperando o quê
- quem mexeu, o que mudou e quando
- quais clientes têm processo de legalização em curso e em que ponto

---

## 2. Quem usa

Isto **não é tela de cliente final**. É comunicação interna entre duas partes que trabalham
no mesmo processo:

| Quem | Papel no processo | O que precisa |
|---|---|---|
| **Gianluca — gestão/comercial ContaZoom** | Executa a primeira etapa (recebe documentos do cliente) e cobra o andamento | Ver tudo, de todos os clientes, com etapa e log |
| **Escritório contábil (equipe da casa)** | Executa da etapa 2 em diante | Ver a carteira, mover etapa, registrar pendência |
| **Ajudante da contabilidade** | Apoio operacional | Acesso restrito ao que lhe cabe |
| **Cliente final** | Dono do CNPJ | *(fora do escopo desta fase — ver seção 14.6)* |

Isso vem direto do documento do escritório: a coluna **"Responsável típico"** já atribui a
etapa 1 ao **Comercial C.Z** e a etapa 3 do Simples Nacional a **Escritório/Comercial C.Z**.
Ou seja, o fluxo é compartilhado por construção — não é o escritório trabalhando sozinho e
reportando no fim.

---

## 3. Os dois mundos

### 3.1 Apuração fiscal — rotina mensal

Acontece **todo mês, para todo cliente**. A unidade de trabalho é a **competência**
(mês/ano). Dois regimes, com fluxos diferentes:

- **Simples Nacional** — 10 etapas. É o foco principal da carteira.
- **Lucro Presumido** — 14 etapas. Inclui escrituração contábil e obrigações acessórias.

Todo mês nasce uma tarefa nova por cliente. Em janeiro existe a competência 2026-01; em
fevereiro, a 2026-02; e assim por diante. O histórico fica.

### 3.2 Legalização — processos pontuais

Acontece **quando acontece**, sem periodicidade. A unidade de trabalho é o **processo**, que
tem começo e fim. Cinco tipos:

1. **Abertura de CNPJ**
2. **Encerramento / baixa de CNPJ**
3. **Regularização de CNPJ** (cliente com dívida ou pendência na Receita)
4. **Alteração** (contratual, endereço, sócios, atividade, capital)
5. **Desenquadramento** (sair do Simples, mudar de regime, sair do MEI)

Cada um tem etapas próprias. **As etapas de legalização ainda não estão documentadas** —
a seção 11 traz uma proposta minha para vocês corrigirem.

### 3.3 A diferença que muda o software

| | Apuração | Legalização |
|---|---|---|
| Periodicidade | Mensal, automática | Pontual, criada à mão |
| Unidade | Competência (mês/ano) | Processo (com abertura e conclusão) |
| Existe para todo cliente? | Sim | Não, só quando contratado |
| Prazo | Fixo pelo calendário fiscal | Variável, depende de órgão externo |
| Quantidade por cliente | Uma por mês, por CNPJ | Zero, uma ou várias ao mesmo tempo |
| Repete? | Sempre | Raramente |

Por isso **não** são a mesma entidade com um campo "tipo". São dois fluxos que compartilham
a mesma mecânica de etapas, status e log, mas têm ciclo de vida diferente. O modelo de dados
da seção 6 reflete isso.

---

## 4. A tensão central, e como resolvo

Preciso ser direto aqui, porque isto define o produto.

**O que o escritório propôs.** O slide 2 diz, literalmente:

> "A empresa acompanha o status da competência como um todo — sem visibilidade sobre as
> sub-etapas internas de execução, que permanecem no controle operacional do escritório."

E o slide de benefícios reforça: *"Não exige que o prestador registre micro-etapas que não
agregam informação para quem contrata."*

Ou seja: eles querem expor **6 status macro** e manter as 10/14 etapas como assunto interno
deles.

**O que você pediu.**

> "eu preciso ter lá cada cliente as etapas estágios que se encontram e o log disse quando
> foi alterado por quem o status"

Ou seja: você quer **as etapas**, não só o status macro.

**Os dois estão certos, para plateias diferentes.** A proposta do escritório foi escrita
pensando na ContaZoom como *cliente contratante* — e para um contratante, micro-etapa é
ruído. Mas o ambiente que você descreveu não é isso: é um ambiente **interno compartilhado**,
onde a ContaZoom **executa** parte do fluxo. A etapa 1 é sua. A etapa 3 é sua e deles. Você
não é plateia, é participante.

**A decisão: duas camadas, uma fonte de verdade.**

```
┌──────────────────────────────────────────────────────────────┐
│  CAMADA DE EXECUÇÃO  (a verdade)                             │
│  Etapa atual: 4 de 10 — "Apuração do faturamento (PGDAS-D)"  │
│  Quem executa: Escritório                                    │
│  Log completo de cada mudança                                │
└──────────────────────────────────────────────────────────────┘
                            │  deriva automaticamente
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  CAMADA DE ACOMPANHAMENTO  (o resumo)                        │
│  Status: "Em elaboração"                                     │
└──────────────────────────────────────────────────────────────┘
```

- A **etapa** é o que se move. Ela é registrada, tem responsável e vai para o log.
- O **status** é **calculado** a partir da etapa (tabela na seção 7.3). Ninguém preenche
  status à mão — exceto os dois status que não são posição no fluxo (*Pendência
  identificada* e *Aguardando documentação*), que são estados de bloqueio.
- Quem tem perfil interno (você e o escritório) vê **as duas camadas**.
- Se um dia o cliente final tiver acesso, ele vê **só a camada de acompanhamento** — e a
  promessa do escritório continua honrada, sem que ninguém precise registrar duas coisas.

Isso elimina o retrabalho: o escritório move a etapa uma vez, e o status macro sai de graça.

---

## 5. Vocabulário

Fixar os nomes agora evita conversa cruzada depois. Estes são os termos que uso no resto do
documento e que devem aparecer no código e na tela.

| Termo | Significado |
|---|---|
| **Cliente** | A empresa atendida. Hoje no CONTAZOOM é o `User`; ver o problema na seção 6.1 |
| **Empresa / CNPJ** | A pessoa jurídica que sofre a apuração. Um cliente pode ter mais de uma |
| **Competência** | O mês de referência da apuração, no formato `2026-01` |
| **Regime** | Simples Nacional ou Lucro Presumido |
| **Tarefa** | Uma unidade de trabalho: uma apuração de uma competência, ou um processo de legalização |
| **Etapa** | Um passo numerado dentro da tarefa (1 a 10, 1 a 14, etc.) |
| **Status** | O resumo macro da tarefa, derivado da etapa (os 6 do slide 2) |
| **Pendência** | Um bloqueio registrado: o que falta, de quem, desde quando |
| **Log** | Histórico imutável de tudo que mudou na tarefa, com autor e data |
| **Responsável** | Quem executa a etapa: `COMERCIAL_CZ`, `ESCRITORIO`, ou ambos |

---

## 6. Modelo de dados

### 6.1 O problema que precisa ser decidido antes de tudo: não existe CNPJ

Verifiquei o `prisma/schema.prisma` inteiro (24 modelos, 523 linhas). **Não existe modelo de
empresa, não existe campo de CNPJ, não existe razão social, não existe regime tributário.**
Busquei por `cnpj`, `empresa` e `tenant` em todo o `src/` e no schema: zero ocorrências.

Hoje o modelo mental do sistema é **1 `User` = 1 cliente = 1 empresa**. Está explícito na
própria interface: o painel admin diz *"Crie e gerencie contas de clientes na plataforma"*,
e o Drive diz *"Selecione um cliente para vincular o documento"*. O isolamento de dados é
`where: { userId }` em cada consulta.

O mais perto de CNPJ que existe é `AliquotaImposto.conta`, e o comentário do próprio schema
mostra que não serve: `// Conta/CNPJ (ex: "Mercado Livre - Moscou", "Shopee Principal")` —
é texto livre com nome de conta de marketplace.

**Por que isso é bloqueante.** Apuração fiscal é por **CNPJ e competência**, não por login.
E na contabilidade é comum:

- um cliente com **dois ou três CNPJs** (a operação, a holding, a filial)
- CNPJs em **regimes diferentes** entre si
- um CNPJ que **muda de regime** no meio da vida (é exatamente o que "desenquadramento" faz)
- CNPJ que a ContaZoom atende **sem que exista login de cliente** para ele no sistema

Se `TarefaApuracao` apontar para `userId`, nenhuma dessas quatro situações cabe.

**Recomendação: criar o modelo `Empresa`.** É a decisão certa e é aditiva — não mexe em nada
do que existe. `User` continua sendo o login; `Empresa` passa a ser o CNPJ atendido.

**Três caminhos, e o que eu escolheria:**

| Caminho | Como fica | Avaliação |
|---|---|---|
| **A** — Tarefa aponta para `userId` | Zero schema novo | Não resolve nada. Quebra no primeiro cliente com dois CNPJs. **Rejeitado** |
| **B** — `Empresa` com FK opcional para `User` | `Empresa` é a unidade; login é opcional | **Recomendado.** Permite atender CNPJ sem login, e vários CNPJs por login |
| **C** — `Empresa` + tabela de junção `UsuarioEmpresa` | Vários logins por empresa e vice-versa | Correto a longo prazo, complexo agora. Cabe depois, sem migração destrutiva |

Vou detalhar o **caminho B**. Ele não fecha a porta para o C.

### 6.2 Padrões do projeto que vou seguir (e um que vou quebrar)

Levantei do código para o módulo novo não parecer enxertado:

- **`@@map` para snake_case** em toda tabela e coluna. Todos os 24 modelos fazem isso.
- **`cuid()` como id.** Só o `User` usa `uuid()`; o resto é `cuid()`.
- **`createdAt`/`updatedAt`** com `@map("created_at")`/`@map("updated_at")`.
- **`onDelete: Cascade`** nas relações filhas.
- **Nenhum `enum`.** O schema não tem um único enum. O padrão é `String` + `@default(...)` +
  comentário listando os valores (`role String @default("USER")`, `status String
  @default("pendente")`, `origem String @default("MANUAL") // MANUAL, SINCRONIZACAO, EXCEL`).
  **Vou manter `String`** e concentrar os valores válidos em constantes TypeScript num arquivo
  único, no modelo de `src/lib/document-categories.ts`. Motivo: consistência, e migração de
  enum no Postgres é mais chata justamente num banco que já tem drift (ver 6.5).
- **Migração defensiva.** A migration `20260520165058_add_subfolder_support` usa
  `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` e `DO $$ ... EXCEPTION` para FK.
  Não é preciosismo: a coluna `role` do `User` **não existe em nenhuma migration** — foi
  aplicada por `db push` ou SQL manual. O deploy roda `prisma migrate deploy`, então
  migration nova precisa tolerar banco fora de sincronia.

O padrão que **vou quebrar de propósito**: os textos de etapa não ficam no banco como texto
livre. Ficam em constante versionada no código (seção 8.4), porque são regra de negócio, não
dado do usuário.

### 6.3 Schema proposto

```prisma
// ===========================================================================
// EMPRESA — o CNPJ atendido. É a unidade de trabalho da contabilidade.
//
// Separado do User de propósito: User é login, Empresa é quem sofre a apuração.
// Um login pode responder por vários CNPJs, e a ContaZoom pode atender um CNPJ
// que ainda não tem login no sistema (comum em cliente novo em abertura).
// ===========================================================================
model Empresa {
  id             String    @id @default(cuid())
  cnpj           String    @unique @db.VarChar(14)   // só dígitos, sem máscara
  razaoSocial    String    @map("razao_social")
  nomeFantasia   String?   @map("nome_fantasia")
  regime         String                              // SIMPLES_NACIONAL, LUCRO_PRESUMIDO
  uf             String?   @db.VarChar(2)
  municipio      String?
  inicioAtividade DateTime? @map("inicio_atividade")

  // Situação da empresa no atendimento, não na Receita.
  // ATIVA, SUSPENSA, ENCERRADA, EM_ABERTURA
  situacao       String    @default("ATIVA")

  // Login do cliente, quando existir. Opcional: CNPJ em processo de abertura
  // ainda não tem usuário, e nem por isso deixa de ter tarefa.
  // SetNull e não Cascade: apagar o login NUNCA pode apagar o histórico fiscal.
  userId         String?   @map("user_id")
  user           User?     @relation(fields: [userId], references: [id], onDelete: SetNull)

  responsavelId  String?   @map("responsavel_id")    // contador responsável
  responsavel    User?     @relation("EmpresaResponsavel", fields: [responsavelId], references: [id], onDelete: SetNull)

  observacoes    String?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  apuracoes      TarefaApuracao[]
  processos      ProcessoLegalizacao[]

  @@index([userId])
  @@index([regime])
  @@index([situacao])
  @@index([razaoSocial])
  @@map("empresa")
}

// ===========================================================================
// HISTÓRICO DE REGIME — porque desenquadramento existe.
//
// Sem isto, mudar o regime da empresa reescreveria o passado: a apuração de
// março (Simples) passaria a ser lida como Lucro Presumido só porque a empresa
// mudou em julho. A tarefa guarda o regime da própria competência (ver
// TarefaApuracao.regime), e esta tabela guarda a linha do tempo.
// ===========================================================================
model EmpresaRegimeHistorico {
  id           String    @id @default(cuid())
  empresaId    String    @map("empresa_id")
  regime       String
  vigenciaInicio DateTime @map("vigencia_inicio")
  vigenciaFim  DateTime? @map("vigencia_fim")        // null = vigente
  motivo       String?                              // ex: "Desenquadramento do Simples"
  registradoPor String?  @map("registrado_por")
  createdAt    DateTime  @default(now()) @map("created_at")

  empresa      Empresa   @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@index([empresaId])
  @@index([vigenciaInicio])
  @@map("empresa_regime_historico")
}

// ===========================================================================
// TAREFA DE APURAÇÃO — uma competência de uma empresa.
//
// `ano` e `mes` como Int em vez de DateTime ou string "2026/01_Janeiro":
//   - ordena e filtra sem truque de parsing
//   - a unicidade composta é natural
//   - não sofre com fuso horário, que é o defeito de DateTime para competência
// O projeto tem os dois precedentes ruins: ContaPagar.dataCompetencia (DateTime,
// sujeito a fuso) e Document.subFolder ("2026/01_Janeiro", string frágil).
// ===========================================================================
model TarefaApuracao {
  id            String   @id @default(cuid())
  empresaId     String   @map("empresa_id")
  ano           Int
  mes           Int                                  // 1 a 12

  // Regime CONGELADO no momento da criação da tarefa. Ver EmpresaRegimeHistorico.
  regime        String

  // Posição no fluxo. 0 = não iniciada. Máximo depende do regime (10 ou 14).
  etapaAtual    Int      @default(0) @map("etapa_atual")

  // Resumo macro, DERIVADO da etapa (ver seção 7.3). Gravado para permitir
  // filtro e agregação no banco sem recalcular em memória a cada consulta.
  status        String   @default("AGUARDANDO_DOCUMENTACAO")

  // Bloqueio ativo. Sai do fluxo normal: uma tarefa pode estar na etapa 4 e
  // bloqueada ao mesmo tempo, e o status macro passa a refletir o bloqueio.
  bloqueada         Boolean   @default(false)
  bloqueioMotivo    String?   @map("bloqueio_motivo")
  bloqueioDesde     DateTime? @map("bloqueio_desde")
  bloqueioResponsavel String? @map("bloqueio_responsavel")  // CLIENTE, ESCRITORIO, COMERCIAL_CZ, TERCEIRO

  prazoEntrega  DateTime? @map("prazo_entrega")
  iniciadaEm    DateTime? @map("iniciada_em")
  concluidaEm   DateTime? @map("concluida_em")

  responsavelId String?  @map("responsavel_id")
  responsavel   User?    @relation("ApuracaoResponsavel", fields: [responsavelId], references: [id], onDelete: SetNull)

  observacoes   String?
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  empresa       Empresa  @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  etapas        TarefaApuracaoEtapa[]
  logs          TarefaLog[]

  // Uma apuração por empresa por competência. É a trava que impede
  // competência duplicada quando dois operadores criam ao mesmo tempo.
  @@unique([empresaId, ano, mes], name: "empresa_competencia")
  @@index([status])
  @@index([ano, mes])
  @@index([bloqueada])
  @@index([prazoEntrega])
  @@index([responsavelId])
  @@map("tarefa_apuracao")
}

// ===========================================================================
// ETAPA DA APURAÇÃO — uma linha por etapa do fluxo, criada junto com a tarefa.
//
// Materializar as etapas (em vez de só guardar etapaAtual) é o que permite:
//   - saber QUANDO cada etapa foi concluída e por quem
//   - marcar etapa opcional como não aplicável sem furar a numeração
//   - medir onde o processo trava, por etapa, ao longo dos meses
// ===========================================================================
model TarefaApuracaoEtapa {
  id           String    @id @default(cuid())
  tarefaId     String    @map("tarefa_id")
  numero       Int                                   // 1..10 ou 1..14
  chave        String                                // ex: RECEBIMENTO_DOCUMENTOS
  titulo       String                                // congelado na criação
  responsavelTipo String @map("responsavel_tipo")    // COMERCIAL_CZ, ESCRITORIO, AMBOS
  opcional     Boolean   @default(false)

  // PENDENTE, EM_ANDAMENTO, CONCLUIDA, NAO_APLICAVEL
  situacao     String    @default("PENDENTE")

  iniciadaEm   DateTime? @map("iniciada_em")
  concluidaEm  DateTime? @map("concluida_em")
  concluidaPor String?   @map("concluida_por")
  observacao   String?

  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  tarefa       TarefaApuracao @relation(fields: [tarefaId], references: [id], onDelete: Cascade)

  @@unique([tarefaId, numero])
  @@index([tarefaId])
  @@index([situacao])
  @@map("tarefa_apuracao_etapa")
}

// ===========================================================================
// PROCESSO DE LEGALIZAÇÃO — pontual, com começo e fim.
//
// Separado da apuração porque o ciclo de vida é outro: não tem competência, não
// nasce sozinho todo mês, pode haver vários em paralelo e depende de prazo de
// órgão externo (Junta, Receita, Prefeitura).
// ===========================================================================
model ProcessoLegalizacao {
  id            String   @id @default(cuid())
  empresaId     String?  @map("empresa_id")          // opcional: abertura ainda não tem empresa

  // Quando é abertura, a empresa ainda não existe. Guarda a identificação
  // provisória para o processo poder existir antes do CNPJ.
  identificacaoProvisoria String? @map("identificacao_provisoria")

  // ABERTURA_CNPJ, ENCERRAMENTO_CNPJ, REGULARIZACAO_CNPJ,
  // ALTERACAO_CADASTRAL, DESENQUADRAMENTO
  tipo          String

  etapaAtual    Int      @default(0) @map("etapa_atual")
  status        String   @default("AGUARDANDO_DOCUMENTACAO")

  bloqueada         Boolean   @default(false)
  bloqueioMotivo    String?   @map("bloqueio_motivo")
  bloqueioDesde     DateTime? @map("bloqueio_desde")
  bloqueioResponsavel String? @map("bloqueio_responsavel")

  // Protocolo no órgão externo, quando houver. É o que o cliente pergunta.
  protocoloExterno String? @map("protocolo_externo")
  orgaoExterno     String? @map("orgao_externo")     // JUNTA_COMERCIAL, RECEITA_FEDERAL, PREFEITURA, SEFAZ

  prazoEstimado DateTime? @map("prazo_estimado")
  abertoEm      DateTime  @default(now()) @map("aberto_em")
  concluidoEm   DateTime? @map("concluido_em")

  responsavelId String?  @map("responsavel_id")
  responsavel   User?    @relation("ProcessoResponsavel", fields: [responsavelId], references: [id], onDelete: SetNull)

  observacoes   String?
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  empresa       Empresa? @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  etapas        ProcessoLegalizacaoEtapa[]
  logs          TarefaLog[]

  @@index([empresaId])
  @@index([tipo])
  @@index([status])
  @@index([bloqueada])
  @@index([abertoEm])
  @@map("processo_legalizacao")
}

model ProcessoLegalizacaoEtapa {
  id           String    @id @default(cuid())
  processoId   String    @map("processo_id")
  numero       Int
  chave        String
  titulo       String
  responsavelTipo String @map("responsavel_tipo")
  opcional     Boolean   @default(false)
  situacao     String    @default("PENDENTE")
  iniciadaEm   DateTime? @map("iniciada_em")
  concluidaEm  DateTime? @map("concluida_em")
  concluidaPor String?   @map("concluida_por")
  observacao   String?
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  processo     ProcessoLegalizacao @relation(fields: [processoId], references: [id], onDelete: Cascade)

  @@unique([processoId, numero])
  @@index([processoId])
  @@map("processo_legalizacao_etapa")
}

// ===========================================================================
// LOG — o "quem mudou o quê e quando" que você pediu.
//
// Uma tabela só para os dois tipos de tarefa, com FKs opcionais. Motivo: a tela
// de auditoria é uma, e unir duas tabelas em toda consulta de histórico seria
// pior. Segue o formato do DocumentLog, que já existe e já tem tela de
// auditoria funcionando.
//
// Esta tabela é APPEND-ONLY. Nada nela é editado ou apagado pela aplicação.
// ===========================================================================
model TarefaLog {
  id          String   @id @default(cuid())

  apuracaoId  String?  @map("apuracao_id")
  processoId  String?  @map("processo_id")

  // ETAPA_AVANCADA, ETAPA_RETORNADA, ETAPA_CONCLUIDA, ETAPA_NAO_APLICAVEL,
  // STATUS_ALTERADO, BLOQUEIO_REGISTRADO, BLOQUEIO_RESOLVIDO,
  // TAREFA_CRIADA, TAREFA_CONCLUIDA, TAREFA_REABERTA,
  // RESPONSAVEL_ALTERADO, PRAZO_ALTERADO, OBSERVACAO_ADICIONADA
  acao        String

  de          String?                              // valor anterior, legível
  para        String?                              // valor novo, legível
  detalhe     String?                              // motivo, observação

  autorId     String   @map("autor_id")
  autorNome   String   @map("autor_nome")           // congelado: nome muda, log não
  autorPapel  String?  @map("autor_papel")

  createdAt   DateTime @default(now()) @map("created_at")

  apuracao    TarefaApuracao?      @relation(fields: [apuracaoId], references: [id], onDelete: Cascade)
  processo    ProcessoLegalizacao? @relation(fields: [processoId], references: [id], onDelete: Cascade)
  autor       User                 @relation("TarefaLogAutor", fields: [autorId], references: [id], onDelete: Restrict)

  @@index([apuracaoId, createdAt])
  @@index([processoId, createdAt])
  @@index([autorId])
  @@index([createdAt])
  @@index([acao])
  @@map("tarefa_log")
}
```

### 6.4 Duas decisões do schema que merecem explicação

**`autorNome` duplicado no log.** O nome do autor é copiado para dentro do log em vez de vir
sempre por JOIN. Parece redundância, e é de propósito: se o nome do funcionário mudar, ou se
o usuário for removido, o histórico do que ele fez em março continua legível. Log que muda
retroativamente não é log. Por isso também `onDelete: Restrict` no autor.

**`regime` congelado na tarefa.** A empresa tem um regime *atual*; a competência tem o regime
*daquele mês*. Desenquadramento em julho não pode transformar a apuração de março em outra
coisa. Sem esse congelamento, o número de etapas da tarefa antiga mudaria sozinho.

### 6.5 Riscos de migração

1. **Drift de migrations.** A coluna `role` do `User` não está em nenhuma migration. Logo, o
   histórico local e o banco de produção já divergem. Migration nova precisa ser defensiva
   (`IF NOT EXISTS`), no formato de `20260520165058_add_subfolder_support`.
2. **`citext`.** O `User.email` usa `@db.Citext`. A extensão já está no banco, então
   `Empresa` pode usar se precisar; para `cnpj` (só dígitos) não é necessário.
3. **Ordem de criação.** `Empresa` antes de `TarefaApuracao`, senão a FK falha.
4. **Nenhuma tabela existente é alterada.** Todo o módulo é aditivo. `User` ganha apenas
   relações inversas — que não geram coluna nem alteram dado.

---

## 7. Os 6 status

### 7.1 Os textos, exatos como no slide 2

| # | Chave | Texto na tela |
|---|---|---|
| 1 | `AGUARDANDO_DOCUMENTACAO` | Aguardando documentação do cliente |
| 2 | `EM_ELABORACAO` | Em elaboração |
| 3 | `EM_REVISAO` | Em revisão / conferência |
| 4 | `ENTREGUE` | Entregue |
| 5 | `PENDENCIA_IDENTIFICADA` | Pendência identificada |
| 6 | `CONCLUIDO` | Concluído |

### 7.2 As cores

O slide usa vermelho, laranja, roxo, azul, amarelo e verde. A identidade do ContaZoom é
**laranja, branco e preto** — e seis cores saturadas competindo com o laranja da marca
transformam a tela num carnaval.

Resolvi assim: **o laranja continua sendo a cor da marca e da ação** (navegação, botão
primário, etapa em andamento). Os status usam uma escala de sinal contida, em tom mais
fechado, sobre fundo branco e texto quase preto. O status que representa trabalho em curso é
justamente o laranja — o que casa a semântica com a identidade em vez de brigar com ela.

| Status | Fundo | Texto | Borda | Papel visual |
|---|---|---|---|---|
| Aguardando documentação | `#FEF2F2` | `#B42318` | `#FECDCA` | Parado por falta de insumo |
| Em elaboração | `#FFF4EB` | `#C2410C` | `#FED7AA` | **Laranja da marca** — trabalho em curso |
| Em revisão / conferência | `#F4F3FF` | `#5925DC` | `#D9D6FE` | Conferência, olhar de terceiro |
| Entregue | `#EFF8FF` | `#175CD3` | `#B2DDFF` | Saiu daqui, aguarda o cliente |
| Pendência identificada | `#FFFAEB` | `#B54708` | `#FEDF89` | Atenção, algo travou |
| Concluído | `#ECFDF3` | `#027A48` | `#ABEFC6` | Fechado |

E a cor sólida para as barras de coluna do Kanban, quando precisar de contraste maior:
`#D92D20`, `#EA580C`, `#6938EF`, `#1570EF`, `#DC6803`, `#039855`.

Regra que vale para tudo: **nenhum status é comunicado só por cor.** Sempre cor + texto +
ícone SVG. Quem não distingue vermelho de verde precisa conseguir usar o sistema, e isso é
requisito, não gentileza.

### 7.3 Derivação: da etapa para o status

Esta é a tabela que faz as duas camadas da seção 4 funcionarem sem retrabalho.

**Simples Nacional (10 etapas)**

| Etapa | Status derivado |
|---|---|
| 0 — não iniciada | Aguardando documentação do cliente |
| 1 — Recebimento de documentos | Aguardando documentação do cliente |
| 2 — Captura de XML | Em elaboração |
| 3 — Conferência dos documentos | Em elaboração |
| 4 — Apuração do faturamento (PGDAS-D) | Em elaboração |
| 5 — Cálculo e apuração do DAS | Em elaboração |
| 6 — Conferência da apuração | Em revisão / conferência |
| 7 — Geração da guia DAS | Em revisão / conferência |
| 8 — Envio da guia por e-mail | Entregue |
| 9 — Upload dos documentos no sistema | Entregue |
| 10 — Encerramento da competência | Concluído |

**Lucro Presumido (14 etapas)**

| Etapa | Status derivado |
|---|---|
| 0 — não iniciada | Aguardando documentação do cliente |
| 1 — Recebimento de documentos | Aguardando documentação do cliente |
| 2 a 6 — XML, classificação, lançamentos, apurações | Em elaboração |
| 7 — Conferência da apuração | Em revisão / conferência |
| 8 — Geração das guias | Em revisão / conferência |
| 9 — Envio das guias por e-mail | Entregue |
| 10 — Upload dos documentos e guias | Entregue |
| 11 — Envio das obrigações acessórias | Entregue |
| 12 — Fechamento contábil (balancete) | Entregue |
| 13 — Envio de relatórios gerenciais (opcional) | Entregue |
| 14 — Encerramento da competência | Concluído |

**A regra do bloqueio sobrepõe tudo.** Se `bloqueada = true`, o status exibido passa a ser:

- **Aguardando documentação do cliente**, quando `bloqueioResponsavel = CLIENTE`
- **Pendência identificada**, em qualquer outro caso

E a etapa continua onde estava. É isso que permite ler "está na etapa 4, travada há 6 dias
esperando o cliente" — que é a informação que resolve reunião.

**Ponto para vocês confirmarem:** esta tabela é minha proposta. Ela é o coração do módulo,
porque define o que o resto da empresa vê. Vale o escritório bater o martelo em dois pontos
em especial: se a etapa 7 do SN (*Geração da guia*) já é "Em revisão" ou se deveria ser
"Em elaboração"; e se *Entregue* começa no envio do e-mail (etapa 8/9) ou só quando o cliente
confirma o recebimento.

---

## 8. Etapas — Simples Nacional

Foco principal da carteira. **10 etapas.** Os textos e descrições abaixo são transcrição do
documento `Tarefas SN e LP.pdf`, seção 1, sem alteração de conteúdo — o que está entre
colchetes é comentário meu.

### 8.1 A tabela completa

| Nº | Etapa | Descrição | Responsável típico |
|---|---|---|---|
| 1 | **Recebimento de documentos do cliente** | Recebimento de informações de faturamento, notas de saída emitidas e demais documentos necessários à apuração do mês. | **Comercial C.Z** |
| 2 | **Captura de XML de notas de saída e entrada** | Importação/download dos XMLs de saídas disponíveis e XMLs de compras e notas de entrada, via sistema ou portal da SEFAZ, para compor a apuração. | Escritório |
| 3 | **Conferência dos documentos recebidos** | Checagem completa: confronto entre o que foi solicitado e o que foi efetivamente recebido, identificando pendências. | **Escritório / Comercial C.Z** |
| 4 | **Apuração do faturamento no sistema (PGDAS-D)** | Lançamento das receitas por atividade/anexo no sistema do Simples Nacional para cálculo do imposto devido no mês. | Escritório |
| 5 | **Cálculo e apuração do DAS** | Processamento da apuração e obtenção do valor consolidado do DAS (Documento de Arrecadação do Simples Nacional). | Escritório |
| 6 | **Conferência da apuração** | Revisão dos valores apurados antes da geração definitiva da guia, verificando consistência com o período anterior. | Escritório |
| 7 | **Geração da guia DAS** | Emissão da guia de pagamento a partir do PGDAS-D já transmitido. | Escritório |
| 8 | **Envio da guia por e-mail ao cliente** | Encaminhamento da guia de pagamento e, quando aplicável, do relatório de apuração ao cliente. | Escritório |
| 9 | **Upload dos documentos no sistema** | Inclusão da guia e dos documentos que embasaram a apuração no sistema/portal de controle do escritório. | Escritório |
| 10 | **Encerramento da competência** | Marcação da competência como concluída, com arquivamento dos documentos e registro de eventuais pendências para o mês seguinte. | Escritório |

### 8.2 Observações que saltam da leitura

**Etapa 3 é a etapa de bloqueio natural.** A descrição diz *"identificando pendências"* — é
literalmente o ponto do fluxo onde se descobre que falta documento. É a etapa que mais vai
acionar o estado *Pendência identificada* / *Aguardando documentação*. O software tem que
tornar registrar essa pendência mais fácil que mandar mensagem no WhatsApp, senão ninguém
registra.

**Etapa 9 conecta com o que o CONTAZOOM já faz.** *"Inclusão da guia e dos documentos... no
sistema/portal de controle"* é exatamente o módulo de documentos que já existe (`Document`,
`DocumentFolder`, categoria `IMPOSTOS`, subpasta no formato `2026/01_Janeiro`). Ou seja: essa
etapa pode ser **verificada automaticamente** — se existe documento da categoria `IMPOSTOS`
na subpasta daquela competência para aquele cliente, a etapa 9 pode se marcar sozinha, ou ao
menos avisar que já foi feita. Isso é integração de baixo custo e alto efeito.

**Etapa 10 gera trabalho para o mês seguinte.** *"registro de eventuais pendências para o mês
seguinte"* — vale um campo de "pendência herdada" que aparece já aberto na competência
seguinte, senão a informação morre no fechamento.

### 8.3 Papel da ContaZoom no fluxo

Das 10 etapas, **duas envolvem a ContaZoom**: a 1 (só sua) e a 3 (compartilhada). Isso
confirma o desenho de duas camadas: você precisa da etapa, não do status macro, porque em
duas delas o trabalho é seu.

### 8.4 Como isso vira código

```ts
// src/lib/tarefa-etapas.ts
//
// Fonte única dos fluxos. Etapa é REGRA DE NEGÓCIO, não dado editável pelo
// usuário: o texto vive aqui, versionado no git, e é copiado para dentro da
// tarefa no momento da criação (TarefaApuracaoEtapa.titulo).
//
// O congelamento é o ponto: se em 2027 o fluxo ganhar uma etapa nova, as
// competências de 2026 continuam com as 10 etapas que realmente foram
// executadas. Fluxo que muda retroativamente falsifica o histórico.

export const REGIME = {
  SIMPLES_NACIONAL: 'SIMPLES_NACIONAL',
  LUCRO_PRESUMIDO: 'LUCRO_PRESUMIDO',
} as const;

export const RESPONSAVEL = {
  COMERCIAL_CZ: 'COMERCIAL_CZ',
  ESCRITORIO: 'ESCRITORIO',
  AMBOS: 'AMBOS',
} as const;

export const ETAPAS_SIMPLES_NACIONAL = [
  {
    numero: 1,
    chave: 'RECEBIMENTO_DOCUMENTOS',
    titulo: 'Recebimento de documentos do cliente',
    descricao: 'Recebimento de informações de faturamento, notas de saída emitidas e demais documentos necessários à apuração do mês.',
    responsavel: RESPONSAVEL.COMERCIAL_CZ,
    statusDerivado: 'AGUARDANDO_DOCUMENTACAO',
    opcional: false,
  },
  {
    numero: 2,
    chave: 'CAPTURA_XML',
    titulo: 'Captura de XML de notas de saída e entrada',
    descricao: 'Importação/download dos XMLs de saídas disponíveis e XMLs de compras e notas de entrada, via sistema ou portal da SEFAZ, para compor a apuração.',
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: 'EM_ELABORACAO',
    opcional: false,
  },
  {
    numero: 3,
    chave: 'CONFERENCIA_DOCUMENTOS',
    titulo: 'Conferência dos documentos recebidos',
    descricao: 'Checagem completa: confronto entre o que foi solicitado e o que foi efetivamente recebido, identificando pendências.',
    responsavel: RESPONSAVEL.AMBOS,
    statusDerivado: 'EM_ELABORACAO',
    opcional: false,
  },
  {
    numero: 4,
    chave: 'APURACAO_FATURAMENTO_PGDAS',
    titulo: 'Apuração do faturamento no sistema (PGDAS-D)',
    descricao: 'Lançamento das receitas por atividade/anexo no sistema do Simples Nacional para cálculo do imposto devido no mês.',
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: 'EM_ELABORACAO',
    opcional: false,
  },
  {
    numero: 5,
    chave: 'CALCULO_DAS',
    titulo: 'Cálculo e apuração do DAS',
    descricao: 'Processamento da apuração e obtenção do valor consolidado do DAS (Documento de Arrecadação do Simples Nacional).',
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: 'EM_ELABORACAO',
    opcional: false,
  },
  {
    numero: 6,
    chave: 'CONFERENCIA_APURACAO',
    titulo: 'Conferência da apuração',
    descricao: 'Revisão dos valores apurados antes da geração definitiva da guia, verificando consistência com o período anterior.',
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: 'EM_REVISAO',
    opcional: false,
  },
  {
    numero: 7,
    chave: 'GERACAO_GUIA_DAS',
    titulo: 'Geração da guia DAS',
    descricao: 'Emissão da guia de pagamento a partir do PGDAS-D já transmitido.',
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: 'EM_REVISAO',
    opcional: false,
  },
  {
    numero: 8,
    chave: 'ENVIO_GUIA_EMAIL',
    titulo: 'Envio da guia por e-mail ao cliente',
    descricao: 'Encaminhamento da guia de pagamento e, quando aplicável, do relatório de apuração ao cliente.',
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: 'ENTREGUE',
    opcional: false,
  },
  {
    numero: 9,
    chave: 'UPLOAD_DOCUMENTOS',
    titulo: 'Upload dos documentos no sistema',
    descricao: 'Inclusão da guia e dos documentos que embasaram a apuração no sistema/portal de controle do escritório.',
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: 'ENTREGUE',
    opcional: false,
  },
  {
    numero: 10,
    chave: 'ENCERRAMENTO_COMPETENCIA',
    titulo: 'Encerramento da competência',
    descricao: 'Marcação da competência como concluída, com arquivamento dos documentos e registro de eventuais pendências para o mês seguinte.',
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: 'CONCLUIDO',
    opcional: false,
  },
] as const;
```

---

## 9. Etapas — Lucro Presumido

**14 etapas.** Inclui escrituração contábil e obrigações acessórias. Transcrição da seção 2
do `Tarefas SN e LP.pdf`.

### 9.1 A tabela completa

| Nº | Etapa | Descrição | Responsável típico |
|---|---|---|---|
| 1 | **Recebimento de documentos do cliente** | Recebimento de notas de entrada e saída, extratos bancários, folha de pagamento e demais documentos do período. | **Comercial C.Z** |
| 2 | **Captura de XML (entradas e saídas)** | Importação dos XMLs de notas fiscais emitidas e recebidas para lançamento contábil e apuração de tributos. | Escritório |
| 3 | **Conferência e classificação contábil** | Checagem dos documentos recebidos e classificação por natureza (receita, despesa, ativo, etc.) para lançamento. | Escritório |
| 4 | **Lançamentos contábeis do período** | Escrituração contábil das operações do mês, base para o fechamento e para as apurações tributárias. | Escritório |
| 5 | **Apuração de PIS/COFINS, IRPJ/CSLL** | Cálculo dos tributos federais incidentes sobre o faturamento e o resultado presumido do período. | Escritório |
| 6 | **Apuração de ICMS/ISS** | Cálculo do imposto estadual ou municipal conforme a atividade da empresa (comércio/indústria ou serviços). | Escritório |
| 7 | **Conferência da apuração** | Revisão dos valores calculados em todas as guias antes da emissão definitiva. | Escritório |
| 8 | **Geração das guias (DARF, ICMS, ISS)** | Emissão das guias de recolhimento aplicáveis ao regime e à atividade do cliente. | Escritório |
| 9 | **Envio das guias por e-mail ao cliente** | Encaminhamento das guias de pagamento ao cliente dentro do prazo estabelecido. | Escritório |
| 10 | **Upload dos documentos e guias no sistema** | Inclusão das guias e da documentação de suporte no sistema/portal de controle do escritório. | Escritório |
| 11 | **Envio das Obrigações Acessórias Mensais** | Preenchimento, conferência e transmissão das declarações acessórias mensais do regime. | Escritório |
| 12 | **Fechamento contábil do período (balancete)** | Consolidação do balancete mensal, refletindo os lançamentos e apurações realizados. | Escritório |
| 13 | **Envio de relatórios gerenciais (opcional)** | Encaminhamento de recibos das obrigações acessórias. | Escritório |
| 14 | **Encerramento da competência** | Marcação da competência como concluída, com arquivamento e registro de pendências remanescentes. | Escritório |

### 9.2 Observações

**A etapa 13 é a única opcional em todo o material.** O título traz "(opcional)" explícito.
No modelo de dados ela nasce com `opcional = true`, e a tarefa pode ser concluída com ela em
`NAO_APLICAVEL` — sem furar a numeração e sem parecer que alguém esqueceu de fazer.

**A etapa 6 é condicional na prática.** *"conforme a atividade da empresa (comércio/indústria
ou serviços)"* — uma empresa de serviços apura ISS e não ICMS; comércio apura ICMS e não ISS.
Nenhuma apura os dois. Vale registrar na `Empresa` qual se aplica, para a etapa aparecer com
o nome certo ("Apuração de ISS") em vez do genérico. Isso é sugestão, não está no documento.

**A etapa 11 é a que diferencia LP de SN de verdade.** Obrigação acessória mensal tem prazo
próprio, independente do prazo da guia, e é onde nasce multa por atraso mesmo com imposto
pago. Vale prazo próprio nessa etapa.

### 9.3 Divergência entre os dois documentos — precisa de decisão

**O PDF da apresentação lista 13 etapas para o Lucro Presumido. O documento Word lista 14.**

O que o Word tem e a apresentação não tem: **"Envio das Obrigações Acessórias Mensais"**, na
posição 11. Com ela, tudo que vinha depois desloca uma casa.

| Posição | Apresentação (13) | Word (14) |
|---|---|---|
| 11 | Fechamento contábil (balancete) | **Envio das Obrigações Acessórias Mensais** |
| 12 | Envio de relatórios gerenciais (opcional) | Fechamento contábil (balancete) |
| 13 | Encerramento da competência | Envio de relatórios gerenciais (opcional) |
| 14 | — | Encerramento da competência |

**Adotei o Word (14 etapas)**, porque é o documento detalhado, tem descrição e responsável
por etapa, e obrigação acessória mensal é etapa real do regime — a ausência dela na
apresentação parece corte de espaço no slide, não decisão. **Confirmar com o escritório.**

### 9.4 Outras três divergências menores

1. **SN etapa 2.** Apresentação: *"Captura de XML de notas de entrada"*. Word: *"Captura de
   XML de notas de saída e entrada"*. Adotei o Word — sem os XMLs de saída não há como apurar
   faturamento, então a versão do slide parece abreviação.

2. **LP etapa 13, título e descrição não combinam.** Título: *"Envio de relatórios gerenciais
   (opcional)"*. Descrição: *"Encaminhamento de Recibos das Obrigações Acessórias"*. São duas
   coisas diferentes: relatório gerencial é informação de gestão, recibo de obrigação
   acessória é comprovante de transmissão. Suspeito que a descrição foi colada da etapa
   errada. **Preciso saber qual das duas a etapa é**, porque muda quem a consome.

3. **Os 6 status não têm mapeamento para as etapas em nenhum dos documentos.** A apresentação
   propõe os status, o Word propõe as etapas, e nada liga os dois. A tabela da seção 7.3 é
   minha proposta para preencher essa lacuna — é justamente por isso que ela precisa de
   validação.

---

## 10. Prazos do calendário fiscal

O documento não fala de prazo, mas o slide de benefícios menciona *"status e prazo de cada
competência"*. Então prazo faz parte do escopo.

**O que eu não vou fazer: chutar datas de vencimento de tributo.** Data errada aqui gera multa
para o cliente. O que proponho é a estrutura, com os valores preenchidos por vocês:

```ts
// src/lib/tarefa-prazos.ts
//
// Prazos configuráveis, NUNCA hardcoded a partir de suposição.
// Valores a preencher pelo escritório antes de ir para produção.
export type RegraPrazo = {
  regime: string;
  chaveEtapa: string;
  // Dia do mês SEGUINTE à competência em que a etapa vence.
  diaVencimento: number;
  // Se cai em fim de semana ou feriado, antecipa ou prorroga?
  ajuste: 'ANTECIPA' | 'PRORROGA' | 'NENHUM';
  descricao: string;
};
```

Com isso o sistema calcula o `prazoEntrega` de cada tarefa na criação, e o Kanban ganha o que
realmente importa numa rotina mensal: **o que está atrasado e o que vence nos próximos dias.**

Três perguntas que preciso que o escritório responda:

1. Qual o prazo interno de cada etapa-chave (não o prazo legal do tributo, o de vocês)?
2. Feriado municipal entra na conta? Cliente em município diferente muda o prazo?
3. Existe cliente com prazo diferenciado por contrato?

---

## 11. Legalização — os cinco processos

**Atenção: esta seção é a mais frágil do documento.** Não existe nada sobre legalização nos
dois PDFs; tudo aqui vem da sua descrição verbal mais conhecimento geral de mercado. Trate
como rascunho para o escritório corrigir, não como especificação.

### 11.1 Abertura de CNPJ

| Nº | Etapa proposta | Responsável | Órgão |
|---|---|---|---|
| 1 | Coleta de documentos e dados dos sócios | Comercial C.Z | — |
| 2 | Definição de atividade (CNAE), regime e capital social | Ambos | — |
| 3 | Consulta de viabilidade (nome e endereço) | Escritório | Junta / Prefeitura |
| 4 | Registro do ato constitutivo | Escritório | Junta Comercial |
| 5 | Obtenção do CNPJ | Escritório | Receita Federal |
| 6 | Inscrição estadual, quando aplicável | Escritório | SEFAZ |
| 7 | Inscrição municipal e alvará | Escritório | Prefeitura |
| 8 | Enquadramento tributário | Escritório | Receita Federal |
| 9 | Emissão de certificado digital | Escritório | Certificadora |
| 10 | Habilitação para emissão de nota fiscal | Escritório | SEFAZ / Prefeitura |
| 11 | Entrega da documentação ao cliente | Comercial C.Z | — |
| 12 | Encerramento do processo | Escritório | — |

### 11.2 Encerramento / baixa de CNPJ

| Nº | Etapa proposta | Responsável |
|---|---|---|
| 1 | Coleta de documentos e confirmação da decisão | Comercial C.Z |
| 2 | Levantamento de pendências fiscais e obrigações em aberto | Escritório |
| 3 | Regularização das pendências encontradas | Escritório |
| 4 | Entrega das declarações finais | Escritório |
| 5 | Distrato / ato de encerramento | Escritório |
| 6 | Baixa na Receita Federal | Escritório |
| 7 | Baixa estadual e municipal | Escritório |
| 8 | Entrega dos comprovantes ao cliente | Comercial C.Z |
| 9 | Encerramento do processo | Escritório |

### 11.3 Regularização de CNPJ

| Nº | Etapa proposta | Responsável |
|---|---|---|
| 1 | Coleta de procuração e acessos | Comercial C.Z |
| 2 | Diagnóstico de pendências (Receita, SEFAZ, Prefeitura) | Escritório |
| 3 | Apresentação do plano e dos valores ao cliente | Comercial C.Z |
| 4 | Aprovação do cliente | Comercial C.Z |
| 5 | Entrega das declarações em atraso | Escritório |
| 6 | Emissão de guias e parcelamentos | Escritório |
| 7 | Acompanhamento até a baixa das pendências | Escritório |
| 8 | Emissão de certidão negativa | Escritório |
| 9 | Encerramento do processo | Escritório |

### 11.4 Alteração cadastral

| Nº | Etapa proposta | Responsável |
|---|---|---|
| 1 | Definição do que será alterado | Comercial C.Z |
| 2 | Coleta de documentos da alteração | Comercial C.Z |
| 3 | Elaboração do ato de alteração | Escritório |
| 4 | Assinatura pelos sócios | Comercial C.Z |
| 5 | Registro na Junta Comercial | Escritório |
| 6 | Atualização na Receita Federal | Escritório |
| 7 | Atualização estadual e municipal | Escritório |
| 8 | Entrega dos documentos atualizados | Comercial C.Z |
| 9 | Encerramento do processo | Escritório |

### 11.5 Desenquadramento

| Nº | Etapa proposta | Responsável |
|---|---|---|
| 1 | Identificação do motivo (limite, atividade, opção) | Escritório |
| 2 | Estudo do impacto tributário | Escritório |
| 3 | Apresentação do cenário ao cliente | Comercial C.Z |
| 4 | Aprovação do cliente | Comercial C.Z |
| 5 | Comunicação do desenquadramento | Escritório |
| 6 | Ajuste do regime nos sistemas | Escritório |
| 7 | Comunicação da mudança de rotina ao cliente | Comercial C.Z |
| 8 | Encerramento do processo | Escritório |

### 11.6 O que a legalização exige do software, e a apuração não

1. **Protocolo externo.** Todo processo tem número de protocolo em órgão de terceiro. É o
   primeiro dado que o cliente pergunta. Precisa ser campo visível e copiável, não observação.
2. **Espera fora do controle de vocês.** Junta Comercial tem prazo próprio. O status
   *Pendência identificada* precisa distinguir "travado esperando o cliente" de "travado
   esperando órgão público" — daí o campo `bloqueioResponsavel` com o valor `TERCEIRO`.
3. **Processo antes da empresa existir.** Abertura de CNPJ não tem CNPJ. Por isso
   `ProcessoLegalizacao.empresaId` é opcional e existe
   `identificacaoProvisoria`. Quando o CNPJ sai (etapa 5), a `Empresa` é criada e o processo
   passa a apontar para ela.
4. **Desenquadramento muda o regime.** Ao concluir um processo de desenquadramento, o sistema
   deve gravar uma linha em `EmpresaRegimeHistorico` e atualizar `Empresa.regime`. As
   competências futuras passam a nascer com o fluxo do novo regime, e as passadas continuam
   com o antigo. É aqui que o congelamento da seção 6.4 prova o valor.
5. **Vários em paralelo.** A mesma empresa pode ter regularização e alteração em curso ao
   mesmo tempo. O Kanban de legalização é por processo, não por empresa.

---

## 12. O Kanban

### 12.1 Qual é a pergunta que ele responde

Kanban só serve se a coluna representar algo que a pessoa quer contar de relance. Aqui a
pergunta é *"onde está cada cliente neste mês?"*, então **as colunas são os 6 status**, e cada
cartão é uma tarefa (uma competência de uma empresa).

```
┌───────────────┬───────────────┬───────────────┬───────────────┬───────────────┬───────────────┐
│ AGUARDANDO    │ EM ELABORAÇÃO │ EM REVISÃO /  │ ENTREGUE      │ PENDÊNCIA     │ CONCLUÍDO     │
│ DOCUMENTAÇÃO  │               │ CONFERÊNCIA   │               │ IDENTIFICADA  │               │
│      4        │      11       │      3        │      6        │      2        │      31       │
├───────────────┼───────────────┼───────────────┼───────────────┼───────────────┼───────────────┤
│ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │               │
│ │ NW STORE  │ │ │ MOSCOU    │ │ │ ELIDELU   │ │ │ CINGAPURA │ │ │ FERNANDA  │ │               │
│ │ SN · 1/10 │ │ │ SN · 4/10 │ │ │ LP · 7/14 │ │ │ SN · 8/10 │ │ │ SN · 3/10 │ │               │
│ │ vence 20  │ │ │ vence 20  │ │ │ vence 25  │ │ │ ok        │ │ │ 6 dias    │ │               │
│ └───────────┘ │ └───────────┘ │ └───────────┘ │ └───────────┘ │ └───────────┘ │               │
└───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴───────────────┘
```

### 12.2 O cartão

O que aparece, em ordem de importância visual:

1. **Razão social ou nome fantasia** — é como a pessoa identifica o cliente
2. **Selo do regime** — `SN` ou `LP`, curto, porque muda o fluxo esperado
3. **Etapa atual** — `4/10` e o título da etapa: a camada de execução, o que você pediu
4. **Prazo** — vence em X dias, ou "atrasado há X dias" em vermelho
5. **Responsável** — avatar ou iniciais de quem está com a bola
6. **Marca de bloqueio** — ícone SVG de alerta e há quantos dias está travada

O que **não** aparece no cartão: descrição da etapa, observações, log. Isso é o painel de
detalhe. Cartão com muita informação deixa de ser escaneável, e o valor do Kanban é justamente
a leitura em um segundo.

### 12.3 Mover cartão

**Arrastar entre colunas não move etapa.** Isso é uma decisão, e explico: a coluna é o status
*derivado*. Arrastar de "Em elaboração" para "Entregue" significaria pular as etapas 5, 6, 7 e
8 de uma vez, sem registrar o que foi feito em cada uma. O log ficaria mentindo.

Então:

- **Arrastar está desabilitado** entre colunas de fluxo. O cartão se move sozinho quando a
  etapa avança.
- **Avançar etapa** é ação explícita: abrir o cartão, concluir a etapa atual. Botão único e
  grande, com o título da próxima etapa escrito nele.
- **Arrastar para "Pendência identificada"** é permitido, porque bloqueio não é posição de
  fluxo — é estado. Ao soltar, abre o formulário de bloqueio (obrigatório informar o motivo e
  de quem se espera).

Isso mantém o Kanban como leitura rápida e a execução como registro honesto.

Nota técnica: não existe biblioteca de drag-and-drop no projeto (nem `@dnd-kit` nem
`react-beautiful-dnd`). Como o único arraste é o de bloqueio, dá para usar HTML5 drag events
puro e não adicionar dependência.

### 12.4 Filtros

Barra fixa no topo, no padrão dos filtros que já existem no sistema:

- **Competência** — seletor mês/ano. Padrão: mês corrente. É o filtro mais usado.
- **Regime** — todos, Simples Nacional, Lucro Presumido
- **Responsável** — todos, ou um usuário
- **Situação de prazo** — todos, no prazo, vence em 3 dias, atrasado
- **Bloqueio** — todos, só bloqueadas, só desbloqueadas
- **Busca** — razão social, nome fantasia, CNPJ

### 12.5 O que o Kanban não resolve, e a lista resolve

Kanban é ruim para duas coisas que vocês vão querer: ver 60 clientes de uma vez, e comparar
meses. Por isso a mesma tela tem alternância **Kanban / Lista**:

- **Lista** — tabela densa com competência, empresa, regime, etapa, status, prazo,
  responsável, dias em bloqueio. Ordenável por qualquer coluna. É a visão de cobrança.
- **Matriz mensal** — clientes nas linhas, meses nas colunas, uma célula colorida por
  status. É a visão de auditoria: mostra num relance quem está sempre atrasado e qual mês foi
  ruim para todos.

---

## 13. Log de alterações

### 13.1 O que é registrado

Toda mudança que alguém faz. Sem exceção e sem opção de "não registrar":

| Ação | Registra |
|---|---|
| `TAREFA_CRIADA` | Competência aberta, automática ou manual |
| `ETAPA_CONCLUIDA` | Etapa N concluída, com o título |
| `ETAPA_AVANCADA` | Mudança de etapa atual, de → para |
| `ETAPA_RETORNADA` | Volta para etapa anterior, **com motivo obrigatório** |
| `ETAPA_NAO_APLICAVEL` | Etapa opcional marcada como não aplicável |
| `STATUS_ALTERADO` | Status macro mudou (normalmente derivado) |
| `BLOQUEIO_REGISTRADO` | Pendência aberta, com motivo e de quem se espera |
| `BLOQUEIO_RESOLVIDO` | Pendência resolvida, com quantos dias durou |
| `RESPONSAVEL_ALTERADO` | Passagem de bastão |
| `PRAZO_ALTERADO` | Prazo mudado, de → para, com motivo |
| `OBSERVACAO_ADICIONADA` | Comentário livre |
| `TAREFA_CONCLUIDA` | Competência encerrada |
| `TAREFA_REABERTA` | **Com motivo obrigatório** |

### 13.2 Três regras não negociáveis

1. **Append-only.** A aplicação nunca faz `UPDATE` nem `DELETE` em `tarefa_log`. Nem o admin.
   Log editável não é prova de nada.
2. **Autor congelado.** `autorNome` é copiado no momento do registro. Funcionário que sai da
   empresa não some do histórico.
3. **Retorno de etapa exige motivo.** Voltar da 7 para a 4 é o evento mais informativo do
   sistema — é onde o processo falhou. Sem motivo obrigatório, ninguém escreve, e a informação
   mais valiosa se perde.

### 13.3 Onde aparece

- **No cartão**, aba "Histórico": linha do tempo vertical, mais recente primeiro, com autor,
  ação, de → para e data relativa ("há 2 dias") com data exata no title.
- **Tela de auditoria** (`/admin/tarefas/auditoria`): tudo de todos, com filtros por período,
  autor, ação, empresa e competência, paginado.

O CONTAZOOM já tem exatamente essa tela para documentos — `AuditoriaDocumentos.tsx` +
`api/admin/auditoria-documentos/route.ts`, com filtros e paginação `{logs, pagination}`. **É
para copiar aquela estrutura**, não inventar outra.

---

## 14. Usuários e níveis de acesso

### 14.1 Como está hoje

- `User.role` é `String @default("USER")`. Na prática só existem dois valores: `USER` e
  `ADMIN`.
- Não existe `enum` no schema. Não existe `middleware.ts` no projeto.
- Cada rota de API repete o mesmo bloco de guard, copiado em cerca de 15 arquivos:

```ts
const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const isAdmin = await checkIsAdmin(session.email, session.sub);
if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

- O **JWT não carrega `role`**. O payload é `{ sub, email, name }`. Consequência: toda
  checagem de permissão é uma consulta ao banco.
- Pior: `checkIsAdmin` faz `new PrismaClient()` e `$disconnect()` **a cada chamada**, em vez
  de usar o singleton de `src/lib/prisma.ts`. Uma conexão nova por request admin.
- O frontend descobre o papel por um endpoint dedicado, `GET /api/admin/check`, com cache em
  variável de módulo no `Sidebar.tsx`.
- `ProtectedRoute.tsx` só verifica se está autenticado. **Não verifica papel.** O gate de
  admin é o 403 da API renderizado como mensagem de erro.

### 14.2 Por que dois papéis não bastam

Você pediu para "cadastrar user para ter acesso níveis, que é ajudante da contabilidade". Com
`USER`/`ADMIN`, o ajudante da contabilidade teria que ser `ADMIN` — e `ADMIN` hoje pode criar
usuário, apagar documento de qualquer cliente e ver tudo. Dar isso para quem só precisa mover
etapa é conceder poder demais por falta de granularidade.

### 14.3 Papéis propostos

Mantendo `USER` e `ADMIN` intactos para não quebrar nada do que existe:

| Papel | Quem é | Acesso |
|---|---|---|
| `ADMIN` | Gestão ContaZoom | Tudo, inclusive cadastro de usuário, empresa e configuração de fluxo |
| `COMERCIAL` | Comercial ContaZoom | Vê toda a carteira; executa etapas de `COMERCIAL_CZ`; abre pendência; cria processo de legalização. **Não** cadastra usuário |
| `CONTABIL` | Contador do escritório | Vê toda a carteira; executa etapas de `ESCRITORIO`; conclui competência |
| `CONTABIL_ASSISTENTE` | Ajudante da contabilidade | Vê a carteira; executa etapas de `ESCRITORIO`; **não** conclui competência nem reabre tarefa |
| `USER` | Cliente final | Nada do módulo de tarefas nesta fase (ver 14.6) |

### 14.4 Matriz de permissões

| Ação | ADMIN | COMERCIAL | CONTABIL | ASSISTENTE |
|---|---|---|---|---|
| Ver Kanban e lista | sim | sim | sim | sim |
| Ver log | sim | sim | sim | sim |
| Concluir etapa de `COMERCIAL_CZ` | sim | sim | não | não |
| Concluir etapa de `ESCRITORIO` | sim | não | sim | sim |
| Concluir etapa `AMBOS` | sim | sim | sim | sim |
| Retornar etapa | sim | não | sim | não |
| Registrar bloqueio | sim | sim | sim | sim |
| Resolver bloqueio | sim | sim | sim | sim |
| Encerrar competência | sim | não | sim | não |
| Reabrir tarefa concluída | sim | não | não | não |
| Criar processo de legalização | sim | sim | sim | não |
| Cadastrar empresa | sim | sim | não | não |
| Cadastrar usuário | sim | não | não | não |
| Configurar prazos e fluxo | sim | não | não | não |

A regra que sustenta a matriz: **você só conclui etapa que é sua.** É o que impede o comercial
de marcar apuração como feita e o escritório de marcar recebimento de documento que não
recebeu.

### 14.5 Três correções técnicas que o módulo exige

**1. Criar `src/lib/api-guard.ts`.** O bloco de guard copiado em 15 arquivos vira função. Sem
isso, o módulo novo adiciona mais uma dúzia de cópias, e a próxima mudança de regra de
permissão vira caça ao tesouro.

```ts
// src/lib/api-guard.ts
export type Sessao = { userId: string; email: string; nome: string; papel: string };

/** 401 se não houver sessão válida. */
export async function requireSessao(req: NextRequest): Promise<Sessao | NextResponse>;

/** 403 se o papel não estiver na lista. */
export async function requirePapel(
  req: NextRequest,
  papeisAceitos: string[]
): Promise<Sessao | NextResponse>;

/** 403 se o papel não puder concluir etapa daquele responsável. */
export function podeConcluirEtapa(papel: string, responsavelEtapa: string): boolean;
```

**2. Resolver o custo de `checkIsAdmin`.** Duas saídas:

- **(a)** Colocar `role` no payload do JWT. Elimina a consulta ao banco. Custo: invalida as
  sessões existentes (todos precisam entrar de novo) e o papel fica velho por até 7 dias se
  mudar no meio.
- **(b)** Manter a consulta, mas usar o **singleton** do Prisma e um cache curto em memória
  (30 s por usuário). Não invalida sessão, resolve o problema da conexão nova por chamada.

**Recomendo a (b)** para não forçar relogin geral, e considerar a (a) numa próxima janela.

**3. Criar guard de papel no client.** `ProtectedRoute` não checa papel, então hoje uma tela
admin renderiza para qualquer autenticado e só quebra quando a API responde 403. Para o módulo
novo isso é ruim: o operador veria o Kanban montar e depois esvaziar. Precisa de um
`RequirePapel` que decide antes de renderizar.

### 14.6 Cliente final vê ou não vê?

**Nesta fase, não.** Você foi claro: o ambiente é para comunicação interna entre a ContaZoom e
o escritório. Colocar o cliente dentro agora traz duas obrigações que ninguém pediu: linguagem
revisada para leigo em tudo, e a promessa implícita de que o dado está sempre atualizado.

O desenho de duas camadas (seção 4) já deixa isso pronto para quando quiser: é ligar o papel
`USER` para ver **somente** o status macro e o prazo das próprias competências, sem etapa, sem
log, sem observação interna. Nenhum retrabalho.

### 14.7 Tela de gestão de usuários — o que muda

Hoje (pelo print): cards de KPI, tabela com Nome/E-mail, Data de Cadastro, Permissão e Contas
Conectadas, botão "Novo Usuário".

O que falta e vou acrescentar:

1. **Coluna de papel com os novos valores**, com selo colorido em vez do texto cru `USER`
2. **Filtro por papel** e busca por nome/e-mail — com 17 usuários já incomoda, com 60 é
   inviável
3. **Empresas vinculadas** ao usuário, não só contas de marketplace
4. **Último acesso** — hoje só existe data de cadastro, que não diz se a pessoa usa o sistema
5. **Ativar/desativar** em vez de só excluir. Funcionário que sai precisa perder acesso sem
   apagar o histórico do que fez
6. **Formulário de novo usuário** com papel, e um resumo do que aquele papel permite escrito
   em texto — para quem cadastra não errar por não saber o que está concedendo
7. **Confirmação ao elevar papel**, dizendo o que a pessoa passa a poder fazer

Sobre os cards de KPI: os três atuais (Total de Usuários, Contas Meli, Contas Shopee) medem
integração de marketplace, não gestão contábil. Para este módulo, os números que importam são
**Clientes ativos**, **Competências abertas no mês**, **Bloqueadas** e **Atrasadas**. Sugiro
manter os três atuais na tela de usuários e usar os novos no painel de tarefas.

---

## 15. Telas

### 15.1 Mapa de navegação

Seguindo a convenção real do projeto: página em `src/app/`, componente de tela em
`src/app/components/views/`, sub-componentes em `src/app/components/views/ui/`.

```
/admin/tarefas                       Painel geral: KPIs + Kanban do mês
/admin/tarefas/apuracao              Kanban / Lista / Matriz das apurações
/admin/tarefas/apuracao/[id]         Detalhe de uma competência
/admin/tarefas/legalizacao           Kanban / Lista dos processos
/admin/tarefas/legalizacao/[id]      Detalhe de um processo
/admin/tarefas/auditoria             Log completo, filtrável
/admin/empresas                      Cadastro de empresas (CNPJ)
/admin/empresas/[id]                 Detalhe: dados, histórico de regime, competências
/admin/tarefas/configuracao          Prazos, fluxos, geração automática (só ADMIN)
/admin                               Gestão de usuários (existente, reformulada)
```

### 15.2 Item novo na sidebar do admin

`src/app/admin/AdminSidebar.tsx` tem hoje três links: Painel de Usuários, Enviar Documentos,
Auditoria Docs. Passa a ter, na ordem:

```
Tarefas                 /admin/tarefas
Empresas                /admin/empresas
Painel de Usuários      /admin
Enviar Documentos       /admin/documentos
Auditoria Docs          /admin/auditoria-documentos
```

Tarefas em primeiro porque é a tela de trabalho diário. O padrão de estado ativo continua o
que já existe: `bg-orange-600 text-white` no ativo, `text-gray-300 hover:bg-gray-800` no
resto, sobre `bg-gray-900`.

### 15.3 Painel geral — `/admin/tarefas`

**Cabeçalho**

```
Tarefas
Acompanhamento de apuração fiscal e processos de legalização
```

**Quatro cards de KPI** (com o seletor de competência no topo, padrão: mês corrente)

| Card | Número | Detalhe |
|---|---|---|
| Competências abertas | 26 | de 31 clientes ativos |
| Em andamento | 14 | etapas 2 a 7 |
| Bloqueadas | 2 | há 6 dias em média |
| Atrasadas | 1 | vencimento passou |

**Abaixo:** o Kanban do mês corrente, e um bloco lateral "Processos de legalização em curso"
com os pontuais abertos.

### 15.4 Detalhe da competência — `/admin/tarefas/apuracao/[id]`

Cabeçalho com razão social, CNPJ formatado, selo de regime, competência, selo de status e
prazo.

**Coluna esquerda — as etapas.** Lista vertical numerada, cada linha com:

- número em círculo: cinza (pendente), laranja (em andamento), verde com marca de confirmação
  (concluída), cinza riscado (não aplicável)
- título da etapa
- selo do responsável: `Comercial C.Z` / `Escritório` / `Ambos`
- quando concluída: quem concluiu e quando
- descrição da etapa, recolhida, abrindo ao clicar

**Rodapé fixo da coluna:** um botão primário só, laranja, com o texto da próxima ação:

```
Concluir etapa 4 — Apuração do faturamento (PGDAS-D)
```

E dois secundários: `Registrar pendência` e `Voltar etapa` (este só para quem tem permissão, e
sempre pedindo motivo).

**Coluna direita — abas**

1. **Resumo** — prazo, responsável, datas de início e conclusão, observações
2. **Pendências** — abertas e resolvidas, com duração de cada uma
3. **Histórico** — o log completo desta competência
4. **Documentos** — os documentos daquela competência, puxados do módulo que já existe

### 15.5 Textos de interface

Fixar agora evita seis variações do mesmo botão espalhadas pela tela.

**Ações**

| Situação | Texto |
|---|---|
| Avançar | `Concluir etapa {n} — {título}` |
| Voltar | `Voltar etapa` |
| Bloquear | `Registrar pendência` |
| Desbloquear | `Resolver pendência` |
| Encerrar | `Encerrar competência` |
| Reabrir | `Reabrir competência` |
| Etapa opcional | `Marcar como não aplicável` |
| Criar competência | `Abrir competência` |
| Criar processo | `Novo processo de legalização` |
| Cadastrar empresa | `Nova empresa` |

**Confirmações** (nada destrutivo sem confirmar)

| Ação | Título | Texto |
|---|---|---|
| Encerrar competência | Encerrar competência | `Encerrar {competência} de {empresa}? Depois de encerrada, a competência não aceita mudança de etapa. Só um administrador pode reabrir.` |
| Voltar etapa | Voltar etapa | `Voltar da etapa {n} para a {n-1}? Informe o motivo — ele fica registrado no histórico.` |
| Reabrir | Reabrir competência | `Reabrir {competência}? A competência volta para a etapa {n} e a reabertura fica registrada com seu nome.` |
| Elevar papel | Alterar permissão | `{nome} passa a ter permissão de {papel} e poderá {resumo do que o papel permite}.` |

**Vazios** (tela vazia é oportunidade de explicar, não de mostrar nada)

| Onde | Texto |
|---|---|
| Sem competência no mês | `Nenhuma competência aberta em {mês}. Abra as competências do mês para começar o acompanhamento.` |
| Coluna vazia | `Nenhum cliente neste status.` |
| Sem legalização | `Nenhum processo de legalização em curso. Processos são pontuais e criados quando contratados.` |
| Sem empresa | `Nenhuma empresa cadastrada. Cadastre o primeiro CNPJ para começar.` |
| Sem log | `Nenhuma alteração registrada ainda.` |
| Filtro sem resultado | `Nenhuma tarefa corresponde aos filtros. Limpar filtros.` |

**Erros**

| Situação | Texto |
|---|---|
| Sem permissão para a etapa | `Esta etapa é de responsabilidade do {responsável}. Seu perfil não pode concluí-la.` |
| Competência já existe | `A competência {mês} de {empresa} já existe.` |
| Etapa fora de ordem | `Conclua a etapa {n} antes de avançar.` |
| Encerrar com etapa pendente | `Ainda há {n} etapas pendentes. Conclua ou marque como não aplicável antes de encerrar.` |
| Competência encerrada | `Esta competência está encerrada e não aceita alteração. Reabra antes de continuar.` |

### 15.6 Regras de interface

**Ícones: SVG sempre, emoji nunca.** Em nenhuma circunstância, em nenhum lugar — nem em
tela, nem em texto de botão, nem em mensagem de erro, nem em comentário de código voltado ao
usuário. O projeto usa `lucide-react` na área admin (`Shield`, `Users`, `FolderOpen`,
`FileText`) e SVG inline no Sidebar principal. Na área admin, seguir lucide.

Ícones por conceito:

| Conceito | Ícone lucide |
|---|---|
| Tarefas | `ClipboardList` |
| Apuração | `Calculator` |
| Legalização | `Building2` |
| Empresas | `Building` |
| Etapa concluída | `CheckCircle2` |
| Etapa em andamento | `Circle` |
| Pendência | `AlertTriangle` |
| Prazo | `Calendar` |
| Atrasado | `CalendarX` |
| Histórico | `History` |
| Responsável | `User` |
| Documento | `FileText` |
| Protocolo externo | `Hash` |

**Paleta.** Laranja é marca e ação; preto e branco são a estrutura; cor de status é sinal,
contida, e nunca sozinha.

| Uso | Valor |
|---|---|
| Ação primária | `orange-500` normal, `orange-600` hover |
| Navegação ativa | `bg-orange-600` |
| Fundo de sidebar admin | `gray-900` |
| Fundo de página | `gray-50` |
| Card | `bg-white` com `border-gray-200` |
| Texto principal | `gray-900` |
| Texto secundário | `gray-500` |
| Status | os hex da seção 7.2 |

**Nota técnica sobre Tailwind.** O projeto usa **Tailwind v4 sem `tailwind.config.js`** — só
`@import "tailwindcss"` no `globals.css`. Não existe onde registrar token customizado por
config; as cores de status entram como CSS vars em `:root` ou no bloco `@theme inline` que já
existe no `globals.css`. E atenção: o `globals.css` estiliza `input`, `textarea` e `select`
**por seletor de tag, com `!important`** (`h-12 rounded-xl border-2` e box-shadow). Todo
formulário novo herda isso automaticamente — conte com o comportamento em vez de lutar contra.

---

## 16. API

Seguindo o padrão do projeto: `route.ts` no App Router, `NextResponse.json`, guard por rota,
mensagem de erro em português na chave `error`, params dinâmicos como `Promise`.

### 16.1 Empresas

| Método | Rota | Papéis |
|---|---|---|
| `GET` | `/api/empresas` | ADMIN, COMERCIAL, CONTABIL, ASSISTENTE |
| `POST` | `/api/empresas` | ADMIN, COMERCIAL |
| `GET` | `/api/empresas/[id]` | todos internos |
| `PATCH` | `/api/empresas/[id]` | ADMIN, COMERCIAL |
| `POST` | `/api/empresas/[id]/regime` | ADMIN, CONTABIL |

Filtros do `GET`: `regime`, `situacao`, `busca`, `page`, `limit`.

### 16.2 Apuração

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tarefas/apuracao` | Lista com filtros de competência, regime, status, responsável, prazo, bloqueio |
| `POST` | `/api/tarefas/apuracao` | Abre uma competência para uma empresa |
| `POST` | `/api/tarefas/apuracao/abrir-mes` | Abre a competência do mês para **todas** as empresas ativas |
| `GET` | `/api/tarefas/apuracao/[id]` | Detalhe com etapas, pendências e log |
| `POST` | `/api/tarefas/apuracao/[id]/etapa/concluir` | Conclui a etapa atual |
| `POST` | `/api/tarefas/apuracao/[id]/etapa/voltar` | Volta uma etapa. Exige `motivo` |
| `POST` | `/api/tarefas/apuracao/[id]/etapa/[numero]/nao-aplicavel` | Só etapa opcional |
| `POST` | `/api/tarefas/apuracao/[id]/bloqueio` | Registra pendência. Exige `motivo` e `responsavel` |
| `DELETE` | `/api/tarefas/apuracao/[id]/bloqueio` | Resolve a pendência |
| `POST` | `/api/tarefas/apuracao/[id]/encerrar` | Encerra a competência |
| `POST` | `/api/tarefas/apuracao/[id]/reabrir` | Só ADMIN. Exige `motivo` |
| `PATCH` | `/api/tarefas/apuracao/[id]` | Responsável, prazo, observações |

### 16.3 Legalização

Mesmo desenho, em `/api/tarefas/legalizacao`, mais:

| Método | Rota | O que faz |
|---|---|---|
| `PATCH` | `/api/tarefas/legalizacao/[id]/protocolo` | Grava protocolo e órgão externo |
| `POST` | `/api/tarefas/legalizacao/[id]/vincular-empresa` | Liga o processo à empresa criada (abertura de CNPJ) |

### 16.4 Painel e log

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tarefas/painel` | Os KPIs da seção 15.3, em uma consulta |
| `GET` | `/api/tarefas/log` | Log filtrável e paginado, no formato de `auditoria-documentos` |
| `GET` | `/api/tarefas/matriz` | Matriz cliente × mês |

### 16.5 Duas coisas que a API precisa garantir

**Concluir etapa é transação.** Uma chamada de conclusão faz quatro escritas: marca a etapa
como concluída, atualiza `etapaAtual`, recalcula `status` e grava o log. Se qualquer uma
falhar, nenhuma vale. Sem transação, dá para ter tarefa na etapa 5 com o log dizendo que ainda
está na 4 — e aí o log deixa de ser confiável, que é a única coisa que ele precisa ser. Usar
`prisma.$transaction`.

**Abrir o mês precisa ser idempotente.** `POST /abrir-mes` clicado duas vezes não pode criar
competência duplicada. A trava de verdade é o `@@unique([empresaId, ano, mes])` no banco; a
rota trata a violação como "já existia" e segue, em vez de devolver erro.

### 16.6 Validação

O projeto **não usa zod**, apesar de ter `zod ^4.1.11` instalado — validação é manual, em
português, no estilo de `src/lib/aliquota-imposto.ts`. Duas opções:

- **Seguir o padrão atual:** validação manual em `src/lib/tarefas.ts` com funções que
  devolvem `null` em falha, e a rota convertendo em 400 com mensagem em português.
- **Introduzir zod:** sem adicionar dependência, já está lá. Ganha mensagem estruturada por
  campo e tipo derivado do schema.

Recomendo **zod só no módulo novo**, sem tocar no resto. O módulo tem muitos campos com regra
(competência 1-12, CNPJ de 14 dígitos, etapa dentro do intervalo do regime), e validar isso à
mão é onde erro passa.

---

## 17. Geração automática das competências

Rotina mensal só funciona se as tarefas nascerem sozinhas. Se alguém tiver que criar 31
competências à mão todo dia 1º, em três meses o sistema está abandonado.

**Como:** no primeiro dia de cada mês, para cada `Empresa` com `situacao = 'ATIVA'`, criar a
`TarefaApuracao` da competência anterior — porque a apuração de janeiro é feita em fevereiro.
O regime vem de `EmpresaRegimeHistorico` vigente no último dia da competência, não o de hoje.

**Onde:** o projeto já tem `node-cron` nas dependências e um endpoint de cron em
`api/cron/meli-sync/trigger`. Mesmo desenho: `POST /api/cron/tarefas/abrir-competencia`,
protegido por `CRON_SECRET` (variável que já existe no `env.example`).

**Duas travas:**

1. **Idempotência** pelo `@@unique([empresaId, ano, mes])`. Rodar duas vezes não duplica.
2. **Botão manual** em `/admin/tarefas/configuracao` para abrir o mês na mão, porque cron
   falha e ninguém pode ficar esperando o mês seguinte.

**Ponto a decidir com vocês:** empresa nova cadastrada no meio do mês entra na competência
corrente ou só na seguinte? E empresa em processo de abertura de CNPJ — ela gera competência
antes de ter CNPJ? Minha proposta: entra no mês seguinte ao cadastro, e empresa
`EM_ABERTURA` não gera competência até virar `ATIVA`.

---

## 18. Integração com o que já existe no CONTAZOOM

O módulo não nasce numa ilha. Quatro pontos de encaixe, do mais óbvio ao mais útil:

**1. Documentos (`Document`, `DocumentFolder`, `DocumentLog`).** A etapa 9 do SN e a 10 do LP
são literalmente *"upload dos documentos no sistema"* — e o sistema é este. A categoria
`IMPOSTOS` já existe, e `Document.subFolder` já usa formato de competência
(`"2026/01_Janeiro"`). Dá para:

- mostrar na aba Documentos do cartão os arquivos daquela competência
- **sugerir a conclusão da etapa** quando aparecer documento novo naquela pasta
- exigir pelo menos um documento antes de deixar encerrar a competência (regra opcional,
  configurável)

**2. Notificações (`SyncNotification` + `NotificationContext`).** Já existe estrutura de
notificação por usuário, com contador de não lidas. Reaproveitar para: pendência aberta há
mais de X dias, competência vencendo em 3 dias, etapa que voltou. Zero infraestrutura nova.

**3. Alíquotas (`AliquotaImposto`).** Tem campo `descricao` cujo comentário no schema já cita
`"Simples Nacional"` e `"Lucro Presumido"`. Não é a mesma coisa que o regime da empresa, mas
vale conferir se não há informação duplicada esperando para divergir.

**4. Contas a pagar (`ContaPagar` com `dataCompetencia`).** A guia gerada na etapa 7/8 é uma
conta a pagar do cliente. Se um dia quiserem que a apuração alimente o financeiro
automaticamente, o gancho existe. **Fora do escopo desta fase**, mas o schema não fecha a
porta.

---

## 19. Riscos e armadilhas técnicas

Levantados da leitura do código. Cada um destes já quebrou algo em algum projeto.

| # | Risco | Efeito | Como evito |
|---|---|---|---|
| 1 | **Não existe `Empresa`/CNPJ no sistema** | Módulo inteiro sem chão | Decisão da seção 6.1 antes de qualquer código |
| 2 | **Drift de migrations** (`role` não está em nenhuma migration) | `migrate deploy` falha em produção | SQL defensivo com `IF NOT EXISTS`, no padrão de `20260520165058` |
| 3 | **JWT sem `role`** | Consulta ao banco em toda checagem | Helper com singleton + cache curto (14.5) |
| 4 | **`checkIsAdmin` abre `PrismaClient` por chamada** | Conexão nova por request; pool esgota | Usar o singleton de `src/lib/prisma.ts` |
| 5 | **Sem `middleware.ts`, guard copiado em ~15 rotas** | Regra de permissão inconsistente | `src/lib/api-guard.ts` antes das rotas novas |
| 6 | **`ProtectedRoute` não checa papel** | Tela monta e esvazia no 403 | `RequirePapel` no client |
| 7 | **Sem `tailwind.config.js`** (v4) | Não há onde pôr token | CSS vars / `@theme inline` no `globals.css` |
| 8 | **`globals.css` sobrescreve input por tag com `!important`** | Formulário novo herda `h-12 rounded-xl border-2` | Contar com isso, não lutar |
| 9 | **Sem lib de drag-and-drop** | Kanban arrastável exigiria dependência | Só o bloqueio arrasta; HTML5 drag events resolve |
| 10 | **Upload grava em disco local** (`process.cwd()/uploads`) | Anexo se perde em redeploy sem volume | Se tarefa tiver anexo, confirmar volume no Coolify |
| 11 | **Status derivado gravado no banco** | Pode divergir da etapa | Recalcular sempre na mesma transação; nunca por caminho separado |
| 12 | **Etapa como texto no banco** | Mudar o fluxo reescreveria o passado | Texto congelado na criação (6.4) |
| 13 | **Fuso horário em competência** | Competência errada perto da virada do mês | `ano`/`mes` como `Int`, nunca `DateTime` |
| 14 | **`Branch.slug` do Sidebar é union literal `"sales" \| "finance"`** | TypeScript quebra ao adicionar grupo | Estender o union ao mexer no Sidebar principal |
| 15 | **Excluir usuário apaga histórico** | Log perde o autor | `onDelete: Restrict` no autor do log + desativar em vez de excluir |

---

## 20. Fases de implementação

Ordem escolhida para ter algo utilizável cedo, e para o que é irreversível vir primeiro.

**Fase 0 — Decisões (você e o escritório, sem código)**
1. Confirmar as 14 etapas do LP (divergência da seção 9.3)
2. Resolver o título/descrição da etapa 13 do LP (9.4)
3. Validar o mapeamento etapa → status (7.3)
4. Aprovar `Empresa` como modelo novo (6.1)
5. Preencher as etapas reais de legalização (seção 11)
6. Definir prazos internos por etapa (seção 10)

**Fase 1 — Fundação**
- `src/lib/api-guard.ts` e o helper de papel
- Papéis novos e a tela de usuários reformulada
- Modelo `Empresa` + `EmpresaRegimeHistorico` + migration defensiva
- CRUD de empresas com importação em massa dos clientes que já existem

**Fase 2 — Apuração, que é o que gera valor**
- `TarefaApuracao`, `TarefaApuracaoEtapa`, `TarefaLog`
- Constantes de fluxo (`tarefa-etapas.ts`)
- API de apuração completa
- Kanban + Lista + detalhe da competência
- Log e tela de auditoria

**Fase 3 — Automação**
- Cron de abertura mensal + botão manual
- Prazos e destaque de atraso
- Notificações de pendência e vencimento
- Integração com documentos (sugerir conclusão da etapa de upload)

**Fase 4 — Legalização**
- `ProcessoLegalizacao` + etapas
- Fluxos dos cinco tipos
- Protocolo e órgão externo
- Vínculo com `Empresa` na conclusão da abertura
- Efeito do desenquadramento no regime

**Fase 5 — Análise**
- Matriz cliente × mês
- Onde o processo mais trava, por etapa
- Tempo médio por etapa e por responsável
- Exportação

Fim da Fase 2 já é sistema usável no dia a dia. Fases 4 e 5 são incremento.

---

## 21. O que eu preciso de vocês para começar

Em ordem de bloqueio. Os quatro primeiros travam o schema; os outros travam telas específicas.

**Bloqueia tudo:**

1. **`Empresa` como modelo novo, sim ou não?** Se for não, preciso entender como um cliente com
   dois CNPJs deve funcionar.
2. **Lucro Presumido tem 13 ou 14 etapas?** Adotei 14 (com obrigações acessórias).
3. **A etapa 13 do LP é relatório gerencial ou recibo de obrigação acessória?** Título e
   descrição do documento discordam.
4. **O mapeamento etapa → status da seção 7.3 está correto?** Em especial: *Entregue* começa no
   envio do e-mail ou na confirmação do cliente?

**Bloqueia a legalização:**

5. As etapas reais dos cinco processos. Minha proposta da seção 11 é chute informado.
6. Existe outro tipo de processo além dos cinco?

**Bloqueia prazos e cobrança:**

7. Prazo interno de cada etapa-chave.
8. Feriado municipal afeta prazo? Cliente de município diferente muda algo?

**Bloqueia permissões:**

9. Os quatro papéis (`ADMIN`, `COMERCIAL`, `CONTABIL`, `CONTABIL_ASSISTENTE`) cobrem a equipe?
10. Quem pode encerrar competência? Deixei em `ADMIN` e `CONTABIL`.
11. Quem pode reabrir? Deixei só `ADMIN`.

**Bloqueia a automação:**

12. Empresa cadastrada no meio do mês entra na competência corrente?
13. Cliente sem movimento no mês gera competência? (Faturamento zero ainda tem PGDAS-D a
    transmitir, então minha suposição é que sim.)

---

## 22. Resumo de uma página

**O problema.** A ContaZoom e o escritório contábil da casa trabalham juntos na apuração
fiscal dos clientes, e não existe lugar comum para ver em que ponto está cada cliente. A
informação vive em conversa.

**O que existe de material.** O escritório propôs 6 status macro e documentou 10 etapas para o
Simples Nacional e 14 para o Lucro Presumido, com descrição e responsável de cada uma.

**A tensão.** O escritório propôs esconder as etapas e mostrar só o status. Você precisa das
etapas, porque duas delas são executadas pela ContaZoom.

**A solução.** Duas camadas com uma fonte de verdade: a etapa é o que se move e o que vai para
o log; o status macro é derivado dela por tabela fixa. Ninguém registra duas coisas, e o
cliente final — se um dia entrar — vê apenas o macro, sem retrabalho.

**O bloqueio real.** O CONTAZOOM não tem modelo de empresa nem campo de CNPJ. Hoje "cliente" é
o login. Apuração é por CNPJ e competência. Criar `Empresa` é a primeira decisão, e é aditiva.

**O que se ganha.** Kanban por competência com etapa visível, prazo e atraso destacados,
pendência com responsável e duração, log completo de quem mudou o quê, quatro níveis de acesso
em vez de dois, e a legalização — hoje sem controle nenhum — com processos rastreáveis e
protocolo do órgão externo.

**O que falta para começar.** As treze respostas da seção 21. As quatro primeiras travam o
schema; sem elas, qualquer código escrito agora vira retrabalho.
