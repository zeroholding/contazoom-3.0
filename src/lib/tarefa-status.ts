/**
 * Os 6 status de entrega e a derivação a partir da etapa.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 4 e 7.
 *
 * Este arquivo é o que faz as duas camadas do módulo funcionarem sem
 * retrabalho:
 *
 *   - a ETAPA é o que se move, e é o que vai para o log
 *   - o STATUS é CALCULADO a partir dela
 *
 * O escritório propôs expor só os 6 status macro; a gestão precisa ver as
 * etapas. Derivando um do outro, o escritório move a etapa uma vez e o status
 * sai de graça — e se um dia o cliente final tiver acesso, ele vê apenas o
 * status, sem que ninguém precise registrar duas coisas.
 *
 * Ninguém preenche status à mão. As duas exceções são estados de BLOQUEIO, que
 * não são posição no fluxo: "Aguardando documentação do cliente" e "Pendência
 * identificada" sobrepõem o status derivado enquanto o bloqueio existir.
 */

import { fluxoApuracao, fluxoLegalizacao } from "./tarefa-etapas";

export const STATUS = {
  AGUARDANDO_DOCUMENTACAO: "AGUARDANDO_DOCUMENTACAO",
  EM_ELABORACAO: "EM_ELABORACAO",
  EM_REVISAO: "EM_REVISAO",
  ENTREGUE: "ENTREGUE",
  PENDENCIA_IDENTIFICADA: "PENDENCIA_IDENTIFICADA",
  CONCLUIDO: "CONCLUIDO",
} as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

/** Textos exatos da apresentação do escritório (slide 2). Não abreviar. */
export const STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_DOCUMENTACAO: "Aguardando documentação do cliente",
  EM_ELABORACAO: "Em elaboração",
  EM_REVISAO: "Em revisão / conferência",
  ENTREGUE: "Entregue",
  PENDENCIA_IDENTIFICADA: "Pendência identificada",
  CONCLUIDO: "Concluído",
};

/** Versão curta, para cartão e coluna estreita. */
export const STATUS_LABEL_CURTO: Record<string, string> = {
  AGUARDANDO_DOCUMENTACAO: "Aguardando documentação",
  EM_ELABORACAO: "Em elaboração",
  EM_REVISAO: "Em revisão",
  ENTREGUE: "Entregue",
  PENDENCIA_IDENTIFICADA: "Pendência",
  CONCLUIDO: "Concluído",
};

/**
 * Ordem das colunas do Kanban.
 *
 * "Pendência identificada" fica antes de "Concluído" de propósito: é onde o
 * olho tem de bater antes de olhar o que já acabou.
 */
export const STATUS_ORDEM: string[] = [
  STATUS.AGUARDANDO_DOCUMENTACAO,
  STATUS.EM_ELABORACAO,
  STATUS.EM_REVISAO,
  STATUS.ENTREGUE,
  STATUS.PENDENCIA_IDENTIFICADA,
  STATUS.CONCLUIDO,
];

/**
 * Cores dos status.
 *
 * A apresentação usa seis cores saturadas. A identidade do ContaZoom é laranja,
 * branco e preto, e seis cores fortes competindo com o laranja da marca viram
 * ruído. Aqui o laranja continua sendo marca e ação, e os status usam uma escala
 * de sinal contida — com o status de trabalho em curso justamente no laranja,
 * o que casa semântica com identidade em vez de brigar com ela.
 *
 * Regra que vale para toda a interface: NENHUM status é comunicado só por cor.
 * Sempre cor + texto + ícone. Quem não distingue vermelho de verde precisa
 * conseguir usar o sistema.
 */
export type CorStatus = {
  /** Classe Tailwind pronta para o selo. */
  selo: string;
  /** Cor sólida, para barra de coluna e gráfico. */
  solida: string;
  /** Ícone lucide correspondente. Nunca emoji. */
  icone: string;
};

