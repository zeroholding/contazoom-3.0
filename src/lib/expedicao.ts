/**
 * Vocabulário do módulo de Expedição: tipos, classificação de urgência e rótulos.
 *
 * NÃO IMPORTA PRISMA NEM `next/server` DE PROPÓSITO — mesmo motivo de
 * `src/lib/papeis.ts`. A tela é um componente `"use client"` e precisa das cores
 * e dos rótulos de urgência para pintar as etiquetas; se este arquivo tocasse o
 * Prisma, o cliente do banco iria inteiro para o pacote do navegador. As
 * consultas ficam em `expedicao-data.ts`, que é só servidor.
 */

/* -------------------------------------------------------------------------- */
/*                                   Canais                                   */
/* -------------------------------------------------------------------------- */

export type Canal = "ML" | "SP";

export const CANAIS: Canal[] = ["ML", "SP"];

export const CANAL_ROTULO: Record<Canal, string> = {
  ML: "Mercado Livre",
  SP: "Shopee",
};

export function ehCanal(valor: string): valor is Canal {
  return (CANAIS as string[]).includes(valor);
}

/* -------------------------------------------------------------------------- */
/*                                  Urgência                                  */
/* -------------------------------------------------------------------------- */

/**
 * Faixa de urgência de um pacote.
 *
 * A fila de expedição não tem "status": ninguém marca nada como separado neste
 * módulo (ele é 100% leitura, igual ao do CyberDock e ao do NEXUS v2 — o estado
 * real vem do sync do marketplace). O que organiza o trabalho é o quanto falta
 * para o prazo, e é isso que estas faixas nomeiam.
 *
 * `semPrazo` é uma faixa de verdade, e não um caso de erro: venda cujo prazo o
 * marketplace não informou tem de aparecer em algum lugar, senão vira trabalho
 * invisível. Ela fica visualmente neutra para não competir com o vermelho de
 * quem está de fato atrasado.
 */
export type Urgencia =
  | "atrasado"
  | "hoje"
  | "amanha"
  | "proximo"
  | "futuro"
  | "semPrazo";

/** Ordem de exibição: do mais urgente ao menos. */
export const URGENCIAS: Urgencia[] = [
  "atrasado",
  "hoje",
  "amanha",
  "proximo",
  "futuro",
  "semPrazo",
];

export function ehUrgencia(valor: string): valor is Urgencia {
  return (URGENCIAS as string[]).includes(valor);
}

export const URGENCIA_ROTULO: Record<Urgencia, string> = {
  atrasado: "Atrasado",
  hoje: "Vence hoje",
  amanha: "Vence amanhã",
  proximo: "Próximos dias",
  futuro: "Com folga",
  semPrazo: "Sem prazo",
};

/**
 * Classes da etiqueta de urgência.
 *
 * Vermelho, âmbar e laranja são SEMÂNTICOS aqui (ruim, vence hoje, vence amanhã)
 * e por isso não foram trocados pelo laranja da marca, que no produto significa
 * "ação". Cinza para `semPrazo` é deliberado: ausência de informação não é
 * gravidade, e pintá-la de vermelho faria a tela gritar por um dado que o
 * marketplace simplesmente não mandou.
 */
export const URGENCIA_CLASSE: Record<Urgencia, string> = {
  atrasado: "border-rose-200 bg-rose-50 text-rose-700",
  hoje: "border-amber-200 bg-amber-50 text-amber-800",
  amanha: "border-orange-200 bg-orange-50 text-orange-800",
  proximo: "border-sky-200 bg-sky-50 text-sky-700",
  futuro: "border-emerald-200 bg-emerald-50 text-emerald-700",
  semPrazo: "border-slate-200 bg-slate-50 text-slate-600",
};

/** Tom do cartão de indicador, para o kit `Kpi` do shell. */
export const URGENCIA_TOM: Partial<Record<Urgencia, "alerta" | "critico">> = {
  atrasado: "critico",
  hoje: "alerta",
};

