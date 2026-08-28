/**
 * Fonte única dos fluxos de trabalho contábil.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md
 *
 * Etapa é REGRA DE NEGÓCIO, não dado editável pelo usuário. O texto vive aqui,
 * versionado no git, e é COPIADO para dentro da tarefa no momento da criação
 * (campo `titulo` das tabelas de etapa).
 *
 * O congelamento é o ponto: se em 2027 o fluxo ganhar uma etapa, as
 * competências de 2026 continuam com as etapas que realmente foram executadas.
 * Fluxo que muda retroativamente falsifica o histórico.
 *
 * Os textos de apuração são transcrição literal de `NOVIDADES/Tarefas SN e
 * LP.pdf`. Os de legalização são PROPOSTA a validar com o escritório — não há
 * documento de origem para eles.
 */

/* -------------------------------------------------------------------------- */
/*                                 Constantes                                 */
/* -------------------------------------------------------------------------- */

export const REGIME = {
  SIMPLES_NACIONAL: "SIMPLES_NACIONAL",
  LUCRO_PRESUMIDO: "LUCRO_PRESUMIDO",
} as const;
export type Regime = (typeof REGIME)[keyof typeof REGIME];

export const REGIME_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
};

/** Selo curto para o cartão do Kanban, onde espaço é escasso. */
export const REGIME_SIGLA: Record<string, string> = {
  SIMPLES_NACIONAL: "SN",
  LUCRO_PRESUMIDO: "LP",
};

export const RESPONSAVEL = {
  COMERCIAL_CZ: "COMERCIAL_CZ",
  ESCRITORIO: "ESCRITORIO",
  AMBOS: "AMBOS",
} as const;
export type ResponsavelTipo = (typeof RESPONSAVEL)[keyof typeof RESPONSAVEL];

export const RESPONSAVEL_LABEL: Record<string, string> = {
  COMERCIAL_CZ: "Comercial C.Z",
  ESCRITORIO: "Escritório",
  AMBOS: "Ambos",
};

export const SITUACAO_ETAPA = {
  PENDENTE: "PENDENTE",
  EM_ANDAMENTO: "EM_ANDAMENTO",
  CONCLUIDA: "CONCLUIDA",
  NAO_APLICAVEL: "NAO_APLICAVEL",
} as const;
export type SituacaoEtapa =
  (typeof SITUACAO_ETAPA)[keyof typeof SITUACAO_ETAPA];

export const SITUACAO_ETAPA_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  NAO_APLICAVEL: "Não aplicável",
};

export const SITUACAO_EMPRESA = {
  ATIVA: "ATIVA",
  SUSPENSA: "SUSPENSA",
  ENCERRADA: "ENCERRADA",
  EM_ABERTURA: "EM_ABERTURA",
} as const;

export const SITUACAO_EMPRESA_LABEL: Record<string, string> = {
  ATIVA: "Ativa",
  SUSPENSA: "Suspensa",
  ENCERRADA: "Encerrada",
  EM_ABERTURA: "Em abertura",
};

/**
 * Qual imposto local a empresa apura.
 *
 * Existe porque a etapa 6 do Lucro Presumido é condicional: o documento diz
 * "conforme a atividade da empresa (comércio/indústria ou serviços)". Comércio
 * apura ICMS, serviço apura ISS. Nenhuma empresa apura os dois de fato, então a
 * etapa aparece com o nome certo em vez do genérico.
 */
export const TRIBUTO_LOCAL = {
  ICMS: "ICMS",
  ISS: "ISS",
  AMBOS: "AMBOS",
  NENHUM: "NENHUM",
} as const;

export const TRIBUTO_LOCAL_LABEL: Record<string, string> = {
  ICMS: "ICMS (comércio/indústria)",
  ISS: "ISS (serviços)",
  AMBOS: "ICMS e ISS",
  NENHUM: "Nenhum",
};

export const BLOQUEIO_RESPONSAVEL = {
  CLIENTE: "CLIENTE",
  ESCRITORIO: "ESCRITORIO",
  COMERCIAL_CZ: "COMERCIAL_CZ",
  TERCEIRO: "TERCEIRO",
} as const;

export const BLOQUEIO_RESPONSAVEL_LABEL: Record<string, string> = {
  CLIENTE: "Cliente",
  ESCRITORIO: "Escritório",
  COMERCIAL_CZ: "Comercial C.Z",
  TERCEIRO: "Órgão externo",
};

