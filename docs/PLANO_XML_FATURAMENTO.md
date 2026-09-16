# Importação de XML fiscal e apuração de faturamento

Análise e plano de back-end. **Nenhuma linha de front-end é tratada aqui.**

Status: proposta técnica, nada implementado. Escrito depois de ler o módulo
contábil existente (`prisma/schema.prisma`, `src/lib/tarefa-*`, `src/app/api/tarefas/**`),
a infraestrutura de upload (`src/lib/spreadsheet.ts`, `src/app/api/tarefas/anexos/`,
`src/lib/tarefa-anexo-disco.ts`), os padrões de lote (`src/lib/prazo-despacho-backfill.ts`)
e o ambiente real (`docker-compose.prod.yml`, `Dockerfile.prod`, `next.config.ts`).

---

## 1. O que foi pedido

Três entregas, e elas dependem uma da outra nesta ordem:

1. **Ingestão** — ambiente que recebe XML e lê para calcular faturamento mensal
   declarado / NFs emitidas **por CNPJ**.
2. **Apuração e conferência** — tela que mostra os valores das NFs subidas, com
   período, série, número e situação.
3. **Declaração de faturamento 12 meses** — relatório gerado a partir do
   faturamento dos XMLs **ou** de valor digitado à mão.

A terceira é a que o cliente final enxerga (é o documento que o banco pede), e é
também a que impõe o requisito mais duro: **o número tem de ser defensável**. Um
relatório assinado pelo escritório com valor errado é problema do escritório, não
do sistema. Isso é o que dita quase todas as decisões abaixo.

---

## 2. Dois achados que mudam o desenho

### 2.1 O módulo contábil não é multi-inquilino por login, e não tem nenhum valor

Verificado por busca em `src/app/api/{tarefas,empresas}/**`: **nenhuma rota do
módulo contábil filtra por `userId` da sessão.** O escopo é por PAPEL
(`requireInterno` libera a carteira inteira), o que está declarado na
especificação dos papéis — COMERCIAL, CONTABIL e CONTABIL_ASSISTENTE "veem toda a
carteira" (`src/lib/papeis.ts`).

Isso é o oposto do lado marketplace/financeiro, onde **toda** consulta filtra
`where: { userId: session.sub }` (`/api/vendas`, `/api/financeiro/*`).

`Empresa.userId` existe, mas é o **login do cliente quando existir** — nullable,
`onDelete: SetNull`, com o comentário no schema explicando que apagar o login não
pode apagar o histórico fiscal. Boa parte da carteira não tem login nenhum.

> **Consequência direta:** a chave de escopo das tabelas novas é `empresaId`, não
> `userId`. Pôr `userId` como escopo inventaria um inquilino que o módulo não tem e
> deixaria fora do alcance a maior parte da carteira. Para "quem importou", o padrão
> do módulo é **autoria congelada** (`importadoPorId` + `importadoPorNome`, como
> `TarefaAnexo.enviadoPorId/Nome` e `TarefaLog.autorId/Nome`).

E o segundo lado do achado: **nenhuma tabela do módulo contábil guarda valor
monetário.** Busca por `faturamento|receitaBruta|nfe|xml` no módulo não retorna
nada. `MeliVenda`, `ShopeeVenda`, `ContaPagar/Receber` têm dinheiro, mas são todas
por `userId` e **nenhuma tem `empresaId` nem CNPJ** — não existe ponte entre venda
de marketplace e empresa contábil. Estamos partindo do zero nessa parte.

### 2.2 NF-e não é a fonte do faturamento de toda empresa

Isto é o erro mais provável do projeto inteiro se não for tratado desde o começo:

| Tipo de empresa | Documento que gera o faturamento | Layout |
|---|---|---|
| Comércio / indústria | **NF-e** modelo 55 | NF-e 4.00 (+ NT 2025.002) |
| Varejo no balcão | **NFC-e** modelo 65 | mesmo layout da NF-e |
| **Serviço** | **NFS-e** | Outro layout, outro emissor, outro XML |
| Transporte | CT-e | Outro layout |

`Empresa.tributoLocal` já reconhece essa divisão (`ICMS` = comércio/indústria,
`ISS` = serviço) e é usado para nomear a etapa 6 do Lucro Presumido. Uma empresa
de serviço pode ter **zero** NF-e e faturar todo mês.

Fatos externos confirmados (out/2025 – set/2026):

