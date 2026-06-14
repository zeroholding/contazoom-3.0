# Upload por planilha - SKU e financeiro

## Objetivo

Implementar, de ponta a ponta, a importacao e exportacao por planilha para:

- cadastro de SKUs;
- contas a pagar;
- contas a receber;
- categorias financeiras;
- formas de pagamento.

O fluxo deve aproveitar as regras de negocio ja existentes no cadastro manual,
preservar historico de custo, recalculo retroativo das vendas e atualizacao dos
indicadores de SKUs pendentes.

## Diagnostico inicial

### Estado encontrado

- A interface de importacao de SKU ja existe em
  `src/app/components/views/ui/ImportSKUExcelModal.tsx`.
- A interface de importacao financeira ja existe em
  `src/app/components/views/ui/ImportFinanceModal.tsx`.
- Os botoes de modelo, importacao e exportacao ja apontam para URLs internas.
- A dependencia `xlsx` ja esta instalada no projeto.
- Os endpoints chamados pelas interfaces nao existem:
  - `POST /api/sku/import`
  - `GET /api/sku/template`
  - `GET /api/sku/export`
  - `POST /api/financeiro/import-excel`
  - `GET /api/financeiro/download-template`

### Causa raiz

O recurso foi iniciado apenas na camada visual. Como o Next.js nao possui
rewrites ou um backend externo para essas URLs, as requisicoes terminam em 404.

### Regras existentes que nao podem ser perdidas

- SKU e unico por usuario.
- Cadastro de custo gera `SKUCustoHistorico`.
- Primeiro custo valido deve ser aplicado retroativamente nas vendas do SKU.
- Alteracoes de SKU devem invalidar o cache de vendas.
- Kits e SKUs filhos precisam manter o relacionamento `skuPai`.
- Um SKU ativo com custo zero continua aparecendo como `Sem custo`.
- Um SKU encontrado nas vendas e ainda nao cadastrado aparece como
  `Sem cadastro`.
- Contas importadas devem ter origem `EXCEL`.

## Decisoes tecnicas

### Leitura e normalizacao

Sera criada uma camada compartilhada para:

- validar extensao e tamanho do arquivo;
- ler XLSX, XLS e CSV;
- normalizar cabecalhos com ou sem acentos;
- interpretar moeda brasileira e valores numericos;
- interpretar datas do Excel, ISO e `DD/MM/AAAA`;
- interpretar booleanos como `Sim/Nao`, `Ativo/Inativo`, `1/0`;
- limitar quantidade de linhas para proteger o servidor;
- produzir erros com numero da linha e campo relacionado.

### Duplicidade de SKU

SKUs ja cadastrados para o usuario serao ignorados e informados no relatorio.
Essa decisao segue o texto atual da interface e evita sobrescrever custo ou
estrutura de kit silenciosamente.

### Duplicidade financeira

Uma nova importacao nao deve duplicar registros identicos. A verificacao sera
feita com uma chave normalizada composta pelos dados relevantes da linha:
descricao, valor, datas, categoria e forma de pagamento. Linhas repetidas no
mesmo arquivo e registros equivalentes ja existentes serao ignorados e
informados no relatorio.

### Categorias e formas de pagamento

Os nomes informados na planilha serao resolvidos sem diferenca entre
maiusculas/minusculas e acentos. Quando nao existirem:

- a categoria sera criada com o tipo coerente com a importacao;
- a forma de pagamento sera criada automaticamente.

Isso permite que uma planilha completa seja importada sem uma preparacao manual
anterior. Toda criacao automatica sera contabilizada no resultado.

### Status financeiro

- conta a pagar com data de pagamento: `PAGO`;
- conta a pagar sem data de pagamento: `PENDENTE`;
- conta a receber com data de recebimento: `RECEBIDO`;
- conta a receber sem data de recebimento: `PENDENTE`.

### Processamento de kits

O importador fara o cadastro em etapas para garantir que todos os SKUs existam
antes de gravar os relacionamentos. Ao final, os filhos serao vinculados aos
respectivos pais e a estrutura sera validada.

## Plano de execucao

| Etapa | Status | Entrega |
| --- | --- | --- |
| 1. Documento tecnico vivo | Em andamento | Escopo, diagnostico, decisoes e criterios |
| 2. Mapeamento dos contratos existentes | Concluido | Modelos, APIs, componentes e regras |
| 3. Infraestrutura compartilhada | Concluido | Parser, normalizadores e relatorio |
| 4. Fluxo de SKU | Concluido | Modelo, importacao e exportacao |
| 5. Fluxo financeiro | Concluido | Modelos e importacao por tipo |
| 6. Integracao da interface | Concluido | Feedback detalhado e validacoes |
| 7. Testes e validacao | Em andamento | Casos unitarios, build e fluxos |
| 8. Revisao e entrega Git | Pendente | Diff revisado, commit e push |

## Criterios de aceite

### SKU

- Baixar um arquivo modelo valido.
- Importar XLSX ou XLS com cabecalhos documentados.
- Exportar os SKUs cadastrados respeitando os filtros enviados.
- Ignorar duplicados sem alterar registros existentes.
- Criar historico para custos importados.
- Aplicar o primeiro custo valido retroativamente nas vendas.
- Preservar kits, filhos e `skuPai`.
- Atualizar os indicadores de `Sem cadastro` e `Sem custo`.
- Exibir totais de sucesso, ignorados e erros por linha.

### Financeiro

- Baixar um modelo especifico para cada tipo.
- Importar XLSX, XLS ou CSV.
- Resolver ou criar categorias e formas de pagamento.
- Gravar contas com origem `EXCEL`.
- Definir corretamente status e datas.
- Evitar duplicacao ao reenviar a mesma planilha.
- Enviar progresso e resultado no formato consumido pelo modal atual.
- Exibir erros por linha sem abortar todo o arquivo.

