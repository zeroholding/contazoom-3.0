/**
 * As colunas da tabela de vendas, em UM lugar só.
 *
 * Existe porque o objeto de colunas visíveis estava escrito à mão em OITO
 * arquivos (os dois `FiltrosVendas`, os dois `TabelaVendas`, e as quatro telas de
 * vendas) e os oito já tinham divergido entre si: `ads` era `false` em cinco e
 * `true` em nenhum, `exposicao` e `tipo` variavam de tela para tela. Como nada
 * disso chegava até a tabela, a divergência era invisível — e é exatamente por
 * isso que ela pôde crescer.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ A TABELA TEM 7 COLUNAS, NÃO 18                                         │
 * ├────────────────────────────────────────────────────────────────────────┤
 * │ `VendasTable` foi refeita em algum momento para AGRUPAR informação:    │
 * │ "Data / Canal", "Venda / Conta", "Produto / SKU", "Cliente / Envio",   │
 * │ "Qtd / Unitário", "Financeiro Detalhado", "CMV / Margem".              │
 * │                                                                        │
 * │ A lista de caixas de seleção continuou descrevendo a tabela ANTIGA, de │
 * │ uma coluna por campo. Não havia como ligar as duas, e por isso o botão │
 * │ "Exibir/Ocultar colunas" não tinha o que fazer: a prop chegava em      │
 * │ `VendasTable` tipada como `unknown` e nem entrava no destructuring.    │
 * │                                                                        │
 * │ A solução aqui NÃO é jogar as 18 fora. Cada uma delas corresponde a um │
 * │ PEDAÇO real de uma das 7 células, e é essa granularidade que serve a   │
 * │ quem usa: "quero ver a tabela sem o CMV" é um pedido legítimo e não    │
 * │ implica esconder a margem junto. Então cada campo declara a que GRUPO  │
 * │ pertence, o grupo desaparece quando todos os seus pedaços estão        │
 * │ desligados, e o rótulo do cabeçalho é montado a partir do que sobrou.  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Sem `"use client"` e sem JSX de propósito: é só dado. Assim serve tanto ao
 * componente de tabela quanto ao painel de filtros sem arrastar um deles para
 * dentro do outro.
 */

/* -------------------------------------------------------------------------- */
/*                                  Grupos                                    */
/* -------------------------------------------------------------------------- */

/**
 * Os sete grupos são as sete `<th>` de verdade da tabela.
 *
 * A ordem aqui É a ordem das colunas na tela, e o `VendasTable` percorre esta
 * lista para montar o cabeçalho. Antes a ordem estava implícita na sequência das
 * tags JSX, o que fazia mover uma coluna significar mover dois blocos grandes de
 * marcação em sincronia — e errar isso troca o conteúdo de lugar sem erro de
 * tipo, porque `<td>` casa com `<th>` por POSIÇÃO.
 */
export type GrupoColuna =
  | "dataCanal"
  | "vendaConta"
  | "produtoSku"
  | "clienteEnvio"
  | "qtdUnitario"
  | "financeiro"
  | "cmvMargem";

export const GRUPOS_COLUNA: GrupoColuna[] = [
  "dataCanal",
  "vendaConta",
  "produtoSku",
  "clienteEnvio",
  "qtdUnitario",
  "financeiro",
  "cmvMargem",
];

/**
 * Largura mínima de cada grupo, como já estava na tabela.
 *
 * Fica junto do grupo, e não espalhado nas `<th>`, porque é o tipo de valor que
 * alguém ajusta olhando a tela inteira — e com as classes soltas no JSX havia
 * `sm:min-w-[100px] sm:min-w-[130px]` na mesma `<th>` (duas vezes a mesma
 * propriedade, a segunda ganhando), em duas colunas diferentes.
 */