/**
 * Cor da barra vertical na borda esquerda da linha.
 *
 * É o que permite achar os atrasados descendo o olho pela margem, sem ler nada.
 * Numa fila de cinquenta linhas, o selo de urgência está no fim da linha e exige
 * varredura horizontal; a barra fica na margem e todas as linhas compartilham a
 * mesma coluna de leitura.
 */
export const URGENCIA_BARRA: Record<Urgencia, string> = {
  atrasado: "border-l-rose-500",
  hoje: "border-l-amber-500",
  amanha: "border-l-orange-400",
  proximo: "border-l-sky-400",
  futuro: "border-l-emerald-400",
  semPrazo: "border-l-slate-300",
};

/**
 * Faixa a partir de "quantos dias faltam".
 *
 * `dias` é a diferença entre DATAS CIVIS em São Paulo, não uma divisão de
 * milissegundos por 86.400.000: o que importa é se o prazo cai hoje, e um prazo
 * às 23h de hoje está a poucas horas mas continua sendo "hoje". Dividir duração
 * por dia daria `0` para as 23h de hoje e também `0` para as 22h de amanhã.
 *
 * O cálculo vem do SQL (ver `expedicao-data.ts`), que é onde o fuso é aplicado.
 * Esta função só nomeia o resultado, e existe para a tela poder reclassificar sem
 * pedir de novo ao servidor.
 */
export function classificarUrgencia(dias: number | null): Urgencia {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) {
    return "semPrazo";
  }
  if (dias < 0) return "atrasado";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanha";
  if (dias <= 3) return "proximo";
  return "futuro";
}

/** "Atrasado 2 dias", "Vence hoje", "Em 5 dias". */
export function rotuloPrazo(dias: number | null): string {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) {
    return "Sem prazo informado";
  }
  if (dias < 0) {
    const atraso = Math.abs(dias);
    return atraso === 1 ? "Atrasado 1 dia" : `Atrasado ${atraso} dias`;
  }
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Vence amanhã";
  return `Em ${dias} dias`;
}

/* -------------------------------------------------------------------------- */
/*                                    Data                                    */
/* -------------------------------------------------------------------------- */

/**
 * Data de hoje em São Paulo, como `YYYY-MM-DD`.
 *
 * `en-CA` porque é o único idioma cujo formato curto de data JÁ é ISO
 * (`2026-09-09`), o que dispensa remontar a string a partir das partes — que é
 * onde `getNowInBrazil()`, copiado em uma dúzia de rotas deste projeto, troca dia
 * por mês quando alguém mexe na ordem do `split`.
 *
 * NÃO é usada para classificar urgência: isso acontece no SQL, com o
 * `NOW()` do banco, para a tela não depender do relógio do processo do Node.
 * Serve para a CHAVE DE CACHE, e é o que impede uma resposta calculada às 23h59
 * de continuar sendo servida às 00h05 dizendo "vence hoje" sobre ontem.
 */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/* -------------------------------------------------------------------------- */
/*                                  Modelo                                    */
/* -------------------------------------------------------------------------- */

/** Uma venda dentro do pacote. */
export type ItemPacote = {
  orderId: string;
  titulo: string;
  sku: string | null;
  quantidade: number;
  valorTotal: number;
  /** MLB do anúncio. Só Mercado Livre. Usado para achar a foto e o link. */
  itemId: string | null;
  /**
   * Variação do anúncio. `"-"` é o marcador de "olhei e não havia variação" —
   * ver o docblock do campo no schema.
   */
  variationId: string | null;
  /**
   * Foto da VARIAÇÃO vendida, com a capa do anúncio como reserva.
   *
   * Não vem do banco: é resolvida na API do Mercado Livre a cada carregamento,
   * porque foto de anúncio muda e não vale persistir. `null` quando o anúncio
   * não respondeu, foi apagado, ou é da Shopee (que não temos como consultar).
   */
  thumbnailUrl: string | null;
  /** Link do anúncio no Mercado Livre. */
  permalink: string | null;
  /** Categorias do cadastro de SKU. Servem para separar trabalho no galpão. */
  hierarquia1: string | null;
  hierarquia2: string | null;
};

