/**
 * O que conta como faturamento. Função pura: documento -> soma ou não soma, e por quê.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA REGRA JÁ ESTAVA ERRADA UMA VEZ, E O DADO REAL PROVOU
 *
 * A primeira versão (em `docs/PLANO_XML_FATURAMENTO.md`, antes da Fase 0) era
 * "produção + saída + autorizada + não cancelada + finalidade 1 ou 2". Contra a
 * pasta de agosto/2026 da conta CINGAPURA ela deu:
 *
 *     387 notas · R$ 63.270,86     <- errado
 *
 * Acrescentando a faixa de CFOP:
 *
 *     366 notas · R$ 62.514,16     <- bate AO CENTAVO com a pasta "NF-e de venda"
 *                                     que o exportador do Mercado Livre separa
 *
 * A diferença de R$ 756,70 (1,2%) eram 21 notas de "Remessa para Depósito
 * Temporário": mercadoria saindo para o galpão do Mercado Livre. São saída,
 * autorizadas, em produção, finalidade normal — e não são receita.
 *
 * Dois critérios independentes chegando no mesmo centavo é a melhor evidência
 * disponível de que a regra agora está certa.
 *
 * POR QUE CFOP, E NÃO `natOp`: `natOp` é texto livre, e na mesma pasta apareceram
 * seis redações diferentes. CFOP é código.
 *
 * POR QUE WHITELIST, E NÃO BLACKLIST: `5949`/`6949` é "outra saída não
 * especificada", lata de lixo do layout. Na base ele aparece nas remessas para o
 * FULL, e amanhã pode aparecer em outra coisa. Aceitar tudo menos uma lista de
 * exclusão faria toda saída desconhecida virar receita — errando PARA CIMA, que é
 * o pior lado para um número que vai assinado ao banco.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ------------------------------- Constantes ------------------------------- */

export const AMBIENTE_PRODUCAO = "1";
export const AMBIENTE_HOMOLOGACAO = "2";

export const OPERACAO_ENTRADA = "0";
export const OPERACAO_SAIDA = "1";

export const FINALIDADE_NORMAL = "1";
export const FINALIDADE_COMPLEMENTAR = "2";
export const FINALIDADE_AJUSTE = "3";
export const FINALIDADE_DEVOLUCAO = "4";

export const STATUS_AUTORIZADA = "100";

/**
 * Prefixos de CFOP que são venda.
 *
 * Grupo 5.1 (dentro do estado) e 6.1 (interestadual) = "venda de produção própria
 * ou de terceiros". Prefixo de dois dígitos cobre a faixa inteira (5101, 5102,
 * 5105, 5106, 6101, 6102, 6105, 6106, 6107, 6108) sem listar código por código —
 * e um código novo do mesmo grupo entra sozinho.
 */
export const PREFIXOS_CFOP_VENDA = ["51", "61"] as const;

/** Modelos que a apuração soma. CT-e (57) e NFS-e (13) ficam fora por ora. */
export const MODELOS_APURADOS = ["55", "65"] as const;

/**
 * Versão da regra.
 *
 * Gravada em cada documento classificado. Quando a regra mudar — e vai mudar na
 * primeira revisão do escritório — o conjunto a reprocessar é `versaoRegra <
 * VERSAO_REGRA_FATURAMENTO`, em lote por número de linhas. Sem isso, mudar a
 * regra exigiria reimportar XML que ninguém tem mais.
 *
 * Mesmo mecanismo do `PRAZO_ORIGEM_AUSENTE` versionado da Expedição.
 */
export const VERSAO_REGRA_FATURAMENTO = 1;

/* --------------------------------- Motivos -------------------------------- */

export const MOTIVO_EXCLUSAO = {
  HOMOLOGACAO: "HOMOLOGACAO",
  MODELO_NAO_APURADO: "MODELO_NAO_APURADO",
  NAO_AUTORIZADA: "NAO_AUTORIZADA",
  CANCELADA: "CANCELADA",
  ENTRADA: "ENTRADA",
  DEVOLUCAO: "DEVOLUCAO",
  AJUSTE: "AJUSTE",
  EMPRESA_NAO_VINCULADA: "EMPRESA_NAO_VINCULADA",
  TERCEIRO: "TERCEIRO",
  CFOP_MISTO: "CFOP_MISTO",
  SEM_CFOP: "SEM_CFOP",
  FORA_DA_FAIXA_DE_VENDA: "FORA_DA_FAIXA_DE_VENDA",
} as const;

