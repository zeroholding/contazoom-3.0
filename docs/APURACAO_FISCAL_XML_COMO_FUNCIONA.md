# Apuração fiscal por XML — como funciona, de ponta a ponta

Documento de orientação. Explica **do que se trata**, **onde queremos chegar**,
**o caminho que uma nota percorre**, **as URLs**, **as regras** e **o que ainda
falta**. Escrito para ser lido por quem vai operar a tela e por quem vai mexer no
código.

Complementa, não substitui:

- `docs/PLANO_XML_FATURAMENTO.md` — a análise técnica e o plano de back-end, com
  o modelo de dados justificado campo por campo e o resultado do diagnóstico.
- `scripts/diagnostico-xml.ts` — o script que leu 822 XMLs reais e produziu os
  números citados aqui.

---

## 1. Do que se trata

O escritório pediu três coisas, e elas dependem uma da outra **nesta ordem**:

1. **Ingestão** — um ambiente onde se joga o XML das notas e o sistema lê, para
   calcular o faturamento mensal por CNPJ.
2. **Apuração e conferência** — uma tela que mostre os valores das notas subidas,
   com período, série, número e situação.
3. **Declaração de faturamento de 12 meses** — o relatório gerado a partir do
   faturamento dos XMLs, ou de um valor digitado à mão.

A terceira é a que o cliente final enxerga: é o documento que o banco pede. E é
ela que impõe o requisito mais duro de todos.

> **O número tem de ser defensável.** Uma declaração assinada pelo escritório com
> valor errado é problema do escritório, não do sistema. Isso dita praticamente
> todas as decisões técnicas descritas abaixo.

---

## 2. Onde queremos chegar

O estado final desejado, em uma frase por etapa:

| Etapa | O que o operador faz | O que o sistema garante |
|---|---|---|
| Recebe a pasta do cliente | Arrasta os XMLs na tela | Reenviar a mesma pasta não duplica nada |
| Confere o mês | Olha os cartões e a tabela | Todo arquivo lido está visível, somando ou não, com o motivo |
| Ajusta o que precisa | Digita valor quando não há XML | Valor digitado exige justificativa registrada |
| Emite a declaração | Gera o PDF de 12 meses | Os valores ficam **congelados** no documento emitido |

E o critério de sucesso do módulo inteiro: **o total apurado tem de bater com o
PGDAS-D do mês.** Quando divergir, a diferença é a informação mais valiosa que
esse sistema produz.

---

## 3. O que está pronto hoje

Fases 1 a 6 do plano. A tela `/admin/tarefas/faturamento` deixou de ser maquete.

**Funciona hoje:** importar XML ou ZIP, abrir ZIPs grandes no navegador e enviar
em lotes, validar a assinatura digital ICP-Brasil, guardar o arquivo, classificar
cada documento, persistir CT-e como arquivo lido que não soma, reapurar a
competência, listar/filtrar/buscar as notas, baixar o XML original com conferência
de hash, digitar valor manual com justificativa, configurar série → canal e emitir
a declaração dos 12 meses como snapshot imutável para imprimir/salvar em PDF.

**Ainda não existe:** leitura de NFS-e (serviço). NF-e/NFC-e modelo 55/65,
CT-e reconhecido e eventos de cancelamento já estão cobertos.

> **Importante:** as migrations estão escritas e versionadas, mas não foram
> executadas localmente. O deploy aplica com `prisma migrate deploy` antes do
> build. Os testes desta entrega não usaram banco nem servidor real.

---

## 4. O caminho de uma nota, do arquivo até o número na tela

Este é o coração do documento. Onze passos, e a ordem importa em quase todos.

```
  [1] GUARD          requireInterno — ADMIN, COMERCIAL, CONTABIL, CONTABIL_ASSISTENTE
        |
  [2] RECEBER        formData().getAll("arquivos") — N arquivos de uma vez
        |
  [3] TRIAGEM        extensão .xml · tamanho > 0 · tamanho <= 1 MB
        |
  [4] LER TUDO       antes de gravar QUALQUER coisa (ver 4.1)
        |            separa em: notas | eventos | outro modelo
        |
  [5] CASAR          CNPJ do emitente -> Empresa.cnpj  (uma consulta para o lote)
        |
  [6] CLASSIFICAR    soma ou não soma, e por quê (ver seção 6)
        |
  [7] GRAVAR NOTAS   arquivo no disco -> linha no banco -> unlink se o banco falhar
        |
  [8] GRAVAR EVENTOS depois de TODAS as notas (ver 4.2)
        |
  [9] APURAR         recalcula a competência inteira, do zero
        |
 [10] RELATAR        uma linha por arquivo: o que foi feito e por quê
        |
 [11] RECARREGAR     a tela busca o resumo e a tabela de novo
```