/** Conta disponível para o filtro, já com o canal. */
export type ContaFiltro = { accountId: string; conta: string; canal: Canal };

/**
 * A unidade da tela é o PACOTE, não a venda.
 *
 * No Mercado Livre, várias vendas do mesmo comprador saem numa etiqueta só
 * (mesmo `shipping_id`). Contar e paginar por venda faria a tela dizer "12 a
 * despachar" onde o galpão tem 7 pacotes na mão, e a conferência nunca fecharia.
 * É a mesma decisão do CyberDock, que pagina sobre uma CTE de pacotes.
 */
export type PacoteExpedicao = {
  chave: string;
  canal: Canal;
  accountId: string;
  conta: string;
  comprador: string;
  /** Etiqueta/rastreio no ML; número de rastreio na Shopee. */
  shippingId: string | null;
  /** Modalidade de envio normalizada (ML) ou transportadora (Shopee). */
  modalidade: string;
  shippingStatus: string | null;
  status: string;
  dataVenda: string;
  prazoDespacho: string | null;
  /** NULL quando não há prazo. Negativo = atrasado. */
  diasRestantes: number | null;
  urgencia: Urgencia;
  /** Quantas vendas o pacote junta. */
  pedidos: number;
  unidades: number;
  valorTotal: number;
  /** Categoria do pacote (a do primeiro item). Ver o comentário no SQL. */
  hierarquia1: string | null;
  hierarquia2: string | null;
  itens: ItemPacote[];
};

/* -------------------------------------------------------------------------- */
/*                            Recorte por prazo                               */
/* -------------------------------------------------------------------------- */

/**
 * Atalhos de faixa de prazo.
 *
 * Existem porque a pergunta real nunca é "de 12/09 a 14/09": é "o que vence
 * hoje", "o que já venceu", "o que sai amanhã". Obrigar a digitar duas datas para
 * responder isso é transformar uma decisão de um clique em quatro.
 *
 * Vale junto com as fichas de urgência, e não em vez delas: o atalho estreita a
 * FAIXA consultada (e é o que protege a consulta), enquanto a ficha classifica o
 * que já veio. Quem escolhe "Próximos 7 dias" e clica em "Atrasado" está pedindo
 * uma interseção vazia de propósito — e a tela responde vazio, que é correto.
 */
export type PrazoPreset =
  | "personalizado"
  | "aDespachar"
  | "atrasados"
  | "hoje"
  | "amanha"
  | "proximos3"
  | "proximos7"
  | "esteMes"
  | "todas";

export const PRAZO_PRESETS: { chave: PrazoPreset; rotulo: string }[] = [
  { chave: "aDespachar", rotulo: "A despachar hoje" },
  { chave: "atrasados", rotulo: "Atrasados" },
  { chave: "hoje", rotulo: "Vencem hoje" },
  { chave: "amanha", rotulo: "Vencem amanhã" },
  { chave: "proximos3", rotulo: "Próximos 3 dias" },
  { chave: "proximos7", rotulo: "Próximos 7 dias" },
  { chave: "esteMes", rotulo: "Este mês" },
  { chave: "todas", rotulo: "Todos os prazos" },
  { chave: "personalizado", rotulo: "Período personalizado" },
];

export function ehPrazoPreset(valor: string): valor is PrazoPreset {
  return PRAZO_PRESETS.some((p) => p.chave === valor);
}

