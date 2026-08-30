/**
 * Tipos das respostas das rotas do módulo de tarefas.
 *
 * Escrito a partir do que as rotas realmente devolvem, não do que seria
 * elegante. Duas assimetrias reais estão preservadas aqui de propósito, porque
 * "consertar" no tipo só transferiria o erro para runtime:
 *
 *   - apuração devolve `tarefas` + `pagination`; legalização devolve `itens` +
 *     `paginacao` (com `totalPaginas`)
 *   - apuração devolve `prazo: { situacao, dias }`; legalização devolve
 *     `situacaoPrazo` e `diasPrazo` soltos no nível de cima
 *
 * `null` aparece em quase todo campo opcional porque o Prisma devolve `null`, não
 * `undefined` — tratar como opcional levaria a `campo === undefined` que nunca
 * é verdade.
 */

/* ------------------------------- Paginação -------------------------------- */

/** Empresas, log e apuração. Atenção: `totalPages` pode vir 0 no log e na apuração. */
export type Pagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/** Só legalização. Nome e campos diferentes. */
export type Paginacao = {
  page: number;
  limit: number;
  total: number;
  totalPaginas: number;
};

/* -------------------------------- Pessoas --------------------------------- */

export type PessoaResumo = {
  id: string;
  name: string | null;
  email: string;
};

export type UsuarioInterno = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  papelLabel: string;
  rotulo: string;
};

/* -------------------------------- Empresas -------------------------------- */

export type EmpresaLista = {
  id: string;
  /** `null` na empresa em abertura, que é cadastrada antes de o CNPJ existir. */
  cnpj: string | null;
  grupo: string | null;
  razaoSocial: string;
  nomeFantasia: string | null;
  regime: string;
  /** PLANO_SIMPLES, PLANO_PRESUMIDO, PLANO_STANDBY, SEM_PLANO_SUSPENSA */
  planoInterno: string;
  /** Derivada do plano e do CNPJ. Mantida para a tela de detalhe e o histórico. */
  situacao: string;
  tributoLocal: string;
  inscricaoMunicipal: string | null;
  inscricaoEstadual: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  uf: string | null;
  municipio: string | null;
  responsavelOperacional: string | null;
  socioAdmNome: string | null;
  socioAdmCpf: string | null;
  userId: string | null;
  responsavelId: string | null;
  createdAt: string;
  _count: { apuracoes: number; processos: number };
  /** Máscaras aplicadas no servidor, para toda tela mostrar o mesmo formato. */
  cnpjFormatado: string | null;
  cepFormatado: string | null;
  socioAdmCpfFormatado: string | null;
  /** Endereço em uma linha, montado no servidor. */
  enderecoLinha: string | null;
};

export type RegimeHistorico = {
  id: string;
  empresaId: string;
  regime: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  motivo: string | null;
  registradoPor: string | null;
  createdAt: string;
};

export type EmpresaDetalhe = {
  id: string;
  cnpj: string | null;
  grupo: string | null;
  razaoSocial: string;
  nomeFantasia: string | null;
  regime: string;
  planoInterno: string;
  inscricaoMunicipal: string | null;
  inscricaoEstadual: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  uf: string | null;
  municipio: string | null;
  responsavelOperacional: string | null;
  socioAdmNome: string | null;
  socioAdmCpf: string | null;
  inicioAtividade: string | null;
  situacao: string;
  tributoLocal: string;
  userId: string | null;
  responsavelId: string | null;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
  cnpjFormatado: string | null;
  cepFormatado: string | null;
  socioAdmCpfFormatado: string | null;
  user: PessoaResumo | null;
  responsavel: PessoaResumo | null;
  regimeHistorico: RegimeHistorico[];
  apuracoes: {
    id: string;
    ano: number;
    mes: number;
    regime: string;
    etapaAtual: number;
    status: string;
    bloqueada: boolean;
    bloqueioMotivo: string | null;
    prazoEntrega: string | null;
    concluidaEm: string | null;
  }[];
  processos: {
    id: string;
    tipo: string;
    status: string;
    etapaAtual: number;
    bloqueada: boolean;
    protocoloExterno: string | null;
    orgaoExterno: string | null;
    prazoEstimado: string | null;
    abertoEm: string;
  }[];
  _count: { apuracoes: number; processos: number };
};