### 4.1 Por que ler tudo antes de gravar

Leitura é pura e barata — regex sobre alguns KB, sem banco e sem rede. Ler o lote
inteiro primeiro dá duas coisas que não se conseguem de outro jeito:

- **A lista de CNPJs para UMA consulta.** 822 arquivos resolvidos um a um seriam
  822 consultas. O padrão do módulo é resolver a página inteira numa só.
- **A separação entre nota e evento**, que é o que permite o passo 8.

### 4.2 Por que o evento de cancelamento vem depois

O arquivo de cancelamento faz `UPDATE` numa nota que **já tem de existir**. Numa
pasta única, nota e cancelamento vêm juntos, e a ordem em que o navegador entrega
o multipart é a ordem do sistema de arquivos — ou seja, arbitrária.

Processando na ordem recebida, um cancelamento que chegasse antes da sua nota não
acharia nada, e a nota ficaria **autorizada para sempre, somando no faturamento**.

### 4.3 Por que o arquivo vai para o disco antes da linha

Se o disco falhar, não sobra linha apontando para arquivo inexistente. Se o banco
falhar, o arquivo é apagado no `catch`. A sobra possível é um arquivo órfão, que
custa disco; o inverso apareceria na tela como download quebrado.

### 4.4 Por que a apuração recalcula tudo

Soma incremental erra **para sempre** se uma importação falhar no meio. Recalcular
a competência inteira é mais lento e é o certo — são centenas de linhas, não
milhões.

---

## 5. As URLs

Todas exigem sessão de usuário interno. Nenhuma é pública.

### 5.1 Importar

```http
POST /api/fiscal/xml/importar
Content-Type: multipart/form-data

arquivos:   <File>   (repetido N vezes, máximo 300 por envio)
empresaId:  <id da empresa selecionada>
sessaoId:   <UUID compartilhado por todos os lotes do ZIP>
ultimoLote: 0 | 1
```

Resposta `201`:

```json
{
  "importacaoId": "clx...",
  "arquivosEnviados": 300,
  "importados": 128,
  "duplicados": 4,
  "ignorados": 165,
  "comErro": 3,
  "naoProcessados": 0,
  "situacao": "CONCLUIDA",
  "competenciasApuradas": [{ "empresaId": "clx...", "ano": 2026, "mes": 8 }],
  "relatorio": [
    { "arquivo": "2000018234927818_4126...xml",
      "resultado": "IMPORTADO", "chave": "4126...", "motivo": null, "code": null },
    { "arquivo": "cte_123.xml",
      "resultado": "IGNORADO", "chave": "4126...",
      "motivo": "Modelo que a apuração não soma (CT-e de frete, por exemplo) (modelo 57)",
      "code": "MODELO_NAO_APURADO" }
  ]
}
```

**Erros:** `400 ARQUIVO_OBRIGATORIO`, `400 EMPRESA_OBRIGATORIA`,
`400 SESSAO_INVALIDA`, `413 LOTE_GRANDE`, `413 ENVIO_GRANDE`,
`413 ARQUIVO_GRANDE`, `415 TIPO_NAO_ACEITO`, `400 ARQUIVO_VAZIO`,
`400 CORPO_INVALIDO`.

> **O teto de 300 é por número de arquivos, não por tempo.** Lição paga em
> produção neste projeto (`prazo-despacho-backfill.ts`): o teto de tempo era
> conferido antes da volta do laço, então toda chamada entregava o lote inteiro de
> qualquer forma — 120 MB de WAL e um checkpoint de 269 segundos travando o banco.
> A tela fatia em lotes de 300 e envia **em série**; em paralelo os lotes
> disputariam a reapuração da mesma competência.

### 5.2 Resumo da competência

```http
GET /api/fiscal/faturamento?empresaId=<id>&competencia=2026-08
```

Devolve tudo que a tela monta em volta da tabela, numa requisição só: contexto da
empresa, competências disponíveis, KPIs, faturamento definido, resumo por canal,
painel "fora do faturamento" e importações recentes.

Se `competencia` for omitida, o servidor escolhe **a mais recente que tenha
documento** — e não o mês corrente. Abrir no mês atual mostraria tela vazia para
quem acabou de importar agosto em setembro, e tela vazia depois de importação
bem-sucedida parece falha.

### 5.3 Valor declarado à mão