export const TIPO_PROCESSO = {
  ABERTURA_CNPJ: "ABERTURA_CNPJ",
  ENCERRAMENTO_CNPJ: "ENCERRAMENTO_CNPJ",
  REGULARIZACAO_CNPJ: "REGULARIZACAO_CNPJ",
  ALTERACAO_CADASTRAL: "ALTERACAO_CADASTRAL",
  DESENQUADRAMENTO: "DESENQUADRAMENTO",
} as const;
export type TipoProcesso = (typeof TIPO_PROCESSO)[keyof typeof TIPO_PROCESSO];

export const TIPO_PROCESSO_LABEL: Record<string, string> = {
  ABERTURA_CNPJ: "Abertura de CNPJ",
  ENCERRAMENTO_CNPJ: "Encerramento de CNPJ",
  REGULARIZACAO_CNPJ: "Regularização de CNPJ",
  ALTERACAO_CADASTRAL: "Alteração cadastral",
  DESENQUADRAMENTO: "Desenquadramento",
};

export const ORGAO_EXTERNO = {
  JUNTA_COMERCIAL: "JUNTA_COMERCIAL",
  RECEITA_FEDERAL: "RECEITA_FEDERAL",
  PREFEITURA: "PREFEITURA",
  SEFAZ: "SEFAZ",
  CERTIFICADORA: "CERTIFICADORA",
} as const;

export const ORGAO_EXTERNO_LABEL: Record<string, string> = {
  JUNTA_COMERCIAL: "Junta Comercial",
  RECEITA_FEDERAL: "Receita Federal",
  PREFEITURA: "Prefeitura",
  SEFAZ: "SEFAZ",
  CERTIFICADORA: "Certificadora",
};

export const ACAO_LOG = {
  TAREFA_CRIADA: "TAREFA_CRIADA",
  ETAPA_CONCLUIDA: "ETAPA_CONCLUIDA",
  ETAPA_AVANCADA: "ETAPA_AVANCADA",
  ETAPA_RETORNADA: "ETAPA_RETORNADA",
  ETAPA_NAO_APLICAVEL: "ETAPA_NAO_APLICAVEL",
  STATUS_ALTERADO: "STATUS_ALTERADO",
  BLOQUEIO_REGISTRADO: "BLOQUEIO_REGISTRADO",
  BLOQUEIO_RESOLVIDO: "BLOQUEIO_RESOLVIDO",
  RESPONSAVEL_ALTERADO: "RESPONSAVEL_ALTERADO",
  PRAZO_ALTERADO: "PRAZO_ALTERADO",
  OBSERVACAO_ADICIONADA: "OBSERVACAO_ADICIONADA",
  TAREFA_CONCLUIDA: "TAREFA_CONCLUIDA",
  TAREFA_REABERTA: "TAREFA_REABERTA",
  PROTOCOLO_ATUALIZADO: "PROTOCOLO_ATUALIZADO",
  EMPRESA_VINCULADA: "EMPRESA_VINCULADA",
} as const;
export type AcaoLog = (typeof ACAO_LOG)[keyof typeof ACAO_LOG];

export const ACAO_LOG_LABEL: Record<string, string> = {
  TAREFA_CRIADA: "Tarefa criada",
  ETAPA_CONCLUIDA: "Etapa concluída",
  ETAPA_AVANCADA: "Etapa avançada",
  ETAPA_RETORNADA: "Etapa retornada",
  ETAPA_NAO_APLICAVEL: "Etapa marcada como não aplicável",
  STATUS_ALTERADO: "Status alterado",
  BLOQUEIO_REGISTRADO: "Pendência registrada",
  BLOQUEIO_RESOLVIDO: "Pendência resolvida",
  RESPONSAVEL_ALTERADO: "Responsável alterado",
  PRAZO_ALTERADO: "Prazo alterado",
  OBSERVACAO_ADICIONADA: "Observação adicionada",
  TAREFA_CONCLUIDA: "Tarefa concluída",
  TAREFA_REABERTA: "Tarefa reaberta",
  PROTOCOLO_ATUALIZADO: "Protocolo atualizado",
  EMPRESA_VINCULADA: "Empresa vinculada",
};