- A **NFS-e de padrão nacional** virou obrigatória para os municípios a partir de
  01/01/2026, e a Resolução CGSN nº 189/2026 tornou o **Emissor Nacional**
  obrigatório para ME/EPP do Simples Nacional a partir de **01/09/2026**
  ([Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional),
  [Portal NFS-e](https://www.gov.br/nfse/pt-br/noticias/nfs-e-e-simples-nacional-obrigatoriedade-de-emissao-atraves-do-emissor-nacional)).
- O fluxo nacional é **DPS → NFS-e**: a DPS é a declaração que o contribuinte
  envia, e o Ambiente Nacional devolve a NFS-e final, que é o documento válido
  ([Portal NFS-e / material municipal](https://www.fazenda.niteroi.rj.gov.br/site/nfse-nacional/)).
  **Só a NFS-e conta como faturamento; a DPS é o rascunho.**
- O layout da NFS-e também está mudando pela Reforma Tributária (Nota Técnica nº
  009, de 04/06/2026), e o DANFSe v2 tem prazo de adaptação
  ([gov.br](https://www.gov.br/nfse/pt-br/noticias/publicada-a-nota-tecnica-009-da-nfs-e)).

> *Conteúdo das fontes acima parafraseado e resumido para atender a restrições de
> licenciamento.*

**Decisão proposta:** a Fase 1 implementa **NF-e/NFC-e** (modelos 55 e 65), porque
são o mesmo layout e cobrem comércio. A tabela e o serviço nascem com uma coluna
`modelo` e a apuração soma "documentos fiscais", não "NF-e" — para NFS-e entrar na
Fase 3 sem migração de dados nem reescrita da apuração. O que **não** pode
acontecer é a tela dizer "faturamento" mostrando só NF-e para uma empresa de
serviço: enquanto NFS-e não entrar, a apuração precisa dizer de quais modelos ela
é feita.

---

## 3. Anatomia do XML, e só o que interessa

Um XML de NF-e autorizada vem embrulhado em `<nfeProc>`, que contém a nota
(`<NFe>`) **e** o protocolo de autorização (`<protNFe>`):

```
nfeProc                        ← o arquivo distribuído (autorizado)
└─ NFe
   └─ infNFe  Id="NFe4131..."  ← 44 dígitos + prefixo "NFe"
      ├─ ide                   ← identificação
      │   ├─ cUF, natOp
      │   ├─ mod               ← 55 = NF-e, 65 = NFC-e
      │   ├─ serie, nNF        ← série e número (o que a tela precisa)
      │   ├─ dhEmi             ← data/hora de emissão, com fuso: -03:00
      │   ├─ tpNF              ← 0 = entrada, 1 = SAÍDA
      │   ├─ tpAmb             ← 1 = produção, 2 = HOMOLOGAÇÃO
      │   └─ finNFe            ← 1 normal, 2 complementar, 3 ajuste, 4 DEVOLUÇÃO
      ├─ emit / CNPJ           ← quem emitiu: é o que casa com Empresa.cnpj
      ├─ dest / CNPJ|CPF
      ├─ det (N vezes)         ← itens
      └─ total / ICMSTot
          ├─ vProd             ← soma dos produtos
          ├─ vDesc, vFrete, vST
          └─ vNF               ← VALOR TOTAL DA NOTA
   └─ protNFe / infProt
      ├─ cStat                 ← 100 = autorizada
      ├─ nProt
      └─ dhRecbto
```

Arquivo de **cancelamento** é um documento separado, com raiz diferente:

```
procEventoNFe
└─ evento / infEvento
   ├─ chNFe                    ← a chave da nota cancelada
   ├─ tpEvento                 ← 110111 = cancelamento
   ├─ nSeqEvento
   └─ detEvento / xJust
└─ retEvento / infEvento
   ├─ cStat                    ← 135/136 = registrado
   └─ dhRegEvento
```

Isto é a razão de a tabela de notas ter de aceitar **UPDATE** vindo de um
arquivo posterior: o escritório recebe a autorização hoje e o cancelamento em
outro arquivo, semana que vem. Se cancelamento criasse linha nova, o faturamento
somaria a nota cancelada e mais um registro de nada.

### 3.1 A chave de acesso é a chave natural

44 dígitos, e ela **contém** quase tudo que identifica a nota:

```
cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
```

Ou seja: UF, ano/mês de emissão, CNPJ do emitente, modelo, série e número saem da
própria chave. Isso dá duas coisas de graça:

1. **Idempotência** — `@unique` na chave faz reenvio do mesmo arquivo ser um
   no-op. É a propriedade mais importante do módulo, porque o contador **vai**
   subir a mesma pasta duas vezes.
2. **Conferência** — série/número lidos das tags têm de bater com os da chave. Se
   não baterem, o arquivo foi editado à mão, e é isso que a importação precisa
   recusar em vez de contabilizar.

---

## 4. O que conta como faturamento

Aqui não há como o sistema adivinhar: são regras contábeis, e cada uma precisa de
aval do escritório.

> **Esta tabela foi CORRIGIDA depois de rodar o diagnóstico contra XML real. A
> versão anterior errava por R$ 756,70 em R$ 63.270,86 (1,2%) numa única conta e num
> único mês, porque contava as notas de remessa para o FULL como venda. Ver a seção
> 12.** A linha do CFOP é a que mudou tudo.

| Condição | Entra no faturamento? | Motivo |
|---|---|---|
| **CFOP fora da faixa 51xx / 61xx** | **Não.** | É esta linha que decide. Grupo 5.1/6.1 é "venda de produção própria ou de terceiros"; tudo fora é movimentação, remessa, retorno ou devolução. Ver 4.3. |
| `tpAmb = 2` (homologação) | **Nunca.** Recusar na importação. | Nota de teste, valor fictício. É o erro mais comum de pasta de XML. |
| `tpNF = 0` (entrada) | Não. Guardar, não somar. | É compra ou retorno, não faturamento. Ver 4.1. |
| `cStat ≠ 100` (não autorizada) | Não. | Denegada/rejeitada não existe fiscalmente. |
| Cancelada (evento 110111) | Não. | E o valor tem de SAIR do mês, não ficar. Ver 4.4. |
| `finNFe = 4` (devolução) | Não soma como receita. | Devolução de mercadoria. |
| `finNFe = 2` (complementar) | **Soma.** | Complemento de valor de nota anterior. |
| `finNFe = 3` (ajuste) | **Não soma.** | Nota de ajuste não tem receita nova. |
| `mod = 65` (NFC-e) | Soma. | Venda no balcão é receita igual. |
| `mod = 57` (CT-e) | **Nunca.** | É frete, e emitido por OUTRA empresa. Ver 4.5. |

### 4.1 Nota de entrada e nota de terceiro na mesma pasta

Duas situações que a pasta do cliente traz garantido:

- **Nota que ele emitiu de entrada** (`tpNF = 0`): devolução a fornecedor, remessa.
  `emit/CNPJ` é dele, mas não é faturamento.
- **Nota que ele recebeu** (`emit/CNPJ` é de outra empresa, `dest/CNPJ` é dele):
  compra. Não é faturamento dele de jeito nenhum.

A importação precisa dizer isso, não descartar em silêncio: "12 arquivos são notas
de compra (a empresa é destinatária) e não entram no faturamento". Descarte
silencioso é o que faz alguém achar que o sistema perdeu arquivo.

### 4.3 CFOP é o discriminador. `natOp` não serve e `tpNF` não basta

Verificado no dado real (seção 12): existem notas de **saída, autorizadas, em
produção, `finNFe = 1`** que **não são receita** — a remessa de mercadoria para o
depósito do Mercado Livre (FULL). Toda regra que olhe só `tpNF` + `finNFe` +
`cStat` conta essas notas como venda.

- **`natOp` não serve**: é texto livre. Na base analisada apareceram seis redações
  diferentes, incluindo "Outras Saidas - Remessa para Deposito Temporario" e
  "Venda de mercadoria para consumidor final". Depender de texto livre é depender
  de o emissor não mudar a frase.
- **CFOP serve**: é código. O grupo **5.1xx / 6.1xx** é "venda de produção própria
  ou de terceiros" e é exatamente o conjunto de venda.
- **A faixa é WHITELIST, não blacklist.** O CFOP `5949/6949` ("outra saída não
  especificada") é lata de lixo: na base ele aparece nas remessas para o FULL, e
  amanhã pode aparecer em outra coisa. Aceitar tudo menos uma lista de exclusão
  deixaria toda saída desconhecida virar receita — errar para cima, que é o pior
  lado para um documento que vai ao banco.

**A nota pode ter itens com CFOP diferente.** A regra tem de olhar todos os itens,
não o primeiro. Se uma nota tiver item de venda e item fora da faixa, ela precisa
ser sinalizada para conferência humana em vez de resolvida por chute.

### 4.4 O XML da nota cancelada continua dizendo "autorizada"

Confirmado no dado real: nas três notas canceladas da amostra, o `cStat` dentro do
próprio `procNFe` é **100 (autorizada)**. O cancelamento está **só** no arquivo de
evento (`procEventoNFe`, `tpEvento 110111`), que é outro arquivo.

Consequência: quem importar apenas os `procNFe` — mesmo os da pasta "Canceladas" —
soma nota cancelada no faturamento. E a pasta não pode ser o critério: nome de
pasta é convenção do exportador, muda sem avisar e não existe quando o arquivo vem
por e-mail.

### 4.5 CT-e na mesma pasta é documento de OUTRA empresa

Na amostra havia 361 CT-e (mod 57) emitidos pelo próprio Mercado Livre contra a
empresa. É **custo de frete**, e o emitente é outro CNPJ — nem sequer casa com a
carteira. Precisam ser reconhecidos e recusados por modelo, com mensagem, não
importados como documento órfão nem somados.

### 4.2 O aviso que precisa estar no relatório

**Somatório de XML não é faturamento declarado.** O faturamento declarado é o que
está no PGDAS-D (Simples) ou na EFD-Contribuições / apuração (Presumido), e ele
pode divergir legitimamente:

- receita de serviço em NFS-e que o sistema ainda não lê;
- regime de caixa vs competência;
- receita sem nota (raro, mas existe);
- segregação de receitas por anexo do Simples.

O que o módulo entrega é **faturamento apurado por documento fiscal**, que serve
para conferir, para gerar declaração e para achar divergência. Chamar de
"faturamento declarado" sem essa ressalva é criar um número que vai ser usado como
prova e não é.

Para a declaração de 12 meses, o conceito próximo é a **RBT12** (receita bruta dos
12 meses anteriores ao período de apuração), que o Simples usa para achar a faixa,
com **proporcionalização** para empresa com menos de 13 meses de atividade
([referência de cálculo](https://autoatendimento.contmatic.com.br/hc/pt-br/articles/52817448768275-Simples-Nacional-Como-%C3%A9-feito-o-c%C3%A1lculo-da-RBT12)).
`Empresa.inicioAtividade` já existe no cadastro e é o campo que permite fazer essa
conta. *(Conteúdo da fonte parafraseado.)*

---

## 5. Armadilhas técnicas verificadas

### 5.1 O layout mudou em 2026 (Reforma Tributária)

A **NT 2025.002-RTC** (versões sucessivas, até v1.40) alterou o layout da NF-e e da
NFC-e para incluir IBS, CBS e Imposto Seletivo, com grupos e campos novos no XML,
eventos novos e validações mais rígidas nas SEFAZ
([Inventti](https://inventti.com.br/nt-2025-002-v1-40-da-nf-e-nfc-e-amplia-controles-da-reforma-tributaria-com-novos-campos-grupos-e-validacoes-de-ibs-e-cbs/),
[NDD](https://ndd.tech/fiscal-blog/nota-tecnica-2025-002-rtc-v1-10-novas-regras-para-ibs-cbs-e-is-na-nf-e-e-nfc-e/)).
*(Conteúdo parafraseado.)*

**Consequência de projeto:** o parser **não** pode validar contra XSD fixo nem
recusar tag desconhecida. Ele lê os campos de que precisa e ignora o resto. XML de
2027 com grupo novo tem de continuar importando. Validação por schema aqui
transformaria cada nota técnica da SEFAZ num incidente de produção.

### 5.2 XML de upload é entrada hostil

Não é paranoia: é a superfície clássica de ataque.

- **XXE** — `<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>` faz o
  parser ler arquivo do servidor.
- **Billion laughs / quadratic blowup** — entidade que se expande até estourar a
  memória do container. E o container **não tem limite de memória declarado**
  (`docker-compose.prod.yml` não tem `deploy.resources.limits`), então estourar a
  heap derruba a aplicação toda.

O `fast-xml-parser`, que é o candidato natural em Node, acumulou uma série de CVEs
exatamente nessa família ao longo de 2026: expansão de entidade sem limite
(GHSA-jmr7-xgp7-cmfj), `RangeError` não tratado em entidade numérica fora de faixa
(CVE-2026-25128), bypass dos limites por referência numérica (CVE-2026-33036) e
exaustão de pilha com `preserveOrder` (CVE-2026-27942). Versão mais recente no
registro npm: **5.11.1**.

**Defesa proposta, em três camadas:**

1. **Recusar DOCTYPE antes de parsear.** Procurar `<!DOCTYPE` / `<!ENTITY` nos
   primeiros KB do arquivo e rejeitar. XML fiscal legítimo **não tem DTD**. Isso
   mata XXE e billion laughs independentemente da biblioteca e das CVEs dela.
2. Pinar a versão (`5.11.1`), sem `preserveOrder`, sem resolução de entidade
   externa.
3. Teto de tamanho por arquivo. Uma NF-e tem 5–15 KB; nota com 500 itens chega a
   algumas centenas de KB. Teto de **1 MB por XML** é folgado e recusa qualquer
   coisa que não seja nota.

### 5.3 Encoding

O XML declara `encoding="UTF-8"` em quase todo emissor, mas existe emissor
gravando ISO-8859-1 com declaração errada. Resultado: razão social com `Ã§` no
lugar de `ç`. O valor não se perde (dígito é ASCII), mas o nome fica ilegível.
Detectar pela declaração e converter quando necessário; nunca confiar cegamente.

### 5.4 `.zip`

O projeto **não tem nenhuma biblioteca de zip** (o `xlsx` traz um leitor interno
próprio, não reaproveitável) e roda **Node 20** (`Dockerfile.prod`), que não tem
descompactação de zip nativa.

Fase 1 aceita **N arquivos `.xml` de uma vez** (`formData.getAll`), que é o
comportamento natural de "selecionar a pasta toda" no navegador. `.zip` fica para
a Fase 2, com `fflate` (pequeno, sem dependência nativa) e com teto de expansão
declarado — zip bomb é o mesmo problema do 5.2 por outro caminho.

### 5.5 Onde o arquivo mora

Fato do ambiente: `UPLOAD_DIR=/app/uploads`, volume `contazoom_uploads`
(`docker-compose.prod.yml`). Sem esse volume o arquivo morre no deploy — o
comentário no compose registra que isso já aconteceu.

**O XML tem de ser guardado, não só lido.** Ele é a prova do número: quando o
banco questionar a declaração, o que responde é o arquivo original. Retenção fiscal
é de 5 anos.

Volume de arquivo, contas rápidas: 60 empresas × 200 notas/mês = 12 mil
arquivos/mês, 144 mil/ano. **Um diretório único com 144 mil arquivos é um problema
operacional** (listagem, backup, inode). Proposta: `xml/<cnpj>/<AAAA-MM>/<chave>.xml`
— shardeado por natureza, e o caminho é derivável da chave, então não precisa de
coluna para achar o arquivo.

### 5.6 Sem worker, sem fila

Confirmado: **não existe worker nem agendador ativo** no projeto (dito
explicitamente em `src/app/api/estoque-full/sync/route.ts`). `node-cron` está no
`package.json` e não é importado. Existe `redis-queue.ts`, mas o "worker" roda
dentro da própria requisição.

Então a importação roda **dentro da requisição**, e o padrão a copiar é o do
`estoque-full/sync`: `maxDuration` na rota + **orçamento interno menor** +
devolver "faltou tempo, X restantes" em vez de ser cortado no meio + lock para não
rodar duas vezes (`acquireSyncLock`, 409 `alreadyRunning`).

E a lição já paga em produção, registrada em `prazo-despacho-backfill.ts`: **o
botão de lote é NÚMERO DE LINHAS, não tempo.** A versão anterior usava teto de
tempo com lote de 5000 e gerou 120 MB de WAL e um checkpoint de 269 segundos que
travou o banco inteiro.

### 5.7 A lição do prazo de despacho, que se aplica inteira aqui

O módulo de Expedição perdeu três tentativas escrevendo a extração do prazo **a
partir da documentação** do Mercado Livre. Nenhum dos campos documentados existia
no payload real daquela conta. O conserto só veio depois de `scripts/diagnostico-prazo.ts`
despejar o que havia de verdade no dado.

**Portanto, a primeira entrega deste módulo não é o parser: é
`scripts/diagnostico-xml.ts`** — um script que recebe uma pasta de XML de verdade
do escritório e imprime, sem gravar nada.

> **Já foi feito, e valeu a pena: a regra de faturamento que este documento
> propunha estava errada por 1,2% na primeira pasta real. Resultado na seção 12.**

O que ele mostra:

- quantos arquivos, quais raízes (`nfeProc`, `NFe`, `procEventoNFe`, `nfeProcCanc`, NFS-e, outra);
- distribuição de `mod`, `tpNF`, `tpAmb`, `finNFe`, `cStat`;
- quais CNPJs de `emit` aparecem e quais casam com `Empresa.cnpj`;
- presença dos campos de valor (`vNF`, `vProd`) e divergência entre eles;
- quantos arquivos são de entrada, de terceiro, duplicados;
- encoding declarado vs real.

Sem essa saída, qualquer regra escrita aqui é palpite. Com ela, as regras da seção
4 viram números conferidos.

---

## 6. Modelo de dados proposto

Seguindo as convenções declaradas no cabeçalho do bloco contábil do
`prisma/schema.prisma`: `cuid()`, `@map` snake_case, `created_at`/`updated_at`,
**nenhum enum** (String com valores em comentário, constantes em `src/lib/`),
`Decimal @db.Decimal(10,2)` para dinheiro, competência como **`ano Int` + `mes Int`**.

### 6.1 `DocumentoFiscal` — uma linha por documento

```prisma
/// Documento fiscal emitido, lido de XML. Uma linha por nota.
///
/// Chave natural é a CHAVE DE ACESSO (44 dígitos), não o par série+número:
/// série+número repete entre empresas e entre modelos, a chave não repete em
/// lugar nenhum do país. É ela que faz reenviar a mesma pasta ser um no-op.
model DocumentoFiscal {
  id String @id @default(cuid())

  /// 44 dígitos, sem o prefixo "NFe". Único no banco todo.
  chave String @unique @db.VarChar(44)

  /// Empresa emitente, casada por CNPJ. Nulo = XML de CNPJ que não está na
  /// carteira (nota de compra, ou empresa não cadastrada) — a linha existe para
  /// a tela poder dizer o que ignorou e por quê.
  empresaId String? @map("empresa_id")

  /// CNPJ do emitente, só dígitos. Guardado mesmo com empresaId preenchido:
  /// é o que permite reprocessar o vínculo se a empresa for cadastrada depois.
  cnpjEmitente String @map("cnpj_emitente") @db.VarChar(14)
  cnpjDestinatario String? @map("cnpj_destinatario") @db.VarChar(14)
  nomeDestinatario String? @map("nome_destinatario")

  /// 55 = NF-e, 65 = NFC-e, 13 = NFS-e nacional (Fase 3)
  modelo String @db.VarChar(2)
  serie  String @db.VarChar(3)
  numero Int

  /// Emissão, como veio no XML (com fuso). E a competência derivada dela.
  emitidoEm DateTime @map("emitido_em")
  ano       Int
  mes       Int

  /// 0 = entrada, 1 = saída
  tipoOperacao String @map("tipo_operacao") @db.VarChar(1)
  /// 1 normal, 2 complementar, 3 ajuste, 4 devolução
  finalidade   String @db.VarChar(1)
  naturezaOperacao String? @map("natureza_operacao")

  /// AUTORIZADA, CANCELADA, DENEGADA, INUTILIZADA
  situacao String @default("AUTORIZADA")
  /// cStat do protocolo, cru. Para auditar decisão de situação.
  statusSefaz String? @map("status_sefaz") @db.VarChar(3)
  protocolo   String? @db.VarChar(15)

  /// Valor total da nota (vNF) e o dos produtos (vProd), separados: a diferença
  /// entre os dois é frete/desconto/ST, e é a primeira coisa que se confere
  /// quando o total não fecha com a expectativa do contador.
  valorTotal   Decimal @map("valor_total") @db.Decimal(14, 2)
  valorProdutos Decimal? @map("valor_produtos") @db.Decimal(14, 2)

  /// Se ESTA linha soma no faturamento do mês. Coluna e não expressão: é o
  /// resultado de uma regra de negócio que muda (ver seção 4), e gravá-la
  /// permite explicar na tela POR QUE uma nota não entrou.
  contaFaturamento Boolean @default(false) @map("conta_faturamento")
  /// ENTRADA, CANCELADA, DEVOLUCAO, AJUSTE, NAO_AUTORIZADA, HOMOLOGACAO,
  /// EMPRESA_NAO_VINCULADA, TERCEIRO — nulo quando conta.
  motivoExclusao String? @map("motivo_exclusao")

  canceladoEm      DateTime? @map("cancelado_em")
  justificativaCancelamento String? @map("justificativa_cancelamento")

  /// Caminho relativo dentro de UPLOAD_DIR. Derivável da chave, guardado para
  /// não depender da regra de nomes se ela mudar.
  arquivo      String  @unique
  arquivoBytes Int     @map("arquivo_bytes")
  /// SHA-256 do conteúdo. Dois arquivos com a mesma chave e hash diferente é
  /// XML editado, e isso precisa aparecer.
  arquivoHash  String  @map("arquivo_hash") @db.VarChar(64)

  /// Autoria congelada, padrão do módulo (ver TarefaAnexo/TarefaLog).
  importadoPorId   String @map("importado_por_id")
  importadoPorNome String @map("importado_por_nome")
  importadoEm      DateTime @default(now()) @map("importado_em")

  /// Versão da regra que classificou esta linha. É o que permite reclassificar
  /// em lote quando a regra mudar, sem reprocessar o que já está certo — mesma
  /// ideia do PRAZO_ORIGEM_AUSENTE versionado da Expedição.
  versaoRegra Int @default(1) @map("versao_regra")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  empresa Empresa? @relation(fields: [empresaId], references: [id], onDelete: Restrict)

  @@index([empresaId, ano, mes])
  @@index([cnpjEmitente, ano, mes])
  @@index([empresaId, contaFaturamento, ano, mes])
  @@index([situacao])
  @@index([emitidoEm])
  @@index([versaoRegra])
  @@map("documento_fiscal")
}
```

Duas decisões que merecem justificativa explícita:

**`onDelete: Restrict` na empresa, não `Cascade`.** Todo o resto do módulo usa
Cascade, e aqui é errado: apagar uma empresa apagaria a nota fiscal dela, que é
documento com retenção legal de 5 anos e prova de um número já declarado ao banco.
O módulo já tem `RegistroExclusao` justamente porque exclusão física apagava
histórico. Restrict força a exclusão a falhar com mensagem — e essa é a resposta
certa para "quero apagar uma empresa que tem 4 mil notas importadas".

**`Decimal(14,2)` e não `(10,2)`.** O padrão do projeto é `(10,2)`, que estoura em
R$ 99.999.999,99. Nota fiscal de indústria passa disso. Aqui o teto tem de ser
maior que o de linha de venda de marketplace.

### 6.2 `FaturamentoMensal` — o número do mês, congelável

```prisma
/// Faturamento de uma empresa numa competência.
///
/// EXISTE SEPARADO da soma dos documentos por dois motivos que não se resolvem
/// com view: (a) o valor pode ser DIGITADO quando não há XML (mês anterior à
/// adoção do sistema, receita sem nota, empresa de serviço antes da Fase 3), e
/// (b) o valor usado numa declaração assinada tem de ficar CONGELADO — somar
/// documento em tempo de consulta faria a declaração de janeiro mudar de valor
/// quando alguém importasse um XML atrasado de janeiro.
model FaturamentoMensal {
  id        String @id @default(cuid())
  empresaId String @map("empresa_id")
  ano       Int
  mes       Int

  /// XML (somado dos documentos) | MANUAL (digitado) | MISTO
  origem String @default("XML")

  /// O valor que vale. Em MANUAL é o digitado; em XML é a soma apurada.
  valor Decimal @db.Decimal(14, 2)

  /// A soma apurada dos documentos, SEMPRE preenchida quando há documento —
  /// inclusive quando `origem = MANUAL`. É o que permite a tela mostrar
  /// "digitado R$ 50.000, XML soma R$ 47.320" em vez de esconder a divergência.
  valorApurado Decimal? @map("valor_apurado") @db.Decimal(14, 2)
  /// Quantos documentos entraram na soma. Zero com valor > 0 é o caso manual.
  documentos Int @default(0)
  apuradoEm  DateTime? @map("apurado_em")

  /// Justificativa obrigatória quando `origem` != XML ou quando o valor difere
  /// do apurado. Sem isto, ninguém sabe depois por que o número era outro.
  observacao String?

  /// Congelamento. Depois de entrar numa declaração emitida, o valor não muda
  /// mais por reapuração — precedente direto de `TarefaApuracao.concluidaEm`,
  /// que a derivação de status não desfaz ("encerrar congela o valor entregue").
  congeladoEm  DateTime? @map("congelado_em")
  congeladoPor String?   @map("congelado_por")

  definidoPorId   String @map("definido_por_id")
  definidoPorNome String @map("definido_por_nome")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Restrict)

  /// Espelha `empresa_competencia` de TarefaApuracao, de propósito: é a mesma
  /// linguagem de competência do módulo.
  @@unique([empresaId, ano, mes], name: "empresa_competencia_faturamento")
  @@index([empresaId, ano, mes])
  @@index([origem])
  @@index([congeladoEm])
  @@map("faturamento_mensal")
}
```

**Não tem FK para `TarefaApuracao`.** Tentador, e errado: `TarefaApuracao`
cascateia nos filhos, então excluir uma competência apagaria o faturamento — e
faturamento sobrevive à competência (mês anterior à adoção do sistema não tem
`TarefaApuracao` nenhuma). O casamento é pela chave natural `(empresaId, ano, mes)`,
que é a mesma dos dois lados.

### 6.3 `DeclaracaoFaturamento` — o documento emitido

```prisma
/// Uma declaração de faturamento emitida, com os valores CONGELADOS dentro.
///
/// APPEND-ONLY, como FormularioAbertura: declaração assinada que o escritório
/// pode reescrever depois não prova nada. Correção vira declaração NOVA, com
/// protocolo novo, e a anterior fica marcada como substituída.
model DeclaracaoFaturamento {
  id String @id @default(cuid())

  /// Protocolo legível, para ser ditado por telefone. Mesmo alfabeto do
  /// FormularioAbertura (sem 0/O e 1/I/L).
  protocolo String @unique

  empresaId String @map("empresa_id")

  /// Janela declarada. 12 meses é o caso comum, não a regra: o banco às vezes
  /// pede 6, e a coluna aceita.
  anoInicio Int @map("ano_inicio")
  mesInicio Int @map("mes_inicio")
  anoFim    Int @map("ano_fim")
  mesFim    Int @map("mes_fim")

  /// Os valores mês a mês NO MOMENTO DA EMISSÃO, congelados.
  /// [{ ano, mes, valor, origem }]. JSON e não tabela filha: é um documento
  /// emitido, lido inteiro, nunca consultado por mês — mesmo raciocínio do
  /// `dados` de FormularioAbertura.
  linhas Json

  valorTotal Decimal @map("valor_total") @db.Decimal(14, 2)
  mediaMensal Decimal @map("media_mensal") @db.Decimal(14, 2)

  /// Dados da empresa no dia da emissão, congelados: razão social e CNPJ mudam,
  /// e a declaração tem de continuar dizendo o que dizia.
  razaoSocialNaEmissao String @map("razao_social_na_emissao")
  cnpjNaEmissao        String @map("cnpj_na_emissao") @db.VarChar(14)
  regimeNaEmissao      String @map("regime_na_emissao")

  /// Para quem foi feita ("Banco do Brasil", "licitação X"). Texto livre.
  finalidade String?

  /// SUBSTITUIDA quando outra declaração cobre a mesma janela.
  situacao String @default("VIGENTE")
  substituidaPorId String? @map("substituida_por_id")

  emitidaPorId   String @map("emitida_por_id")
  emitidaPorNome String @map("emitida_por_nome")
  createdAt      DateTime @default(now()) @map("created_at")

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Restrict)

  @@index([empresaId, createdAt])
  @@index([situacao])
  @@map("declaracao_faturamento")
}
```

### 6.4 Lote de importação

```prisma
/// Uma sessão de importação. Existe para a pergunta "o que entrou naquele dia?"
/// ter resposta, e para o relatório por arquivo sobreviver ao fechamento da tela.
model ImportacaoXml {
  id String @id @default(cuid())

  /// Nulo quando o lote tem CNPJ de mais de uma empresa (pasta misturada).
  empresaId String? @map("empresa_id")

  arquivosEnviados Int @map("arquivos_enviados")
  importados       Int @default(0)
  duplicados       Int @default(0)
  ignorados        Int @default(0)
  comErro          Int @default(0)

  /// Relatório por arquivo: [{ arquivo, resultado, motivo, chave }].
  /// JSON pelo mesmo motivo de `linhas` acima: é lido inteiro, uma vez.
  relatorio Json?

  /// EM_ANDAMENTO, CONCLUIDA, INTERROMPIDA (estourou o orçamento de tempo)
  situacao String @default("EM_ANDAMENTO")

  importadoPorId   String @map("importado_por_id")
  importadoPorNome String @map("importado_por_nome")
  createdAt DateTime @default(now()) @map("created_at")

  empresa Empresa? @relation(fields: [empresaId], references: [id], onDelete: SetNull)

  @@index([empresaId, createdAt])
  @@index([createdAt])
  @@map("importacao_xml")
}
```

### 6.5 Log

O módulo já tem `TarefaLog` append-only, mas com FK para apuração **ou** processo —
nenhuma das duas serve aqui. Duas saídas:

- **(a)** acrescentar `empresaId` opcional a `TarefaLog` e três ações novas
  (`XML_IMPORTADO`, `FATURAMENTO_DEFINIDO`, `DECLARACAO_EMITIDA`) em `ACAO_LOG` +
  `ACAO_LOG_LABEL`. `acao` já é `String` livre no banco.
- **(b)** tabela própria.

**Proposta: (a).** A tela de auditoria é uma só, e o próprio schema explica que
`TarefaLog` unificou apuração e processo justamente para não ter duas tabelas
consultadas em toda tela. A migration precisa relaxar o CHECK de "exatamente uma
FK" para aceitar a terceira.

---

## 7. Pipeline de ingestão

Fases por arquivo, e a ordem importa:

```
1. GUARD         requireInterno (papéis: ADMIN, COMERCIAL, CONTABIL, CONTABIL_ASSISTENTE)
2. RECEBER       formData(), getAll("arquivos") → N arquivos
3. TRIAGEM       extensão, tamanho > 0, tamanho <= 1 MB, sem DOCTYPE
4. HASH          SHA-256 do conteúdo (identidade do arquivo)
5. PARSE         raiz → nfeProc | NFe | procEventoNFe | (NFS-e, fase 3)
6. EXTRAIR       chave, mod, serie, nNF, dhEmi, tpNF, tpAmb, finNFe, emit, vNF, cStat
7. CONFERIR      série/número/CNPJ das tags == os embutidos na chave
8. CASAR         cnpjEmitente → Empresa.cnpj (normalizarCnpj de src/lib/empresa.ts)
9. CLASSIFICAR   contaFaturamento + motivoExclusao (regras da seção 4)
10. GRAVAR       arquivo no disco → linha no banco, em transação com o log
11. AGREGAR      recalcular FaturamentoMensal das competências tocadas
```

Notas de implementação, todas ancoradas em padrão existente:

- **Erro por arquivo não derruba o lote.** É o padrão dos importadores de planilha
  (`try/catch` por linha + `errorDetails: [{ row, message }]`). Aqui o "row" é o
  nome do arquivo.
- **Arquivo primeiro, linha depois, `unlink` no catch** — a ordem já justificada
  em `src/app/api/tarefas/anexos/route.ts`: sobra de arquivo órfão custa disco;
  linha sem arquivo aparece como download quebrado.
- **Duplicado não é erro.** `chave` já existe + mesmo hash → conta em
  `duplicados` e segue. Mesma chave com hash **diferente** → erro nomeado
  (`XML_DIVERGENTE`), porque é nota editada.
- **Passo 11 é o único que agrega.** Recalcular a competência inteira (e não somar
  incrementalmente) é mais lento e é o certo: soma incremental erra para sempre se
  uma importação falhar no meio, e a competência tem centenas de linhas, não
  milhões.
- **Orçamento de tempo interno**, como em `estoque-full/sync`: ao estourar,
  interrompe, marca `ImportacaoXml.situacao = INTERROMPIDA` e devolve quantos
  faltaram. Sem `preview/commit` das planilhas: XML não tem ambiguidade de coluna
  para o operador resolver antes — ou é nota válida, ou não é. O relatório vem
  depois, não antes.

### 7.1 Reclassificação sem reimportar

`versaoRegra` é o mesmo mecanismo do `PRAZO_ORIGEM_AUSENTE` versionado da
Expedição, e existe pelo mesmo motivo: quando a regra da seção 4 mudar (e vai
mudar — a primeira revisão do escritório vai mexer nela), o conjunto a
reprocessar é `versaoRegra < ATUAL`, em lote por **número de linhas**, e cada
linha é reexaminada no máximo uma vez por versão. Sem isso, mudar a regra exigiria
reimportar todos os XMLs, e ninguém tem a pasta original de dois anos atrás.

---

## 8. Rotas propostas

Padrão do módulo: `NextResponse.json({ error, code }, { status })`, code em
MAIÚSCULA, validação manual com `textoLimpo`, guard na primeira linha.

| Rota | Método | O que faz |
|---|---|---|
| `/api/fiscal/xml/importar` | POST | multipart, N arquivos. Devolve o relatório. |
| `/api/fiscal/xml` | GET | Lista documentos. Filtros: `empresaId`, `competencia`, `modelo`, `serie`, `situacao`, `conta`, `busca`. Paginado (50/100, como `apuracao/route.ts`). |
| `/api/fiscal/xml/[id]` | GET | Baixa o XML original. Rota autenticada, nunca caminho estático. |
| `/api/fiscal/faturamento` | GET | Série mensal por empresa: apurado, definido, contagem, divergência. |
| `/api/fiscal/faturamento` | PUT | Define/ajusta valor de uma competência (`origem = MANUAL`), exige `observacao`. Recusa se `congeladoEm`. |
| `/api/fiscal/faturamento/reapurar` | POST | Recalcula competências a partir dos documentos. Respeita congelamento. |
| `/api/fiscal/declaracao` | POST | Emite declaração, congelando os valores. |
| `/api/fiscal/declaracao` | GET | Lista declarações emitidas. |
| `/api/fiscal/declaracao/[id]` | GET | Uma declaração, com as linhas congeladas. |

Códigos de erro:

`ARQUIVO_OBRIGATORIO`, `ARQUIVO_GRANDE` (413), `TIPO_NAO_ACEITO` (415),
`XML_INVALIDO`, `XML_COM_DOCTYPE`, `XML_DIVERGENTE`, `MODELO_NAO_SUPORTADO`,
`EMPRESA_NAO_ENCONTRADA` (404), `EMPRESA_SEM_CNPJ`, `COMPETENCIA_INVALIDA`,
`COMPETENCIA_CONGELADA` (409), `OBSERVACAO_OBRIGATORIA`, `SEM_FATURAMENTO_NO_PERIODO`,
`JANELA_INVALIDA`, `IMPORTACAO_EM_ANDAMENTO` (409).

### 8.1 Papéis

Reaproveitando os predicados de `src/lib/api-guard.ts` e o critério que já existe
lá (a escala do estrago decide):

| Ação | Quem | Análogo existente |
|---|---|---|
| Importar XML, listar, baixar | qualquer interno | `TarefaAnexo` |
| Definir faturamento manual | ADMIN, CONTABIL | `podeAlterarRegime` — é decisão contábil |
| Congelar / emitir declaração | ADMIN, CONTABIL | `podeEncerrarTarefa` — "congela o valor entregue" |
| Excluir documento importado | ADMIN | `podeExcluir` |

Predicados novos: `podeDefinirFaturamento`, `podeEmitirDeclaracao`.

---

## 9. Ordem de implementação

| Fase | Entrega | Verificável sem banco? |
|---|---|---|
| **0** ✅ | `scripts/diagnostico-xml.ts` — **feito**, resultado na seção 12 | Sim, é só leitura de arquivo |
| **1** | Parser puro (`src/lib/nfe-xml.ts`): bytes → objeto tipado | **Sim**, com XML fixo em `scripts/teste-nfe-xml.ts` |
| **2** | Classificador (`src/lib/faturamento-regras.ts`): documento → conta/não conta | **Sim**, função pura |
| **3** | Migration + model | Não |
| **4** | Rota de importação + gravação em disco | Não |
| **5** | Apuração mensal + reapuração em lote | Não |
| **6** | Faturamento manual + congelamento | Não |
| **7** | Declaração 12 meses | Não |
| **8** | NFS-e (layout nacional) | Fase 1 e 2 de novo, para o outro layout |

As fases 1 e 2 são funções puras e testáveis com `npx tsx`, no mesmo formato de
`scripts/teste-prazo-despacho.ts` (13 asserções, sem banco e sem token). É aí que a
correção do módulo se prova — não na tela.

---

## 10. Decisões que precisam do escritório

Nenhuma delas é técnica, e todas mudam o número:

0. **O faturamento de agosto/2026 da CINGAPURA é R$ 62.514,16 em 366 notas?** É o
   que o XML diz pela regra da seção 4 corrigida. Conferir contra o PGDAS-D do mês é
   o teste que valida o módulo inteiro — e, se divergir, a diferença é a informação
   mais valiosa deste projeto.
1. **A faixa de CFOP 51xx/61xx é a definição de venda?** É a regra que fecha ao
   centavo com a classificação do Mercado Livre, mas vale para o resto da carteira?
   E complementar soma, ajuste não soma, devolução não soma (em vez de subtrair)?
2. **Devolução abate o faturamento do mês?** Há escritório que abate e há que não.
   A tabela atual não abate.
3. **NFC-e entra junto com NF-e** no mesmo total, ou separado?
4. **Faturamento é por emissão ou por competência de escrituração?** A proposta usa
   `dhEmi`. Nota emitida em 31/01 e escriturada em fevereiro é o caso de borda.
5. **Empresa de serviço, antes da Fase 3:** valor 100% digitado, com observação
   obrigatória. Confirma?
6. **Declaração pode ser emitida com mês faltando?** A proposta recusa e diz qual
   mês falta — mas talvez o escritório queira emitir com zero declarado.
7. **Retenção do arquivo:** 5 anos é o mínimo legal. Guardar indefinidamente?

---

## 11. O que este documento NÃO resolve

- **Front-end.** Nada de tela aqui, por pedido explícito.
- **Busca automática de XML na SEFAZ** (DFe / manifestação do destinatário). Seria
  o próximo salto óbvio — o escritório para de depender do cliente mandar pasta —
  mas exige certificado digital A1 por empresa, guarda de chave privada e controle
  de NSU. É outro projeto, e mais arriscado que este inteiro.
- **CT-e, NFCom, NF3-e.** Fora do escopo.
- **Cálculo de imposto.** O módulo apura FATURAMENTO. Alíquota, anexo, Fator R e
  DAS são a apuração fiscal que já existe como fluxo de etapas.
- **Números do ambiente medidos.** Todos os limites citados foram lidos em
  arquivo de configuração; nada foi medido contra o banco ou o container em
  produção.

---

## 12. Fase 0 executada: o que o XML real disse

`scripts/diagnostico-xml.ts` rodado contra a pasta de agosto/2026 do grupo, conta
**CINGAPURA** (Mercado Livre). Somente leitura, sem banco e sem rede.

**822 arquivos XML, 5,8 MB.** Menor 4,9 KB, mediana 7,4 KB, maior 8,9 KB.

### 12.1 O que a pasta tinha

| Raiz do XML | Arquivos | Modelo |
|---|---|---|
| `nfeProc` | 458 | 55 (NF-e) |
| `cteProc` | 361 | 57 (CT-e) |
| `procEventoNFe` | 3 | — (evento) |

O exportador do Mercado Livre já separa em pastas: `venda` (366), `CT-e` (361),
`retiro simbólico` (63), `transferência` (21), `Canceladas` (6), `devolução` (5).
Útil como conferência — **e não usado como regra**, por 4.4.

### 12.2 Onde a minha regra estava errada

Aplicando a regra da versão anterior da seção 4 (produção + saída + autorizada +
não cancelada + `finNFe` 1 ou 2):

```
387 notas   R$ 63.270,86   <-- ERRADO
```

Aplicando com a faixa de CFOP 51xx/61xx:

```
366 notas   R$ 62.514,16   <-- bate com a pasta "NF-e de venda" AO CENTAVO
```

A diferença de **R$ 756,70** são 21 notas de "Remessa para Depósito Temporário" —
mercadoria saindo para o galpão do Mercado Livre, que é movimentação de estoque
próprio e não venda. Elas usam CFOP `5949`, `6949` e `6905`.

Que o total por CFOP feche exatamente com a classificação independente do
exportador é a melhor evidência disponível de que a regra está certa — são dois
critérios diferentes chegando no mesmo centavo.

### 12.3 Distribuições (458 NF-e)

| Campo | O que apareceu |
|---|---|
| Emitente | **100%** `50506775000101` NEXUS GROUP LTDA |
| CRT | **100%** `1` — Simples Nacional |
| `tpAmb` | **100%** `1` produção. Nenhuma nota de homologação. |
| `cStat` | **100%** `100` autorizada |
| Série | **100%** série `2` |
| Competência | **100%** `2026-08` |
| `tpNF` | 390 saída (85,2%) · **68 entrada (14,8%)** |
| `finNFe` | 453 normal · 5 devolução |
| Destinatário | **329 CPF (71,8%)** · 129 CNPJ |
| CFOP principal | `6108` em 240 notas (52,4%), R$ 46.556,37 |
| `NFref` | **131 de 458** referenciam outra nota |
| `vNF ≠ vProd` | 24 de 458 (há frete/desconto/ST) |

### 12.4 Sete achados que mudam o modelo de dados

1. **`cnpjDestinatario` está errado como nome de coluna.** 71,8% dos destinatários
   são **CPF** (venda a consumidor final). A coluna tem de ser
   `documentoDestinatario` aceitando 11 ou 14 dígitos, com `tipoDocumentoDestinatario`.
2. **A ponte com `meli_venda` existe, e está no nome do arquivo.** Os 461 arquivos
   do Mercado Livre são nomeados `<10 dígitos>_<chave de 44>-procNFe.xml`, e esse
   prefixo é o número do pedido — 461 de 461, sem exceção. Isso permite uma coluna
   `pedidoMarketplace` e liga documento fiscal a venda, ponte que **não existe em
   nenhum lugar do banco hoje**. Falta confirmar contra `meli_venda.order_id`, o que
   exige consulta ao banco.
3. **Os grupos IBS/CBS da Reforma Tributária JÁ estão na base**: presentes em 361
   dos 822 arquivos — exatamente os CT-e. A decisão de o parser ser tolerante a tag
   desconhecida deixou de ser precaução e passou a ser requisito com evidência.
4. **43,6% dos arquivos não declaram encoding** (são os CT-e). O padrão do XML é
   UTF-8 quando ausente, e o leitor tem de assumir isso em vez de falhar.
5. **Zero arquivos com DOCTYPE ou ENTITY.** A defesa proposta em 5.2 (recusar
   DOCTYPE antes de parsear) não vai recusar nada legítimo nesta base.
6. **A chave de acesso está 100% consistente** com as tags nas 458 notas — desde que
   comparada como NÚMERO. A tag traz `<serie>2</serie>` e a chave `002`; a tag
   `<nNF>7786</nNF>` e a chave `000007786`. Comparar como texto acusaria divergência
   em todas as notas.
7. **O CT-e do frete é emitido por seis CNPJs diferentes da mesma empresa**
   (`03007331004996` e cinco filiais, EBAZARCOMBR LTDA — o Mercado Livre), somando
   R$ 12.569,00. Nenhum casa com a carteira, e nem deveria.

### 12.5 Extrapolação de volume

Uma conta, um mês: 822 arquivos, 5,8 MB. O grupo tem 5 contas de Mercado Livre
(BRUXELAS, CINGAPURA, ESTOCOLMO, MOSCOU, TOKYO) mais Shopee e TikTok — ainda em
`.zip`, não analisadas.

Na mesma ordem de grandeza: **~50 mil arquivos e ~350 MB por ano** só de Mercado
Livre. Confirma duas decisões: o sharding de diretório de 5.5 é necessário (50 mil
arquivos num diretório é problema operacional), e o teto de 1 MB por XML de 5.2 é
folgado por duas ordens de grandeza.

### 12.6 O que a Fase 0 ainda não respondeu

- **Shopee e TikTok** continuam em `.zip` — não sei que documento eles trazem. Se
  for NFS-e ou nota de outro emitente, muda a Fase 3.
- **As outras quatro contas de ML** também estão em `.zip`. Espero o mesmo formato,
  mas o valor deste script é justamente não supor.
- **Se `50506775000101` está cadastrado em `Empresa`** — exige consulta ao banco,
  que não fiz.
- **Um mês só, uma conta só.** Nada aqui prova o comportamento de dezembro, de
  nota com muitos itens ou de emissor que não seja o do Mercado Livre.

> `XML/` foi acrescentado ao `.gitignore` nesta mesma passada. A pasta tinha 822
> notas fiscais reais, com CNPJ e endereço do cliente e o CPF de 329 compradores,
> **sem estar ignorada**, num repositório com remoto no GitHub.

---

### Fontes externas consultadas

- [Receita Federal — NFS-e nacional obrigatória para o Simples](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional)
- [Portal NFS-e — Emissor Nacional obrigatório (Resolução CGSN 189/2026)](https://www.gov.br/nfse/pt-br/noticias/nfs-e-e-simples-nacional-obrigatoriedade-de-emissao-atraves-do-emissor-nacional)
- [Portal NFS-e — Nota Técnica 009 (Reforma Tributária no layout da NFS-e)](https://www.gov.br/nfse/pt-br/noticias/publicada-a-nota-tecnica-009-da-nfs-e)
- [Inventti — NT 2025.002 v1.40 (novos grupos IBS/CBS na NF-e)](https://inventti.com.br/nt-2025-002-v1-40-da-nf-e-nfc-e-amplia-controles-da-reforma-tributaria-com-novos-campos-grupos-e-validacoes-de-ibs-e-cbs/)
- [NDD — NT 2025.002-RTC v1.10](https://ndd.tech/fiscal-blog/nota-tecnica-2025-002-rtc-v1-10-novas-regras-para-ibs-cbs-e-is-na-nf-e-e-nfc-e/)
- [Cálculo da RBT12 e proporcionalização](https://autoatendimento.contmatic.com.br/hc/pt-br/articles/52817448768275-Simples-Nacional-Como-%C3%A9-feito-o-c%C3%A1lculo-da-RBT12)
- CVEs do `fast-xml-parser` (2026): [GHSA-jmr7-xgp7-cmfj](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-jmr7-xgp7-cmfj), [CVE-2026-25128](https://github.com/advisories/GHSA-37qj-frw5-hhjh), [CVE-2026-33036](https://github.com/advisories/GHSA-8gc5-j5rx-235r)

*O conteúdo dessas fontes foi parafraseado e resumido para atender a restrições de licenciamento.*