```http
PUT /api/fiscal/faturamento
{
  "empresaId": "clx...",
  "competencia": "2026-08",
  "origem": "MANUAL",
  "valor": 71000.00,
  "observacao": "Receita de serviço em NFS-e, ainda não importada."
}
```

Exige **ADMIN ou CONTABIL** (é decisão contábil, mesmo critério de
`podeAlterarRegime`). Recusa com `409 COMPETENCIA_CONGELADA` se o mês já entrou
numa declaração emitida. Justificativa é **obrigatória** no valor digitado:
sem ela, ninguém sabe depois por que o número era outro — e "depois" é quando o
banco questiona.

### 5.4 Lista de notas

```http
GET /api/fiscal/xml?empresaId=<id>&competencia=2026-08
    &canal=ML&situacao=AUTORIZADA&conta=sim&conferencia=sim
    &busca=7786&page=1&limit=50
```

Resposta: `{ documentos: [...], pagination: { total, page, limit, totalPages } }`.

A busca casa contra nome do destinatário, nome do emitente, natureza da operação,
e — quando o termo tem 3+ dígitos — chave de acesso, número do pedido, documento
do destinatário e número da nota.

### 5.5 Baixar o XML original

```http
GET /api/fiscal/xml/<id>
```

Devolve o arquivo como `attachment`. **Rota autenticada, nunca caminho estático:**
o XML tem CNPJ e endereço do cliente e o CPF do comprador — 329 CPFs num único
mês de uma única conta, na base analisada.

Devolve `410 ARQUIVO_AUSENTE` (e não 404) quando o registro existe mas o arquivo
se perdeu. Acontece se o volume de upload não estiver montado.

### 5.6 Mapa série → canal

```http
GET /api/fiscal/series?empresaId=<id>
PUT /api/fiscal/series   { "empresaId": "...", "series": [{ "serie": "2", "canal": "ML" }] }
```

O `GET` devolve também as **séries que aparecem nas notas e ninguém mapeou** — é a
lista de pendências. Sem isso, configurar exigiria adivinhar quais séries o
cliente usa, que é justamente a informação que o sistema já tem.

### 5.7 Período e declaração de 12 meses

```http
GET  /api/fiscal/faturamento/periodo?empresaId=<id>&fim=2026-08
GET  /api/fiscal/declaracao?empresaId=<id>
POST /api/fiscal/declaracao
GET  /api/fiscal/declaracao/<id>
```

O período sempre tem exatamente 12 competências contíguas. Mês ausente é
diferente de R$ 0,00 confirmado: enquanto houver ausência, a emissão é recusada.
O `POST` recebe empresa, mês final, finalidade e uma chave de idempotência. Na
mesma transação ele cria o snapshot, congela os 12 valores e substitui eventual
declaração anterior da mesma janela. Retry com a mesma chave devolve a mesma
emissão.

A página interna `/admin/tarefas/faturamento/declaracao/<id>` renderiza o snapshot
formal para **Imprimir / Salvar como PDF**. Declaração substituída leva aviso
também no papel, com o protocolo sucessor.

### 5.8 Revisar mês já declarado

```http
POST /api/fiscal/faturamento/revisar
{
  "empresaId": "...",
  "competencia": "2026-08",
  "motivo": "XML recebido depois da primeira declaração"
}
```

Libera o mês usando o apurado atual e grava um histórico append-only com valor
anterior, valor novo, autor e motivo. A declaração antiga não é editada. Depois da
correção, uma nova emissão recebe novo protocolo e marca a anterior como
substituída.

---

## 6. A regra: o que conta como faturamento

Esta é a parte que já esteve errada, e o dado real provou.

### 6.1 A história do erro de 1,2%

A primeira versão da regra era: **produção + saída + autorizada + não cancelada +
finalidade 1 ou 2**. Rodada contra agosto/2026 da conta CINGAPURA:

```
387 notas   R$ 63.270,86     <- ERRADO
```

Acrescentando a faixa de CFOP:

```
366 notas   R$ 62.514,16     <- bate AO CENTAVO com a pasta "NF-e de venda"
                                que o exportador do Mercado Livre separa
```

A diferença de **R$ 756,70** eram 21 notas de "Remessa para Depósito Temporário":
mercadoria saindo para o galpão do Mercado Livre. São **saída, autorizadas, em
produção, finalidade normal** — e não são receita.

Dois critérios independentes chegando no mesmo centavo é a melhor evidência
disponível de que a regra agora está certa.

### 6.2 A tabela da regra

