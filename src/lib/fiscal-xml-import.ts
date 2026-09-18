/**
 * Importação de XML fiscal: arquivos -> linhas em `documento_fiscal` + apuração.
 *
 * A rota é fina; a lógica mora aqui. Mesmo arranjo de `spreadsheet.ts` e
 * `legalizacao-service.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISÕES QUE VALE LER ANTES DE MEXER
 *
 * 1. DUAS PASSADAS: notas primeiro, eventos depois.
 *    O arquivo de cancelamento faz UPDATE numa nota que já tem de existir. Numa
 *    pasta única vêm os dois juntos, e a ordem em que o navegador entrega o
 *    multipart é a ordem do sistema de arquivos — ou seja, arbitrária. Processando
 *    na ordem recebida, o cancelamento que chegasse antes da sua nota não acharia
 *    nada e a nota ficaria AUTORIZADA para sempre, somando no faturamento.
 *
 * 2. ERRO POR ARQUIVO NÃO DERRUBA O LOTE.
 *    Padrão dos importadores de planilha (`try/catch` por linha + `errorDetails`).
 *    Aqui o "row" é o nome do arquivo. Um XML corrompido no meio de 800 não pode
 *    custar a importação dos outros 799.
 *
 * 3. ARQUIVO PRIMEIRO, LINHA DEPOIS, `unlink` NO CATCH.
 *    Ordem já justificada em `api/tarefas/anexos/route.ts`: arquivo órfão custa
 *    disco, linha sem arquivo aparece como download quebrado.
 *
 * 4. TETO POR NÚMERO DE ARQUIVOS, NÃO POR TEMPO.
 *    Lição paga em produção e registrada em `prazo-despacho-backfill.ts`: o teto
 *    de tempo era conferido antes da volta do laço, então toda chamada entregava
 *    o lote inteiro de qualquer forma — 120 MB de WAL e um checkpoint de 269
 *    segundos travando o banco. O botão certo é o número de itens.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHash } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import { dirname } from "path";
import prisma from "./prisma";
import { caminhoAbsolutoDoXml, caminhoRelativoDoXml } from "./fiscal-xml-disco";
import {
  ErroXmlFiscal,
  lerXmlFiscal,
  type EventoFiscalLido,
  type NotaFiscalLida,
} from "./nfe-xml";
import {
  MOTIVO_EXCLUSAO,
  MOTIVO_EXCLUSAO_LABEL,
  VERSAO_REGRA_FATURAMENTO,
  classificarFaturamento,
  type MotivoExclusao,
  type VinculoEmpresa,
} from "./faturamento-regras";

/**
 * Arquivos processados por requisição.
 *
 * 300 × ~8 KB de XML é pouco mais de 2 MB de corpo, e a tela envia em lotes desse
 * tamanho. O que sobra volta com `INTERROMPIDA` e a contagem do que faltou, em vez
 * de ser cortado no meio pela plataforma.
 */
export const MAX_ARQUIVOS_POR_LOTE = 300;

export type ArquivoParaImportar = {
  nome: string;
  bytes: Buffer;
};

export type ResultadoArquivo =
  | "IMPORTADO"
  | "DUPLICADO"
  | "CANCELAMENTO_APLICADO"
  | "IGNORADO"
  | "ERRO"
  | "NAO_PROCESSADO";

export type LinhaRelatorio = {
  arquivo: string;
  resultado: ResultadoArquivo;
  chave: string | null;
  /** Frase em português. É o que a tela mostra. */
  motivo: string | null;
  /** Código estável, para a tela agrupar sem depender do texto. */
  code: string | null;
};

export type CompetenciaTocada = { empresaId: string; ano: number; mes: number };

export type ResumoImportacao = {
  importacaoId: string;
  arquivosEnviados: number;
  importados: number;
  duplicados: number;
  ignorados: number;
  comErro: number;
  naoProcessados: number;
  situacao: "CONCLUIDA" | "INTERROMPIDA";
  competenciasApuradas: CompetenciaTocada[];
  relatorio: LinhaRelatorio[];
};

export type ContextoImportacao = {
  usuarioId: string;
  usuarioNome: string;
};

/* -------------------------------------------------------------------------- */
/*                          Casamento com a carteira                          */
/* -------------------------------------------------------------------------- */