/* -------------------------------------------------------------------------- */
/*                             Definição de etapa                             */
/* -------------------------------------------------------------------------- */

export type DefinicaoEtapa = {
  numero: number;
  chave: string;
  titulo: string;
  descricao: string;
  responsavel: ResponsavelTipo;
  /** Status macro que esta etapa produz. Ver src/lib/tarefa-status.ts */
  statusDerivado: string;
  opcional: boolean;
  /** Órgão externo típico. Só para legalização. */
  orgao?: string;
};

/* -------------------------------------------------------------------------- */
/*                     Simples Nacional — 10 etapas                           */
/*                                                                            */
/* Transcrição de NOVIDADES/Tarefas SN e LP.pdf, seção 1.                     */
/* Foco principal da carteira.                                                */
/* -------------------------------------------------------------------------- */

export const ETAPAS_SIMPLES_NACIONAL: DefinicaoEtapa[] = [
  {
    numero: 1,
    chave: "RECEBIMENTO_DOCUMENTOS",
    titulo: "Recebimento de documentos do cliente",
    descricao:
      "Recebimento de informações de faturamento, notas de saída emitidas e demais documentos necessários à apuração do mês.",
    responsavel: RESPONSAVEL.COMERCIAL_CZ,
    statusDerivado: "AGUARDANDO_DOCUMENTACAO",
    opcional: false,
  },
  {
    numero: 2,
    chave: "CAPTURA_XML",
    titulo: "Captura de XML de notas de saída e entrada",
    descricao:
      "Importação/download dos XMLs de saídas disponíveis e XMLs de compras e notas de entrada, via sistema ou portal da SEFAZ, para compor a apuração.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 3,
    chave: "CONFERENCIA_DOCUMENTOS",
    titulo: "Conferência dos documentos recebidos",
    descricao:
      "Checagem completa: confronto entre o que foi solicitado e o que foi efetivamente recebido, identificando pendências.",
    responsavel: RESPONSAVEL.AMBOS,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 4,
    chave: "APURACAO_FATURAMENTO_PGDAS",
    titulo: "Apuração do faturamento no sistema (PGDAS-D)",
    descricao:
      "Lançamento das receitas por atividade/anexo no sistema do Simples Nacional para cálculo do imposto devido no mês.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 5,
    chave: "CALCULO_DAS",
    titulo: "Cálculo e apuração do DAS",
    descricao:
      "Processamento da apuração e obtenção do valor consolidado do DAS (Documento de Arrecadação do Simples Nacional).",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 6,
    chave: "CONFERENCIA_APURACAO",
    titulo: "Conferência da apuração",
    descricao:
      "Revisão dos valores apurados antes da geração definitiva da guia, verificando consistência com o período anterior.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_REVISAO",
    opcional: false,
  },
  {
    numero: 7,
    chave: "GERACAO_GUIA_DAS",
    titulo: "Geração da guia DAS",
    descricao:
      "Emissão da guia de pagamento a partir do PGDAS-D já transmitido.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_REVISAO",
    opcional: false,
  },
  {
    numero: 8,
    chave: "ENVIO_GUIA_EMAIL",
    titulo: "Envio da guia por e-mail ao cliente",
    descricao:
      "Encaminhamento da guia de pagamento e, quando aplicável, do relatório de apuração ao cliente.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "ENTREGUE",
    opcional: false,
  },
  {
    numero: 9,
    chave: "UPLOAD_DOCUMENTOS",
    titulo: "Upload dos documentos no sistema",
    descricao:
      "Inclusão da guia e dos documentos que embasaram a apuração no sistema/portal de controle do escritório.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "ENTREGUE",
    opcional: false,
  },
  {
    numero: 10,
    chave: "ENCERRAMENTO_COMPETENCIA",
    titulo: "Encerramento da competência",
    descricao:
      "Marcação da competência como concluída, com arquivamento dos documentos e registro de eventuais pendências para o mês seguinte.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "CONCLUIDO",
    opcional: false,
  },
];