/* -------------------------------- Apuração -------------------------------- */

export type SituacaoPrazo = {
  situacao: string;
  dias: number | null;
};

export type ApuracaoLista = {
  id: string;
  ano: number;
  mes: number;
  competencia: string;
  regime: string;
  status: string;
  etapaAtual: number;
  totalEtapas: number;
  etapasConcluidas: number;
  tituloEtapaAtual: string | null;
  empresa: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    /** `null` na empresa em abertura. */
    cnpj: string | null;
    regime: string;
    planoInterno: string;
  };
  responsavel: PessoaResumo | null;
  prazoEntrega: string | null;
  prazo: SituacaoPrazo;
  /** Dias úteis e corridos até o prazo. `null` sem prazo ou já concluída. */
  contagemPrazo: ContagemPrazoApi | null;
  bloqueada: boolean;
  bloqueioMotivo: string | null;
  bloqueioResponsavel: string | null;
  bloqueioDesde: string | null;
  diasEmBloqueio: number | null;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  observacoes: string | null;
  /** Quantos anexos a competência tem. Contagem, não a lista. */
  anexos: number;
  atualizadaEm: string;
};

/**
 * Contagem de prazo como a API devolve.
 *
 * Espelha `ContagemPrazo` de `src/lib/dias-uteis.ts`. Declarada aqui em vez de
 * importada de lá porque `tipos.ts` é o contrato do que chega pela rede — e o que
 * chega pela rede é JSON, que já passou por serialização. Amarrar o tipo da tela
 * ao tipo do domínio esconderia a diferença no dia em que ela existir.
 */
export type ContagemPrazoApi = {
  corridos: number;
  uteis: number;
  hoje: boolean;
  atrasado: boolean;
};

