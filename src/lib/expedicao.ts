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
  busca: string;
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
  busca: "",
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
  /** Somas do conjunto filtrado inteiro, não só da página. */
  unidades: number;
  valorTotal: number;
  contas: ContaExpedicao[];
  modalidades: string[];
  /** Quantas vendas ainda não passaram pelo backfill de prazo. */
  prazoPendente: number;
};