/**
 * Soma dias a uma data `YYYY-MM-DD` sem passar por fuso.
 *
 * Aritmética em UTC de propósito. `new Date("2026-09-09")` é meia-noite UTC; num
 * servidor em São Paulo (UTC-3) formatar isso de volta para data local devolve
 * 08/09 — um dia a menos, em silêncio. Este foi um defeito real do projeto irmão,
 * e é a razão de a conta ser feita nos getters UTC e a string ser remontada à mão
 * em vez de usar `toISOString` sobre um `Date` local.
 */
function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(a, (m ?? 1) - 1, d ?? 1);
  const alvo = new Date(base + dias * 86_400_000);
  const mm = String(alvo.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(alvo.getUTCDate()).padStart(2, "0");
  return `${alvo.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * Resolve o atalho em faixa de datas (`YYYY-MM-DD`), no calendário de São Paulo.
 *
 * `null` em qualquer ponta significa "sem limite desse lado" — é o que faz
 * "Atrasados" pegar tudo o que venceu, sem inventar um piso arbitrário, e
 * "Todos os prazos" não filtrar nada.
 */
export function resolverPrazo(
  preset: PrazoPreset,
  de: string | null,
  ate: string | null,
): { de: string | null; ate: string | null } {
  const hoje = hojeSP();

  switch (preset) {
    /**
     * "A despachar hoje" — o padrão da tela.
     *
     * Vai até hoje SEM PISO, ou seja inclui o que já venceu. Não é o mesmo que
     * `hoje`, e a diferença é o ponto: o que precisa sair do galpão hoje é o que
     * vence hoje MAIS tudo o que já deveria ter saído. Um preset que mostrasse só
     * o dia corrente esconderia justamente o pacote mais grave — o atrasado —
     * de quem abre a tela às oito da manhã para montar a carga.
     */
    case "aDespachar":
      return { de: null, ate: hoje };
    // Sem piso: um pacote parado há três meses continua sendo trabalho, e cortar
    // em 30 dias esconderia justamente o caso mais grave.
    case "atrasados":
      return { de: null, ate: somarDias(hoje, -1) };
    case "hoje":
      return { de: hoje, ate: hoje };
    case "amanha":
      return { de: somarDias(hoje, 1), ate: somarDias(hoje, 1) };
    // Inclui hoje: quem pergunta "próximos 3 dias" está planejando o trabalho, e
    // o que vence hoje é a primeira coisa desse plano.
    case "proximos3":
      return { de: hoje, ate: somarDias(hoje, 3) };
    case "proximos7":
      return { de: hoje, ate: somarDias(hoje, 7) };
    // O último dia é calculado, não fixado em 31: `2026-09-31` e `2026-02-31`
    // passam por qualquer validação de FORMATO e são recusados pelo Postgres na
    // conversão para `date`, derrubando a consulta com 500. Dia 0 do mês seguinte
    // é o último dia deste, sem tabela de meses e sem regra de ano bissexto.
    case "esteMes": {
      const primeiro = `${hoje.slice(0, 7)}-01`;
      const [a, m] = hoje.split("-").map(Number);
      const ultimo = new Date(Date.UTC(a, m, 0));
      const dd = String(ultimo.getUTCDate()).padStart(2, "0");
      return { de: primeiro, ate: `${hoje.slice(0, 7)}-${dd}` };
    }
    case "todas":
      return { de: null, ate: null };
    case "personalizado":
    default: {
      // Datas invertidas são erro de digitação, não pedido de lista vazia.
      if (de && ate && de > ate) return { de: ate, ate: de };
      return { de: de ?? null, ate: ate ?? null };
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                              Outros recortes                               */
/* -------------------------------------------------------------------------- */

/** Situação da VENDA, que é diferente da situação do ENVIO. */
export type StatusVenda = "pago" | "cancelado" | "todos";

export const STATUS_VENDA: { chave: StatusVenda; rotulo: string }[] = [
  { chave: "pago", rotulo: "Pagas" },
  { chave: "cancelado", rotulo: "Canceladas" },
  { chave: "todos", rotulo: "Todas" },
];

export function ehStatusVenda(valor: string): valor is StatusVenda {
  return STATUS_VENDA.some((s) => s.chave === valor);
}

/**
 * Tem ou não prazo registrado.
 *
 * Serve para os dois lados do problema: "só o que tem prazo" é a fila confiável
 * para trabalhar, e "só o que NÃO tem" é a lista de conferência de quem quer
 * descobrir por que uma venda ficou sem prazo — que é uma pergunta de manutenção,
 * não de galpão, e por isso não é o padrão.
 */
export type TemPrazo = "com" | "sem" | "todos";

export const TEM_PRAZO: { chave: TemPrazo; rotulo: string }[] = [
  { chave: "todos", rotulo: "Com e sem prazo" },
  { chave: "com", rotulo: "Só com prazo" },
  { chave: "sem", rotulo: "Só sem prazo" },
];

export function ehTemPrazo(valor: string): valor is TemPrazo {
  return TEM_PRAZO.some((t) => t.chave === valor);
}

/**
 * Uma linha dos resumos do rodapé.
 *
 * `pacotes` e `vendas` são coisas diferentes e as duas aparecem: no Mercado Livre
 * várias vendas do mesmo comprador saem numa etiqueta só, então "8 pacotes / 11
 * vendas" é normal. Mostrar só um dos dois faz a conferência com o painel do
 * marketplace (que conta VENDAS) parecer errada.
 */
export type LinhaResumo = {
  rotulo: string;
  pacotes: number;
  /** Vendas dentro desses pacotes. */
  vendas: number;
  unidades: number;
  valorTotal: number;
};

export type OrdemExpedicao = "prazo" | "venda" | "valor" | "unidades";

export const ORDENS: OrdemExpedicao[] = ["prazo", "venda", "valor", "unidades"];

export function ehOrdem(valor: string): valor is OrdemExpedicao {
  return (ORDENS as string[]).includes(valor);
}

export type FiltrosExpedicao = {
  /** Vazio = todos. */
  canais: Canal[];
  /** IDs de `meli_account` / `shopee_account`. Vazio = todas. */
  contas: string[];
  /** Vazio = todas. */
  urgencias: Urgencia[];
  /** Modalidade/transportadora já normalizada. Vazio = todas. */
  modalidades: string[];
  /** Categorias do cadastro de SKU. Vazio = todas. */
  hierarquias1: string[];
  hierarquias2: string[];
  /**
   * Códigos de SKU. Vazio = todos.
   *
   * Recorta as VENDAS, não os pacotes: escolher um SKU deixa na tela só as vendas
   * daquele SKU, e um pacote misto aparece com o item selecionado apenas. É a
   * pergunta de quem vai separar um lote específico ("quantas unidades deste
   * produto saem hoje"), e responder com o pacote inteiro traria produto que não
   * faz parte do lote.
   *
   * Diferente de `hierarquias1/2`, que são as CATEGORIAS do cadastro. Aqui é o
   * código do produto, um por um.
   */
  skus: string[];
  busca: string;

  /** Atalho de faixa de prazo. `personalizado` usa `prazoDe`/`prazoAte`. */
  prazoPreset: PrazoPreset;
  /** Faixa de PRAZO DE DESPACHO, em data civil de São Paulo. */
  prazoDe: string | null;
  prazoAte: string | null;

  /**
   * Faixa da DATA DA VENDA. Recorte OPCIONAL dentro da janela.
   *
   * Não substitui `janelaDias`: a janela é o teto de segurança que impede a
   * consulta de varrer a tabela inteira, e vale sempre. Estas duas datas
   * estreitam ainda mais, quando alguém quer conferir um lote específico.
   */
  vendaDe: string | null;
  vendaAte: string | null;

  statusVenda: StatusVenda;
  temPrazo: TemPrazo;

  /** Janela sobre a DATA DA VENDA, em dias. Ver `expedicao-data.ts`. */
  janelaDias: number;
  ordem: OrdemExpedicao;
  direcao: "asc" | "desc";
  pagina: number;
  porPagina: number;
};

export const FILTROS_PADRAO: FiltrosExpedicao = {
  canais: [],
  contas: [],
  urgencias: [],
  modalidades: [],
  hierarquias1: [],
  hierarquias2: [],
  skus: [],
  busca: "",
  /**
   * A tela abre em "A DESPACHAR HOJE".
   *
   * Que é o trabalho do dia: o que vence hoje MAIS o que já venceu. Um padrão de
   * `hoje` puro esconderia o atrasado — o caso mais grave — de quem abre a tela
   * pela manhã, e por isso o preset tem piso aberto. E um padrão de "todos os
   * prazos" abre a fila inteira, incluindo o que vence em três semanas, o que
   * afoga a decisão de agora numa lista que não é de hoje.
   *
   * As fichas de urgência continuam mostrando a distribuição do recorte, e trocar
   * para "Todos os prazos" é um clique.
   */
  prazoPreset: "aDespachar",
  prazoDe: null,
  prazoAte: null,
  vendaDe: null,
  vendaAte: null,
  // Pagas: venda cancelada não é trabalho de expedição.
  statusVenda: "pago",
  temPrazo: "todos",
  janelaDias: 60,
  // Prazo crescente: o que vence primeiro aparece primeiro. É a única ordenação
  // que serve para começar o dia nesta tela.
  ordem: "prazo",
  direcao: "asc",
  pagina: 1,
  porPagina: 50,
};

export type ContaExpedicao = {
  accountId: string;
  conta: string;
  canal: Canal;
  pacotes: number;
};

export type ResultadoExpedicao = {
  pacotes: PacoteExpedicao[];
  /** Total de PACOTES que passam em TODOS os filtros. Base da paginação. */
  total: number;
  totalPaginas: number;
  /** Contagem por faixa, ignorando o filtro de urgência — alimenta as fichas. */
  porUrgencia: Record<Urgencia, number>;
  /**
   * VENDAS a despachar no conjunto filtrado.
   *
   * Separado de `total` (que conta PACOTES) porque são as duas perguntas que o
   * galpão faz: quantas etiquetas vou imprimir, e quantas vendas vou dar baixa.
   * No Mercado Livre uma etiqueta pode cobrir três vendas, então os dois números
   * divergem — e é o de vendas que fecha com o painel do marketplace.
   */
  vendas: number;
  /** Somas do conjunto filtrado inteiro, não só da página. */
  unidades: number;
  valorTotal: number;
  contas: ContaExpedicao[];
  modalidades: string[];
  /** Opções de hierarquia disponíveis, para os filtros. */
  opcoesHierarquia1: string[];
  opcoesHierarquia2: string[];
  /**
   * SKUs presentes na fila, para o filtro.
   *
   * Vem da consulta SEM os filtros do usuário, igual às outras facetas: escolher
   * um SKU não pode apagar os outros da lista, senão não há como trocar de SKU
   * sem limpar tudo.
   */
  opcoesSku: string[];
  /**
   * Resumos do rodapé: onde o trabalho está concentrado.
   *
   * A lista responde "o que despachar"; os resumos respondem "por onde começar".
   * Trinta pacotes espalhados em dez categorias é um dia de trabalho diferente de
   * trinta pacotes na mesma prateleira, e a lista paginada não mostra isso.
   */
  resumoHierarquia1: LinhaResumo[];
  resumoHierarquia2: LinhaResumo[];
  resumoModalidade: LinhaResumo[];
  /**
   * Resumo por SKU.
   *
   * É o resumo que o galpão realmente usa: "deste código saem 14 unidades hoje"
   * é a lista de separação condensada, e evita ir à prateleira duas vezes pelo
   * mesmo produto porque ele apareceu em pacotes diferentes.
   */
  resumoSku: LinhaResumo[];
  /** Quantas vendas ainda não passaram pelo backfill de prazo. */
  prazoPendente: number;
};