type EmpresaMinima = { id: string; cnpj: string | null; razaoSocial: string };

/**
 * Carrega de uma vez as empresas de todos os CNPJs que aparecem no lote.
 *
 * Uma consulta para o lote inteiro, e não uma por arquivo: 822 arquivos daria 822
 * consultas, e o padrão do módulo é resolver a página inteira em uma
 * (`apuracao/route.ts` faz `tarefaId: { in: ids }` justamente para não cair em
 * N+1).
 */
async function carregarEmpresasPorCnpj(cnpjs: Set<string>): Promise<Map<string, EmpresaMinima>> {
  const lista = [...cnpjs].filter((c) => c.length === 14);
  if (lista.length === 0) return new Map();

  const empresas = await prisma.empresa.findMany({
    where: { cnpj: { in: lista } },
    select: { id: true, cnpj: true, razaoSocial: true },
  });

  const mapa = new Map<string, EmpresaMinima>();
  for (const empresa of empresas) {
    if (empresa.cnpj) mapa.set(empresa.cnpj, empresa);
  }
  return mapa;
}

/**
 * De onde vem o vínculo da nota com a carteira.
 *
 * Emitente na carteira = nota dela. Destinatário na carteira e emitente não =
 * nota de compra. Nenhum dos dois = empresa não cadastrada. Distinguir os dois
 * últimos importa porque a ação do operador é diferente: um é "ignore, é compra",
 * o outro é "cadastre a empresa e reimporte".
 */
function resolverVinculo(
  nota: NotaFiscalLida,
  empresasPorCnpj: Map<string, EmpresaMinima>,
): { vinculo: VinculoEmpresa; empresa: EmpresaMinima | null } {
  const emitente = empresasPorCnpj.get(nota.cnpjEmitente);
  if (emitente) return { vinculo: "EMITENTE", empresa: emitente };

  if (nota.documentoDestinatario && nota.tipoDocumentoDestinatario === "CNPJ") {
    const destinatario = empresasPorCnpj.get(nota.documentoDestinatario);
    if (destinatario) return { vinculo: "DESTINATARIO", empresa: destinatario };
  }

  return { vinculo: "NENHUM", empresa: null };
}

/* -------------------------------------------------------------------------- */
/*                              Importação                                    */
/* -------------------------------------------------------------------------- */

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Motivo legível a partir do código de exclusão. */
function textoDoMotivo(motivo: MotivoExclusao): string {
  return MOTIVO_EXCLUSAO_LABEL[motivo] ?? motivo;
}