| Condição | Soma? | Motivo registrado |
|---|---|---|
| Ambiente de homologação (`tpAmb = 2`) | **Recusa a importação** | `HOMOLOGACAO` |
| Modelo fora de 55/65 (CT-e, NFS-e) | Não | `MODELO_NAO_APURADO` |
| `cStat` diferente de 100 | Não | `NAO_AUTORIZADA` |
| Cancelada por evento | Não | `CANCELADA` |
| Nota recebida de terceiro (empresa é destinatária) | Não | `TERCEIRO` |
| CNPJ do emitente fora da carteira | Não | `EMPRESA_NAO_VINCULADA` |
| Entrada (`tpNF = 0`) | Não | `ENTRADA` |
| Devolução (`finNFe = 4`) | Não | `DEVOLUCAO` |
| Ajuste (`finNFe = 3`) | Não | `AJUSTE` |
| Sem CFOP nos itens | Não | `SEM_CFOP` |
| **CFOP fora de 51xx / 61xx** | Não | `FORA_DA_FAIXA_DE_VENDA` |
| Itens de venda **e** de movimentação na mesma nota | Não, pede conferência | `CFOP_MISTO` |
| Complementar (`finNFe = 2`) | **Sim** | — |
| NFC-e (modelo 65) | **Sim** | — |

**A ordem dos testes é a ordem da resposta.** Várias condições podem valer ao
mesmo tempo, e o motivo gravado é o primeiro que casa. A ordem vai do fato mais
grave e mais acionável para o mais rotineiro: quem vê "nota de teste" sabe que
subiu a pasta errada, enquanto "fora da faixa de venda" é esperado todo mês.

### 6.3 Por que CFOP, e por que whitelist

- **`natOp` não serve.** É texto livre. Na mesma pasta apareceram seis redações
  diferentes, incluindo "Outras Saidas - Remessa para Deposito Temporario".
  Depender disso é depender de o emissor não mudar a frase.
- **CFOP serve.** É código. O grupo 5.1xx / 6.1xx é "venda de produção própria ou
  de terceiros".
- **A faixa é WHITELIST.** O CFOP `5949`/`6949` é "outra saída não especificada",
  a lata de lixo do layout. Na base ele aparece nas remessas para o FULL, e amanhã
  pode aparecer em outra coisa. Uma blacklist faria toda saída desconhecida virar
  receita — errando **para cima**, que é o pior lado para um número que vai
  assinado ao banco.

### 6.4 As três armadilhas do dado real

**A nota cancelada continua dizendo que está autorizada.** Nas três notas
canceladas da amostra, o `cStat` dentro do próprio arquivo da nota é **100**. O
cancelamento vive **só** no arquivo de evento, que chega dias depois. Quem confia
no `cStat` da nota soma cancelada no faturamento.

**O nome da pasta não pode ser o critério.** É convenção do exportador, muda sem
avisar e não existe quando o arquivo chega por e-mail.

**Nota com itens de CFOP diferente existe.** A regra olha **todos** os itens, não
o primeiro. Quando a nota mistura venda e movimentação, ela não soma e é marcada
para conferência humana: somar o total inflaria a receita com a parte que é
movimentação, e ratear o `vNF` por item seria estimativa apresentada como fato,
porque o `vNF` carrega frete e desconto do documento inteiro.

---

## 7. Anatomia do XML, só o que interessa

```
nfeProc                         <- o arquivo distribuído (autorizado)
└─ NFe
   └─ infNFe  Id="NFe4131..."   <- 44 dígitos com o prefixo "NFe"
      ├─ ide
      │   ├─ mod                <- 55 = NF-e, 65 = NFC-e, 57 = CT-e
      │   ├─ serie, nNF         <- série e número
      │   ├─ dhEmi              <- emissão, com fuso: -03:00
      │   ├─ tpNF               <- 0 = entrada, 1 = SAÍDA
      │   ├─ tpAmb              <- 1 = produção, 2 = HOMOLOGAÇÃO
      │   └─ finNFe             <- 1 normal, 2 complementar, 3 ajuste, 4 DEVOLUÇÃO
      ├─ emit / CNPJ            <- casa com Empresa.cnpj
      ├─ dest / CNPJ ou CPF     <- 71,8% são CPF
      ├─ det (N vezes)
      │   └─ prod / CFOP        <- o discriminador da regra
      └─ total / ICMSTot
          ├─ vProd              <- soma dos produtos
          └─ vNF                <- VALOR TOTAL DA NOTA (é este que soma)
   └─ protNFe / infProt
      ├─ cStat                  <- 100 = autorizada
      └─ nProt
```

Cancelamento é **arquivo separado**, com raiz diferente:

```
procEventoNFe
└─ evento / infEvento
   ├─ chNFe                     <- a chave da nota cancelada
   ├─ tpEvento                  <- 110111 = cancelamento
   └─ detEvento / xJust
└─ retEvento / infEvento
   └─ cStat                     <- 135/136 = registrado
```

### 7.1 A chave de acesso é a chave natural

44 dígitos, e ela **contém** quase tudo:

```
cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
```

Isso dá duas coisas de graça:

1. **Idempotência.** A chave não repete em lugar nenhum do país. Índice único
   nela faz reenviar a mesma pasta ser um no-op — e isso não é otimização, é
   requisito: o contador **vai** subir a mesma pasta duas vezes.
2. **Conferência.** Série, número, CNPJ e modelo lidos das tags têm de bater com
   os que a chave carrega. Quando não batem, o arquivo foi editado à mão, e a
   importação recusa.

> **A comparação é NUMÉRICA, e isso não é detalhe.** A tag traz `<serie>2</serie>`
> e a chave carrega `002`; a tag `<nNF>7786</nNF>` e a chave `000007786`. Comparar
> como texto acusaria divergência em **100% das notas** — foi medido.

---

## 8. O modelo de dados

Quatro tabelas, em `prisma/migrations/20260918120000_apuracao_fiscal_xml/`.

### `documento_fiscal` — uma linha por nota

Chaveada pela **chave de acesso** (`@unique`). Guarda o que o XML disse, mais a
decisão da regra (`conta_faturamento` + `motivo_exclusao`), mais onde o arquivo
está (`arquivo`, `arquivo_hash`), mais quem importou (autoria congelada).

Campos que merecem menção:

- **`documento_destinatario` + `tipo_documento_destinatario`** — e não
  `cnpj_destinatario`. Achado do diagnóstico: 71,8% são CPF. Uma coluna
  `VarChar(14)` chamada "cnpj" recusaria a maioria dos casos.
- **`cfops` (array)** — de todos os itens. Guardar só o primeiro esconderia
  exatamente o caso que precisa de conferência.
- **`pedido_marketplace`** — vem do **nome do arquivo**
  (`<order_id>_<chave>-procNFe.xml`), padrão do exportador do ML: 461 de 461
  arquivos na base. É a **única ponte** entre documento fiscal e venda de
  marketplace que existe no banco.
- **`arquivo_hash` (SHA-256)** — mesma chave com hash diferente é XML editado, e
  isso aparece como erro em vez de passar como duplicata inofensiva.
- **`versao_regra`** — permite reclassificar em lote quando a regra mudar, sem
  reimportar XML que ninguém tem mais.

Duas fugas do padrão do projeto, as duas deliberadas:

> **`onDelete: Restrict`, não `Cascade`.** Todo o resto do bloco contábil
> cascateia. Aqui apagar uma empresa apagaria as notas dela, que têm retenção
> legal de 5 anos e sustentam número já declarado. Restrict faz a exclusão
> **falhar com mensagem**, e essa é a resposta certa para "quero apagar uma
> empresa com 4 mil notas".

> **`Decimal(14,2)`, não `(10,2)`.** O padrão do projeto estoura em
> R$ 99.999.999,99, e nota de indústria passa disso.

E um CHECK que sustenta a tela:

```sql
CHECK (
  (conta_faturamento = true  AND motivo_exclusao IS NULL)
  OR
  (conta_faturamento = false AND motivo_exclusao IS NOT NULL)
)
```

Uma linha que não soma e não diz por quê desapareceria do painel "Fora do
faturamento", a contagem deixaria de fechar, e o operador concluiria que o sistema
comeu nota.

### `faturamento_mensal` — o número do mês, congelável

Existe **separado** da soma dos documentos, e não é view, por dois motivos que
view nenhuma resolve:

1. O valor pode ser **digitado** (mês anterior à adoção do sistema, receita sem
   nota, empresa de serviço antes da NFS-e).
2. O valor usado numa declaração assinada tem de ficar **congelado**. Somar
   documento em tempo de consulta faria a declaração de janeiro mudar de valor
   quando alguém importasse um XML atrasado de janeiro.

`valor_apurado` é **sempre** preenchido quando há documento, inclusive com
`origem = MANUAL`: é o que permite a tela mostrar "digitado R$ 50.000, XML soma
R$ 47.320" em vez de esconder a divergência.

### `importacao_xml` — a sessão de importação

Guarda o relatório por arquivo em JSON, para a pergunta "o que entrou naquele dia,
e o que foi recusado?" ter resposta depois de a tela fechar.

### `evento_fiscal` — cancelamento/correção em arquivo separado