export const STATUS_COR: Record<string, CorStatus> = {
  AGUARDANDO_DOCUMENTACAO: {
    selo: "bg-[#FEF2F2] text-[#B42318] border-[#FECDCA]",
    solida: "#D92D20",
    icone: "Clock",
  },
  EM_ELABORACAO: {
    // Laranja da marca: trabalho em curso.
    selo: "bg-[#FFF4EB] text-[#C2410C] border-[#FED7AA]",
    solida: "#EA580C",
    icone: "Loader",
  },
  EM_REVISAO: {
    selo: "bg-[#F4F3FF] text-[#5925DC] border-[#D9D6FE]",
    solida: "#6938EF",
    icone: "Search",
  },
  ENTREGUE: {
    selo: "bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]",
    solida: "#1570EF",
    icone: "Send",
  },
  PENDENCIA_IDENTIFICADA: {
    selo: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
    solida: "#DC6803",
    icone: "AlertTriangle",
  },
  CONCLUIDO: {
    selo: "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]",
    solida: "#039855",
    icone: "CheckCircle2",
  },
};

/** Fallback seguro para status desconhecido, em vez de quebrar a tela. */
const COR_PADRAO: CorStatus = {
  selo: "bg-gray-100 text-gray-700 border-gray-200",
  solida: "#667085",
  icone: "Circle",
};

export function corDoStatus(status: string): CorStatus {
  return STATUS_COR[status] ?? COR_PADRAO;
}