/* -------------------------------------------------------------------------- */
/*                      Lucro Presumido — 14 etapas                           */
/*                                                                            */
/* Transcrição de NOVIDADES/Tarefas SN e LP.pdf, seção 2.                     */
/*                                                                            */
/* ATENÇÃO — divergência conhecida entre os documentos de origem: a            */
/* apresentação lista 13 etapas e NÃO inclui "Envio das Obrigações Acessórias  */
/* Mensais". O Word lista 14 e a inclui na posição 11. Adotado o WORD, porque  */
/* é o documento detalhado (tem descrição e responsável por etapa) e porque    */
/* obrigação acessória mensal é etapa real do regime. Pendente de confirmação  */
/* com o escritório — ver seção 9.3 do documento de especificação.             */
/* -------------------------------------------------------------------------- */

export const ETAPAS_LUCRO_PRESUMIDO: DefinicaoEtapa[] = [
  {
    numero: 1,
    chave: "RECEBIMENTO_DOCUMENTOS",
    titulo: "Recebimento de documentos do cliente",
    descricao:
      "Recebimento de notas de entrada e saída, extratos bancários, folha de pagamento e demais documentos do período.",
    responsavel: RESPONSAVEL.COMERCIAL_CZ,
    statusDerivado: "AGUARDANDO_DOCUMENTACAO",
    opcional: false,
  },
  {
    numero: 2,
    chave: "CAPTURA_XML",
    titulo: "Captura de XML (entradas e saídas)",
    descricao:
      "Importação dos XMLs de notas fiscais emitidas e recebidas para lançamento contábil e apuração de tributos.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 3,
    chave: "CONFERENCIA_CLASSIFICACAO",
    titulo: "Conferência e classificação contábil",
    descricao:
      "Checagem dos documentos recebidos e classificação por natureza (receita, despesa, ativo, etc.) para lançamento.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 4,
    chave: "LANCAMENTOS_CONTABEIS",
    titulo: "Lançamentos contábeis do período",
    descricao:
      "Escrituração contábil das operações do mês, base para o fechamento e para as apurações tributárias.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 5,
    chave: "APURACAO_FEDERAIS",
    titulo: "Apuração de PIS/COFINS, IRPJ/CSLL",
    descricao:
      "Cálculo dos tributos federais incidentes sobre o faturamento e o resultado presumido do período.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 6,
    chave: "APURACAO_ICMS_ISS",
    titulo: "Apuração de ICMS/ISS",
    descricao:
      "Cálculo do imposto estadual ou municipal conforme a atividade da empresa (comércio/indústria ou serviços).",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_ELABORACAO",
    opcional: false,
  },
  {
    numero: 7,
    chave: "CONFERENCIA_APURACAO",
    titulo: "Conferência da apuração",
    descricao:
      "Revisão dos valores calculados em todas as guias antes da emissão definitiva.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_REVISAO",
    opcional: false,
  },
  {
    numero: 8,
    chave: "GERACAO_GUIAS",
    titulo: "Geração das guias (DARF, ICMS, ISS)",
    descricao:
      "Emissão das guias de recolhimento aplicáveis ao regime e à atividade do cliente.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "EM_REVISAO",
    opcional: false,
  },
  {
    numero: 9,
    chave: "ENVIO_GUIAS_EMAIL",
    titulo: "Envio das guias por e-mail ao cliente",
    descricao:
      "Encaminhamento das guias de pagamento ao cliente dentro do prazo estabelecido.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "ENTREGUE",
    opcional: false,
  },
  {
    numero: 10,
    chave: "UPLOAD_DOCUMENTOS",
    titulo: "Upload dos documentos e guias no sistema",
    descricao:
      "Inclusão das guias e da documentação de suporte no sistema/portal de controle do escritório.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "ENTREGUE",
    opcional: false,
  },
  {
    numero: 11,
    chave: "OBRIGACOES_ACESSORIAS",
    titulo: "Envio das Obrigações Acessórias Mensais",
    descricao:
      "Preenchimento, conferência e transmissão das declarações acessórias mensais do regime.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "ENTREGUE",
    opcional: false,
  },
  {
    numero: 12,
    chave: "FECHAMENTO_CONTABIL",
    titulo: "Fechamento contábil do período (balancete)",
    descricao:
      "Consolidação do balancete mensal, refletindo os lançamentos e apurações realizados.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "ENTREGUE",
    opcional: false,
  },
  {
    numero: 13,
    chave: "RELATORIOS_GERENCIAIS",
    titulo: "Envio de relatórios gerenciais (opcional)",
    // Divergência do documento de origem: o título diz "relatórios gerenciais"
    // e a descrição diz "recibos das obrigações acessórias". São coisas
    // diferentes. Mantida a descrição original até o escritório definir qual
    // das duas a etapa é — ver seção 9.4 da especificação.
    descricao: "Encaminhamento de recibos das obrigações acessórias.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "ENTREGUE",
    // Única etapa opcional em todo o material. O "(opcional)" é do documento.
    opcional: true,
  },
  {
    numero: 14,
    chave: "ENCERRAMENTO_COMPETENCIA",
    titulo: "Encerramento da competência",
    descricao:
      "Marcação da competência como concluída, com arquivamento e registro de pendências remanescentes.",
    responsavel: RESPONSAVEL.ESCRITORIO,
    statusDerivado: "CONCLUIDO",
    opcional: false,
  },
];

