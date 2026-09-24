/**
 * Importação de XML fiscal: arquivos -> documento/evento persistido -> apuração.
 *
 * A rota é fina; a lógica mora aqui. Mesmo arranjo de `spreadsheet.ts` e
 * `legalizacao-service.ts`.
 *
 * GARANTIAS CENTRAIS:
 *
 * 1. O upload é contextual: a empresa selecionada vai no multipart e cada NF-e
 *    precisa ter essa empresa como emitente ou destinatária. Arquivo de outra
 *    empresa não some em outra tela sem o operador perceber.
 * 2. Nota e evento são serializados por chave com `pg_advisory_xact_lock`.
 * 3. O arquivo nasce temporário e só vira o caminho canônico dentro da região
 *    serializada. Quem perde uma corrida nunca apaga o arquivo de quem venceu.
 * 4. Evento é persistido mesmo sem nota. Quando a nota chega depois, o evento
 *    pendente é aplicado na mesma transação lógica.
 * 5. Reenvio de nota/evento duplicado também marca a competência para reapuração;
 *    retry reconcilia estado parcial em vez de só responder "já existe".
 * 6. A competência vem da data CIVIL de `dhEmi`, não do instante UTC.
 */

import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import { dirname } from "path";
import { Prisma, type EventoFiscal, type DocumentoFiscal } from "@prisma/client";
import prisma from "./prisma";
import {
  caminhoAbsolutoDoXml,
  caminhoRelativoDoEvento,
  caminhoRelativoDoIgnorado,
  caminhoRelativoDoXml,
} from "./fiscal-xml-disco";
import {
  ErroXmlFiscal,
  STATUS_EVENTO_REGISTRADO,
  decomporChave,
  eventoFoiRegistrado,
  lerXmlFiscal,
  type EventoFiscalLido,
  type NotaFiscalLida,
  type OutroModeloLido,
} from "./nfe-xml";
import {
  MOTIVO_EXCLUSAO,
  MOTIVO_EXCLUSAO_LABEL,
  VERSAO_REGRA_FATURAMENTO,
  classificarFaturamento,
  type MotivoExclusao,
  type VinculoEmpresa,
} from "./faturamento-regras";
import { normalizarSerie } from "./faturamento-canais";

export const MAX_ARQUIVOS_POR_LOTE = 300;

export class ErroImportacaoFiscal extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ErroImportacaoFiscal";
    this.code = code;
    this.status = status;
  }
}

export type ArquivoParaImportar = {
  nome: string;
  bytes: Buffer;
  /** ZIP!caminho interno, ou o nome do XML solto; usado só na auditoria. */
  origem?: string;
  /**
   * Falha encontrada pela rota antes do parser.
   *
   * Ela viaja junto do arquivo em vez de a rota devolver HTTP 4xx para o lote
   * inteiro. Assim um XML vazio/grande/com extensão errada vira UMA linha de
   * relatório e os outros 299 arquivos continuam. Limites agregados (32 MiB e
   * quantidade máxima) continuam sendo falhas da requisição inteira, pois são
   * proteção de memória — não defeito de um documento isolado.
   */
  erroPrevalidacao?: { code: string; motivo: string };
};

export type ResultadoArquivo =
  | "IMPORTADO"
  | "DUPLICADO"
  | "CANCELAMENTO_APLICADO"
  | "EVENTO_PENDENTE"
  | "EVENTO_ARQUIVADO"
  | "IGNORADO"
  | "ERRO"
  | "NAO_PROCESSADO";

export type LinhaRelatorio = {
  arquivo: string;
  resultado: ResultadoArquivo;
  chave: string | null;
  motivo: string | null;
  code: string | null;
};

export type CompetenciaTocada = { empresaId: string; ano: number; mes: number };

export type ResumoImportacao = {
  importacaoId: string;
  sessaoId: string;
  arquivosEnviados: number;
  importados: number;
  duplicados: number;
  ignorados: number;
  eventosAplicados: number;
  comErro: number;
  naoProcessados: number;
  situacao: "CONCLUIDA" | "PARCIAL" | "INTERROMPIDA";
  competenciasApuradas: CompetenciaTocada[];
  relatorio: LinhaRelatorio[];
};

export type ContextoImportacao = {
  usuarioId: string;
  usuarioNome: string;
  empresaId: string;
  /** Uma seleção de XML/ZIP inteira, compartilhada por todos os lotes HTTP. */
  sessaoId: string;
  /** Só o último lote encerra a sessão e libera emissão de declaração. */
  ultimoLote: boolean;
};

type EmpresaMinima = { id: string; cnpj: string; razaoSocial: string };

type MarcarCompetencia = (empresaId: string, ano: number, mes: number) => void;

function sha256(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function textoDoMotivo(motivo: MotivoExclusao): string {
  return MOTIVO_EXCLUSAO_LABEL[motivo] ?? motivo;
}

async function carregarEmpresaEsperada(empresaId: string): Promise<EmpresaMinima> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, cnpj: true, razaoSocial: true },
  });
  if (!empresa) {
    throw new ErroImportacaoFiscal("EMPRESA_NAO_ENCONTRADA", "Empresa não encontrada.", 404);
  }
  if (!empresa.cnpj) {
    throw new ErroImportacaoFiscal(
      "EMPRESA_SEM_CNPJ",
      "A empresa selecionada ainda não tem CNPJ e não pode receber XML fiscal.",
    );
  }
  return { ...empresa, cnpj: empresa.cnpj };
}

function vinculoComEmpresa(
  nota: NotaFiscalLida,
  empresa: EmpresaMinima,
): "EMITENTE" | "TERCEIRO" | null {
  if (nota.cnpjEmitente === empresa.cnpj) return "EMITENTE";
  if (
    nota.tipoDocumentoDestinatario === "CNPJ" &&
    nota.documentoDestinatario === empresa.cnpj
  ) {
    return "TERCEIRO";
  }
  return null;
}