export async function importarXmlFiscal(
  arquivos: ArquivoParaImportar[],
  contexto: ContextoImportacao,
): Promise<ResumoImportacao> {
  const relatorio: LinhaRelatorio[] = [];

  // O que passar do teto volta como NAO_PROCESSADO, com a contagem. A tela
  // reenvia; nada é cortado no meio.
  const processar = arquivos.slice(0, MAX_ARQUIVOS_POR_LOTE);
  const sobra = arquivos.slice(MAX_ARQUIVOS_POR_LOTE);

  /*
   * PASSO 1: ler tudo antes de gravar qualquer coisa.
   *
   * Leitura é pura e barata (regex sobre alguns KB). Fazer a leitura inteira
   * primeiro dá duas coisas: a lista de CNPJs para uma consulta só, e a separação
   * entre notas e eventos — que é o que permite ordenar as duas passadas.
   */
  const notas: Array<{ arquivo: ArquivoParaImportar; conteudo: NotaFiscalLida }> = [];
  const eventos: Array<{ arquivo: ArquivoParaImportar; conteudo: EventoFiscalLido }> = [];
  const cnpjsDoLote = new Set<string>();

  for (const arquivo of processar) {
    try {
      const conteudo = lerXmlFiscal(arquivo.bytes, arquivo.nome);

      if (conteudo.tipo === "EVENTO") {
        eventos.push({ arquivo, conteudo });
        continue;
      }

      if (conteudo.tipo === "OUTRO_MODELO") {
        // CT-e de frete é o caso real: 361 dos 822 arquivos da base, emitido pelo
        // próprio Mercado Livre. Não é erro do operador e não vira linha: é
        // relatado para a soma de arquivos fechar na tela.
        relatorio.push({
          arquivo: arquivo.nome,
          resultado: "IGNORADO",
          chave: conteudo.chave,
          motivo: `${textoDoMotivo(MOTIVO_EXCLUSAO.MODELO_NAO_APURADO)} (modelo ${conteudo.modelo ?? "?"})`,
          code: MOTIVO_EXCLUSAO.MODELO_NAO_APURADO,
        });
        continue;
      }

      notas.push({ arquivo, conteudo });
      cnpjsDoLote.add(conteudo.cnpjEmitente);
      if (conteudo.tipoDocumentoDestinatario === "CNPJ" && conteudo.documentoDestinatario) {
        cnpjsDoLote.add(conteudo.documentoDestinatario);
      }
    } catch (falha) {
      const erro = falha instanceof ErroXmlFiscal ? falha : null;
      relatorio.push({
        arquivo: arquivo.nome,
        resultado: "ERRO",
        chave: null,
        motivo: erro
          ? erro.detalhe
            ? `${erro.message} (${erro.detalhe})`
            : erro.message
          : "Não foi possível ler o arquivo.",
        code: erro?.code ?? "XML_INVALIDO",
      });
    }
  }

  const empresasPorCnpj = await carregarEmpresasPorCnpj(cnpjsDoLote);

  /*
   * O lote pertence a uma empresa só? `empresaId` do registro de importação fica
   * nulo quando a pasta traz CNPJ de mais de uma — que é o caso de quem exporta o
   * grupo inteiro de uma vez.
   */
  const empresasEnvolvidas = new Set<string>();
  for (const { conteudo } of notas) {
    const { empresa, vinculo } = resolverVinculo(conteudo, empresasPorCnpj);
    if (empresa && vinculo === "EMITENTE") empresasEnvolvidas.add(empresa.id);
  }

  const importacao = await prisma.importacaoXml.create({
    data: {
      empresaId: empresasEnvolvidas.size === 1 ? [...empresasEnvolvidas][0] : null,
      arquivosEnviados: arquivos.length,
      situacao: sobra.length > 0 ? "INTERROMPIDA" : "CONCLUIDA",
      importadoPorId: contexto.usuarioId,
      importadoPorNome: contexto.usuarioNome,
    },
    select: { id: true },
  });

  const competencias = new Map<string, CompetenciaTocada>();
  const marcarCompetencia = (empresaId: string, ano: number, mes: number) => {
    competencias.set(`${empresaId}|${ano}|${mes}`, { empresaId, ano, mes });
  };

  /* PASSO 2: as notas. */
  for (const { arquivo, conteudo } of notas) {
    const linha = await gravarNota({
      nota: conteudo,
      nomeArquivo: arquivo.nome,
      bytes: arquivo.bytes,
      empresasPorCnpj,
      importacaoId: importacao.id,
      contexto,
      marcarCompetencia,
    });
    relatorio.push(linha);
  }

  /* PASSO 3: os eventos, depois de todas as notas do lote existirem. */
  for (const { arquivo, conteudo } of eventos) {
    const linha = await aplicarEvento(conteudo, arquivo.nome, marcarCompetencia);
    relatorio.push(linha);
  }

  /* PASSO 4: a apuração das competências tocadas. */
  const competenciasApuradas = [...competencias.values()];
  for (const competencia of competenciasApuradas) {
    await apurarCompetencia(competencia, contexto);
  }

  for (const arquivo of sobra) {
    relatorio.push({
      arquivo: arquivo.nome,
      resultado: "NAO_PROCESSADO",
      chave: null,
      motivo: `Passou do limite de ${MAX_ARQUIVOS_POR_LOTE} arquivos por envio. Reenvie estes.`,
      code: "LOTE_CHEIO",
    });
  }

  const contar = (resultado: ResultadoArquivo) =>
    relatorio.filter((l) => l.resultado === resultado).length;

  const resumo: ResumoImportacao = {
    importacaoId: importacao.id,
    arquivosEnviados: arquivos.length,
    importados: contar("IMPORTADO"),
    duplicados: contar("DUPLICADO"),
    ignorados: contar("IGNORADO") + contar("CANCELAMENTO_APLICADO"),
    comErro: contar("ERRO"),
    naoProcessados: contar("NAO_PROCESSADO"),
    situacao: sobra.length > 0 ? "INTERROMPIDA" : "CONCLUIDA",
    competenciasApuradas,
    relatorio,
  };

  await prisma.importacaoXml.update({
    where: { id: importacao.id },
    data: {
      importados: resumo.importados,
      duplicados: resumo.duplicados,
      ignorados: resumo.ignorados,
      comErro: resumo.comErro,
      relatorio: relatorio as unknown as object,
    },
  });

  return resumo;
}