export const LARGURA_GRUPO: Record<GrupoColuna, string> = {
  dataCanal: "min-w-[80px] sm:min-w-[130px]",
  vendaConta: "min-w-[110px] sm:min-w-[140px]",
  produtoSku: "min-w-[130px] sm:min-w-[180px]",
  clienteEnvio: "min-w-[110px] sm:min-w-[150px]",
  qtdUnitario: "min-w-[80px] sm:min-w-[100px]",
  financeiro: "min-w-[120px] sm:min-w-[160px]",
  cmvMargem: "min-w-[80px] sm:min-w-[130px]",
};

/* -------------------------------------------------------------------------- */
/*                                  Colunas                                   */
/* -------------------------------------------------------------------------- */

/**
 * Um pedaço mostrável da tabela — o que cada caixa de seleção liga e desliga.
 *
 * Os nomes são os mesmos de antes, de propósito: são os que aparecem no painel
 * de filtros, e renomeá-los agora só criaria uma migração de preferência salva
 * sem nenhum ganho.
 */
export type ColunaVenda =
  | "data"
  | "canal"
  | "conta"
  | "pedido"
  | "produto"
  | "sku"
  | "ads"
  | "exposicao"
  | "tipo"
  | "comprador"
  | "envioMode"
  | "quantidade"
  | "unitario"
  | "valor"
  | "taxa"
  | "frete"
  | "cmv"
  | "margem";

export type ColunasVisiveis = Record<ColunaVenda, boolean>;

export type DefinicaoColuna = {
  id: ColunaVenda;
  /** Como aparece na lista de caixas de seleção. */
  label: string;
  /** A `<th>` em que este pedaço mora. */
  grupo: GrupoColuna;
  /**
   * Nome curto para o cabeçalho, quando o grupo é exibido parcialmente.
   *
   * "Data / Canal" com o canal desligado tem de virar "Data", senão o cabeçalho
   * anuncia uma informação que a coluna não mostra mais.
   */
  curto: string;
  /** Só faz sentido no Mercado Livre. A Shopee não tem ADS, exposição nem tipo. */
  somenteMeli?: boolean;
};

export const COLUNAS_VENDAS: DefinicaoColuna[] = [
  { id: "data", label: "Data", grupo: "dataCanal", curto: "Data" },
  { id: "canal", label: "Canal", grupo: "dataCanal", curto: "Canal" },

  { id: "conta", label: "Conta", grupo: "vendaConta", curto: "Conta" },
  { id: "pedido", label: "Id venda", grupo: "vendaConta", curto: "Venda" },

  { id: "produto", label: "Produto", grupo: "produtoSku", curto: "Produto" },
  { id: "sku", label: "SKU", grupo: "produtoSku", curto: "SKU" },
  { id: "ads", label: "ADS", grupo: "produtoSku", curto: "ADS", somenteMeli: true },
  {
    id: "exposicao",
    label: "Exposição",
    grupo: "produtoSku",
    curto: "Exposição",
    somenteMeli: true,
  },
  { id: "tipo", label: "Tipo de anúncio", grupo: "produtoSku", curto: "Tipo", somenteMeli: true },

  { id: "comprador", label: "Cliente", grupo: "clienteEnvio", curto: "Cliente" },
  { id: "envioMode", label: "Mod. envio", grupo: "clienteEnvio", curto: "Envio" },

  { id: "quantidade", label: "Qtd.", grupo: "qtdUnitario", curto: "Qtd" },
  { id: "unitario", label: "Unitário", grupo: "qtdUnitario", curto: "Unitário" },

  { id: "valor", label: "Valor", grupo: "financeiro", curto: "Valor" },
  { id: "taxa", label: "Taxa", grupo: "financeiro", curto: "Taxa" },
  { id: "frete", label: "Frete", grupo: "financeiro", curto: "Frete" },

  { id: "cmv", label: "CMV", grupo: "cmvMargem", curto: "CMV" },
  { id: "margem", label: "Margem", grupo: "cmvMargem", curto: "Margem" },
];