export function labelDoStatus(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/* -------------------------------------------------------------------------- */
/*                                 Derivação                                  */
/* -------------------------------------------------------------------------- */

export type EntradaDerivacao = {
  etapaAtual: number;
  bloqueada?: boolean | null;
  bloqueioResponsavel?: string | null;
};

/**
 * Regra de bloqueio, que sobrepõe o status derivado da etapa.
 *
 * Travado esperando o cliente é "Aguardando documentação"; travado por qualquer
 * outro motivo é "Pendência identificada". A etapa continua onde estava — é isso
 * que permite ler "está na etapa 4, travada há 6 dias esperando o cliente", que
 * é a informação que resolve reunião.
 */
function statusDeBloqueio(bloqueioResponsavel?: string | null): string {
  return bloqueioResponsavel === "CLIENTE"
    ? STATUS.AGUARDANDO_DOCUMENTACAO
    : STATUS.PENDENCIA_IDENTIFICADA;
}

function derivar(
  fluxo: { numero: number; statusDerivado: string }[],
  entrada: EntradaDerivacao
): string {
  if (entrada.bloqueada) return statusDeBloqueio(entrada.bloqueioResponsavel);

  // Etapa 0 = tarefa criada e ainda não iniciada.
  if (!entrada.etapaAtual || entrada.etapaAtual < 1) {
    return STATUS.AGUARDANDO_DOCUMENTACAO;
  }

  // Etapa além do fluxo só acontece quando a última foi concluída.
  const ultima = fluxo[fluxo.length - 1];
  if (entrada.etapaAtual >= ultima.numero) return STATUS.CONCLUIDO;

  const etapa = fluxo.find((e) => e.numero === entrada.etapaAtual);
  return etapa?.statusDerivado ?? STATUS.EM_ELABORACAO;
}

/** Status macro de uma apuração. */
export function statusApuracao(
  regime: string,
  entrada: EntradaDerivacao
): string {
  return derivar(fluxoApuracao(regime), entrada);
}

/** Status macro de um processo de legalização. */
export function statusLegalizacao(
  tipo: string,
  entrada: EntradaDerivacao
): string {
  return derivar(fluxoLegalizacao(tipo), entrada);
}

/* -------------------------------------------------------------------------- */
/*                              Prazo e atraso                                */
/* -------------------------------------------------------------------------- */

export const SITUACAO_PRAZO = {
  SEM_PRAZO: "SEM_PRAZO",
  NO_PRAZO: "NO_PRAZO",
  VENCE_EM_BREVE: "VENCE_EM_BREVE",
  ATRASADO: "ATRASADO",
  CONCLUIDO: "CONCLUIDO",
} as const;

export const SITUACAO_PRAZO_LABEL: Record<string, string> = {
  SEM_PRAZO: "Sem prazo definido",
  NO_PRAZO: "No prazo",
  VENCE_EM_BREVE: "Vence em breve",
  ATRASADO: "Atrasado",
  CONCLUIDO: "Concluído",
};

/** Dias a partir dos quais o prazo passa a ser destacado como "vence em breve". */
export const DIAS_ALERTA_PRAZO = 3;

/**
 * Situação de prazo e quantos dias faltam (ou passaram).
 *
 * Compara em dia cheio, não em milissegundos: prazo é "dia 20", e uma tarefa não
 * fica atrasada às 00h01 do dia 20 só porque o prazo foi gravado à meia-noite.
 */
export function situacaoPrazo(
  prazo: Date | string | null | undefined,
  concluido: boolean,
  referencia: Date = new Date()
): { situacao: string; dias: number | null } {
  if (concluido) return { situacao: SITUACAO_PRAZO.CONCLUIDO, dias: null };
  if (!prazo) return { situacao: SITUACAO_PRAZO.SEM_PRAZO, dias: null };

  const alvo = prazo instanceof Date ? prazo : new Date(prazo);
  if (Number.isNaN(alvo.getTime())) {
    return { situacao: SITUACAO_PRAZO.SEM_PRAZO, dias: null };
  }

  const diaAlvo = Date.UTC(
    alvo.getUTCFullYear(),
    alvo.getUTCMonth(),
    alvo.getUTCDate()
  );
  const diaHoje = Date.UTC(
    referencia.getUTCFullYear(),
    referencia.getUTCMonth(),
    referencia.getUTCDate()
  );
  const dias = Math.round((diaAlvo - diaHoje) / 86_400_000);

  if (dias < 0) return { situacao: SITUACAO_PRAZO.ATRASADO, dias };
  if (dias <= DIAS_ALERTA_PRAZO) {
    return { situacao: SITUACAO_PRAZO.VENCE_EM_BREVE, dias };
  }
  return { situacao: SITUACAO_PRAZO.NO_PRAZO, dias };
}

/** Quantos dias um bloqueio já dura. É o número que cobra ação. */
export function diasEmBloqueio(
  desde: Date | string | null | undefined,
  referencia: Date = new Date()
): number | null {
  if (!desde) return null;
  const inicio = desde instanceof Date ? desde : new Date(desde);
  if (Number.isNaN(inicio.getTime())) return null;
  return Math.max(
    0,
    Math.round((referencia.getTime() - inicio.getTime()) / 86_400_000)
  );
}

/* -------------------------------------------------------------------------- */
/*                                Competência                                 */
/* -------------------------------------------------------------------------- */

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "2026-01" — formato para chave, URL e ordenação. */
export function competenciaChave(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** "Janeiro/2026" — formato para leitura humana. */
export function competenciaLabel(ano: number, mes: number): string {
  const nome = MESES[mes - 1] ?? String(mes);
  return `${nome}/${ano}`;
}

/** "01/2026" — formato compacto, para cartão. */
export function competenciaCurta(ano: number, mes: number): string {
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

/**
 * Converte "2026-01" em { ano, mes }, ou null se inválido.
 *
 * Valida o mês de verdade: "2026-13" e "2026-00" são recusados, porque um mês
 * fora de 1..12 geraria competência impossível de exibir.
 */
export function parseCompetencia(
  valor: unknown
): { ano: number; mes: number } | null {
  if (typeof valor !== "string") return null;
  const casa = valor.trim().match(/^(\d{4})-(\d{2})$/);
  if (!casa) return null;
  const ano = Number(casa[1]);
  const mes = Number(casa[2]);
  if (mes < 1 || mes > 12) return null;
  if (ano < 2000 || ano > 2100) return null;
  return { ano, mes };
}

/**
 * A competência que se apura no mês de referência.
 *
 * A apuração de janeiro é feita em fevereiro, então "abrir o mês" em fevereiro
 * cria a competência de janeiro. É isso que a rotina automática usa.
 */
export function competenciaAnterior(referencia: Date = new Date()): {
  ano: number;
  mes: number;
} {
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth() + 1;
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export const STATUS_VALIDOS = Object.values(STATUS) as string[];