Persiste o evento mesmo quando a nota ainda não chegou. Só cancelamentos com
assinatura válida, ambiente de produção, autor compatível e cStat 135, 136 ou 155
alteram a nota. Os demais ficam arquivados/rejeitados sem efeito.

### `arquivo_fiscal_ignorado` — CT-e e outros modelos

Mantém chave, competência, valor, hash e arquivo de documentos reconhecidos que
não entram na receita. É o que fecha `822 = 458 NF-e + 361 CT-e + 3 eventos` sem
inventar campos de NF-e num CT-e.

### `declaracao_faturamento` — snapshot dos 12 meses

Guarda protocolo, 12 linhas, total, média, snapshot da empresa, finalidade,
autoria, hash canônico e substituição. O papel/PDF é renderizado desse snapshot,
nunca de consulta viva.

### `faturamento_mensal_historico` — trilha de alteração

Append-only: registra definição, alteração e liberação de mês congelado com valor
anterior/novo, autor e motivo.

### `empresa_serie_canal` — o mapa série → canal

Ver seção 10.

---

## 9. Os arquivos do código

| Arquivo | O que faz |
|---|---|
| `src/lib/nfe-xml.ts` | **Parser.** Bytes → objeto tipado. Puro, sem banco. |
| `src/lib/faturamento-regras.ts` | **Classificador.** Documento → soma ou não, e por quê. Puro. |
| `src/lib/faturamento-canais.ts` | Vocabulário de canal (rótulo, logo, cor). Sem imports, serve servidor e navegador. |
| `src/lib/xml-assinatura.ts` | Valida XMLDSig, certificado ICP-Brasil, CNPJ e nó realmente assinado. |
| `src/lib/fiscal-zip.ts` | Abre ZIP no navegador com limites contra zip bomb/path traversal. |
| `src/lib/fiscal-xml-disco.ts` | Onde o arquivo mora e como o caminho é validado. |
| `src/lib/fiscal-xml-import.ts` | **Pipeline.** Sessão multi-lote, notas, eventos, CT-e e `apurarCompetencia`. |
| `src/lib/faturamento-consulta.ts` | Consultas compartilhadas de competência/canal/exclusões. |
| `src/lib/declaracao-faturamento.ts` | Janela de 12 meses, snapshot, hash, congelamento e substituição. |
| `scripts/teste-nfe-xml.ts` | Testes puros do parser e classificador. |
| `scripts/teste-zip-fiscal.ts` | Limites sintéticos + abertura dos 22 ZIPs reais. |
| `scripts/teste-assinatura-xml.ts` | Assinaturas reais, adulteração de vNF e 46 eventos. |
| `scripts/teste-cingapura-producao.ts` | Aceitação completa dos 822 arquivos, ao centavo. |
| `scripts/teste-declaracao-faturamento.ts` | Janela contígua e hash JSON canônico. |
| `src/app/api/fiscal/**` | Importação, leitura, revisão e declaração. |
| `src/app/components/views/FaturamentoXmlView.tsx` | Tela mensal e integração XML/ZIP. |
| `src/app/components/views/fiscal/*` | Grade de 12 meses e folha imprimível. |

### 9.1 Parser de campos e validação da assinatura

A extração dos campos fiscais continua tolerante a tags novas: lê apenas o que o
módulo precisa e ignora grupos desconhecidos (incluindo IBS/CBS). Antes de usar
`vNF`, CFOP, CNPJ, operação ou finalidade, porém, a importação valida o XMLDSig
com o certificado X.509 embutido, confere a assinatura criptográfica, o CNPJ e
a validade do certificado, e usa **somente o nó assinado**. Isso bloqueia alteração
de valor e ataques que coloquem um `infNFe` falso antes do conteúdo autenticado.
A cadeia/revogação até a AC Raiz ICP-Brasil não é validada nesta fase; ver a
limitação da seção 13.

A decisão evita um parser de objeto completo para a extração econômica: o módulo
precisa de poucas tags, o container não declara memória ilimitada e o layout muda
com notas técnicas. O DOM entra somente para a canonicalização e verificação da
assinatura, através de `xml-crypto` e `@xmldom/xmldom`, ambos fixados por versão.

DOCTYPE/ENTITY continuam recusados antes de qualquer parse. Nas amostras reais,
37 assinaturas diretas foram validadas; a varredura adicional confirmou 46 eventos
nos ZIPs (43× cStat 135 e 3× cStat 155). Adulterar `vNF` fez o arquivo ser
recusado.

---

## 10. O mapa série → canal, e por que ele existe

> **A NF-e não tem campo de marketplace. Nenhum.** O layout não prevê, porque
> canal de venda não é informação fiscal.