## Registro de implementacao

### 2026-06-14 - Inicio

- Confirmada a existencia das interfaces sem os respectivos endpoints.
- Confirmada a dependencia `xlsx`.
- Mapeadas as principais regras de SKU e financeiro.
- Definidas as politicas iniciais de duplicidade, relacionamentos e criacao de
  cadastros auxiliares.

### 2026-06-14 - Infraestrutura compartilhada

- Criado `src/lib/spreadsheet.ts`.
- Adicionada validacao de extensao, arquivo vazio, limite de 10 MB e limite de
  5.000 linhas.
- A leitura usa a primeira aba e preserva a numeracao original da linha para
  mensagens de erro.
- Cabecalhos sao normalizados removendo acentos, espacos e pontuacao.
- Valores monetarios aceitam numero nativo, formato brasileiro, formato
  internacional e negativos entre parenteses.
- Datas aceitam celula de data, numero serial do Excel, `DD/MM/AAAA` e ISO.
- Booleanos aceitam variacoes textuais e numericas.
- Criado formato padrao de relatorio com sucesso, ignorados e erros detalhados.

### 2026-06-14 - Endpoints de SKU

- Criado `GET /api/sku/template` com abas `SKUs` e `Instrucoes`.
- Criado `GET /api/sku/export` respeitando os filtros de tipo e status ativo.
- Criado `POST /api/sku/import`.
- A importacao:
  - valida e normaliza cada linha;
  - rejeita custo ou quantidade malformados sem substituir silenciosamente;
  - ignora duplicados existentes e repetidos no arquivo;
  - cadastra kits antes dos itens individuais;
  - cria historico de custo para itens individuais;
  - aplica custo positivo retroativamente nas vendas ML e Shopee;
  - vincula filhos aos kits depois que todos os registros existem;
  - invalida os caches de SKU e vendas uma unica vez ao final.

### 2026-06-14 - Endpoints financeiros

- Criado `GET /api/financeiro/download-template`.
- O modelo e gerado especificamente para contas a pagar, contas a receber,
  categorias ou formas de pagamento.
- Criado `POST /api/financeiro/import-excel`.
- O endpoint responde em SSE no contrato que o modal existente ja consumia.
- O processamento envia inicio, progresso a cada dez linhas, conclusao e erro
  fatal.
- Contas a pagar e receber:
  - exigem descricao, valor positivo e data de vencimento;
  - aceitam data de pagamento/recebimento opcional;
  - definem status `pago`, `recebido` ou `pendente`;
  - sao gravadas com origem `EXCEL`;
  - criam categoria e forma de pagamento ausentes;
  - ignoram registros equivalentes existentes ou repetidos no mesmo arquivo.
- Categorias sao comparadas por nome normalizado e tipo.
- Formas de pagamento sao comparadas por nome normalizado.

### 2026-06-14 - Integracao dos modais

- SKU passou a aceitar XLSX, XLS e CSV.
- Financeiro passou a validar tambem pela extensao, pois navegadores podem
  enviar o MIME vazio ou generico.
- Corrigido o tratamento de resposta de erro: a mensagem da API nao e mais
  descartada pelo `catch` do parse JSON.
- O progresso financeiro agora mostra total, importados, ignorados e erros.
- As instrucoes foram corrigidas para indicar apenas os campos realmente
  obrigatorios.
- Valores monetarios sao documentados como compativeis com ponto ou virgula.

## Validacoes executadas

### TypeScript inicial

Comando:

```text
npx tsc --noEmit
```

Resultado:

- o projeto possui erros TypeScript anteriores a esta demanda em arquivos de
  vendas, Shopee, hooks, documentos e configuracao;
- foram encontrados dois erros novos no importador de SKU relacionados ao tipo
  JSON nullable do Prisma;
- os dois erros da implementacao foram corrigidos usando campo omitido quando a
  lista esta vazia;
- os erros preexistentes serao mantidos fora do escopo e o build oficial do
  projeto tambem sera executado, pois a configuracao atual ignora erros de
  TypeScript no build.

### ESLint focado

Foram verificados apenas os arquivos criados ou alterados nesta entrega.

Resultado:

```text
ESLint: No issues found
```

### Teste real do parser

Foi gerado em memoria um arquivo XLSX real, lido novamente pelo mesmo parser
usado pelas APIs e validados:

- cabecalho com acento;
- valor `R$ 1.234,56`;
- valor internacional `1,234.56`;
- numero negativo entre parenteses;
- data `14/06/2026`;
- booleano `Sim`;
- lista separada por ponto e virgula;
- numeracao da linha original.

Resultado:

```text
Spreadsheet validation passed.
```

O script temporario de validacao foi removido depois da execucao para nao
adicionar manutencao artificial ao repositorio.

### Build oficial do projeto

O comando `npm run build` executa migracoes Prisma antes do Next. Ele parou
porque o ambiente local nao possui `DATABASE_URL`; nenhuma migracao nova foi
criada por esta entrega.

### Build direto do Next

Comando:

```text
npx next build
```

Resultado:

- compilacao concluida;
- 79 paginas geradas;
- os cinco novos endpoints apareceram no manifesto de rotas:
  - `/api/sku/template`;
  - `/api/sku/import`;
  - `/api/sku/export`;
  - `/api/financeiro/download-template`;
  - `/api/financeiro/import-excel`.

Avisos encontrados e anteriores a esta entrega:

- chave `eslint` nao reconhecida no `next.config.ts`;
- base `baseline-browser-mapping` desatualizada.
