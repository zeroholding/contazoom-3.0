/**
 * Tipos de notificação — versão segura para o navegador (só dado, sem import).
 *
 * O sino junta as notificações POR TIPO. Hoje todo aviso nasce de um documento
 * que a equipe enviou ao cliente, então o tipo é a natureza do documento — a
 * mesma divisão das pastas padrão do drive (`DOCUMENT_CATEGORIES`): impostos,
 * folha, faturamento e institucional. É a divisão que o cliente de contabilidade
 * entende, e é a que pede atenção diferente: guia de imposto tem vencimento,
 * contrato social não.
 *
 * Tipo novo (aviso de tarefa, de vencimento...) entra aqui com `ordem` e
 * `email`, sem migração: a coluna é texto, como `usuario.role`.
 */

export const TIPO_NOTIFICACAO = {
  DOCUMENTO_IMPOSTOS: "DOCUMENTO_IMPOSTOS",
  DOCUMENTO_FOLHA: "DOCUMENTO_FOLHA",
  DOCUMENTO_FATURAMENTO: "DOCUMENTO_FATURAMENTO",
  DOCUMENTO_INSTITUCIONAL: "DOCUMENTO_INSTITUCIONAL",
  DOCUMENTO_GERAL: "DOCUMENTO_GERAL",
} as const;

export type TipoNotificacao = (typeof TIPO_NOTIFICACAO)[keyof typeof TIPO_NOTIFICACAO];

export type InfoTipoNotificacao = {
  /** Título do grupo no sino e no e-mail. */
  rotulo: string;
  /** Aba do sino, onde o espaço é curto. */
  rotuloCurto: string;
  /** Ordem dos grupos: o que tem prazo vem primeiro. */
  ordem: number;
  /** Se o aviso também vai por e-mail. */
  email: boolean;
};

export const TIPOS_NOTIFICACAO: Record<TipoNotificacao, InfoTipoNotificacao> = {
  DOCUMENTO_IMPOSTOS: { rotulo: "Impostos e obrigações", rotuloCurto: "Impostos", ordem: 1, email: true },
  DOCUMENTO_FOLHA: { rotulo: "Folha e funcionários", rotuloCurto: "Folha", ordem: 2, email: true },
  DOCUMENTO_FATURAMENTO: { rotulo: "Faturamento e relatórios", rotuloCurto: "Faturamento", ordem: 3, email: true },
  DOCUMENTO_INSTITUCIONAL: {
    rotulo: "Documentos institucionais",
    rotuloCurto: "Institucionais",
    ordem: 4,
    email: true,
  },
  DOCUMENTO_GERAL: { rotulo: "Outros documentos", rotuloCurto: "Outros", ordem: 5, email: true },
};

/** Tipo que não está na tabela (linha antiga, tipo removido): não quebra o sino. */
const TIPO_DESCONHECIDO: InfoTipoNotificacao = {
  rotulo: "Avisos",
  rotuloCurto: "Avisos",
  ordem: 99,
  email: false,
};

export function infoTipoNotificacao(tipo: string): InfoTipoNotificacao {
  return TIPOS_NOTIFICACAO[tipo as TipoNotificacao] ?? TIPO_DESCONHECIDO;
}

export function ehNotificacaoDeDocumento(tipo: string): boolean {
  return tipo.startsWith("DOCUMENTO_");
}

/** Situação do e-mail de cada notificação (coluna `email_status`). */
export const STATUS_EMAIL = {
  PENDENTE: "PENDENTE",
  ENVIANDO: "ENVIANDO",
  ENVIADO: "ENVIADO",
  FALHOU: "FALHOU",
  NAO_CONFIGURADO: "NAO_CONFIGURADO",
  NAO_SE_APLICA: "NAO_SE_APLICA",
  SEM_DESTINATARIO: "SEM_DESTINATARIO",
} as const;

/**
 * O que a tela recebe de `/api/notificacoes`. Mora aqui, e não na rota, para o
 * hook do navegador e a API falarem do mesmo formato.
 */
export type DadosNotificacaoDocumento = {
  documentoId: string;
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
  /** Caminho legível: "Impostos e obrigações › 2026". */
  pasta: string | null;
  /** "setembro de 2026", só para documento com competência (impostos). */
  competencia: string | null;
};

export type NotificacaoItem = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  documentoId: string | null;
  dados: Partial<DadosNotificacaoDocumento> | null;
  lida: boolean;
  criadaEm: string;
  /** O e-mail deste aviso já saiu (a tela só diz "foi para o seu e-mail" se for verdade). */
  emailEnviado: boolean;
};

export type ResumoTipo = { tipo: string; rotulo: string; rotuloCurto: string; naoLidas: number };

export type RespostaNotificacoes = {
  naoLidas: number;
  porTipo: ResumoTipo[];
  itens: NotificacaoItem[];
};