O que existe é convenção do emissor: quem vende em vários marketplaces costuma
reservar **uma série por canal**. Na base analisada, 100% das notas são série 2 —
uma conta, um canal.

Então o canal vem de uma tabela onde o escritório **declara** o mapa. Deduzir do
nome do arquivo ou do CFOP erraria em silêncio, e silêncio num número que vai ao
banco é o pior defeito possível.

O mapa é **por empresa**, não global: cada cliente numera série como quiser, e a
série 2 de um não tem relação com a série 2 do outro.

Série que aparece em nota e ninguém declarou cai num balde chamado **"sem série
mapeada"** — que não é um canal. Jogá-la em "Outro canal" esconderia a falta de
configuração, e o resumo por canal mentiria por omissão.

---

## 11. Segurança

**XML de upload é entrada hostil.** Não é paranoia, é a superfície clássica:

- **XXE** — `<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>` faz o
  parser ler arquivo do servidor.
- **Billion laughs** — entidade que se expande até estourar a memória.

A defesa que **não depende de biblioteca nem de versão**: recusar `<!DOCTYPE` e
`<!ENTITY` antes de parsear. XML fiscal legítimo não tem DTD — zero ocorrências
nos 822 arquivos. Como a extração é por regex, não há resolvedor de entidade para
explorar; a checagem fica como segunda barreira e como sinal de que o arquivo não
é o que diz ser.

Mais três tetos e uma validação:

- **1 MB por XML.** Uma NF-e tem 5–15 KB; nota com 500 itens chega a centenas de
  KB. O teto é folgado por duas ordens de grandeza.
- **300 arquivos por envio.**
- **Caminho por whitelist.** O caminho no disco tem de casar exatamente
  `14 dígitos / AAAA-MM / 44 dígitos .xml`. Exigir o formato rejeita `..`,
  `%2e%2e`, barra invertida, caminho absoluto e byte nulo **de uma vez**, sem
  precisar prever cada variante. A conferência acontece na leitura, não só na
  escrita: o banco não é fronteira de confiança para caminho.
- **Download autenticado**, nunca arquivo estático.

E um registro histórico: a pasta `XML/` **não estava no `.gitignore`**. Eram 822
notas reais com CNPJ e endereço do cliente e o CPF de 329 compradores, soltas num
repositório com remoto no GitHub. Foi corrigido, com o motivo escrito no próprio
`.gitignore`.

---

## 12. O que temos para testar

Inventário real de `XML/XML GRUPO NEXUS 202608/`:

### Mercado Livre — 5 contas

| Conta | venda | full | devolução | CT-e | Razão social no CT-e |
|---|---|---|---|---|---|
| BRUXELAS | 6,4 MB | 2,2 MB | 60 KB | 5,2 MB | `59263727LUANACE` |
| CINGAPURA | 2,9 MB | 656 KB | 38 KB | 2,5 MB | `NEXUSGROUPLTDA` |
| ESTOCOLMO | 9,5 MB | 4,9 MB | 77 KB | 7,9 MB | `RAFAHMIXLTDA` |
| MOSCOU | 11,0 MB | 6,7 MB | 185 KB | 8,9 MB | `GIANLUCCACAMPOS` |
| TOKYO | 24,9 MB | 3,0 MB | 257 KB | 21,1 MB | `NOAHMIXUTILIDAD` |

### Outros canais

| Canal | Arquivo | Tamanho |
|---|---|---|
| Shopee | `1854389741_NFe_Vendas_20260801_20260831_xml.zip` | 7,8 MB |
| TikTok | `invoice_20260902122621_1.zip` | 1,6 MB |

Só a CINGAPURA está descompactada por completo. É a linha de base do teste de
aceitação: 822 arquivos (458 NF-e, 361 CT-e e 3 eventos), 366 notas de venda e
R$ 62.514,16.

### 12.1 Três coisas que este inventário já revela

**O grupo tem cinco CNPJs, não um.** O upload é sempre feito com uma empresa
selecionada. NF-e emitida por outro CNPJ é recusada; nota recebida de terceiro é
relatada e não ocupa a chave global da nota, para a emitente poder importá-la
depois. CT-e só é arquivado para a empresa selecionada quando o CNPJ dela aparece
no próprio documento.

**O volume não é uniforme.** O `venda` da TOKYO é 8× o da CINGAPURA. Se CINGAPURA
tem 366 notas, TOKYO deve passar de 2.500 — o que significa nove ou dez envios de
300 arquivos, só para uma conta e um mês.

