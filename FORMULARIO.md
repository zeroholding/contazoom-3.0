# Formulário de Abertura de CNPJ — Legalização

Especificação da tela pública `https://app.contazoom.com.br/formulario`, que
substitui o Google Forms usado hoje para coletar os dados e documentos de
abertura de empresa.

> **Escopo desta fase: só a tela.** Nada de banco de dados. Nenhuma migração,
> nenhum model novo no Prisma, nenhuma tabela. O que esta fase entrega é o
> formulário completo, bonito, validado e com os documentos organizados por
> pessoa. Persistência e vínculo com o processo de legalização estão na seção
> [Fora de escopo](#16-fora-de-escopo-e-o-que-fica-pendente), com o contrato de
> dados já definido para a implementação depois ser mecânica.

**A tela não existe hoje.** `src/app/formulario/` não está criado. Tudo aqui é
construção nova, reaproveitando os componentes e validadores que já existem no
projeto.

---

## Índice

1. [Onde a tela vive](#1-onde-a-tela-vive)
2. [O formulário de hoje, transcrito](#2-o-formulário-de-hoje-transcrito)
3. [O que está errado hoje](#3-o-que-está-errado-hoje)
4. [A forma nova, em cinco telas](#4-a-forma-nova-em-cinco-telas)
5. [Passo 1 — Sócios](#5-passo-1--sócios)
6. [Passo 2 — A empresa](#6-passo-2--a-empresa)
7. [Passo 3 — Sociedade](#7-passo-3--sociedade)
8. [Passo 4 — Documentos](#8-passo-4--documentos)
9. [Passo 5 — Revisão e envio](#9-passo-5--revisão-e-envio)
10. [Todas as regras condicionais num lugar](#10-todas-as-regras-condicionais-num-lugar)
11. [Máscara, validação e busca de CEP](#11-máscara-validação-e-busca-de-cep)
12. [Upload](#12-upload)
13. [Layout](#13-layout)
14. [Rascunho local](#14-rascunho-local)
15. [Acessibilidade](#15-acessibilidade)
16. [Fora de escopo e o que fica pendente](#16-fora-de-escopo-e-o-que-fica-pendente)
17. [Contrato de dados](#17-contrato-de-dados)
18. [Arquivos a criar](#18-arquivos-a-criar)
19. [Critérios de aceite](#19-critérios-de-aceite)

---

## 1. Onde a tela vive

Rota: `/formulario`. Nasce **pública**, sem login.

Isso não é uma decisão nova, é como o app funciona: não existe `middleware.ts`
no projeto (procurado, não há), e `src/app/admin/` não tem `layout.tsx`. O
controle de acesso do painel é feito dentro dos componentes, via `useSessao`,
no cliente. Então uma rota nova em `src/app/formulario/` é acessível por
qualquer pessoa com o link — que é exatamente o que se quer aqui. O cliente
recebe o link do comercial e preenche.

O Google Forms atual exige conta Google para anexar arquivo. Cliente sem Gmail
não consegue enviar documento. Aqui não há login nenhum.

### Três detalhes de ambiente que afetam esta tela

Levantados lendo `src/app/layout.tsx` e `src/app/globals.css`:

| Item | Situação hoje | O que fazer |
|---|---|---|
| Fonte | `Plus_Jakarta_Sans` é carregada no root layout, mas aplicada só em `.cz-admin` e `.cz-auth` (globals.css, seletor da linha ~671). `.cz-tarefas` **não está** nessa lista | Adicionar `.cz-form` ao seletor de `font-family` em globals.css e usar `className="cz-form cz-tarefas"` no container. Sem isso a tela cai no fallback e sai com outra fonte |
| Fundo | `<body>` tem `bg-[#F3F3F3]` | O container da tela declara o seu próprio: `var(--cz-fundo)` = `#F8F9FB` |
| Idioma | root layout tem `<html lang="en">` | Declarar `lang="pt-BR"` no container da tela. Trocar no root afeta o app inteiro e é decisão separada. Sem isso o leitor de tela lê os rótulos em português com fonética inglesa e o autofill do navegador erra |

Os tokens de cor (`--cz-laranja`, `--cz-hairline`, `--cz-texto`, `--cz-elev-*`)
**já** valem em `.cz-tarefas`, então só a fonte precisa do ajuste.

---

## 2. O formulário de hoje, transcrito

Registro fiel do que existe, para ninguém perder pergunta na migração.

Cabeçalho: *"Abertura de CNPJ — Este formulário reúne todos os documentos
necessários para abertura de CNPJ."*

| # | Pergunta | Tipo | Obrigatória | Ajuda / opções |
|---|---|---|---|---|
| 1 | Nome(s) do(s) sócio(s) | texto | Sim | — |
| 2 | CPF do(s) sócio(s) | texto | Não | — |
| 3 | RG ou CNH do(s) Sócio(s) | upload | Não | até 5 arquivos, máx **100 MB** por item |
| 4 | Endereço Completo com CEP do(s) Sócio(s) | texto | Não | — |
| 5 | Comprovante de Residência do(s) Sócio(s) | upload | Não | até 5 arquivos, máx **10 MB** por item |
| 6 | Telefone do(s) Sócio(s) | texto | Não | — |
| 7 | E-mail do(s) Sócio(s) | texto | Não | — |
| 8 | Profissão do(s) sócio(s) | texto | Sim | — |
| 9 | Sócio(s) possui(em) Conta GOV? | Sim / Não | Não | — |
| 10 | Informe o seu estado civil [Se casado, informar Regime de Bens] | escolha | Sim | 8 opções (ver abaixo) |
| 11 | Se houver sócio, informe o estado civil dele(a) [Se casado, informar Regime de Bens] | escolha | Não | as mesmas 8 opções |
| 12 | Capital Social investido por cada sócio | texto | Sim | *"Utiliza um valor aproximado que será utilizado para iniciar a empresa, seja um aporte financeiro, valores de ativos como maquinários a serem considerados, entre outros. Não necessita ser exato"* |
| 13 | Quem irá exercer a administração da sociedade? | texto | Sim | — |
| 14 | Endereço da empresa COMPLETO, com CEP | texto | Sim | — |
| 15 | Anexar o IPTU do endereço que sua empresa estará situada | upload | Não | 1 arquivo, máx 100 MB |
| 16 | Três opções de nome para a Razão Social [Sim, precisam ser 03] | texto | Sim | *"Razão social, é o nome oficial do empreendimento no registro, usada em contratos, Nota Fiscal e documentos oficiais."* |
| 17 | Nome Fantasia | texto | Sim | *"O nome fantasia de uma empresa é como ela vai ser conhecida ou reconhecida pelo público. É definido na hora da formalização, considerando o mercado e a área de atuação."* |
| 18 | Quais Atividades que serão desenvolvidas na empresa? | texto | Sim | *"Gentileza descrever com detalhes os produtos a serem comercializados, o nicho, ou serviços prestados, para identificarmos os melhores CNAEs a serem utilizados no CNPJ"* |
| 19 | Se algum dos sócios possuir participação societária em outra empresa, qual enquadramento pertence (simples nacional ou regime geral)? | escolha | Não | Simples Nacional / Lucro Presumido / Lucro Real |
| 20 | Se algum dos sócios possuir participação societária em outra empresa, anexe o(s) contrato(s) social(is) | upload | Não | 1 arquivo, máx 100 MB |

As 8 opções de estado civil, literais: Solteiro(a) · Separado(a) · Divorciado(a)
· Viúvo(a) · Casado [Regime: COMUNHÃO UNIVERSAL DE BENS] · Casado [Regime:
COMUNHÃO PARCIAL DE BENS] · Casado [Regime: SEPARAÇÃO DE BENS] · Casado [Regime:
PARTICIPAÇÃO FINAL NOS AQUESTOS].

Nenhuma pergunta é perdida. Todas as 20 reaparecem na forma nova, algumas
divididas em mais de um campo.

---

## 3. O que está errado hoje

Cada item abaixo é um defeito real do formulário atual e o que ele custa. É a
lista que justifica a tela nova; se um item destes sobreviver na
implementação, a tela nova não resolveu nada.

**1. Tudo pluralizado num campo só.** "Nome(s) do(s) sócio(s)", "CPF do(s)
sócio(s)", "Profissão do(s) sócio(s)". A resposta volta como um blob de texto
— "João e Maria", "111... e 222..." — e alguém do escritório desembaralha à
mão para descobrir qual CPF é de quem. Erro de pareamento aqui vira erro no
contrato social.

**2. Upload sem dono.** "Faça upload de até 5 arquivos" para RG/CNH de todos os
sócios. Chegam 4 fotos e ninguém sabe quais duas são do João. Se os nomes de
arquivo forem `IMG_2841.jpg`, ninguém sabe de quem é nenhuma.

**3. Estado civil chumbado em dois sócios.** "Informe o **seu** estado civil" +
"Se houver sócio, informe o estado civil **dele(a)**". Com três sócios o
formulário não tem onde colocar o terceiro. A pessoa escreve em outro campo, ou
não escreve.

**4. Duas perguntas numa.** Estado civil e regime de bens estão fundidos nas 8
opções. São perguntas diferentes: a segunda só existe se a primeira for
"Casado". Fundidas, viram lista longa que a pessoa lê rápido e erra.

**5. Capital social em texto livre, sem total.** "Capital Social investido por
cada sócio" é um campo de texto. Volta "uns 10 mil cada" ou "30.000". Ninguém
sabe o capital total nem a participação de cada um, que é justamente o que vai
no contrato social.

**6. Administração em texto livre.** "Quem irá exercer a administração da
sociedade?" aceita qualquer coisa, inclusive um nome que não é de nenhum sócio
declarado, ou um apelido, ou "eu".

**7. "Três opções de nome" num campo só.** O enunciado pede 3 e implora ("Sim,
precisam ser 03"), mas o campo aceita 1 ou 7. Se vierem 2, alguém liga de volta
e o processo espera.

**8. Conta GOV perguntada uma vez para todos.** "Sócio(s) possui(em) Conta GOV?"
com Sim/Não. Ter conta GOV é fato de cada pessoa. Com dois sócios e um só tendo,
não há resposta certa.

**9. Participação em outra empresa perguntada no genérico.** "Se algum dos
sócios possuir participação societária em outra empresa..." — qual sócio? Em
qual empresa? O enquadramento é da outra empresa, e se dois sócios tiverem
participação em duas empresas diferentes, cabe um enquadramento só.

**10. Pergunta e opções que não combinam.** A pergunta 19 diz "(simples nacional
ou **regime geral**)" e as opções são Simples Nacional / Lucro Presumido / Lucro
Real. Quem lê a pergunta procura "regime geral" na lista e não acha.

**11. Endereço em texto livre, sem CEP.** "Endereço Completo com CEP" num campo
único. Volta sem número, sem bairro, com o CEP errado, ou com o CEP do bairro em
vez do da rua. É o dado que vai para a JUCESP.

**12. Zero validação.** CPF sem dígito verificador conferido. Telefone com 9
dígitos. E-mail sem `@`. O erro só aparece dias depois, no meio do processo de
viabilidade.

**13. Sem salvar e retomar.** Formulário longo, preenchido no celular. Cai a
conexão ou chega uma ligação, e volta tudo em branco.

**14. 100 MB por arquivo.** Para uma foto de RG. Um cliente em 4G tentando
subir um PDF de 80 MB significa cinco minutos de barra andando e uma
desistência.

**15. Exige conta Google.** *"O nome, a foto e o e-mail associados à sua Conta
do Google serão registrados quando você fizer upload de arquivos"*. Cliente sem
Gmail simplesmente não anexa documento. E o e-mail que fica registrado é da
conta Google, não o e-mail que a pessoa usa na empresa.

---

## 4. A forma nova, em cinco telas

```
┌────────────────────────────────────────────────────────────┐
│  [logo]        Abertura de CNPJ                            │
│                                                            │
│  ●───────●───────○───────○───────○                         │
│  Sócios  Empresa Sociedade Documentos Revisão              │
└────────────────────────────────────────────────────────────┘
```

| Passo | Título | O que tem | Por que aqui |
|---|---|---|---|
| 1 | Sócios | Quantos sócios + um bloco completo por pessoa | Nada mais pode ser perguntado antes de saber quem são as pessoas |
| 2 | A empresa | 3 razões sociais, nome fantasia, atividades, endereço | Independe dos sócios, exceto o endereço, que pode copiar de um deles |
| 3 | Sociedade | Capital por sócio com total, quem administra | Depende do passo 1: só se distribui capital entre pessoas já declaradas |
| 4 | Documentos | Checklist por pessoa + documentos da empresa | Agrupado para o cliente pegar todos os arquivos de uma vez |
| 5 | Revisão | Tudo em leitura, com link para corrigir cada bloco | Última chance antes de enviar |

### Sobre serem cinco telas

Passo tem custo: mais clique, e a pessoa não vê o tamanho do que tem à frente.
Mas o alternativo aqui é pior. São 20 perguntas, das quais 13 se repetem por
sócio. Com três sócios, página única passa de 45 campos numa rolagem só, e a
pessoa perde onde está. A barra de progresso no topo resolve o "não sei quanto
falta", que é a real reclamação contra multi-passo.

### Regras de navegação

- **Avançar valida.** Campo obrigatório vazio ou inválido bloqueia o avanço, com
  o erro embaixo do campo e o foco indo para o primeiro erro. Chegar na revisão
  com 12 erros acumulados é pior que travar no passo.
- **Voltar é livre.** Sem validação, sem confirmação, sem perder o que foi
  digitado.
- **Clicar no passo na barra de progresso** navega para trás livremente e para
  frente só até o passo mais avançado já validado.
- **A barra de progresso é clicável e tem `aria-current`** no passo atual.

---

## 5. Passo 1 — Sócios

### 5.1 Quantos sócios

Primeira coisa da tela. Controle segmentado: `1` `2` `3` `4` `5+`.

- `5+` abre um campo numérico (limite 10).
- Ao aumentar, blocos novos entram vazios.
- Ao **diminuir**, abre `Modal` de confirmação nomeando quem sai: *"Remover o
  Sócio 3 (Maria Silva)? Os dados e documentos dele serão apagados do
  formulário."* Reduzir sem avisar apaga trabalho em silêncio.
- Com `1` sócio, a tela some com tudo que é plural. Ver a
  [tabela de condicionais](#10-todas-as-regras-condicionais-num-lugar).

### 5.2 O bloco de cada sócio

**Isto é o coração da mudança.** Em vez de campos "(s)", um bloco repetido por
pessoa. Cada bloco é um `Painel` com cabeçalho próprio:

```
┌──────────────────────────────────────────────────────────────┐
│ (1)  Sócio 1                          Maria Silva  [Recolher]│
├──────────────────────────────────────────────────────────────┤
│ Nome completo *                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ CPF *                        Telefone *                      │
│ ┌───────────────────────┐   ┌──────────────────────────────┐ │
│ │ 000.000.000-00        │   │ (00) 00000-0000              │ │
│ └───────────────────────┘   └──────────────────────────────┘ │
│                                                              │
│ E-mail *                     Profissão *                     │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

O nome aparece no cabeçalho do bloco à medida que é digitado. Serve de âncora:
na revisão, nos documentos e no passo 3, a pessoa é referida pelo nome, não por
"Sócio 2".

Blocos além do primeiro podem ser **recolhidos**. Quem já preencheu o sócio 1
recolhe e vê o 2 inteiro na tela.

### 5.3 Campos do bloco

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Nome completo | texto | Sim | Mínimo 2 palavras. "João" sozinho não é nome completo e é o que vai no contrato social |
| CPF | `EntradaDocumento tipo="cpf"` | Sim | Máscara `000.000.000-00`, dígito verificador conferido, **e não pode repetir** o CPF de outro sócio do mesmo formulário |
| Telefone | `EntradaDocumento tipo="telefone"` | Sim | Máscara `(00) 00000-0000`, DDD válido, 10 ou 11 dígitos |
| E-mail | `Entrada type="email"` | Sim | Formato com `@` e domínio com ponto |
| Profissão | texto | Sim | — |
| Estado civil | `Escolha` | Sim | **5 opções**, sem regime: Solteiro(a) · Casado(a) · Separado(a) · Divorciado(a) · Viúvo(a) |
| Regime de bens | `Escolha` | Sim, **se casado** | **Só aparece** com estado civil = Casado(a). 4 opções: Comunhão universal de bens · Comunhão parcial de bens · Separação de bens · Participação final nos aquestos |
| Possui conta GOV.BR? | `Escolha` Sim/Não | Sim | **Por pessoa**, não uma vez para todos |
| Participação societária em outra empresa? | `Escolha` Sim/Não | Sim | Se Sim, abre os 3 campos abaixo |
| ↳ CNPJ da outra empresa | `EntradaDocumento tipo="cnpj"` | Sim, se acima = Sim | Máscara `00.000.000/0000-00` com dígito verificador conferido |
| ↳ Enquadramento tributário dela | `Escolha` | Sim, se acima = Sim | Simples Nacional · Lucro Presumido · Lucro Real. O enunciado não fala mais em "regime geral" |
| ↳ Contrato social dela | upload | Sim, se acima = Sim | Vai no passo 4, no bloco desta pessoa |

O bloco de participação é **por sócio**, resolvendo o defeito 9: dois sócios com
participação em duas empresas diferentes têm dois CNPJs e dois enquadramentos.

### 5.4 Endereço do sócio

Endereço estruturado, com busca automática por CEP. Ver
[seção 11](#11-máscara-validação-e-busca-de-cep) para o comportamento da busca.

| Campo | Largura no desktop | Obrigatório |
|---|---|---|
| CEP | 1/3 | Sim |
| Logradouro | 2/3 | Sim |
| Número | 1/4 | Sim |
| Complemento | 1/4 | Não |
| Bairro | 1/4 | Sim |
| Cidade | 1/4 | Sim |
| UF | select, 1/4 | Sim |

A partir do sócio 2, um `Alternador` no topo do endereço: **"Mesmo endereço do
Sócio 1 (Maria Silva)"**. Ligado, esconde os campos e mostra o endereço copiado
em texto. Cônjuges e familiares sócios da mesma empresa costumam morar juntos, e
digitar o mesmo endereço duas vezes é onde aparece divergência de dígito.

---

## 6. Passo 2 — A empresa

### 6.1 Razão social — três campos, não um

```
Opções de nome para a Razão Social *
Os três são obrigatórios. A Junta Comercial pode recusar nomes já registrados,
então enviamos três para não recomeçar o processo.

1ª opção  ┌────────────────────────────────────────────────┐
2ª opção  ┌────────────────────────────────────────────────┐
3ª opção  ┌────────────────────────────────────────────────┐
```

Três campos separados e obrigatórios. Não dá para mandar 2 nem 5. Validação
extra: **as três precisam ser diferentes** entre si, comparando sem
considerar maiúsculas e acentos — senão a pessoa preenche "Padaria Silva",
"padaria silva", "PADARIA SILVA" e manda uma opção só, achando que mandou três.

### 6.2 Nome fantasia e atividades

| Campo | Tipo | Obrigatório | Texto de ajuda |
|---|---|---|---|
| Nome fantasia | texto | Sim | *"É como a empresa vai ser conhecida pelo público. Definido na formalização, considerando o mercado e a área de atuação."* |
| Atividades que serão desenvolvidas | `Area`, 6 linhas | Sim | *"Descreva com detalhes os produtos a serem comercializados, o nicho, ou os serviços prestados, para identificarmos os melhores CNAEs do CNPJ."* Mínimo 30 caracteres, com contador |

O mínimo de 30 caracteres existe porque este campo alimenta a escolha de CNAE
(etapa 2 das 20 do fluxo de abertura, "Conferência das Atividades do CNPJ"), e
"vendas" como resposta não alimenta nada. O contador aparece só depois que a
pessoa começa a digitar.

### 6.3 Endereço da empresa

Primeiro uma pergunta, não sete campos:

```
Onde a empresa vai funcionar? *
( ) No endereço de um dos sócios
( ) Em outro endereço
```

- **No endereço de um dos sócios** → com mais de um sócio, aparece um select com
  os nomes já preenchidos. Escolhido, mostra o endereço em leitura, com opção de
  **"Ajustar"** (por exemplo, a empresa fica no fundo, sala 2).
- **Em outro endereço** → mesmos 7 campos estruturados do passo 1, com a mesma
  busca por CEP.

### 6.4 IPTU

Não é upload nesta tela. É um `Escolha` Sim/Não — *"Você tem o IPTU do
endereço?"* — e o arquivo em si vai no passo 4. Motivo: junta todos os uploads
num lugar só, e o Sim/Não aqui permite avisar de uma vez o que falta.

Se Não, um `Aviso tom="info"`: *"Sem problema, você pode enviar depois. O
processo de viabilidade pode precisar dele."* Não bloqueia.

---

## 7. Passo 3 — Sociedade

### 7.1 Capital social com total visível

Um campo por sócio, com máscara de moeda, e o total somado ao lado:

```
┌──────────────────────────────────────────────────────────────┐
│ (i)  Capital social                                          │
│      Valor aproximado para iniciar a empresa: aporte em       │
│      dinheiro, maquinário, veículos. Não precisa ser exato.   │
├──────────────────────────────────────────────────────────────┤
│  Maria Silva          ┌──────────────────┐   40,0%           │
│                       │ R$ 20.000,00     │                   │
│                                                              │
│  João Souza           ┌──────────────────┐   60,0%           │
│                       │ R$ 30.000,00     │                   │
│  ──────────────────────────────────────────────────────────  │
│  Capital social total                        R$ 50.000,00    │
└──────────────────────────────────────────────────────────────┘
```

- Máscara de moeda BRL enquanto digita. Guardado em **centavos, como inteiro**.
  Ponto flutuante em dinheiro produz `0.30000000000000004`, e a soma de três
  sócios não fecha com o total.
- O **percentual é derivado**, não perguntado. Recalcula a cada dígito. É o dado
  que vai no contrato social e hoje ninguém tem.
- Total sempre visível, com numeral tabular (classe `.cz-num`) para os dígitos
  não dançarem enquanto a pessoa digita.
- Cada campo é obrigatório e maior que zero. Sócio com capital zero não é sócio.
- Com **1 sócio**: um campo só, sem percentual (é 100%), e o total some — dizer
  "total: R$ 20.000,00" embaixo de "R$ 20.000,00" é ruído.

### 7.2 Quem administra

**Seleção entre os sócios preenchidos**, nunca texto livre:

```
Quem irá exercer a administração da sociedade? *
Marque todos que vão assinar pela empresa.

[x] Maria Silva
[ ] João Souza
```

- Caixas de seleção múltipla, uma por sócio, com o nome digitado no passo 1.
- Ao menos um obrigatório.
- Com **1 sócio**, a pergunta não aparece. No lugar, uma linha: *"A administração
  fica com Maria Silva, única sócia."*
- Se dois ou mais forem marcados, aparece: **"Como assinam?"** → `( ) Em
  conjunto  ( ) Isoladamente`. Uma pergunta que o Google Forms nem faz e que o
  contrato social exige.

Impossível informar um administrador que não é sócio. Se o cliente voltar ao
passo 1 e mudar o nome de alguém, a caixa acompanha; se remover o sócio, a marca
dele é removida junto.

---

## 8. Passo 4 — Documentos

O passo que resolve os defeitos 2 e 14. **Todo arquivo tem dono.**

```
┌──────────────────────────────────────────────────────────────┐
│ (paperclip) Documentos                                       │
│  PDF, JPG ou PNG. Até 20 MB por arquivo.                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  MARIA SILVA                                    2 de 2  (ok) │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ RG ou CNH                                     *          ││
│  │ (file) rg-maria-frente.pdf   412 KB              [x]     ││
│  │ ┌──────────────────────────────────────────────────────┐ ││
│  │ │  (upload)  Arraste aqui ou toque para escolher        │ ││
│  │ └──────────────────────────────────────────────────────┘ ││
│  ├──────────────────────────────────────────────────────────┤│
│  │ Comprovante de residência                     *          ││
│  │ (file) conta-luz.pdf         180 KB              [x]     ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  JOÃO SOUZA                                     1 de 3       │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ RG ou CNH                                     *          ││
│  │ Comprovante de residência                     *          ││
│  │ Contrato social da MERCEARIA SOUZA LTDA        *          ││
│  │   (porque João declarou participação nesta empresa)      ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  DA EMPRESA                                                  │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ IPTU do endereço                                         ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Como fica organizado

- **Agrupado por pessoa**, com o nome em caixa alta como cabeçalho de grupo.
- **Uma área de upload por documento**, não uma caixa genérica de 5 arquivos.
  Cada área sabe o que é e de quem é.
- **Contador por pessoa** (`2 de 2`), com selo de concluído quando fecha.
- O slot de contrato social **só aparece** para quem declarou participação, e o
  rótulo cita o CNPJ ou o nome que a pessoa informou — a ligação entre o
  documento e o motivo dele fica na tela.
- Cada slot aceita **múltiplos arquivos** (RG frente e verso, duas contas de
  luz), e cada arquivo listado tem nome, tamanho legível e botão de remover.
- Documento da empresa em grupo separado no fim.

### Por que uploads num passo separado

No celular, escolher arquivo tira a pessoa do navegador e a devolve depois. Se
isso acontecer no meio do bloco do sócio, ela volta e precisa reencontrar onde
estava. Agrupando, a interrupção acontece numa fase só, quando ela já sabe
exatamente quais arquivos precisa buscar.

### Nome do arquivo carrega o dono

Ao montar o envio, cada arquivo recebe prefixo derivado do dono e do tipo:
`socio-1-maria-silva--rg-cnh--rg-maria-frente.pdf`. Passando por
`nomeParaDisco()` de `src/lib/tarefa-anexo.ts`, que já normaliza acento e
remove o que não pode ir para disco. Mesmo que alguém baixe os arquivos soltos,
o dono de cada um está no nome.

---

## 9. Passo 5 — Revisão e envio

Tudo em leitura, agrupado como foi preenchido, cada bloco com um link
**"Editar"** que volta ao passo certo com foco no bloco certo.

Mostra, entre outras coisas: nome, CPF, telefone e e-mail de cada sócio; estado
civil com o regime junto quando houver; capital de cada um com o percentual;
capital total; quem administra e como assina; as três razões sociais; o endereço
da empresa; e a contagem de arquivos por pessoa.

No fim, uma caixa de confirmação: *"Confirmo que os dados e documentos enviados
são verdadeiros."* Obrigatória.

### O botão de enviar nesta fase

Sem persistência, não há para onde enviar. Nesta fase:

- O botão **valida tudo** e mostra o resultado — é o teste real de que a
  validação está completa.
- Oferece **"Baixar resumo"**, gerando um `.json` com todos os campos
  preenchidos, para não jogar fora o preenchimento de teste.
- Um `Aviso tom="atencao"` fixo declara: *"Esta tela está em homologação. O
  envio ao escritório ainda não está ativo."*

Isso é intencional e temporário. O contrato do envio está definido na
[seção 17](#17-contrato-de-dados), e ligar de verdade é escrever a rota,
não redesenhar a tela.

---

## 10. Todas as regras condicionais num lugar

Campo condicional que ninguém consegue listar vira campo que aparece na hora
errada. Esta é a lista completa. Nenhuma outra regra de exibição existe.

| # | Aparece / muda | Condição | Comportamento quando falso |
|---|---|---|---|
| C1 | Bloco do sócio N | `quantidadeSocios >= N` | O bloco não existe. Não é campo oculto: os dados dele saem do estado |
| C2 | Regime de bens (por sócio) | Estado civil do sócio = `CASADO` | Campo sai da tela e o valor é limpo |
| C3 | CNPJ + enquadramento da outra empresa (por sócio) | Participação societária do sócio = `Sim` | Os dois campos saem e os valores são limpos |
| C4 | Slot de upload "Contrato social" (por sócio) | Participação societária do sócio = `Sim` | O slot não aparece no passo 4 |
| C5 | "Mesmo endereço do Sócio 1" | Estamos no sócio 2 ou além | Sócio 1 sempre digita o endereço |
| C6 | Campos de endereço do sócio | `mesmoEnderecoDoSocio1 = false` | Mostra o endereço copiado em texto |
| C7 | Select "de qual sócio?" no endereço da empresa | `localEmpresa = SOCIO` **e** `quantidadeSocios > 1` | Com 1 sócio, copia dele direto, sem perguntar |
| C8 | Campos de endereço da empresa | `localEmpresa = OUTRO` | Mostra o endereço do sócio escolhido |
| C9 | Coluna de percentual e linha de total no capital | `quantidadeSocios > 1` | Um campo só, sem percentual nem total |
| C10 | Pergunta "quem administra" | `quantidadeSocios > 1` | Frase fixa nomeando o sócio único |
| C11 | "Como assinam? Em conjunto / Isoladamente" | 2 ou mais administradores marcados | Não aparece |
| C12 | Aviso sobre IPTU pendente | `temIptu = Não` | Não aparece |
| C13 | Contador de caracteres em "Atividades" | A pessoa já digitou algo | Não aparece com o campo vazio |
| C14 | Slot de upload do IPTU no passo 4 | `temIptu = Sim` | O slot não aparece |

### Duas regras que valem para todas as condicionais

**Limpar ao esconder.** Campo que sai da tela tem o valor apagado do estado.
Sem isso, alguém marca "Casado", escolhe "Separação de bens", muda para
"Solteiro" e envia um regime de bens que a tela não mostrava mais.

**Nunca `display: none` com o campo ativo.** Campo escondido por CSS continua no
formulário, continua sendo validado e recebe foco no `Tab`. A pessoa aperta
`Tab` e o cursor desaparece num campo invisível. Condicional é renderização
condicional em React, não visibilidade em CSS.

---

## 11. Máscara, validação e busca de CEP

### 11.1 O que reaproveitar

`src/lib/documento.ts` **não tem nenhum import**, então roda no cliente e no
servidor sem adaptação. Já está pronto e testado (86 checagens em
`npm run test:tarefas`):

| Uso nesta tela | Função |
|---|---|
| CPF do sócio | `mascaraCpf`, `cpfValido` (confere o dígito verificador), `erroDocumento("cpf", …)` |
| CNPJ da outra empresa | `mascaraCnpj`, `cnpjValido` (dígito verificador), `erroDocumento("cnpj", …)` |
| Telefone do sócio | `mascaraTelefone`, `telefoneValido` (10 ou 11 dígitos, DDD válido) |
| CEP | `mascaraCep`, `cepValido` (8 dígitos e recusa `00000-000`) |
| Placeholders | `PLACEHOLDER_DOCUMENTO` |
| Valor para envio | `somenteDigitos` |

O componente `EntradaDocumento` de
`src/app/components/views/ui/tarefas/Campos.tsx` já junta máscara, placeholder e
erro no momento certo — ele **não** acusa erro enquanto a pessoa está digitando
o número, só quando ela sai do campo ou quando o número fecha em quantidade de
dígitos e está inválido. Nada de "CPF inválido" no terceiro dígito.

**Nenhuma máscara nova é escrita.** Só a de moeda, que não existe no projeto
(confirmado: `formato.ts` não exporta formatação monetária), e mora em
`src/lib/formulario-abertura.ts`.

### 11.2 Regras de validação, campo a campo

| Campo | Regra | Mensagem |
|---|---|---|
| Nome completo | 2+ palavras, cada uma com 2+ letras | "Informe o nome completo, com sobrenome" |
| CPF | 11 dígitos + dígito verificador | Vem de `erroDocumento` |
| CPF | Não repetido entre sócios | "Este CPF já foi informado no Sócio 1" |
| CNPJ | 14 dígitos + dígito verificador | Vem de `erroDocumento` |
| Telefone | 10 ou 11 dígitos, DDD válido | "Telefone incompleto" / "DDD inválido" |
| E-mail | `algo@dominio.tld` | "E-mail inválido" |
| CEP | 8 dígitos, não repetidos | "CEP inválido" |
| Razões sociais | 3 preenchidas e distintas entre si | "A 2ª opção é igual à 1ª. Informe um nome diferente" |
| Atividades | 30+ caracteres | "Descreva com mais detalhe: isso define os CNAEs da empresa" |
| Capital por sócio | Maior que zero | "Informe o valor investido por este sócio" |
| Administração | 1+ marcado | "Marque quem vai administrar a sociedade" |
| Confirmação final | Marcada | "Confirme que os dados são verdadeiros" |

**Quando o erro aparece:** ao sair do campo (`onBlur`) ou ao tentar avançar.
Nunca a cada tecla. Validar a cada tecla mostra "e-mail inválido" para quem
digitou a primeira letra do próprio e-mail.

**Quando o erro desaparece:** assim que o valor fica válido, sem esperar sair do
campo. Erro que persiste depois da correção faz a pessoa achar que o sistema
travou.

### 11.3 Busca de CEP com ViaCEP

Todo campo de CEP da tela (dos sócios e da empresa) busca o endereço.

**Endpoint:** `GET https://viacep.com.br/ws/{8-digitos}/json/`

Respostas verificadas na API real:

```json
// 01001000 → HTTP 200
{
  "cep": "01001-000",
  "logradouro": "Praça da Sé",
  "complemento": "lado ímpar",
  "unidade": "",
  "bairro": "Sé",
  "localidade": "São Paulo",
  "uf": "SP",
  "estado": "São Paulo",
  "regiao": "Sudeste",
  "ibge": "3550308",
  "gia": "1004",
  "ddd": "11",
  "siafi": "7107"
}
```

```json
// 99999999 → HTTP 200 (não é 404)
{ "erro": "true" }
```

**Três detalhes que quebram a implementação ingênua:**

1. **`erro` é a string `"true"`, não o booleano `true`.** Testar
   `if (dados.erro === true)` não pega nunca. O teste correto é a presença da
   chave: `if ("erro" in dados)`.
2. **CEP inexistente devolve 200**, não 404. Checar `response.ok` não detecta
   nada. CEP com formato errado devolve 400.
3. **O campo é `localidade`, não `cidade`.** E `complemento` do ViaCEP é
   informação do CEP ("lado ímpar"), **não** o complemento do endereço da
   pessoa. Copiar um no outro põe "lado ímpar" no lugar de "apto 42".

**Comportamento na tela:**

| Momento | O que acontece |
|---|---|
| 8º dígito digitado | Dispara a busca. Não espera sair do campo |
| Durante a busca | Spinner dentro do campo, à direita. Logradouro/bairro/cidade/UF ficam desabilitados |
| Encontrado | Preenche logradouro, bairro, cidade e UF. **Foco vai para o campo Número**, que é o único que a busca não sabe |
| Não encontrado (`erro`) | Erro no campo de CEP: *"CEP não encontrado. Confira o número ou preencha o endereço manualmente."* Os campos ficam editáveis |
| Rede falhou / API fora | `Aviso tom="atencao"`: *"Não conseguimos buscar o CEP agora. Você pode preencher o endereço manualmente."* Os campos ficam editáveis |
| CEP alterado depois de preenchido | Busca de novo e sobrescreve. Mantém Número e Complemento, que são da pessoa |

**Regras técnicas:**

- **Chamada direta do navegador para o ViaCEP.** Sem rota intermediária no
  Next. Não há segredo envolvido, e um proxy só adicionaria latência e um ponto
  de falha nosso.
- **`AbortController`.** Digitar CEP, apagar e digitar outro dispara duas
  buscas; sem abortar a primeira, ela pode responder depois da segunda e
  preencher o endereço errado. Este é o bug clássico de autocomplete e é
  silencioso.
- **Cache em memória por CEP** dentro da sessão. Dois sócios no mesmo CEP
  fazem uma requisição, não duas.
- **Timeout de 8 segundos**, caindo no preenchimento manual.
- **Os campos preenchidos pela busca continuam editáveis.** ViaCEP erra em
  loteamento novo, e travar o campo transformaria um endereço errado em
  endereço impossível de corrigir.
- **A busca nunca bloqueia o avanço.** Se o ViaCEP estiver fora, o formulário
  funciona todo, com endereço digitado à mão.

---

## 12. Upload

Limites vindos de `src/lib/tarefa-anexo.ts`, que já é usado nos anexos de
tarefa e não tem import nenhum:

| Regra | Valor | Origem |
|---|---|---|
| Tamanho por arquivo | **20 MB** | `TAMANHO_MAXIMO_BYTES` |
| Tipos aceitos | `ACCEPT_ANEXO` no atributo `accept` | `EXTENSOES_ACEITAS` |
| Validação de tipo | `validarTipo(mime, nome)` | Não confia só na extensão |
| Nome no disco | `nomeParaDisco(nome)` | Normaliza acento e caractere proibido |
| Tamanho exibido | `tamanhoLegivel(bytes)` | "412 KB", "2,3 MB" |
| Ícone do arquivo | `iconeDoAnexo(mime)` | Lucide, via `Icone`. Nunca emoji |

20 MB em vez dos 100 MB do Google. Foto de RG passa folgado; PDF de 80 MB é
desistência garantida em 4G.

**Na tela:**

- Arrastar e soltar **e** toque para escolher. No celular, arrastar não existe.
- Erro de tipo ou tamanho aparece **no slot**, nomeando o arquivo: *"rg.zip:
  tipo não aceito. Envie PDF, JPG ou PNG."* Um arquivo recusado não derruba os
  outros do mesmo lote.
- Miniatura para imagem, ícone para PDF.
- Remover é imediato, sem confirmação — nada foi enviado ainda.

---

## 13. Layout

O pedido foi "layout lindo e perfeito, não igual ao do Google". A régua: parecer
parte do ContaZoom, não um formulário genérico.

### 13.1 Cores — tokens reais, nada de valor solto

Do bloco `.cz-tarefas` em `src/app/globals.css` (o segundo conjunto, que vence
na cascata):

```css
--cz-laranja:        #F26212;   /* ação primária, foco, passo atual */
--cz-laranja-forte:  #D9500A;   /* hover do primário, texto sobre suave */
--cz-laranja-suave:  #FFF2E9;   /* fundo de destaque */
--cz-laranja-borda:  #FFD9BF;   /* borda de destaque */

--cz-hairline:       #EDEFF3;   /* borda padrão */
--cz-hairline-forte: #DCE0E7;   /* borda de campo */

--cz-fundo:          #F8F9FB;   /* fundo da página */
--cz-superficie:     #FFFFFF;   /* cartão */

--cz-texto:          #14161B;   /* texto principal */
--cz-texto-suave:    #6B7280;   /* rótulo, ajuda */
--cz-texto-fraco:    #9AA1AC;   /* placeholder */

--cz-elev-1/2/3                 /* sombras, quase invisíveis */
```

Nenhum hex escrito à mão em componente novo. Muda o token, muda a tela.

### 13.2 Componentes — reaproveitar, não recriar

| Precisa de | Usar | De |
|---|---|---|
| Campo de texto | `Entrada` | `ui/tarefas/Campos.tsx` |
| Área de texto | `Area` | idem |
| Select | `Escolha` | idem |
| CPF / CNPJ / CEP / telefone | `EntradaDocumento` | idem |
| Botão | `Botao` | idem |
| Liga/desliga | `Alternador` | idem |
| Bloco com título e ícone | `BlocoForm(icone, titulo, descricao)` | `ui/tarefas/Base.tsx` |
| Cartão | `Painel` | idem |
| Aviso | `Aviso(tom: erro\|atencao\|info\|ok)` | idem |
| Progresso | `Progresso(feito, total)` | idem |
| Spinner | `Carregando` | idem |
| Confirmação de remover sócio | `Modal` (`sm\|md\|lg\|xl\|2xl`) | `ui/tarefas/Modal.tsx` |
| Ícone | `Icone nome="..."` | `ui/tarefas/Icone.tsx` |
| Tamanho, data, percentual | `formato.ts` | `ui/tarefas/` |

`Icone.tsx` tem mapa **explícito** de lucide, para o tree-shaking funcionar.
Ícone novo (`Landmark`, `Wallet`, `IdCard`) precisa ser adicionado ao mapa. Os
que esta tela usa e já estão lá: `User`, `Users`, `Building2`, `MapPin`,
`Paperclip`, `FileText`, `FileImage`, `Upload`, `Trash2`, `Plus`, `Info`,
`AlertTriangle`, `CheckCircle2`, `ChevronLeft`, `ChevronRight`, `Mail`, `Hash`,
`Briefcase`, `Handshake`, `Landmark`.

**Regra do projeto: ícone SVG sempre, emoji nunca.**

### 13.3 Medidas

| Item | Valor | Motivo |
|---|---|---|
| Largura do conteúdo | `max-w-[880px]` centralizado | Formulário não é painel. As telas do admin usam `1800px` porque têm tabela; aqui linha longa cansa |
| Altura de campo | `2.75rem` (44px) no desktop, `3rem` (48px) no toque | 44px é o mínimo de alvo de toque confortável |
| Raio de campo | `10px` | Igual ao resto do sistema |
| Raio de cartão | `1rem` | `rounded-2xl`, como o `Modal` |
| Espaço entre campos | `1.25rem` | — |
| Espaço entre blocos | `2rem` | O bloco por sócio precisa se ler como unidade |
| Foco | anel laranja de 3px, `rgba(242, 98, 18, 0.12)` | Já automático em `.cz-tarefas` |

### 13.4 O topo

```
┌──────────────────────────────────────────────────────────────┐
│  ContaZoom                                                   │
│                                                              │
│  Abertura de CNPJ                                            │
│  Preencha os dados dos sócios e da empresa. Leva cerca de     │
│  10 minutos. Seu progresso é salvo neste navegador.           │
│                                                              │
│  ●━━━━━━━●───────○───────○───────○                            │
│  Sócios  Empresa Sociedade Docs.  Revisão                     │
└──────────────────────────────────────────────────────────────┘
```

Faixa laranja discreta no topo (não um bloco laranja inteiro, que briga com o
foco laranja dos campos). A barra de progresso é `sticky` no celular: rolando 40
campos, saber onde se está importa mais que os 48px de tela.

O "cerca de 10 minutos" e o "seu progresso é salvo" respondem, antes de a pessoa
começar, as duas perguntas que fazem alguém desistir.

### 13.5 Celular

O cliente preenche no celular. Não é adaptação, é o caso principal.

- Uma coluna abaixo de `640px`. Grid de endereço só no desktop.
- `inputMode="numeric"` em CPF, CNPJ, CEP, telefone e capital — abre o teclado
  numérico direto.
- `type="email"` no e-mail, `autoComplete` correto em nome, e-mail, telefone e
  CEP.
- Barra de navegação (`Voltar` / `Continuar`) fixa no rodapé, com `Continuar`
  ocupando a largura maior. Não é preciso rolar até o fim para avançar.
- Bloco de sócio recolhível: com 3 sócios, a rolagem seria absurda.
- `prefers-reduced-motion` respeitado nas transições entre passos — a folha já
  tem a regra para `.cz-auth`, e ela precisa passar a valer aqui também.

---

## 14. Rascunho local

Sem banco nesta fase, o rascunho vive em `localStorage`, chave
`cz_formulario_abertura_v1`.

- Salva com **debounce de 800ms** depois da última tecla. Salvar a cada tecla
  faz `JSON.stringify` do formulário inteiro 40 vezes por segundo.
- Ao abrir com rascunho salvo, **pergunta** antes de restaurar: *"Encontramos um
  preenchimento em andamento deste navegador. Continuar de onde parou?"* →
  `Continuar` / `Começar de novo`. Restaurar sem avisar assusta quem esperava
  formulário em branco.
- Guarda `versao` e `salvoEm`. Rascunho de versão anterior é descartado com
  aviso, não restaurado pela metade.
- Botão **"Limpar preenchimento"** no rodapé, com confirmação.

### O que o rascunho local NÃO garante

Precisa estar escrito na tela, não só aqui:

| Não sobrevive a | Consequência |
|---|---|
| Outro navegador ou outro aparelho | Começou no celular, não continua no computador |
| Aba anônima | Fechou a aba, foi tudo |
| Limpar cache / dados de site | Some sem aviso |
| Cota do `localStorage` (~5 MB por origem) | `setItem` lança e o rascunho para de salvar |

E o mais importante:

> **Arquivos não entram no rascunho.** `File` não é serializável em JSON, e
> converter para base64 estouraria os ~5 MB do `localStorage` com um único PDF.
> Os campos de texto voltam; os documentos precisam ser escolhidos de novo.

A tela diz isso onde a pessoa vê, no passo 4: *"Os arquivos escolhidos não ficam
salvos se você fechar a página. Envie o formulário na mesma sessão em que
anexar."*

### Dado pessoal no aparelho do cliente

O rascunho tem CPF, endereço, telefone e e-mail em texto claro no
`localStorage`, possivelmente num computador compartilhado. Por isso:

- O botão "Limpar preenchimento" fica visível, não escondido.
- Ao enviar com sucesso (quando o envio existir), o rascunho é apagado
  imediatamente.
- Nenhum arquivo, nem em base64, é guardado — o que também é a decisão certa
  para privacidade, não só para a cota.

---

## 15. Acessibilidade

- Todo campo com `<label>` real associado, nunca placeholder no lugar de rótulo.
  Placeholder desaparece ao digitar, e quem se distraiu não sabe mais o que era.
- Erro ligado por `aria-describedby` e `aria-invalid`, para o leitor de tela
  anunciar junto com o campo.
- Ao tentar avançar com erro, o foco vai para o **primeiro campo com erro** e um
  resumo aparece no topo do passo, em `role="alert"`.
- Erro nunca depende só de cor: ícone e texto sempre acompanham.
- Barra de progresso com `aria-current="step"` no passo atual.
- `Modal` de confirmação prende o foco e devolve ao elemento de origem ao
  fechar. Já é o comportamento do `Modal` do projeto.
- Ordem de `Tab` seguindo a ordem visual. Campo condicional escondido **não**
  está no DOM, então não recebe foco.
- Contraste mínimo AA. `--cz-texto-suave` (`#6B7280`) sobre branco atende para
  texto normal; `--cz-texto-fraco` (`#9AA1AC`) é só para placeholder, nunca para
  informação.
- `lang="pt-BR"` no container, contornando o `lang="en"` do root layout.

Validação completa de WCAG exige teste manual com leitor de tela e revisão de
especialista. O que está acima é o que se garante na construção.

---

## 16. Fora de escopo e o que fica pendente

**Não entra nesta fase, por decisão explícita do pedido:**

- Qualquer alteração em `prisma/schema.prisma`. Sem model, sem migração, sem
  coluna.
- Rota de API para receber o envio.
- Gravação dos arquivos no volume `contazoom_uploads`.
- Vínculo com `ProcessoLegalizacao` e com a etapa 1 das 20
  (`"Formulário de Abertura CNPJ - Drive"`, em `src/lib/tarefa-etapas.ts`).
- Tela interna para o escritório ler os formulários recebidos.
- E-mail de confirmação para o cliente.
- Link com token por cliente (hoje o link é único e público).

**A ordem natural depois desta fase:**

1. Model de recebimento + migração.
2. `POST /api/formulario` recebendo o payload da [seção 17](#17-contrato-de-dados)
   e revalidando tudo no servidor — validação de cliente é conveniência, não
   controle.
3. Upload gravando no volume, reaproveitando `diretorioAnexos()` e
   `caminhoDoAnexo()` de `src/lib/tarefa-anexo-disco.ts`.
4. Tela interna de leitura, e a etapa 1 do processo de legalização passando a
   ser concluída pelo recebimento em vez de na mão.

Enquanto 1 e 2 não existirem, o botão de enviar fica com o aviso de homologação
da [seção 9](#9-passo-5--revisão-e-envio).

---

## 17. Contrato de dados

Definido agora para o passo seguinte ser mecânico. Mora em
`src/lib/formulario-abertura.ts`, que **não deve ter nenhum import** — mesma
convenção de `documento.ts` e `tarefa-anexo.ts`, para poder ser testado com
`node --experimental-strip-types` e reaproveitado no servidor.

```ts
export type EstadoCivil =
  | "SOLTEIRO" | "CASADO" | "SEPARADO" | "DIVORCIADO" | "VIUVO";

export type RegimeBens =
  | "COMUNHAO_UNIVERSAL" | "COMUNHAO_PARCIAL"
  | "SEPARACAO_BENS"     | "PARTICIPACAO_FINAL_AQUESTOS";

export type Enquadramento =
  | "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";

export type Endereco = {
  cep: string;          // só dígitos
  logradouro: string;
  numero: string;
  complemento: string;  // "" quando não tem
  bairro: string;
  cidade: string;       // ViaCEP chama de `localidade`
  uf: string;
};

export type Socio = {
  nome: string;
  cpf: string;                     // só dígitos
  telefone: string;                // só dígitos
  email: string;
  profissao: string;
  estadoCivil: EstadoCivil | "";
  regimeBens: RegimeBens | "";     // "" quando não é casado
  contaGov: boolean | null;
  endereco: Endereco;
  mesmoEnderecoDoPrimeiro: boolean;
  temParticipacaoOutraEmpresa: boolean | null;
  outraEmpresaCnpj: string;        // só dígitos, "" quando não tem
  outraEmpresaEnquadramento: Enquadramento | "";
  capitalCentavos: number;         // inteiro. Nunca float
  administrador: boolean;
};

export type FormularioAbertura = {
  versao: 1;
  socios: Socio[];
  razaoSocialOpcoes: [string, string, string];
  nomeFantasia: string;
  atividades: string;
  localEmpresa: "SOCIO" | "OUTRO" | "";
  socioDoEndereco: number | null;  // índice em `socios`
  enderecoEmpresa: Endereco;
  temIptu: boolean | null;
  assinaturaConjunta: boolean | null;  // null com 1 administrador
  confirmouVeracidade: boolean;
};
```

Notas que evitam retrabalho:

- **`capitalCentavos` é inteiro.** Dinheiro em `number` decimal não soma.
- **CPF, CNPJ, telefone e CEP guardados só com dígitos**, formatados só na
  exibição. É a convenção que `documento.ts` já estabelece no projeto.
- **`administrador` é campo do sócio**, não uma lista separada de nomes. Remover
  um sócio remove a marca dele automaticamente, sem sincronizar duas estruturas.
- **`versao: 1`** desde já, para o rascunho antigo poder ser descartado quando o
  formato mudar.
- **`null` e `""` significam coisas diferentes.** `null` é "não respondeu";
  `""` é "não se aplica". Um campo obrigatório em `null` bloqueia o avanço.

Os arquivos ficam **fora** deste tipo, num `Map` separado, porque `File` não é
serializável e este objeto vai para o `localStorage`.

---

## 18. Arquivos a criar

```
src/
├── app/
│   └── formulario/
│       ├── page.tsx                      Server component fino: metadata + View
│       ├── FormularioAberturaView.tsx    "use client". Estado, passos, navegação
│       └── passos/
│           ├── PassoSocios.tsx
│           ├── BlocoSocio.tsx            O bloco repetido por pessoa
│           ├── PassoEmpresa.tsx
│           ├── PassoSociedade.tsx
│           ├── PassoDocumentos.tsx
│           └── PassoRevisao.tsx
├── lib/
│   ├── formulario-abertura.ts            Tipos, opções, validação, moeda. SEM imports
│   ├── formulario-rascunho.ts            localStorage. Só cliente
│   └── cep.ts                            ViaCEP: fetch, abort, cache, timeout
└── app/
    └── globals.css                       Adicionar `.cz-form` ao seletor de font-family
```

Componentes de campo compartilhados (`CampoEndereco`, `CampoMoeda`) entram em
`src/app/components/views/ui/tarefas/` se forem usados fora desta tela, ou em
`src/app/formulario/` se forem só dela. Decidir na implementação, quando ficar
claro; criar componente compartilhado antes de haver segundo uso é abstração no
escuro.

Nenhum arquivo existente é modificado, exceto `globals.css` (uma linha, para a
fonte) e `Icone.tsx` se algum ícone novo for necessário.

---

## 19. Critérios de aceite

Verificável um por um. Se algum falhar, a tela não substitui o Google Forms.

**Estrutura e condicionais**

1. `/formulario` abre sem login, em aba anônima, sem redirecionar para `/login`.
2. Com 1 sócio: não aparece percentual de capital, não aparece linha de total,
   não aparece a pergunta de quem administra, não aparece "mesmo endereço do
   sócio 1".
3. Com 3 sócios: três blocos completos e independentes, cada um com o seu estado
   civil, a sua conta GOV e a sua participação societária.
4. Estado civil "Casado(a)" faz o regime de bens aparecer. Voltar para
   "Solteiro(a)" faz ele desaparecer **e o valor sai do payload**.
5. Participação societária = Sim abre CNPJ e enquadramento, e cria o slot de
   contrato social daquela pessoa no passo 4.
6. Reduzir a quantidade de sócios pede confirmação nomeando quem sai.
7. Nenhum campo escondido recebe foco no `Tab`.

**Máscara e validação**

8. CPF `111.111.111-11` é recusado pelo dígito verificador.
9. O mesmo CPF em dois sócios é recusado, apontando qual sócio já o tem.
10. CNPJ da outra empresa é recusado se o dígito verificador não fechar.
11. Telefone com 9 dígitos não avança. Com 11 dígitos, sai formatado
    `(11) 91234-5678`.
12. Nenhum erro aparece enquanto o número está sendo digitado.
13. Três razões sociais iguais (variando maiúscula ou acento) são recusadas.
14. Tentar avançar com erro leva o foco ao primeiro campo com erro.

**CEP**

15. Digitar `01001000` preenche Praça da Sé / Sé / São Paulo / SP e põe o foco em
    Número.
16. Digitar `99999999` mostra "CEP não encontrado" e deixa os campos editáveis
    (a API devolve 200 com `{"erro":"true"}` — string).
17. Com a rede desligada, o aviso aparece e o endereço pode ser preenchido à
    mão. O formulário avança.
18. Digitar um CEP e trocar rápido por outro não preenche o endereço do primeiro.
19. "lado ímpar" (o `complemento` do ViaCEP) não aparece no campo Complemento.

**Documentos**

20. Cada arquivo está visualmente sob o nome do seu dono.
21. Arquivo de 25 MB é recusado, com o motivo, e os outros do mesmo lote entram.
22. `.zip` é recusado com a lista do que é aceito.
23. O contador por pessoa reflete os documentos obrigatórios dela.

**Rascunho**

24. Preencher, recarregar a página: pergunta se quer continuar; ao confirmar,
    todos os campos de texto voltam.
25. Depois de restaurar, a tela diz claramente que os arquivos precisam ser
    escolhidos de novo.
26. "Limpar preenchimento" pede confirmação e zera tudo.

**Aparência**

27. A tela usa a mesma fonte do painel (`.cz-form` no seletor de `font-family`).
28. Nenhum hex escrito à mão nos componentes novos: cor sempre por token `--cz-*`.
29. Nenhum emoji. Ícone é sempre `Icone` com lucide.
30. Em viewport de 390px de largura: uma coluna, alvos de toque de 48px, teclado
    numérico nos campos numéricos, rodapé de navegação fixo.

**Build**

31. `npx tsc --noEmit` sem erro novo.
32. `npx next build` passa.
33. Nenhuma alteração em `prisma/schema.prisma`, nenhuma migração nova.