/**
 * O padrão: TUDO visível.
 *
 * E não a mistura de `false` que estava nos oito literais. Ela não vinha de
 * decisão nenhuma — vinha de a tabela antiga ter colunas demais para caber, e o
 * remédio era desligar algumas por padrão. A tabela de hoje agrupa a informação e
 * mostra todos esses pedaços, então `true` em tudo é o único valor que descreve o
 * que a tela realmente exibe. Um padrão que não corresponde à tela é como o
 * botão chegou a ser puramente decorativo.
 */
export const COLUNAS_PADRAO: ColunasVisiveis = Object.fromEntries(
  COLUNAS_VENDAS.map((c) => [c.id, true]),
) as ColunasVisiveis;

/**
 * Completa o que faltar com o padrão.
 *
 * Preferência salva de uma versão anterior não conhece coluna nova, e sem isto a
 * coluna nova chegaria como `undefined` — que é falso, ou seja, ela nasceria
 * escondida para quem já usava o sistema e visível para quem chegou depois.
 */
export function normalizarColunas(
  parcial: Partial<ColunasVisiveis> | undefined | null,
): ColunasVisiveis {
  if (!parcial) return { ...COLUNAS_PADRAO };
  return { ...COLUNAS_PADRAO, ...parcial };
}

/**
 * As colunas oferecidas para uma plataforma.
 *
 * A Shopee não tem ADS, exposição nem tipo de anúncio: `VendasTable` já não
 * desenha esses selos para ela (`!isShopee`). Oferecer as caixas de seleção
 * mesmo assim seria repetir o defeito que este arquivo existe para corrigir —
 * um controle que promete algo que a tela não faz.
 */
export function colunasDaPlataforma(platform: string | undefined): DefinicaoColuna[] {
  if (platform === "Shopee") return COLUNAS_VENDAS.filter((c) => !c.somenteMeli);
  return COLUNAS_VENDAS;
}

/* -------------------------------------------------------------------------- */
/*                          Consultas para a tabela                           */
/* -------------------------------------------------------------------------- */

/** Os pedaços de um grupo que estão ligados. */
export function pedacosVisiveis(
  colunas: ColunasVisiveis,
  grupo: GrupoColuna,
): DefinicaoColuna[] {
  return COLUNAS_VENDAS.filter((c) => c.grupo === grupo && colunas[c.id]);
}

/**
 * O grupo aparece quando ao menos um pedaço dele aparece.
 *
 * Esconder a `<th>` e as `<td>` do grupo JUNTAS é obrigatório, não cosmético:
 * `<td>` casa com `<th>` por posição, e omitir só um dos dois desloca todas as
 * colunas seguintes — o valor do frete apareceria embaixo de "CMV / Margem".
 */
export function grupoVisivel(colunas: ColunasVisiveis, grupo: GrupoColuna): boolean {
  return COLUNAS_VENDAS.some((c) => c.grupo === grupo && colunas[c.id]);
}

/**
 * Rótulo do cabeçalho, montado a partir do que sobrou visível.
 *
 * "Data / Canal" com o canal desligado vira "Data". O cabeçalho fixo era o que
 * fazia a tabela prometer uma coluna de canal que não existia mais.
 *
 * `platform` entra na conta para a Shopee não herdar rótulo de campo que ela não
 * tem — a lista dela já vem filtrada, mas o objeto de colunas pode continuar com
 * `ads: true` guardado de outra tela.
 */
export function rotuloGrupo(
  colunas: ColunasVisiveis,
  grupo: GrupoColuna,
  platform?: string,
): string {
  const oferecidas = new Set(colunasDaPlataforma(platform).map((c) => c.id));

  const partes = pedacosVisiveis(colunas, grupo)
    .filter((c) => oferecidas.has(c.id))
    // ADS, exposição e tipo são SELOS dentro da célula de produto, não colunas
    // próprias: entram no rótulo só quando são a única coisa que sobrou ali,
    // senão o cabeçalho viraria "Produto / SKU / ADS / Exposição / Tipo".
    .filter((c) => !c.somenteMeli || pedacosVisiveis(colunas, grupo).length <= 1);

  if (partes.length === 0) return "";
  return partes.map((c) => c.curto).join(" / ");
}