**Shopee e TikTok foram validados.** As amostras dos dois canais são NF-e modelo
55 do mesmo CNPJ da conta correspondente. Shopee usa série 5; TikTok usa série 6.
Ambos passaram pela validação de assinatura e pela regra de CFOP.

### 12.2 O teste de aceitação

O teste automatizado com o parser de produção — incluindo assinatura digital e
cancelamentos 135/155 — já fechou:

```
822 arquivos · 458 NF-e · 361 CT-e · 3 eventos
3 cancelamentos · 366 notas somando · R$ 62.514,16 · 0 erros
```

Esse resultado bate ao centavo com o diagnóstico independente e com a
classificação do exportador do Mercado Livre.

> **ZIP é aceito pela tela.** `fflate@0.8.3` abre no navegador e preserva até
> entradas físicas com o mesmo nome (a amostra Shopee tem 23 duplicatas idênticas).
> Limites: 32 MiB comprimidos, 64 MiB expandidos, 5.000 XMLs, 1 MiB por XML e
> razão máxima 200:1. O servidor recebe lotes de 300, nunca o ZIP expandido inteiro.

---

## 13. Limitações conhecidas, declaradas

- **NFS-e não é lida.** Empresa de serviço pode ter **zero** NF-e e faturar todo
  mês. Até essa fase, o valor dela é digitado com justificativa.
- **PDF é produzido pelo navegador.** O banco guarda o snapshot imutável, o
  protocolo e o hash; a página formal usa Imprimir/Salvar como PDF. Não existe
  assinatura digital do PDF gerado pelo navegador.
- **Validação SEFAZ é documental, não consulta online.** O sistema verifica a
  assinatura XMLDSig com o certificado folha embutido, confere CNPJ, validade e
  usa somente o nó assinado — isso detecta adulteração de valor/CFOP e wrapping.
  Ele **não valida a cadeia completa/revogação até a AC Raiz ICP-Brasil** e não
  consulta o webservice da SEFAZ em tempo real; portanto não substitui uma
  consulta oficial de situação.
- **Migrations não foram executadas localmente.** Verificação feita com schema,
  tipos, lint, build e testes sem banco real.

### 13.1 O aviso que precisa estar no relatório

> **Somatório de XML não é faturamento declarado.** O faturamento declarado é o
> que está no PGDAS-D (Simples) ou na EFD-Contribuições (Presumido), e ele pode
> divergir legitimamente: receita de serviço em NFS-e, regime de caixa vs
> competência, receita sem nota, segregação por anexo do Simples.

O que este módulo entrega é **faturamento apurado por documento fiscal**, que
serve para conferir, para gerar declaração e para achar divergência. Chamar de
"faturamento declarado" sem essa ressalva é criar um número que vai ser usado como
prova e não é.

---

## 14. Decisões que dependem do escritório

Nenhuma é técnica, e todas mudam o número.

0. **Os R$ 62.514,16 de agosto/2026 da CINGAPURA batem com o PGDAS-D?** É o teste
   que valida o módulo inteiro.
1. **A faixa de CFOP 51xx/61xx é a definição de venda** para o resto da carteira,
   ou só para o Mercado Livre?
2. **Devolução abate o faturamento do mês?** Hoje não abate — há escritório que
   abate e há que não.
3. **NFC-e entra no mesmo total da NF-e**, ou separado?
4. **Faturamento é por emissão ou por competência de escrituração?** Hoje usa
   `dhEmi`. Nota emitida em 31/01 e escriturada em fevereiro é o caso de borda.
5. **Empresa de serviço, antes da NFS-e:** valor 100% digitado com justificativa
   obrigatória. Confirma?
6. **Declaração com mês faltando:** o sistema recusa e diz quais meses faltam;
   R$ 0,00 precisa ser confirmado como valor manual, nunca inferido de ausência.
7. **Retenção do arquivo:** 5 anos é o mínimo legal. Guardar indefinidamente?

---

## 15. Próximos passos, na ordem

1. **Conferir quais CNPJs estão cadastrados em `Empresa`.** O upload é sempre
   contextual e recusa arquivo emitido por outro CNPJ.
2. **Importar a amostra validada e confirmar 822 arquivos, 366 notas e o total de
   referência.** O teste automatizado já fecha esses números sem banco.
3. **Mapear as séries por canal:** Mercado Livre usa 1 ou 2 conforme a empresa;
   Shopee usa 5; TikTok usa 6 na amostra.
4. **Conferir o total contra o PGDAS-D** e levar a divergência ao escritório.
5. **Preencher os 12 meses** (XML ou manual) e emitir a declaração.
6. **Próxima fase:** NFS-e nacional.