function situacaoDaNota(statusSefaz: string | null): string {
  if (statusSefaz === "100") return "AUTORIZADA";
  if (["110", "301", "302"].includes(statusSefaz ?? "")) return "DENEGADA";
  return "NAO_AUTORIZADA";
}

/** Lock transacional por chave; funciona entre processos e réplicas. */
async function travarChave(tx: Prisma.TransactionClient, chave: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`fiscal:${chave}`}))`;
}

/** Lock separado por competência, para agregação antiga nunca sobrescrever nova. */
async function travarCompetencia(
  tx: Prisma.TransactionClient,
  empresaId: string,
  ano: number,
  mes: number,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`faturamento:${empresaId}:${ano}:${mes}`}))`;
}

async function escreverTemporario(destinoFinal: string, bytes: Buffer): Promise<string> {
  await mkdir(dirname(destinoFinal), { recursive: true });
  const temporario = `${destinoFinal}.${randomUUID()}.tmp`;
  await writeFile(temporario, bytes, { flag: "wx" });
  return temporario;
}

/**
 * Promove o temporário para o caminho canônico ou repara o canônico corrompido.
 *
 * Só é chamada sob o advisory lock da chave. Se já existe e o hash bate, o
 * temporário é descartado. Se o arquivo sumiu ou diverge do hash do banco, o
 * reenvio conhecido repara a prova em disco.
 */
async function garantirArquivoCanonico(
  temporario: string,
  destinoFinal: string,
  hashEsperado: string,
): Promise<void> {
  try {
    const atual = await readFile(destinoFinal);
    if (sha256(atual) === hashEsperado) {
      await unlink(temporario).catch(() => {});
      return;
    }
    await unlink(destinoFinal).catch(() => {});
  } catch {
    // Ausente: o rename abaixo cria.
  }
  await rename(temporario, destinoFinal);
}

function rotuloArquivo(arquivo: ArquivoParaImportar): string {
  return (arquivo.origem || arquivo.nome).slice(0, 600);
}

function contar(relatorio: LinhaRelatorio[], resultado: ResultadoArquivo): number {
  return relatorio.filter((linha) => linha.resultado === resultado).length;
}

function resumir(
  importacaoId: string,
  sessaoId: string,
  arquivosEnviados: number,
  relatorio: LinhaRelatorio[],
  competenciasApuradas: CompetenciaTocada[],
): ResumoImportacao {
  const comErro = contar(relatorio, "ERRO");
  const naoProcessados = contar(relatorio, "NAO_PROCESSADO");
  const eventosAplicados = contar(relatorio, "CANCELAMENTO_APLICADO");
  const ignorados =
    contar(relatorio, "IGNORADO") +
    contar(relatorio, "EVENTO_PENDENTE") +
    contar(relatorio, "EVENTO_ARQUIVADO") +
    eventosAplicados;

  return {
    importacaoId,
    sessaoId,
    arquivosEnviados,
    importados: contar(relatorio, "IMPORTADO"),
    duplicados: contar(relatorio, "DUPLICADO"),
    ignorados,
    eventosAplicados,
    comErro,
    naoProcessados,
    situacao:
      naoProcessados > 0
        ? "INTERROMPIDA"
        : comErro > 0
          ? "PARCIAL"
          : "CONCLUIDA",
    competenciasApuradas,
    relatorio,
  };
}

function relatorioPersistido(valor: Prisma.JsonValue | null): LinhaRelatorio[] {
  return Array.isArray(valor) ? (valor as unknown as LinhaRelatorio[]) : [];
}