/* -------------------------------------------------------------------------- */
/*                      Legalização — cinco fluxos                            */
/*                                                                            */
/* PROPOSTA A VALIDAR. Não existe documento de origem para legalização; estes  */
/* fluxos vêm da descrição verbal do Gianluca mais prática de mercado. Trate   */
/* como rascunho até o escritório revisar — ver seção 11 da especificação.     */
/* -------------------------------------------------------------------------- */

export const ETAPAS_ABERTURA_CNPJ: DefinicaoEtapa[] = [
  { numero: 1, chave: "COLETA_DOCUMENTOS_SOCIOS", titulo: "Coleta de documentos e dados dos sócios", descricao: "Recebimento de documento de identidade, comprovante de endereço e dados cadastrais de cada sócio.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "AGUARDANDO_DOCUMENTACAO", opcional: false },
  { numero: 2, chave: "DEFINICAO_CNAE_REGIME", titulo: "Definição de atividade (CNAE), regime e capital social", descricao: "Escolha das atividades, do regime tributário e do capital social, com orientação do escritório.", responsavel: RESPONSAVEL.AMBOS, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 3, chave: "CONSULTA_VIABILIDADE", titulo: "Consulta de viabilidade (nome e endereço)", descricao: "Verificação de disponibilidade do nome empresarial e de permissão da atividade no endereço.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false, orgao: ORGAO_EXTERNO.JUNTA_COMERCIAL },
  { numero: 4, chave: "REGISTRO_ATO_CONSTITUTIVO", titulo: "Registro do ato constitutivo", descricao: "Elaboração e registro do contrato social ou requerimento de empresário.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false, orgao: ORGAO_EXTERNO.JUNTA_COMERCIAL },
  { numero: 5, chave: "OBTENCAO_CNPJ", titulo: "Obtenção do CNPJ", descricao: "Emissão da inscrição no Cadastro Nacional da Pessoa Jurídica.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false, orgao: ORGAO_EXTERNO.RECEITA_FEDERAL },
  { numero: 6, chave: "INSCRICAO_ESTADUAL", titulo: "Inscrição estadual, quando aplicável", descricao: "Solicitação de inscrição estadual para atividades sujeitas ao ICMS.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: true, orgao: ORGAO_EXTERNO.SEFAZ },
  { numero: 7, chave: "INSCRICAO_MUNICIPAL_ALVARA", titulo: "Inscrição municipal e alvará", descricao: "Inscrição no cadastro municipal e obtenção do alvará de funcionamento.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false, orgao: ORGAO_EXTERNO.PREFEITURA },
  { numero: 8, chave: "ENQUADRAMENTO_TRIBUTARIO", titulo: "Enquadramento tributário", descricao: "Formalização da opção pelo regime tributário definido na etapa 2.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false, orgao: ORGAO_EXTERNO.RECEITA_FEDERAL },
  { numero: 9, chave: "CERTIFICADO_DIGITAL", titulo: "Emissão de certificado digital", descricao: "Emissão do certificado necessário para transmissão de obrigações e emissão de nota.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false, orgao: ORGAO_EXTERNO.CERTIFICADORA },
  { numero: 10, chave: "HABILITACAO_NOTA_FISCAL", titulo: "Habilitação para emissão de nota fiscal", descricao: "Liberação da emissão de nota fiscal no âmbito estadual e/ou municipal.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false },
  { numero: 11, chave: "ENTREGA_DOCUMENTACAO", titulo: "Entrega da documentação ao cliente", descricao: "Envio ao cliente de todos os documentos e acessos gerados no processo.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "ENTREGUE", opcional: false },
  { numero: 12, chave: "ENCERRAMENTO_PROCESSO", titulo: "Encerramento do processo", descricao: "Conclusão do processo, com arquivamento e vínculo da empresa criada ao sistema.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "CONCLUIDO", opcional: false },
];

export const ETAPAS_ENCERRAMENTO_CNPJ: DefinicaoEtapa[] = [
  { numero: 1, chave: "COLETA_CONFIRMACAO", titulo: "Coleta de documentos e confirmação da decisão", descricao: "Confirmação formal da decisão de encerrar e recebimento dos documentos necessários.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "AGUARDANDO_DOCUMENTACAO", opcional: false },
  { numero: 2, chave: "LEVANTAMENTO_PENDENCIAS", titulo: "Levantamento de pendências fiscais e obrigações em aberto", descricao: "Diagnóstico de débitos, declarações em atraso e obrigações pendentes.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 3, chave: "REGULARIZACAO_PENDENCIAS", titulo: "Regularização das pendências encontradas", descricao: "Quitação ou parcelamento dos débitos e envio das declarações em atraso.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 4, chave: "DECLARACOES_FINAIS", titulo: "Entrega das declarações finais", descricao: "Transmissão das declarações de encerramento exigidas pelo regime.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 5, chave: "DISTRATO", titulo: "Distrato / ato de encerramento", descricao: "Elaboração e registro do ato de dissolução da empresa.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false, orgao: ORGAO_EXTERNO.JUNTA_COMERCIAL },
  { numero: 6, chave: "BAIXA_RECEITA", titulo: "Baixa na Receita Federal", descricao: "Solicitação e acompanhamento da baixa do CNPJ.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false, orgao: ORGAO_EXTERNO.RECEITA_FEDERAL },
  { numero: 7, chave: "BAIXA_ESTADUAL_MUNICIPAL", titulo: "Baixa estadual e municipal", descricao: "Encerramento das inscrições estadual e municipal.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false },
  { numero: 8, chave: "ENTREGA_COMPROVANTES", titulo: "Entrega dos comprovantes ao cliente", descricao: "Envio dos comprovantes de baixa em todas as esferas.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "ENTREGUE", opcional: false },
  { numero: 9, chave: "ENCERRAMENTO_PROCESSO", titulo: "Encerramento do processo", descricao: "Conclusão do processo e atualização da situação da empresa no sistema.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "CONCLUIDO", opcional: false },
];

export const ETAPAS_REGULARIZACAO_CNPJ: DefinicaoEtapa[] = [
  { numero: 1, chave: "COLETA_PROCURACAO", titulo: "Coleta de procuração e acessos", descricao: "Obtenção de procuração eletrônica e acessos necessários aos portais.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "AGUARDANDO_DOCUMENTACAO", opcional: false },
  { numero: 2, chave: "DIAGNOSTICO_PENDENCIAS", titulo: "Diagnóstico de pendências", descricao: "Levantamento completo de débitos e obrigações em atraso na Receita, SEFAZ e Prefeitura.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 3, chave: "APRESENTACAO_PLANO", titulo: "Apresentação do plano e dos valores ao cliente", descricao: "Comunicação do que precisa ser feito, prazos e custos envolvidos.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 4, chave: "APROVACAO_CLIENTE", titulo: "Aprovação do cliente", descricao: "Confirmação do cliente para seguir com o plano apresentado.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "AGUARDANDO_DOCUMENTACAO", opcional: false },
  { numero: 5, chave: "DECLARACOES_ATRASO", titulo: "Entrega das declarações em atraso", descricao: "Transmissão de todas as declarações pendentes identificadas.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 6, chave: "GUIAS_PARCELAMENTOS", titulo: "Emissão de guias e parcelamentos", descricao: "Emissão das guias de débito e formalização de parcelamentos quando aplicável.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false },
  { numero: 7, chave: "ACOMPANHAMENTO_BAIXA", titulo: "Acompanhamento até a baixa das pendências", descricao: "Monitoramento até a efetiva regularização nos sistemas dos órgãos.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false },
  { numero: 8, chave: "CERTIDAO_NEGATIVA", titulo: "Emissão de certidão negativa", descricao: "Emissão da certidão que comprova a regularidade obtida.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "ENTREGUE", opcional: false },
  { numero: 9, chave: "ENCERRAMENTO_PROCESSO", titulo: "Encerramento do processo", descricao: "Entrega da certidão ao cliente e conclusão do processo.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "CONCLUIDO", opcional: false },
];

export const ETAPAS_ALTERACAO_CADASTRAL: DefinicaoEtapa[] = [
  { numero: 1, chave: "DEFINICAO_ALTERACAO", titulo: "Definição do que será alterado", descricao: "Identificação da alteração pretendida: endereço, sócios, atividade, capital ou razão social.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "AGUARDANDO_DOCUMENTACAO", opcional: false },
  { numero: 2, chave: "COLETA_DOCUMENTOS", titulo: "Coleta de documentos da alteração", descricao: "Recebimento dos documentos que embasam a alteração.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "AGUARDANDO_DOCUMENTACAO", opcional: false },
  { numero: 3, chave: "ELABORACAO_ATO", titulo: "Elaboração do ato de alteração", descricao: "Redação do instrumento de alteração contratual.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 4, chave: "ASSINATURA_SOCIOS", titulo: "Assinatura pelos sócios", descricao: "Coleta das assinaturas necessárias no ato de alteração.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 5, chave: "REGISTRO_JUNTA", titulo: "Registro na Junta Comercial", descricao: "Protocolo e registro da alteração no órgão de registro empresarial.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false, orgao: ORGAO_EXTERNO.JUNTA_COMERCIAL },
  { numero: 6, chave: "ATUALIZACAO_RECEITA", titulo: "Atualização na Receita Federal", descricao: "Atualização dos dados cadastrais no CNPJ.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false, orgao: ORGAO_EXTERNO.RECEITA_FEDERAL },
  { numero: 7, chave: "ATUALIZACAO_ESTADUAL_MUNICIPAL", titulo: "Atualização estadual e municipal", descricao: "Atualização das inscrições estadual e municipal, quando aplicável.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: true },
  { numero: 8, chave: "ENTREGA_DOCUMENTOS", titulo: "Entrega dos documentos atualizados", descricao: "Envio ao cliente do contrato e cadastros atualizados.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "ENTREGUE", opcional: false },
  { numero: 9, chave: "ENCERRAMENTO_PROCESSO", titulo: "Encerramento do processo", descricao: "Conclusão do processo e atualização dos dados da empresa no sistema.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "CONCLUIDO", opcional: false },
];

export const ETAPAS_DESENQUADRAMENTO: DefinicaoEtapa[] = [
  { numero: 1, chave: "IDENTIFICACAO_MOTIVO", titulo: "Identificação do motivo", descricao: "Apuração do que motiva o desenquadramento: limite de faturamento, atividade impeditiva ou opção da empresa.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 2, chave: "ESTUDO_IMPACTO", titulo: "Estudo do impacto tributário", descricao: "Comparação da carga tributária entre o regime atual e o novo.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 3, chave: "APRESENTACAO_CENARIO", titulo: "Apresentação do cenário ao cliente", descricao: "Comunicação do estudo e das consequências práticas da mudança.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "EM_ELABORACAO", opcional: false },
  { numero: 4, chave: "APROVACAO_CLIENTE", titulo: "Aprovação do cliente", descricao: "Confirmação do cliente para efetivar a mudança de regime.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "AGUARDANDO_DOCUMENTACAO", opcional: false },
  { numero: 5, chave: "COMUNICACAO_DESENQUADRAMENTO", titulo: "Comunicação do desenquadramento", descricao: "Formalização do desenquadramento junto ao órgão competente.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false, orgao: ORGAO_EXTERNO.RECEITA_FEDERAL },
  { numero: 6, chave: "AJUSTE_REGIME_SISTEMAS", titulo: "Ajuste do regime nos sistemas", descricao: "Atualização do regime nos sistemas internos e no cadastro da empresa.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "EM_REVISAO", opcional: false },
  { numero: 7, chave: "COMUNICACAO_ROTINA", titulo: "Comunicação da mudança de rotina ao cliente", descricao: "Orientação sobre as novas obrigações e o novo fluxo mensal.", responsavel: RESPONSAVEL.COMERCIAL_CZ, statusDerivado: "ENTREGUE", opcional: false },
  { numero: 8, chave: "ENCERRAMENTO_PROCESSO", titulo: "Encerramento do processo", descricao: "Conclusão do processo, com registro do novo regime no histórico da empresa.", responsavel: RESPONSAVEL.ESCRITORIO, statusDerivado: "CONCLUIDO", opcional: false },
];

/* -------------------------------------------------------------------------- */
/*                                  Acesso                                    */
/* -------------------------------------------------------------------------- */

const FLUXOS_APURACAO: Record<string, DefinicaoEtapa[]> = {
  [REGIME.SIMPLES_NACIONAL]: ETAPAS_SIMPLES_NACIONAL,
  [REGIME.LUCRO_PRESUMIDO]: ETAPAS_LUCRO_PRESUMIDO,
};

const FLUXOS_LEGALIZACAO: Record<string, DefinicaoEtapa[]> = {
  [TIPO_PROCESSO.ABERTURA_CNPJ]: ETAPAS_ABERTURA_CNPJ,
  [TIPO_PROCESSO.ENCERRAMENTO_CNPJ]: ETAPAS_ENCERRAMENTO_CNPJ,
  [TIPO_PROCESSO.REGULARIZACAO_CNPJ]: ETAPAS_REGULARIZACAO_CNPJ,
  [TIPO_PROCESSO.ALTERACAO_CADASTRAL]: ETAPAS_ALTERACAO_CADASTRAL,
  [TIPO_PROCESSO.DESENQUADRAMENTO]: ETAPAS_DESENQUADRAMENTO,
};

/** Fluxo de apuração do regime. Lança se o regime não existir. */
export function fluxoApuracao(regime: string): DefinicaoEtapa[] {
  const fluxo = FLUXOS_APURACAO[regime];
  if (!fluxo) throw new Error(`Regime desconhecido: ${regime}`);
  return fluxo;
}

/** Fluxo de um tipo de processo de legalização. Lança se o tipo não existir. */
export function fluxoLegalizacao(tipo: string): DefinicaoEtapa[] {
  const fluxo = FLUXOS_LEGALIZACAO[tipo];
  if (!fluxo) throw new Error(`Tipo de processo desconhecido: ${tipo}`);
  return fluxo;
}

export function totalEtapasApuracao(regime: string): number {
  return fluxoApuracao(regime).length;
}

export function totalEtapasLegalizacao(tipo: string): number {
  return fluxoLegalizacao(tipo).length;
}

export function etapaApuracao(
  regime: string,
  numero: number
): DefinicaoEtapa | null {
  return fluxoApuracao(regime).find((e) => e.numero === numero) ?? null;
}

export function etapaLegalizacao(
  tipo: string,
  numero: number
): DefinicaoEtapa | null {
  return fluxoLegalizacao(tipo).find((e) => e.numero === numero) ?? null;
}

/**
 * Nome da etapa ajustado ao tributo local da empresa.
 *
 * A etapa 6 do Lucro Presumido é "Apuração de ICMS/ISS", mas empresa de
 * serviço não apura ICMS e comércio não apura ISS. Exibir o nome genérico faz o
 * operador conferir todo mês se aquilo se aplica.
 */
export function tituloEtapaAjustado(
  titulo: string,
  chave: string,
  tributoLocal?: string | null
): string {
  if (chave !== "APURACAO_ICMS_ISS") return titulo;
  if (tributoLocal === TRIBUTO_LOCAL.ICMS) return "Apuração de ICMS";
  if (tributoLocal === TRIBUTO_LOCAL.ISS) return "Apuração de ISS";
  return titulo;
}

export const REGIMES_VALIDOS = Object.values(REGIME) as string[];
export const TIPOS_PROCESSO_VALIDOS = Object.values(TIPO_PROCESSO) as string[];
export const SITUACOES_EMPRESA_VALIDAS = Object.values(
  SITUACAO_EMPRESA
) as string[];
export const TRIBUTOS_LOCAIS_VALIDOS = Object.values(TRIBUTO_LOCAL) as string[];
export const BLOQUEIO_RESPONSAVEIS_VALIDOS = Object.values(
  BLOQUEIO_RESPONSAVEL
) as string[];
export const ORGAOS_EXTERNOS_VALIDOS = Object.values(ORGAO_EXTERNO) as string[];