export type MotivoExclusao = (typeof MOTIVO_EXCLUSAO)[keyof typeof MOTIVO_EXCLUSAO];

/**
 * Texto para a tela. Frase curta, sem jargão de layout.
 *
 * O painel "Fora do faturamento" existe porque 822 arquivos importados com 366
 * somando parece arquivo perdido. Cada linha precisa dizer o motivo em português,
 * senão o operador conclui que o sistema comeu nota.
 */
export const MOTIVO_EXCLUSAO_LABEL: Record<MotivoExclusao, string> = {
  HOMOLOGACAO: "Nota de teste (ambiente de homologação), com valor fictício",
  MODELO_NAO_APURADO: "Modelo que a apuração não soma (CT-e de frete, por exemplo)",
  NAO_AUTORIZADA: "Não autorizada pela SEFAZ: fiscalmente não existe",
  CANCELADA: "Cancelada por evento posterior",
  ENTRADA: "Nota de entrada: é compra ou retorno, não faturamento",
  DEVOLUCAO: "Devolução de mercadoria",
  AJUSTE: "Nota de ajuste, sem receita nova",
  EMPRESA_NAO_VINCULADA: "O CNPJ emitente não está cadastrado na carteira",
  TERCEIRO: "Nota recebida de outra empresa: é compra",
  CFOP_MISTO: "Itens de venda e de movimentação na mesma nota: precisa de conferência",
  SEM_CFOP: "Sem CFOP nos itens: não há como classificar a operação",
  FORA_DA_FAIXA_DE_VENDA: "Movimentação de estoque, remessa ou retorno, não venda",
};

/** Motivos que impedem a importação, em vez de só excluir da soma. */
export const MOTIVOS_QUE_RECUSAM_IMPORTACAO: readonly MotivoExclusao[] = [
  MOTIVO_EXCLUSAO.HOMOLOGACAO,
];

/* ------------------------------ Classificação ----------------------------- */

/** De onde vem o vínculo do documento com a carteira de empresas. */
export type VinculoEmpresa =
  /** O emitente é uma empresa da carteira: é nota dela. */
  | "EMITENTE"
  /** O destinatário é da carteira e o emitente não: é nota de compra. */
  | "DESTINATARIO"
  /** Nenhum dos dois está cadastrado. */
  | "NENHUM";

export type EntradaClassificacao = {
  modelo: string;
  /** tpAmb */
  ambiente: string;
  /** tpNF */
  tipoOperacao: string;
  /** finNFe */
  finalidade: string;
  /** cStat do protocolo */
  statusSefaz: string | null;
  /** CFOP de todos os itens, sem repetição */
  cfops: string[];
  cancelada: boolean;
  vinculo: VinculoEmpresa;
};

export type ResultadoClassificacao = {
  contaFaturamento: boolean;
  motivoExclusao: MotivoExclusao | null;
  /**
   * Pede olho humano. Hoje só no CFOP misto: a nota tem item de venda e item de
   * movimentação, e resolver por chute erraria o número nos dois sentidos
   * possíveis.
   */
  precisaConferencia: boolean;
  /** Quando true, a importação deve recusar o arquivo em vez de gravá-lo. */
  recusarImportacao: boolean;
};

/** true quando o CFOP pertence ao grupo de venda. */
export function ehCfopDeVenda(cfop: string): boolean {
  return PREFIXOS_CFOP_VENDA.some((prefixo) => cfop.startsWith(prefixo));
}

/**
 * Decide se o documento soma no faturamento, e registra o motivo quando não soma.
 *
 * A ORDEM DOS TESTES É A ORDEM DA RESPOSTA. Várias condições podem valer ao mesmo
 * tempo (uma nota de homologação também pode estar fora da faixa de CFOP), e o
 * motivo gravado é o primeiro que casa. A ordem vai do fato mais grave e mais
 * acionável para o mais específico: quem vê "nota de teste" sabe que subiu a pasta
 * errada, enquanto "fora da faixa de venda" é rotina e esperado.
 */