/** Abre ou continua a mesma seleção XML/ZIP através de vários lotes HTTP. */
async function abrirSessaoImportacao(
  contexto: ContextoImportacao,
  arquivosNoLote: number,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`importacao:${contexto.sessaoId}`}))`;

    const existente = await tx.importacaoXml.findUnique({
      where: { sessaoId: contexto.sessaoId },
    });
    if (existente) {
      if (
        existente.empresaId !== contexto.empresaId ||
        existente.importadoPorId !== contexto.usuarioId
      ) {
        throw new ErroImportacaoFiscal(
          "SESSAO_DIVERGENTE",
          "Esta sessão de importação pertence a outra empresa ou usuário.",
          409,
        );
      }
      if (existente.finalizadoEm || existente.encerrarQuandoOciosa) {
        throw new ErroImportacaoFiscal(
          "SESSAO_FINALIZADA",
          "Esta sessão de importação já foi finalizada. Selecione os arquivos novamente.",
          409,
        );
      }

      return tx.importacaoXml.update({
        where: { id: existente.id },
        data: {
          arquivosEnviados: { increment: arquivosNoLote },
          lotes: { increment: arquivosNoLote > 0 ? 1 : 0 },
          lotesAtivos: { increment: arquivosNoLote > 0 ? 1 : 0 },
          situacao: "PROCESSANDO",
        },
        select: { id: true },
      });
    }

    return tx.importacaoXml.create({
      data: {
        sessaoId: contexto.sessaoId,
        empresaId: contexto.empresaId,
        arquivosEnviados: arquivosNoLote,
        lotes: arquivosNoLote > 0 ? 1 : 0,
        lotesAtivos: arquivosNoLote > 0 ? 1 : 0,
        situacao: "PROCESSANDO",
        importadoPorId: contexto.usuarioId,
        importadoPorNome: contexto.usuarioNome,
      },
      select: { id: true },
    });
  });
}

/** Agrega o resultado do lote ao registro pai e só finaliza no último lote. */
async function finalizarLoteImportacao(
  resumo: ResumoImportacao,
  contexto: ContextoImportacao,
  fatal = false,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`importacao:${contexto.sessaoId}`}))`;
    const atual = await tx.importacaoXml.findUnique({
      where: { id: resumo.importacaoId },
    });
    if (!atual) {
      throw new ErroImportacaoFiscal(
        "SESSAO_NAO_ENCONTRADA",
        "A sessão de importação não foi encontrada.",
        404,
      );
    }

    const importados = atual.importados + resumo.importados;
    const duplicados = atual.duplicados + resumo.duplicados;
    const ignorados = atual.ignorados + resumo.ignorados;
    const eventosAplicados = atual.eventosAplicados + resumo.eventosAplicados;
    const comErro = atual.comErro + resumo.comErro;
    const naoProcessados = atual.naoProcessados + resumo.naoProcessados;
    const ativosDepois = Math.max(0, atual.lotesAtivos - 1);
    const terminou =
      fatal ||
      ((contexto.ultimoLote || atual.encerrarQuandoOciosa) && ativosDepois === 0);
    const situacao = fatal
      ? "FALHA"
      : !terminou
        ? "PROCESSANDO"
        : atual.encerrarQuandoOciosa || naoProcessados > 0
          // `encerrarQuandoOciosa` só é ligado pelo endpoint de ABORTAR. Ele pode
          // chegar enquanto um lote ainda grava; o lote que termina depois deve
          // produzir o MESMO desfecho de quando o abortamento chegou sem lote
          // ativo. Antes dependia da corrida e alternava entre PARCIAL/CONCLUIDA.
          ? "INTERROMPIDA"
          : comErro > 0
            ? "PARCIAL"
            : "CONCLUIDA";

    await tx.importacaoXml.update({
      where: { id: atual.id },
      data: {
        importados,
        duplicados,
        ignorados,
        eventosAplicados,
        comErro,
        naoProcessados,
        lotesAtivos: ativosDepois,
        situacao,
        encerrarQuandoOciosa: terminou ? false : atual.encerrarQuandoOciosa,
        finalizadoEm: terminou ? new Date() : null,
        relatorio: [
          ...relatorioPersistido(atual.relatorio),
          ...resumo.relatorio,
        ] as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

export async function iniciarSessaoImportacao(input: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
  usuarioNome: string;
}): Promise<{ importacaoId: string }> {
  await carregarEmpresaEsperada(input.empresaId);
  const sessao = await abrirSessaoImportacao(
    { ...input, ultimoLote: false },
    0,
  );
  return { importacaoId: sessao.id };
}

export async function encerrarSessaoImportacao(input: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
  /**
   * Este comando existe só para ABORTAMENTO (ZIP inválido, rede interrompida,
   * aba fechando). O sucesso fecha de forma durável no próprio último lote.
   * Exigir o literal impede uma chamada sem intenção de registrar sucesso por
   * engano, que era exatamente a ambiguidade anterior.
   */
  desfecho: "ABORTAR";
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`importacao:${input.sessaoId}`}))`;
    const atual = await tx.importacaoXml.findUnique({
      where: { sessaoId: input.sessaoId },
    });
    if (!atual || atual.finalizadoEm) return;
    if (atual.empresaId !== input.empresaId || atual.importadoPorId !== input.usuarioId) {
      throw new ErroImportacaoFiscal(
        "SESSAO_DIVERGENTE",
        "Esta sessão de importação pertence a outra empresa ou usuário.",
        409,
      );
    }
    if (atual.lotesAtivos > 0) {
      // O lote que perdeu a resposta ainda pode estar gravando. Ele próprio verá
      // a flag ao terminar e só então fecha a sessão.
      await tx.importacaoXml.update({
        where: { id: atual.id },
        data: { encerrarQuandoOciosa: true },
      });
      return;
    }
    await tx.importacaoXml.update({
      where: { id: atual.id },
      data: {
        // Sem lote ativo, o abortamento termina agora. É INTERROMPIDA mesmo que
        // os lotes anteriores não tenham erro: a seleção não chegou ao fim (por
        // exemplo, um ZIP posterior era inválido). Chamar isso de CONCLUIDA
        // apagava da auditoria justamente o arquivo que interrompeu a rodada.
        situacao: "INTERROMPIDA",
        encerrarQuandoOciosa: false,
        finalizadoEm: new Date(),
      },
    });
  });
}

export async function importarXmlFiscal(
  arquivos: ArquivoParaImportar[],
  contexto: ContextoImportacao,
): Promise<ResumoImportacao> {
  const empresa = await carregarEmpresaEsperada(contexto.empresaId);
  const processar = arquivos.slice(0, MAX_ARQUIVOS_POR_LOTE);
  const sobra = arquivos.slice(MAX_ARQUIVOS_POR_LOTE);
  const relatorio: LinhaRelatorio[] = [];

  const importacao = await abrirSessaoImportacao(contexto, arquivos.length);

  const competencias = new Map<string, CompetenciaTocada>();
  const marcarCompetencia: MarcarCompetencia = (empresaId, ano, mes) => {
    competencias.set(`${empresaId}|${ano}|${mes}`, { empresaId, ano, mes });
  };

  try {
    const notas: Array<{ arquivo: ArquivoParaImportar; conteudo: NotaFiscalLida }> = [];
    const eventos: Array<{ arquivo: ArquivoParaImportar; conteudo: EventoFiscalLido }> = [];
    const outros: Array<{ arquivo: ArquivoParaImportar; conteudo: OutroModeloLido }> = [];

    // Passada 1: leitura pura e separação. Erro de um arquivo não derruba os outros.
    for (const arquivo of processar) {
      // Extensão, tamanho individual e arquivo vazio são detectados na rota,
      // antes de alocar o Buffer. Até então a rota respondia 4xx e descartava o
      // multipart INTEIRO; aqui eles viram exatamente o que são: erro deste
      // arquivo. O registro pai recebe a linha e as contagens normalmente.
      if (arquivo.erroPrevalidacao) {
        relatorio.push({
          arquivo: rotuloArquivo(arquivo),
          resultado: "ERRO",
          chave: null,
          motivo: arquivo.erroPrevalidacao.motivo,
          code: arquivo.erroPrevalidacao.code,
        });
        continue;
      }

      try {
        const conteudo = lerXmlFiscal(arquivo.bytes, arquivo.nome);
        if (conteudo.tipo === "EVENTO") {
          eventos.push({ arquivo, conteudo });
        } else if (conteudo.tipo === "OUTRO_MODELO") {
          outros.push({ arquivo, conteudo });
        } else {
          notas.push({ arquivo, conteudo });
        }
      } catch (falha) {
        const erro = falha instanceof ErroXmlFiscal ? falha : null;
        relatorio.push({
          arquivo: rotuloArquivo(arquivo),
          resultado: "ERRO",
          chave: null,
          motivo: erro
            ? `${erro.message}${erro.detalhe ? ` (${erro.detalhe})` : ""}`
            : "Não foi possível ler o arquivo.",
          code: erro?.code ?? "XML_INVALIDO",
        });
      }
    }

    // Passada 2: notas. Evento pendente antigo é aplicado dentro de gravarNota.
    for (const { arquivo, conteudo } of notas) {
      relatorio.push(
        await gravarNota({
          nota: conteudo,
          nomeArquivo: rotuloArquivo(arquivo),
          bytes: arquivo.bytes,
          empresa,
          importacaoId: importacao.id,
          contexto,
          marcarCompetencia,
        }),
      );
    }

    // Outros modelos são persistidos em tabela própria: contam como arquivo lido
    // e aparecem em "Fora do faturamento", sem inventar campos de NF-e no CT-e.
    for (const { arquivo, conteudo } of outros) {
      relatorio.push(
        await gravarIgnorado({
          conteudo,
          nomeArquivo: rotuloArquivo(arquivo),
          bytes: arquivo.bytes,
          empresa,
          importacaoId: importacao.id,
          contexto,
        }),
      );
    }

    // Passada 3: eventos deste lote. Agora todas as notas dele já existem.
    for (const { arquivo, conteudo } of eventos) {
      relatorio.push(
        await gravarEvento({
          evento: conteudo,
          nomeArquivo: rotuloArquivo(arquivo),
          bytes: arquivo.bytes,
          empresa,
          importacaoId: importacao.id,
          contexto,
          marcarCompetencia,
        }),
      );
    }

    for (const arquivo of sobra) {
      relatorio.push({
        arquivo: rotuloArquivo(arquivo),
        resultado: "NAO_PROCESSADO",
        chave: null,
        motivo: `Passou do limite de ${MAX_ARQUIVOS_POR_LOTE} arquivos por envio. Reenvie estes.`,
        code: "LOTE_CHEIO",
      });
    }

    // Duplicata e evento já aplicado também marcam a competência; retry reconcilia.
    const competenciasApuradas = [...competencias.values()];
    for (const competencia of competenciasApuradas) {
      await apurarCompetencia(competencia, contexto);
    }

    const resumo = resumir(
      importacao.id,
      contexto.sessaoId,
      arquivos.length,
      relatorio,
      competenciasApuradas,
    );
    await finalizarLoteImportacao(resumo, contexto);
    return resumo;
  } catch (falha) {
    // Estado nunca fica falsamente PROCESSANDO depois de uma falha fatal do lote.
    const parcial = resumir(
      importacao.id,
      contexto.sessaoId,
      arquivos.length,
      relatorio,
      [...competencias.values()],
    );
    await finalizarLoteImportacao(parcial, contexto, true).catch((erroFinal) =>
      console.error("Não foi possível marcar a importação como FALHA:", erroFinal),
    );
    throw falha;
  }
}

/* -------------------------------------------------------------------------- */
/*                    Arquivo reconhecido, mas não apurado                    */
/* -------------------------------------------------------------------------- */

async function gravarIgnorado(params: {
  conteudo: OutroModeloLido;
  nomeArquivo: string;
  bytes: Buffer;
  empresa: EmpresaMinima;
  importacaoId: string;
  contexto: ContextoImportacao;
}): Promise<LinhaRelatorio> {
  const { conteudo, nomeArquivo, bytes, empresa, importacaoId, contexto } = params;
  const motivo = `${textoDoMotivo(MOTIVO_EXCLUSAO.MODELO_NAO_APURADO)} (modelo ${conteudo.modelo ?? "?"})`;

  if (!conteudo.documentosRelacionados.includes(empresa.cnpj)) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: conteudo.chave,
      motivo: `O documento não menciona a empresa selecionada (${empresa.cnpj}).`,
      code: "EMPRESA_DIFERENTE",
    };
  }

  // Sem chave/data não há identidade nem competência para persistir. Continua
  // relatado, mas não inventa dado só para fechar contagem.
  const chaveFiscal = conteudo.chave ? decomporChave(conteudo.chave) : null;
  if (
    !conteudo.chave ||
    !chaveFiscal ||
    conteudo.ano === null ||
    conteudo.mes === null
  ) {
    return {
      arquivo: nomeArquivo,
      resultado: "IGNORADO",
      chave: conteudo.chave,
      motivo: `${motivo}; sem chave ou data para arquivar.`,
      code: MOTIVO_EXCLUSAO.MODELO_NAO_APURADO,
    };
  }

  if (
    chaveFiscal.ano !== conteudo.ano ||
    chaveFiscal.mes !== conteudo.mes ||
    (conteudo.modelo && chaveFiscal.modelo !== conteudo.modelo)
  ) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: conteudo.chave,
      motivo: "A data ou o modelo do documento não confere com a chave de acesso.",
      code: "XML_DIVERGENTE",
    };
  }

  const relativo = caminhoRelativoDoIgnorado(
    empresa.cnpj,
    conteudo.ano,
    conteudo.mes,
    conteudo.chave,
  );
  const absoluto = caminhoAbsolutoDoXml(relativo);
  if (!absoluto) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: conteudo.chave,
      motivo: "Não foi possível montar caminho seguro para o arquivo ignorado.",
      code: "CAMINHO_INVALIDO",
    };
  }

  const hash = sha256(bytes);
  let temporario: string;
  try {
    temporario = await escreverTemporario(absoluto, bytes);
  } catch {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: conteudo.chave,
      motivo: "Falha ao gravar o arquivo ignorado no disco.",
      code: "FALHA_DISCO",
    };
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      await travarChave(tx, conteudo.chave!);
      const existente = await tx.arquivoFiscalIgnorado.findUnique({
        where: { chave: conteudo.chave! },
      });
      if (existente) {
        if (existente.arquivoHash !== hash) return "DIVERGENTE" as const;
        const destino = caminhoAbsolutoDoXml(existente.arquivo) ?? absoluto;
        await garantirArquivoCanonico(temporario, destino, hash);
        return "DUPLICADO" as const;
      }

      await garantirArquivoCanonico(temporario, absoluto, hash);
      await tx.arquivoFiscalIgnorado.create({
        data: {
          empresaId: empresa.id,
          importacaoId,
          chave: conteudo.chave,
          modelo: conteudo.modelo,
          cnpjEmitente: conteudo.cnpjEmitente,
          nomeEmitente: conteudo.nomeEmitente,
          emitidoEm: conteudo.emitidoEm,
          ano: conteudo.ano!,
          mes: conteudo.mes!,
          valorTotal: new Prisma.Decimal(conteudo.valorTotal),
          motivoExclusao: MOTIVO_EXCLUSAO.MODELO_NAO_APURADO,
          arquivo: relativo,
          arquivoBytes: bytes.length,
          arquivoHash: hash,
          importadoPorId: contexto.usuarioId,
          importadoPorNome: contexto.usuarioNome,
        },
      });
      return "CRIADO" as const;
    });

    await unlink(temporario).catch(() => {});
    if (resultado === "DIVERGENTE") {
      return {
        arquivo: nomeArquivo,
        resultado: "ERRO",
        chave: conteudo.chave,
        motivo: "Este documento já foi arquivado com conteúdo diferente.",
        code: "XML_DIVERGENTE",
      };
    }
    return {
      arquivo: nomeArquivo,
      resultado: resultado === "DUPLICADO" ? "DUPLICADO" : "IGNORADO",
      chave: conteudo.chave,
      motivo,
      code:
        resultado === "DUPLICADO"
          ? "DUPLICADO"
          : MOTIVO_EXCLUSAO.MODELO_NAO_APURADO,
    };
  } catch (falha) {
    await unlink(temporario).catch(() => {});
    console.error("Erro ao arquivar modelo fiscal ignorado:", falha);
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: conteudo.chave,
      motivo: "Falha ao arquivar o documento que não entra no faturamento.",
      code: "FALHA_BANCO",
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Nota                                      */
/* -------------------------------------------------------------------------- */

type DocumentoComArquivo = Pick<
  DocumentoFiscal,
  "id" | "chave" | "empresaId" | "ano" | "mes" | "situacao" | "arquivo" | "arquivoHash"
>;

async function aplicarPendentesNaNota(
  tx: Prisma.TransactionClient,
  documento: DocumentoComArquivo,
): Promise<boolean> {
  const pendentes = await tx.eventoFiscal.findMany({
    where: {
      chaveDocumento: documento.chave,
      situacao: "PENDENTE",
      tipoEvento: { in: ["110111", "110112"] },
      statusSefaz: { in: [...STATUS_EVENTO_REGISTRADO] },
    },
    orderBy: [{ registradoEm: "asc" }, { createdAt: "asc" }],
  });

  if (pendentes.length === 0) return false;
  const ultimo = pendentes[pendentes.length - 1];

  await tx.documentoFiscal.update({
    where: { id: documento.id },
    data: {
      situacao: "CANCELADA",
      contaFaturamento: false,
      motivoExclusao: MOTIVO_EXCLUSAO.CANCELADA,
      precisaConferencia: false,
      canceladoEm: ultimo.registradoEm ?? new Date(),
      justificativaCancelamento: ultimo.justificativa,
    },
  });
  await tx.eventoFiscal.updateMany({
    where: { id: { in: pendentes.map((evento) => evento.id) } },
    data: { situacao: "APLICADO", documentoId: documento.id, motivo: null },
  });
  return true;
}

async function gravarNota(params: {
  nota: NotaFiscalLida;
  nomeArquivo: string;
  bytes: Buffer;
  empresa: EmpresaMinima;
  importacaoId: string;
  contexto: ContextoImportacao;
  marcarCompetencia: MarcarCompetencia;
}): Promise<LinhaRelatorio> {
  const { nota, nomeArquivo, bytes, empresa, importacaoId, contexto } = params;
  const vinculoDetectado = vinculoComEmpresa(nota, empresa);

  // Este produto apura NF EMITIDA pelo CNPJ. Guardar a mesma chave primeiro na
  // destinatária e depois na emitente é impossível com chave globalmente única e
  // tornava a receita dependente da ordem de upload. Nota recebida fica no
  // relatório do lote, mas não ocupa a identidade fiscal da emitente.
  if (vinculoDetectado === "TERCEIRO") {
    return {
      arquivo: nomeArquivo,
      resultado: "IGNORADO",
      chave: nota.chave,
      motivo: textoDoMotivo(MOTIVO_EXCLUSAO.TERCEIRO),
      code: MOTIVO_EXCLUSAO.TERCEIRO,
    };
  }

  if (!vinculoDetectado) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: nota.chave,
      motivo: `O XML foi emitido por ${nota.cnpjEmitente} e não pertence à empresa selecionada (${empresa.cnpj}).`,
      code: "EMPRESA_DIFERENTE",
    };
  }

  const vinculo: VinculoEmpresa = "EMITENTE";
  const classificacao = classificarFaturamento({
    modelo: nota.modelo,
    ambiente: nota.ambiente,
    tipoOperacao: nota.tipoOperacao,
    finalidade: nota.finalidade,
    statusSefaz: nota.statusSefaz,
    cfops: nota.cfops,
    cancelada: false,
    vinculo,
  });

  if (classificacao.recusarImportacao) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: nota.chave,
      motivo: textoDoMotivo(classificacao.motivoExclusao ?? MOTIVO_EXCLUSAO.HOMOLOGACAO),
      code: classificacao.motivoExclusao ?? MOTIVO_EXCLUSAO.HOMOLOGACAO,
    };
  }

  const relativo = caminhoRelativoDoXml(nota.cnpjEmitente, nota.ano, nota.mes, nota.chave);
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

  const hash = sha256(bytes);
  let temporario: string;
  try {
    temporario = await escreverTemporario(absoluto, bytes);
  } catch {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: nota.chave,
      motivo: "Falha ao gravar o arquivo temporário no disco.",
      code: "FALHA_DISCO",
    };
  }

  try {
    const desfecho = await prisma.$transaction(async (tx) => {
      await travarChave(tx, nota.chave);

      const existente = await tx.documentoFiscal.findUnique({
        where: { chave: nota.chave },
        select: {
          id: true,
          chave: true,
          empresaId: true,
          ano: true,
          mes: true,
          situacao: true,
          arquivo: true,
          arquivoHash: true,
        },
      });

      if (existente) {
        if (existente.arquivoHash !== hash) {
          return { tipo: "DIVERGENTE" as const, documento: existente, cancelou: false };
        }

        const destinoExistente = caminhoAbsolutoDoXml(existente.arquivo) ?? absoluto;
        await garantirArquivoCanonico(temporario, destinoExistente, hash);
        const revalidado = await tx.documentoFiscal.update({
          where: { id: existente.id },
          data: {
            empresaId: empresa.id,
            vinculoEmpresa: "EMITENTE",
            assinaturaValida: true,
            situacao:
              existente.situacao === "CANCELADA"
                ? "CANCELADA"
                : situacaoDaNota(nota.statusSefaz),
            contaFaturamento:
              existente.situacao === "CANCELADA"
                ? false
                : classificacao.contaFaturamento,
            motivoExclusao:
              existente.situacao === "CANCELADA"
                ? MOTIVO_EXCLUSAO.CANCELADA
                : classificacao.motivoExclusao,
            precisaConferencia:
              existente.situacao === "CANCELADA"
                ? false
                : classificacao.precisaConferencia,
            versaoRegra: VERSAO_REGRA_FATURAMENTO,
          },
          select: {
            id: true,
            chave: true,
            empresaId: true,
            ano: true,
            mes: true,
            situacao: true,
            arquivo: true,
            arquivoHash: true,
          },
        });
        const cancelou = await aplicarPendentesNaNota(tx, revalidado);
        return { tipo: "DUPLICADO" as const, documento: revalidado, cancelou };
      }

      await garantirArquivoCanonico(temporario, absoluto, hash);
      const documento = await tx.documentoFiscal.create({
        data: {
          chave: nota.chave,
          empresaId: empresa.id,
          vinculoEmpresa: vinculo,
          cnpjEmitente: nota.cnpjEmitente,
          nomeEmitente: nota.nomeEmitente,
          documentoDestinatario: nota.documentoDestinatario,
          tipoDocumentoDestinatario: nota.tipoDocumentoDestinatario,
          nomeDestinatario: nota.nomeDestinatario,
          modelo: nota.modelo,
          serie: normalizarSerie(nota.serie),
          numero: nota.numero,
          emitidoEm: nota.emitidoEm,
          ano: nota.ano,
          mes: nota.mes,
          tipoOperacao: nota.tipoOperacao,
          finalidade: nota.finalidade,
          naturezaOperacao: nota.naturezaOperacao,
          situacao: situacaoDaNota(nota.statusSefaz),
          statusSefaz: nota.statusSefaz,
          protocolo: nota.protocolo,
          assinaturaValida: nota.assinaturaValida,
          valorTotal: new Prisma.Decimal(nota.valorTotal),
          valorProdutos:
            nota.valorProdutos === null
              ? null
              : new Prisma.Decimal(nota.valorProdutos),
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
        select: {
          id: true,
          chave: true,
          empresaId: true,
          ano: true,
          mes: true,
          situacao: true,
          arquivo: true,
          arquivoHash: true,
        },
      });
      const cancelou = await aplicarPendentesNaNota(tx, documento);
      return { tipo: "CRIADO" as const, documento, cancelou };
    });

    await unlink(temporario).catch(() => {});

    if (desfecho.tipo === "DIVERGENTE") {
      return {
        arquivo: nomeArquivo,
        resultado: "ERRO",
        chave: nota.chave,
        motivo: "Esta nota já foi importada com conteúdo diferente. O arquivo pode ter sido alterado.",
        code: "XML_DIVERGENTE",
      };
    }

    if (desfecho.documento.empresaId) {
      params.marcarCompetencia(
        desfecho.documento.empresaId,
        desfecho.documento.ano,
        desfecho.documento.mes,
      );
    }

    return {
      arquivo: nomeArquivo,
      resultado: desfecho.tipo === "CRIADO" ? "IMPORTADO" : "DUPLICADO",
      chave: nota.chave,
      motivo: desfecho.cancelou
        ? "Nota importada e cancelamento pendente aplicado."
        : desfecho.tipo === "DUPLICADO"
          ? "Já importada anteriormente; arquivo e apuração conferidos."
          : classificacao.contaFaturamento
            ? null
            : textoDoMotivo(
                classificacao.motivoExclusao ??
                  MOTIVO_EXCLUSAO.FORA_DA_FAIXA_DE_VENDA,
              ),
      code:
        desfecho.tipo === "DUPLICADO"
          ? "DUPLICADO"
          : classificacao.motivoExclusao,
    };
  } catch (falha) {
    await unlink(temporario).catch(() => {});
    console.error("Erro ao gravar documento fiscal:", falha);
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: nota.chave,
      motivo: "Falha ao gravar a nota no banco.",
      code: "FALHA_BANCO",
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Evento                                    */
/* -------------------------------------------------------------------------- */

function identidadeEvento(evento: EventoFiscalLido): {
  cnpj: string;
  ano: number;
  mes: number;
} | null {
  const chave = decomporChave(evento.chave);
  return chave ? { cnpj: chave.cnpj, ano: chave.ano, mes: chave.mes } : null;
}

async function aplicarEventoNaNota(
  tx: Prisma.TransactionClient,
  evento: EventoFiscal,
  documento: DocumentoFiscal | null,
): Promise<boolean> {
  if (!documento || evento.situacao !== "PENDENTE") return false;

  await tx.documentoFiscal.update({
    where: { id: documento.id },
    data: {
      situacao: "CANCELADA",
      contaFaturamento: false,
      motivoExclusao: MOTIVO_EXCLUSAO.CANCELADA,
      precisaConferencia: false,
      canceladoEm: evento.registradoEm ?? new Date(),
      justificativaCancelamento: evento.justificativa,
    },
  });
  await tx.eventoFiscal.update({
    where: { id: evento.id },
    data: { situacao: "APLICADO", documentoId: documento.id, motivo: null },
  });
  return true;
}

async function gravarEvento(params: {
  evento: EventoFiscalLido;
  nomeArquivo: string;
  bytes: Buffer;
  empresa: EmpresaMinima;
  importacaoId: string;
  contexto: ContextoImportacao;
  marcarCompetencia: MarcarCompetencia;
}): Promise<LinhaRelatorio> {
  const { evento, nomeArquivo, bytes, empresa, importacaoId, contexto } = params;
  const identidade = identidadeEvento(evento);
  if (!identidade || identidade.cnpj !== empresa.cnpj) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: evento.chave,
      motivo: `O evento não pertence à empresa selecionada (${empresa.cnpj}).`,
      code: "EMPRESA_DIFERENTE",
    };
  }
  if (evento.ambiente !== "1") {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: evento.chave,
      motivo: "Evento de homologação não altera nota de produção.",
      code: "HOMOLOGACAO",
    };
  }
  if (evento.documentoAutor && evento.documentoAutor !== empresa.cnpj) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: evento.chave,
      motivo: `O evento foi assinado por ${evento.documentoAutor}, não pela empresa ${empresa.cnpj}.`,
      code: "AUTOR_DIVERGENTE",
    };
  }

  const relativo = caminhoRelativoDoEvento(
    identidade.cnpj,
    identidade.ano,
    identidade.mes,
    evento.chave,
    evento.tipoEvento,
    evento.sequencia,
  );
  const absoluto = caminhoAbsolutoDoXml(relativo);
  if (!absoluto) {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: evento.chave,
      motivo: "Não foi possível montar um caminho seguro para guardar o evento.",
      code: "CAMINHO_INVALIDO",
    };
  }

  const hash = sha256(bytes);
  let temporario: string;
  try {
    temporario = await escreverTemporario(absoluto, bytes);
  } catch {
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: evento.chave,
      motivo: "Falha ao gravar o evento temporário no disco.",
      code: "FALHA_DISCO",
    };
  }

  try {
    const desfecho = await prisma.$transaction(async (tx) => {
      await travarChave(tx, evento.chave);

      const jaExiste = await tx.eventoFiscal.findUnique({
        where: {
          evento_fiscal_identidade: {
            chaveDocumento: evento.chave,
            tipoEvento: evento.tipoEvento,
            sequencia: evento.sequencia,
          },
        },
      });

      if (jaExiste) {
        if (jaExiste.arquivoHash !== hash) {
          return { tipo: "DIVERGENTE" as const, evento: jaExiste, documento: null };
        }
        const destinoExistente = caminhoAbsolutoDoXml(jaExiste.arquivo) ?? absoluto;
        await garantirArquivoCanonico(temporario, destinoExistente, hash);

        const documento = await tx.documentoFiscal.findUnique({
          where: { chave: evento.chave },
        });
        const aplicou = await aplicarEventoNaNota(tx, jaExiste, documento);
        return {
          tipo: aplicou ? ("APLICADO" as const) : ("DUPLICADO" as const),
          evento: jaExiste,
          documento,
        };
      }

      await garantirArquivoCanonico(temporario, absoluto, hash);

      const registrado = eventoFoiRegistrado(evento.statusSefaz);
      const situacao = !evento.ehCancelamento
        ? "IGNORADO"
        : !registrado
          ? "REJEITADO"
          : "PENDENTE";
      const motivo = !evento.ehCancelamento
        ? `Evento ${evento.tipoEvento} não altera faturamento.`
        : !registrado
          ? `Evento sem retorno autorizado da SEFAZ (cStat ${evento.statusSefaz ?? "ausente"}).`
          : null;

      const criado = await tx.eventoFiscal.create({
        data: {
          eventoId: evento.eventoId,
          chaveDocumento: evento.chave,
          ano: identidade.ano,
          mes: identidade.mes,
          tipoEvento: evento.tipoEvento,
          sequencia: evento.sequencia,
          statusSefaz: evento.statusSefaz,
          ambiente: evento.ambiente,
          documentoAutor: evento.documentoAutor,
          assinaturaValida: evento.assinaturaValida,
          registradoEm: evento.registradoEm,
          justificativa: evento.justificativa,
          situacao,
          motivo,
          empresaId: empresa.id,
          importacaoId,
          arquivo: relativo,
          arquivoBytes: bytes.length,
          arquivoHash: hash,
          importadoPorId: contexto.usuarioId,
          importadoPorNome: contexto.usuarioNome,
        },
      });

      const documento = registrado && evento.ehCancelamento
        ? await tx.documentoFiscal.findUnique({ where: { chave: evento.chave } })
        : null;
      const aplicou = await aplicarEventoNaNota(tx, criado, documento);

      return {
        tipo: aplicou
          ? ("APLICADO" as const)
          : situacao === "PENDENTE"
            ? ("PENDENTE" as const)
            : situacao === "REJEITADO"
              ? ("REJEITADO" as const)
              : ("ARQUIVADO" as const),
        evento: criado,
        documento,
      };
    });

    await unlink(temporario).catch(() => {});

    if (desfecho.tipo === "DIVERGENTE") {
      return {
        arquivo: nomeArquivo,
        resultado: "ERRO",
        chave: evento.chave,
        motivo: "Este evento já foi importado com conteúdo diferente.",
        code: "XML_DIVERGENTE",
      };
    }

    if (desfecho.documento?.empresaId) {
      params.marcarCompetencia(
        desfecho.documento.empresaId,
        desfecho.documento.ano,
        desfecho.documento.mes,
      );
    }

    if (desfecho.tipo === "REJEITADO") {
      return {
        arquivo: nomeArquivo,
        resultado: "ERRO",
        chave: evento.chave,
        motivo: `Cancelamento arquivado, mas NÃO aplicado: cStat ${evento.statusSefaz ?? "ausente"} não confirma registro na SEFAZ.`,
        code: "EVENTO_NAO_REGISTRADO",
      };
    }

    if (desfecho.tipo === "APLICADO") {
      return {
        arquivo: nomeArquivo,
        resultado: "CANCELAMENTO_APLICADO",
        chave: evento.chave,
        motivo: "Nota marcada como cancelada e retirada do faturamento.",
        code: MOTIVO_EXCLUSAO.CANCELADA,
      };
    }

    if (desfecho.tipo === "PENDENTE") {
      return {
        arquivo: nomeArquivo,
        resultado: "EVENTO_PENDENTE",
        chave: evento.chave,
        motivo: "Cancelamento guardado; será aplicado automaticamente quando a nota chegar.",
        code: "NOTA_AINDA_NAO_IMPORTADA",
      };
    }

    if (desfecho.tipo === "ARQUIVADO") {
      return {
        arquivo: nomeArquivo,
        resultado: "EVENTO_ARQUIVADO",
        chave: evento.chave,
        motivo: `Evento ${evento.tipoEvento} guardado; não altera o faturamento.`,
        code: "EVENTO_SEM_EFEITO",
      };
    }

    return {
      arquivo: nomeArquivo,
      resultado: "DUPLICADO",
      chave: evento.chave,
      motivo: "Evento já importado anteriormente.",
      code: "DUPLICADO",
    };
  } catch (falha) {
    await unlink(temporario).catch(() => {});
    console.error("Erro ao gravar evento fiscal:", falha);
    return {
      arquivo: nomeArquivo,
      resultado: "ERRO",
      chave: evento.chave,
      motivo: "Falha ao gravar o evento no banco.",
      code: "FALHA_BANCO",
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                              Apuração mensal                               */
/* -------------------------------------------------------------------------- */

/**
 * Recalcula a competência inteira sob lock transacional.
 *
 * O lock impede write-after-stale-read: duas importações podem inserir documentos
 * em paralelo, mas suas agregações são serializadas; a última sempre enxerga tudo
 * que já foi confirmado. Duplicata também chama esta função, então retry repara
 * crash ocorrido depois do documento e antes da apuração.
 */
export async function apurarCompetencia(
  competencia: CompetenciaTocada,
  contexto: Pick<ContextoImportacao, "usuarioId" | "usuarioNome">,
): Promise<void> {
  const { empresaId, ano, mes } = competencia;

  await prisma.$transaction(async (tx) => {
    await travarCompetencia(tx, empresaId, ano, mes);

    const agregado = await tx.documentoFiscal.aggregate({
      where: {
        empresaId,
        ano,
        mes,
        contaFaturamento: true,
        assinaturaValida: true,
      },
      _sum: { valorTotal: true },
      _count: { _all: true },
    });

    const apurado = agregado._sum.valorTotal ?? new Prisma.Decimal(0);
    const documentos = agregado._count._all;
    const agora = new Date();

    const existente = await tx.faturamentoMensal.findUnique({
      where: { empresa_competencia_faturamento: { empresaId, ano, mes } },
      select: { id: true, origem: true, congeladoEm: true },
    });

    if (!existente) {
      await tx.faturamentoMensal.create({
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

    const preservarValor =
      existente.congeladoEm !== null || existente.origem !== "XML";

    await tx.faturamentoMensal.update({
      where: { id: existente.id },
      data: {
        valorApurado: apurado,
        documentos,
        apuradoEm: agora,
        ...(preservarValor ? {} : { valor: apurado }),
      },
    });
  });
}