export type Etapa = {
  id: string;
  numero: number;
  chave: string;
  titulo: string;
  responsavelTipo: string;
  opcional: boolean;
  situacao: string;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  concluidaPor: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LogItem = {
  id?: string;
  apuracaoId?: string | null;
  processoId?: string | null;
  acao: string;
  de: string | null;
  para: string | null;
  detalhe: string | null;
  autorId?: string | null;
  autorNome: string;
  autorPapel: string;
  createdAt: string;
};

export type ApuracaoDetalhe = {
  tarefa: {
    id: string;
    ano: number;
    mes: number;
    competencia: string;
    competenciaLabel: string;
    regime: string;
    status: string;
    etapaAtual: number;
    totalEtapas: number;
    tituloEtapaAtual: string | null;
    responsavelEtapaAtual: string | null;
    prazoEntrega: string | null;
    prazo: SituacaoPrazo;
    bloqueada: boolean;
    bloqueioMotivo: string | null;
    bloqueioDesde: string | null;
    bloqueioResponsavel: string | null;
    diasEmBloqueio: number | null;
    iniciadaEm: string | null;
    concluidaEm: string | null;
    observacoes: string | null;
    responsavel: PessoaResumo | null;
    criadaEm: string;
    atualizadaEm: string;
  };
  empresa: {
    id: string;
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    regime: string;
    tributoLocal: string;
    situacao: string;
    uf: string | null;
    municipio: string | null;
  };
  etapas: Etapa[];
  logs: LogItem[];
};

/* ------------------------------ Legalização ------------------------------- */

export type ProcessoLista = {
  id: string;
  tipo: string;
  tipoLabel: string;
  status: string;
  empresa: {
    id: string;
    /** `null` na empresa em abertura, que existe antes de o CNPJ sair. */
    cnpj: string | null;
    razaoSocial: string;
    nomeFantasia: string | null;
    regime: string;
    situacao: string;
    planoInterno: string;
  } | null;
  identificacaoProvisoria: string | null;
  etapaAtual: number;
  etapaAtualTitulo: string | null;
  etapasTotal: number;
  etapasResolvidas: number;
  protocoloExterno: string | null;
  orgaoExterno: string | null;
  bloqueada: boolean;
  bloqueioMotivo: string | null;
  bloqueioResponsavel: string | null;
  bloqueioDesde: string | null;
  prazoEstimado: string | null;
  situacaoPrazo: string;
  diasPrazo: number | null;
  /** Dias úteis e corridos até o prazo. `null` sem prazo ou já encerrado. */
  contagemPrazo: ContagemPrazoApi | null;
  abertoEm: string;
  concluidoEm: string | null;
  diasEmAberto: number | null;
  responsavel: PessoaResumo | null;
  observacoes: string | null;
  /** Quantos anexos o processo tem. Contagem, não a lista. */
  anexos: number;
};

/** `GET /api/tarefas/legalizacao/[id]` faz spread — não existe wrapper `processo`. */
export type ProcessoDetalhe = {
  id: string;
  empresaId: string | null;
  identificacaoProvisoria: string | null;
  tipo: string;
  etapaAtual: number;
  status: string;
  bloqueada: boolean;
  bloqueioMotivo: string | null;
  bloqueioDesde: string | null;
  bloqueioResponsavel: string | null;
  protocoloExterno: string | null;
  orgaoExterno: string | null;
  prazoEstimado: string | null;
  abertoEm: string;
  concluidoEm: string | null;
  responsavelId: string | null;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
  empresa: {
    id: string;
    /** `null` na empresa em abertura, que existe antes de o CNPJ sair. */
    cnpj: string | null;
    razaoSocial: string;
    nomeFantasia: string | null;
    regime: string;
    planoInterno: string;
    /** Derivada e não exibida. Ver a nota em Selos.tsx. */
    situacao: string;
    uf: string | null;
    municipio: string | null;
  } | null;
  responsavel: PessoaResumo | null;
  etapas: Etapa[];
  logs: LogItem[];
  tipoLabel: string;
  orgaoExternoLabel: string | null;
  bloqueioResponsavelLabel: string | null;
  etapaAtualTitulo: string | null;
  etapasTotal: number;
  etapasResolvidas: number;
  /** Números das etapas, não objetos. */
  etapasPendentes: number[];
  situacaoPrazo: string;
  diasPrazo: number | null;
  diasEmAberto: number | null;
  diasEmBloqueio: number | null;
  logsTruncados: boolean;
};

/* --------------------------------- Painel --------------------------------- */

export type PainelResumo = {
  competencia: { ano: number; mes: number; chave: string; label: string };
  competenciasAbertas: number;
  empresasAtivas: number;
  emAndamento: number;
  bloqueadas: number;
  atrasadas: number;
  concluidas: number;
  mediaDiasBloqueio: number;
  porStatus: Record<string, number>;
  porRegime: Record<string, number>;
};

/* ------------------------------- Auditoria -------------------------------- */

export type LogAuditoria = LogItem & {
  id: string;
  autor: (PessoaResumo & { role: string | null }) | null;
  apuracao: {
    id: string;
    ano: number;
    mes: number;
    regime: string;
    status: string;
    empresa: {
      id: string;
      cnpj: string;
      razaoSocial: string;
      nomeFantasia: string | null;
    };
  } | null;
  processo: {
    id: string;
    tipo: string;
    status: string;
    identificacaoProvisoria: string | null;
    empresa: {
      id: string;
      cnpj: string;
      razaoSocial: string;
      nomeFantasia: string | null;
    } | null;
  } | null;
};