/* -------------------------------------------------------------------------- */
/*                           Gravação de uma nota                             */
/* -------------------------------------------------------------------------- */

async function gravarNota(params: {
  nota: NotaFiscalLida;
  nomeArquivo: string;
  bytes: Buffer;
  empresasPorCnpj: Map<string, EmpresaMinima>;
  importacaoId: string;
  contexto: ContextoImportacao;
  marcarCompetencia: (empresaId: string, ano: number, mes: number) => void;
}): Promise<LinhaRelatorio> {
  const { nota, nomeArquivo, bytes, empresasPorCnpj, importacaoId, contexto } = params;

  const { vinculo, empresa } = resolverVinculo(nota, empresasPorCnpj);
  const classificacao = classificarFaturamento({
    modelo: nota.modelo,
    ambiente: nota.ambiente,
    tipoOperacao: nota.tipoOperacao,
    finalidade: nota.finalidade,
    statusSefaz: nota.statusSefaz,
    cfops: nota.cfops,
    // Cancelamento nunca vem do XML da nota: o cStat dentro dela diz 100 mesmo
    // quando cancelada (medido na Fase 0). Quem cancela é o arquivo de evento, na
    // passada seguinte — então aqui a nota entra como não cancelada.
    cancelada: false,
    vinculo,
  });

  /*
   * Nota de homologação é recusada, não gravada.
   *
   * É o único caso em que a importação diz não em vez de "gravei e não somei": o
   * valor é fictício e a causa é operacional (subiu a pasta de teste). Guardar
   * valor de mentira ao lado de valor real é convite a alguém somar errado depois.
   */
  if (classificacao.recusarImportacao) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: nota.chave,
      motivo: textoDoMotivo(classificacao.motivoExclusao ?? MOTIVO_EXCLUSAO.HOMOLOGACAO),
      code: classificacao.motivoExclusao ?? MOTIVO_EXCLUSAO.HOMOLOGACAO,
    };
  }

  const hash = sha256(bytes);

  const existente = await prisma.documentoFiscal.findUnique({
    where: { chave: nota.chave },
    select: { id: true, arquivoHash: true },
  });

  if (existente) {
    /*
     * Mesma chave com hash DIFERENTE é XML editado, e isso não pode passar como
     * duplicata inofensiva: a chave de acesso é única no país, então dois
     * conteúdos distintos para a mesma chave significa que um dos dois foi
     * alterado depois de emitido.
     */
    if (existente.arquivoHash !== hash) {
      return {
        arquivo: nomeArquivo,
        resultado: "ERRO",
        chave: nota.chave,
        motivo: "Esta nota já foi importada com conteúdo diferente. O arquivo pode ter sido alterado.",
        code: "XML_DIVERGENTE",
      };
    }

    // Duplicado NÃO é erro: é o retry do contador, e a idempotência existe para
    // isso. Informa e segue.
    return {
      arquivo: nomeArquivo,
      resultado: "DUPLICADO",
      chave: nota.chave,
      motivo: "Já importada anteriormente.",
      code: "DUPLICADO",
    };
  }

  const ano = nota.emitidoEm.getUTCFullYear();
  const mes = nota.emitidoEm.getUTCMonth() + 1;

  const relativo = caminhoRelativoDoXml(nota.cnpjEmitente, ano, mes, nota.chave);
  const absoluto = caminhoAbsolutoDoXml(relativo);
  if (!absoluto) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: nota.chave,
      motivo: "Não foi possível montar um caminho seguro para guardar o arquivo.",
      code: "CAMINHO_INVALIDO",
    };
  }

  try {
    await mkdir(dirname(absoluto), { recursive: true });
    await writeFile(absoluto, bytes);
  } catch {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: nota.chave,
      motivo: "Falha ao gravar o arquivo no disco.",
      code: "FALHA_DISCO",
    };
  }

  try {
    await prisma.documentoFiscal.create({
      data: {
        chave: nota.chave,
        empresaId: vinculo === "EMITENTE" ? empresa?.id ?? null : null,
        cnpjEmitente: nota.cnpjEmitente,
        nomeEmitente: nota.nomeEmitente,
        documentoDestinatario: nota.documentoDestinatario,
        tipoDocumentoDestinatario: nota.tipoDocumentoDestinatario,
        nomeDestinatario: nota.nomeDestinatario,
        modelo: nota.modelo,
        serie: nota.serie,
        numero: nota.numero,
        emitidoEm: nota.emitidoEm,
        ano,
        mes,
        tipoOperacao: nota.tipoOperacao,
        finalidade: nota.finalidade,
        naturezaOperacao: nota.naturezaOperacao,
        situacao: "AUTORIZADA",
        statusSefaz: nota.statusSefaz,
        protocolo: nota.protocolo,
        valorTotal: nota.valorTotal,
        valorProdutos: nota.valorProdutos,
        cfops: nota.cfops,
        contaFaturamento: classificacao.contaFaturamento,
        motivoExclusao: classificacao.motivoExclusao,
        precisaConferencia: classificacao.precisaConferencia,
        pedidoMarketplace: nota.pedidoMarketplace,
        arquivo: relativo,
        arquivoBytes: bytes.length,
        arquivoHash: hash,
        importadoPorId: contexto.usuarioId,
        importadoPorNome: contexto.usuarioNome,
        importacaoId,
        versaoRegra: VERSAO_REGRA_FATURAMENTO,
      },
    });
  } catch (falhaBanco) {
    // Arquivo apagado para não sobrar órfão. A ordem inversa (linha antes do
    // arquivo) deixaria um download quebrado na tela, que é pior.
    await unlink(absoluto).catch(() => {});

    // Corrida entre o findUnique e o create: dois envios simultâneos da mesma
    // pasta. O banco recusa pelo índice único, e aqui isso é duplicata, não erro.
    if (
      typeof falhaBanco === "object" &&
      falhaBanco !== null &&
      (falhaBanco as { code?: string }).code === "P2002"
    ) {
      return {
        arquivo: nomeArquivo,
        resultado: "DUPLICADO",
        chave: nota.chave,
        motivo: "Já importada anteriormente.",
        code: "DUPLICADO",
      };
    }

    console.error("Erro ao gravar documento fiscal:", falhaBanco);
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: nota.chave,
      motivo: "Falha ao gravar a nota no banco.",
      code: "FALHA_BANCO",
    };
  }

  if (vinculo === "EMITENTE" && empresa) {
    params.marcarCompetencia(empresa.id, ano, mes);
  }

  return {
    arquivo: nomeArquivo,
    resultado: "IMPORTADO",
    chave: nota.chave,
    motivo: classificacao.contaFaturamento
      ? null
      : textoDoMotivo(classificacao.motivoExclusao ?? MOTIVO_EXCLUSAO.FORA_DA_FAIXA_DE_VENDA),
    code: classificacao.motivoExclusao,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Evento de cancelamento                            */
/* -------------------------------------------------------------------------- */

async function aplicarEvento(
  evento: EventoFiscalLido,
  nomeArquivo: string,
  marcarCompetencia: (empresaId: string, ano: number, mes: number) => void,
): Promise<LinhaRelatorio> {
  if (!evento.ehCancelamento) {
    // Carta de correção e outros eventos não mexem em valor nem em situação.
    return {
      arquivo: nomeArquivo,
      resultado: "IGNORADO",
      chave: evento.chave,
      motivo: `Evento ${evento.tipoEvento} não altera o faturamento.`,
      code: "EVENTO_SEM_EFEITO",
    };
  }

  const documento = await prisma.documentoFiscal.findUnique({
    where: { chave: evento.chave },
    select: { id: true, empresaId: true, ano: true, mes: true, situacao: true },
  });

  /*
   * Cancelamento de nota que não está no banco.
   *
   * Acontece quando o evento é importado sem a nota (pasta só de canceladas). Não
   * dá para gravar um cancelamento solto: `documento_fiscal` é uma linha POR NOTA,
   * e criar linha a partir do evento produziria um documento sem valor, sem CFOP e
   * sem emitente — que somaria zero e apareceria na tela como nota fantasma.
   *
   * LIMITAÇÃO CONHECIDA: se a nota for importada depois, ela entra AUTORIZADA e
   * este cancelamento se perde. É por isso que as notas do MESMO lote são
   * processadas antes dos eventos — a pasta que traz os dois juntos funciona. Para
   * o caso de pastas separadas, a saída é reimportar o evento depois da nota, e é
   * o que esta mensagem manda fazer.
   */
  if (!documento) {
    return {
      arquivo: nomeArquivo,
      resultado: "IGNORADO",
      chave: evento.chave,
      motivo: "A nota deste cancelamento não está importada. Importe a nota e reenvie este arquivo.",
      code: "NOTA_NAO_IMPORTADA",
    };
  }

  if (documento.situacao === "CANCELADA") {
    return {
      arquivo: nomeArquivo,
      resultado: "DUPLICADO",
      chave: evento.chave,
      motivo: "Cancelamento já aplicado.",
      code: "DUPLICADO",
    };
  }

  /*
   * UPDATE na linha existente, e não linha nova.
   *
   * Se o cancelamento criasse registro próprio, o faturamento somaria a nota
   * cancelada E mais um registro de nada. O valor tem de SAIR do mês.
   */
  await prisma.documentoFiscal.update({
    where: { id: documento.id },
    data: {
      situacao: "CANCELADA",
      contaFaturamento: false,
      motivoExclusao: MOTIVO_EXCLUSAO.CANCELADA,
      canceladoEm: evento.registradoEm ?? new Date(),
      justificativaCancelamento: evento.justificativa,
    },
  });

  if (documento.empresaId) {
    marcarCompetencia(documento.empresaId, documento.ano, documento.mes);
  }

  return {
    arquivo: nomeArquivo,
    resultado: "CANCELAMENTO_APLICADO",
    chave: evento.chave,
    motivo: "Nota marcada como cancelada e retirada do faturamento.",
    code: MOTIVO_EXCLUSAO.CANCELADA,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Apuração da competência                           */
/* -------------------------------------------------------------------------- */

/**
 * Recalcula o faturamento de uma competência a partir dos documentos.
 *
 * RECALCULA A COMPETÊNCIA INTEIRA, e não soma incrementalmente. É mais lento e é
 * o certo: soma incremental erra para sempre se uma importação falhar no meio, e
 * a competência tem centenas de linhas, não milhões.
 *
 * RESPEITA CONGELAMENTO. Competência que já entrou numa declaração emitida não
 * muda de valor — mas `valorApurado` continua sendo atualizado, para a tela poder
 * mostrar "declarado R$ X, XML hoje soma R$ Y". Esconder a divergência seria pior
 * que registrá-la.
 */
export async function apurarCompetencia(
  competencia: CompetenciaTocada,
  contexto: ContextoImportacao,
): Promise<void> {
  const { empresaId, ano, mes } = competencia;

  const agregado = await prisma.documentoFiscal.aggregate({
    where: { empresaId, ano, mes, contaFaturamento: true },
    _sum: { valorTotal: true },
    _count: { _all: true },
  });

  const apurado = agregado._sum.valorTotal ?? 0;
  const documentos = agregado._count._all;
  const agora = new Date();

  const existente = await prisma.faturamentoMensal.findUnique({
    where: { empresa_competencia_faturamento: { empresaId, ano, mes } },
    select: { id: true, origem: true, congeladoEm: true },
  });

  if (!existente) {
    await prisma.faturamentoMensal.create({
      data: {
        empresaId,
        ano,
        mes,
        origem: "XML",
        valor: apurado,
        valorApurado: apurado,
        documentos,
        apuradoEm: agora,
        definidoPorId: contexto.usuarioId,
        definidoPorNome: contexto.usuarioNome,
      },
    });
    return;
  }

  // Congelada ou digitada à mão: `valor` é preservado, só a apuração é atualizada.
  const preservarValor = existente.congeladoEm !== null || existente.origem !== "XML";

  await prisma.faturamentoMensal.update({
    where: { id: existente.id },
    data: {
      valorApurado: apurado,
      documentos,
      apuradoEm: agora,
      ...(preservarValor ? {} : { valor: apurado }),
    },
  });
}