export function classificarFaturamento(
  entrada: EntradaClassificacao,
): ResultadoClassificacao {
  const excluir = (
    motivo: MotivoExclusao,
    extras?: { precisaConferencia?: boolean },
  ): ResultadoClassificacao => ({
    contaFaturamento: false,
    motivoExclusao: motivo,
    precisaConferencia: extras?.precisaConferencia ?? false,
    recusarImportacao: MOTIVOS_QUE_RECUSAM_IMPORTACAO.includes(motivo),
  });

  // 1. Nota de teste. Vem primeiro porque é a única que não deve nem ser gravada:
  // o valor é fictício e o erro é de operação (subiu a pasta de homologação).
  if (entrada.ambiente === AMBIENTE_HOMOLOGACAO) {
    return excluir(MOTIVO_EXCLUSAO.HOMOLOGACAO);
  }

  // 2. Modelo fora do escopo. O CT-e de frete é o caso real: 361 dos 822 arquivos
  // da base, e emitido por OUTRA empresa (o próprio Mercado Livre).
  if (!MODELOS_APURADOS.includes(entrada.modelo as (typeof MODELOS_APURADOS)[number])) {
    return excluir(MOTIVO_EXCLUSAO.MODELO_NAO_APURADO);
  }

  // 3. Sem autorização não existe fiscalmente.
  if (entrada.statusSefaz !== STATUS_AUTORIZADA) {
    return excluir(MOTIVO_EXCLUSAO.NAO_AUTORIZADA);
  }

  /*
   * 4. Cancelamento.
   *
   * Vem de FORA desta função, no campo `cancelada`, e não do `statusSefaz`. Achado
   * da Fase 0: nas três notas canceladas da amostra o cStat DENTRO do próprio
   * arquivo da nota é 100 (autorizada). O cancelamento vive só no arquivo de
   * evento, que chega dias depois. Quem confia no cStat da nota soma cancelada.
   */
  if (entrada.cancelada) {
    return excluir(MOTIVO_EXCLUSAO.CANCELADA);
  }

  // 5. Vínculo com a carteira. Antes do CFOP porque "não é sua nota" explica
  // melhor que "a operação não é venda" — e a nota de compra tem CFOP de entrada,
  // então cairia no motivo errado logo abaixo.
  if (entrada.vinculo === "DESTINATARIO") {
    return excluir(MOTIVO_EXCLUSAO.TERCEIRO);
  }
  if (entrada.vinculo === "NENHUM") {
    return excluir(MOTIVO_EXCLUSAO.EMPRESA_NAO_VINCULADA);
  }

  // 6. Entrada emitida pela própria empresa: devolução a fornecedor, remessa.
  if (entrada.tipoOperacao === OPERACAO_ENTRADA) {
    return excluir(MOTIVO_EXCLUSAO.ENTRADA);
  }

  // 7. Finalidade. Complementar SOMA (é complemento de valor de nota anterior);
  // devolução e ajuste não. Devolução aqui não ABATE o mês — é decisão pendente do
  // escritório (seção 10, item 2 do plano), e abater sem aval mudaria o número.
  if (entrada.finalidade === FINALIDADE_DEVOLUCAO) {
    return excluir(MOTIVO_EXCLUSAO.DEVOLUCAO);
  }
  if (entrada.finalidade === FINALIDADE_AJUSTE) {
    return excluir(MOTIVO_EXCLUSAO.AJUSTE);
  }

  // 8. CFOP: o discriminador que a Fase 0 provou necessário.
  if (entrada.cfops.length === 0) {
    return excluir(MOTIVO_EXCLUSAO.SEM_CFOP);
  }

  const deVenda = entrada.cfops.filter(ehCfopDeVenda);

  if (deVenda.length === 0) {
    return excluir(MOTIVO_EXCLUSAO.FORA_DA_FAIXA_DE_VENDA);
  }

  /*
   * Nota com item de venda E item fora da faixa.
   *
   * Não soma e pede conferência. Somar o total inflaria a receita com a parte que
   * é movimentação; somar só a parte de venda exigiria ratear o vNF por item, e o
   * vNF carrega frete e desconto do documento inteiro — o rateio seria uma
   * estimativa apresentada como fato. Melhor um número menor e uma pendência
   * visível do que um número inventado.
   */
  if (deVenda.length !== entrada.cfops.length) {
    return excluir(MOTIVO_EXCLUSAO.CFOP_MISTO, { precisaConferencia: true });
  }

  return {
    contaFaturamento: true,
    motivoExclusao: null,
    precisaConferencia: false,
    recusarImportacao: false,
  };
}
