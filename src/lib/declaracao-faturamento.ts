/**
 * Declaração de faturamento de 12 meses.
 *
 * O documento é um SNAPSHOT, não uma consulta viva. Emitir e congelar as doze
 * competências acontece na mesma transação; importar XML atrasado depois atualiza
 * `valorApurado`, mas não altera `valor` nem a declaração já emitida.
 */

import { createHash, randomInt } from "node:crypto";
import { Prisma, type DeclaracaoFaturamento } from "@prisma/client";
import prisma from "./prisma";
import { competenciaChave, competenciaLabel, parseCompetencia } from "./tarefa-status";

const MESES_DECLARACAO = 12;
const ALFABETO_PROTOCOLO = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const VERSAO_TEMPLATE = 1;

export class ErroDeclaracaoFaturamento extends Error {
  readonly code: string;
  readonly status: number;
  readonly detalhes?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    detalhes?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ErroDeclaracaoFaturamento";
    this.code = code;
    this.status = status;
    this.detalhes = detalhes;
  }
}

export type CompetenciaPeriodo = {
  ano: number;
  mes: number;
  chave: string;
  label: string;
};

export type LinhaPeriodo = CompetenciaPeriodo & {
  idMensal: string | null;
  origem: string | null;
  valor: string | null;
  valorApurado: string | null;
  documentos: number;
  observacao: string | null;
  congeladoEm: string | null;
  definidoPorNome: string | null;
  atualizadoEm: string | null;
  pronta: boolean;
};

export type PeriodoFaturamento = {
  empresa: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string | null;
    regime: string;
    inicioAtividade: string | null;
  };
  inicio: CompetenciaPeriodo;
  fim: CompetenciaPeriodo;
  meses: LinhaPeriodo[];
  completos: number;
  faltantes: string[];
  total: string;
  mediaMensal: string;
};

export type LinhaDeclaracao = {
  idMensal: string;
  ano: number;
  mes: number;
  competencia: string;
  label: string;
  origem: string;
  valor: string;
  valorApurado: string | null;
  documentos: number;
  observacao: string | null;
  atualizadoEm: string;
};

export type DeclaracaoSerializada = {
  id: string;
  protocolo: string;
  empresaId: string;
  inicio: string;
  fim: string;
  linhas: LinhaDeclaracao[];
  valorTotal: string;
  mediaMensal: string;
  razaoSocial: string;
  cnpj: string;
  regime: string;
  finalidade: string | null;
  situacao: string;
  substituidaPorId: string | null;
  substituidaPorProtocolo: string | null;
  emitidaPorNome: string;
  conteudoHash: string;
  versaoTemplate: number;
  createdAt: string;
  integridadeOk: boolean;
};

/**
 * Doze competências contíguas, em ordem crescente, terminando em `fim`.
 * Função pura e testada sem banco.
 */
export function construirPeriodo(
  fim: string,
  quantidade = MESES_DECLARACAO,
): CompetenciaPeriodo[] {
  const referencia = parseCompetencia(fim);
  if (!referencia || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 24) {
    throw new ErroDeclaracaoFaturamento(
      "PERIODO_INVALIDO",
      "Período inválido. Informe a competência final no formato AAAA-MM.",
    );
  }

  const indiceFinal = referencia.ano * 12 + (referencia.mes - 1);
  const resultado: CompetenciaPeriodo[] = [];
  for (let deslocamento = quantidade - 1; deslocamento >= 0; deslocamento -= 1) {
    const indice = indiceFinal - deslocamento;
    const ano = Math.floor(indice / 12);
    const mes = (indice % 12) + 1;
    resultado.push({
      ano,
      mes,
      chave: competenciaChave(ano, mes),
      label: competenciaLabel(ano, mes),
    });
  }
  return resultado;
}

function gerarProtocolo(ano: number, mes: number): string {
  let aleatorio = "";
  for (let i = 0; i < 7; i += 1) {
    aleatorio += ALFABETO_PROTOCOLO[randomInt(ALFABETO_PROTOCOLO.length)];
  }
  return `FAT-${String(ano).slice(-2)}${String(mes).padStart(2, "0")}-${aleatorio}`;
}

async function protocoloLivre(tx: Prisma.TransactionClient, ano: number, mes: number) {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const protocolo = gerarProtocolo(ano, mes);
    const existe = await tx.declaracaoFaturamento.findUnique({
      where: { protocolo },
      select: { id: true },
    });
    if (!existe) return protocolo;
  }
  throw new ErroDeclaracaoFaturamento(
    "PROTOCOLO_INDISPONIVEL",
    "Não foi possível gerar um protocolo único. Tente novamente.",
    503,
  );
}

function decimalString(valor: Prisma.Decimal): string {
  return valor.toFixed(2);
}

/** Serialização canônica: objetos com chaves ordenadas, arrays na ordem original. */
export function jsonCanonico(valor: unknown): string {
  if (valor === null) return "null";
  if (Array.isArray(valor)) {
    return `[${valor.map((item) => jsonCanonico(item)).join(",")}]`;
  }
  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    return `{${Object.keys(objeto)
      .sort()
      .map((chave) => `${JSON.stringify(chave)}:${jsonCanonico(objeto[chave])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor);
}

export function hashConteudo(conteudo: Record<string, unknown>): string {
  return createHash("sha256").update(jsonCanonico(conteudo), "utf8").digest("hex");
}

function conteudoParaHash(declaracao: {
  protocolo: string;
  empresaId: string;
  anoInicio: number;
  mesInicio: number;
  anoFim: number;
  mesFim: number;
  linhas: unknown;
  valorTotal: string;
  mediaMensal: string;
  razaoSocialNaEmissao: string;
  cnpjNaEmissao: string;
  regimeNaEmissao: string;
  finalidade: string | null;
  emitidaPorId: string;
  emitidaPorNome: string;
  versaoTemplate: number;
  createdAt: string;
}): Record<string, unknown> {
  return { ...declaracao };
}

function lerLinhas(valor: Prisma.JsonValue): LinhaDeclaracao[] {
  if (!Array.isArray(valor)) return [];
  return valor as unknown as LinhaDeclaracao[];
}

export function serializarDeclaracao(
  declaracao: DeclaracaoFaturamento & {
    substituidaPor?: { protocolo: string } | null;
  },
): DeclaracaoSerializada {
  const linhas = lerLinhas(declaracao.linhas);
  const base = conteudoParaHash({
    protocolo: declaracao.protocolo,
    empresaId: declaracao.empresaId,
    anoInicio: declaracao.anoInicio,
    mesInicio: declaracao.mesInicio,
    anoFim: declaracao.anoFim,
    mesFim: declaracao.mesFim,
    linhas,
    valorTotal: decimalString(declaracao.valorTotal),
    mediaMensal: decimalString(declaracao.mediaMensal),
    razaoSocialNaEmissao: declaracao.razaoSocialNaEmissao,
    cnpjNaEmissao: declaracao.cnpjNaEmissao,
    regimeNaEmissao: declaracao.regimeNaEmissao,
    finalidade: declaracao.finalidade,
    emitidaPorId: declaracao.emitidaPorId,
    emitidaPorNome: declaracao.emitidaPorNome,
    versaoTemplate: declaracao.versaoTemplate,
    createdAt: declaracao.createdAt.toISOString(),
  });

  return {
    id: declaracao.id,
    protocolo: declaracao.protocolo,
    empresaId: declaracao.empresaId,
    inicio: competenciaChave(declaracao.anoInicio, declaracao.mesInicio),
    fim: competenciaChave(declaracao.anoFim, declaracao.mesFim),
    linhas,
    valorTotal: decimalString(declaracao.valorTotal),
    mediaMensal: decimalString(declaracao.mediaMensal),
    razaoSocial: declaracao.razaoSocialNaEmissao,
    cnpj: declaracao.cnpjNaEmissao,
    regime: declaracao.regimeNaEmissao,
    finalidade: declaracao.finalidade,
    situacao: declaracao.situacao,
    substituidaPorId: declaracao.substituidaPorId,
    substituidaPorProtocolo: declaracao.substituidaPor?.protocolo ?? null,
    emitidaPorNome: declaracao.emitidaPorNome,
    conteudoHash: declaracao.conteudoHash,
    versaoTemplate: declaracao.versaoTemplate,
    createdAt: declaracao.createdAt.toISOString(),
    integridadeOk: hashConteudo(base) === declaracao.conteudoHash,
  };
}

export async function carregarPeriodo(
  empresaId: string,
  fim: string,
): Promise<PeriodoFaturamento> {
  const competencias = construirPeriodo(fim);
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      regime: true,
      inicioAtividade: true,
    },
  });
  if (!empresa) {
    throw new ErroDeclaracaoFaturamento("EMPRESA_NAO_ENCONTRADA", "Empresa não encontrada.", 404);
  }

  const mensais = await prisma.faturamentoMensal.findMany({
    where: {
      empresaId,
      OR: competencias.map(({ ano, mes }) => ({ ano, mes })),
    },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
  });
  const mapa = new Map(mensais.map((item) => [`${item.ano}-${item.mes}`, item]));

  let total = new Prisma.Decimal(0);
  const meses = competencias.map((competencia): LinhaPeriodo => {
    const item = mapa.get(`${competencia.ano}-${competencia.mes}`);
    if (!item) {
      return {
        ...competencia,
        idMensal: null,
        origem: null,
        valor: null,
        valorApurado: null,
        documentos: 0,
        observacao: null,
        congeladoEm: null,
        definidoPorNome: null,
        atualizadoEm: null,
        pronta: false,
      };
    }
    total = total.plus(item.valor);
    return {
      ...competencia,
      idMensal: item.id,
      origem: item.origem,
      valor: decimalString(item.valor),
      valorApurado: item.valorApurado === null ? null : decimalString(item.valorApurado),
      documentos: item.documentos,
      observacao: item.observacao,
      congeladoEm: item.congeladoEm?.toISOString() ?? null,
      definidoPorNome: item.definidoPorNome,
      atualizadoEm: item.updatedAt.toISOString(),
      pronta: true,
    };
  });

  return {
    empresa: {
      ...empresa,
      inicioAtividade: empresa.inicioAtividade?.toISOString() ?? null,
    },
    inicio: competencias[0],
    fim: competencias[competencias.length - 1],
    meses,
    completos: meses.filter((item) => item.pronta).length,
    faltantes: meses.filter((item) => !item.pronta).map((item) => item.chave),
    total: decimalString(total),
    mediaMensal: decimalString(total.div(MESES_DECLARACAO)),
  };
}

export async function emitirDeclaracao(input: {
  empresaId: string;
  fim: string;
  finalidade: string | null;
  idempotencyKey: string;
  usuarioId: string;
  usuarioNome: string;
}): Promise<{ declaracao: DeclaracaoSerializada; jaExistia: boolean }> {
  const competencias = construirPeriodo(input.fim);
  const fim = competencias[competencias.length - 1];
  const inicio = competencias[0];
  const agora = new Date();

  return prisma.$transaction(async (tx) => {
    // Primeiro serializa pela chave de idempotência global. Sem isto, a mesma
    // chave reutilizada em duas empresas/janelas passaria pelos locks diferentes
    // e uma das chamadas terminaria em P2002/500.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`declaracao-idem:${input.idempotencyKey}`}))`;

    const repetida = await tx.declaracaoFaturamento.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (repetida) {
      const mesmoPedido =
        repetida.empresaId === input.empresaId &&
        repetida.anoFim === fim.ano &&
        repetida.mesFim === fim.mes &&
        (repetida.finalidade ?? null) === (input.finalidade ?? null);
      if (!mesmoPedido) {
        throw new ErroDeclaracaoFaturamento(
          "IDEMPOTENCIA_CONFLITO",
          "Esta chave de emissão já foi usada com outra empresa, período ou finalidade.",
          409,
        );
      }
      return { declaracao: serializarDeclaracao(repetida), jaExistia: true };
    }

    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`declaracao:${input.empresaId}:${input.fim}`}))`;

    // Os mesmos locks usados por PUT mensal e pela reapuração, sempre em ordem
    // cronológica. Sem eles, uma importação poderia alterar um dos 12 valores
    // entre o SELECT do snapshot e o UPDATE que congela as linhas.
    for (const competencia of competencias) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`faturamento:${input.empresaId}:${competencia.ano}:${competencia.mes}`}))`;
    }

    const empresa = await tx.empresa.findUnique({
      where: { id: input.empresaId },
      select: { id: true, razaoSocial: true, cnpj: true, regime: true },
    });
    if (!empresa) {
      throw new ErroDeclaracaoFaturamento("EMPRESA_NAO_ENCONTRADA", "Empresa não encontrada.", 404);
    }
    if (!empresa.cnpj) {
      throw new ErroDeclaracaoFaturamento(
        "EMPRESA_SEM_CNPJ",
        "A empresa ainda não tem CNPJ e não pode emitir a declaração.",
      );
    }

    /**
     * Recupera sessão cujo navegador sumiu antes do lote final/ABORTAR.
     *
     * Um request de lote tem `maxDuration = 300s`. Trinta minutos é seis vezes
     * esse teto: não existe lote legítimo ainda executando depois disso. Deixar a
     * sessão aberta por duas horas (regra antiga) bloqueava declaração por uma aba
     * fechada. A recuperação acontece sob a mesma transação da emissão, então duas
     * tentativas concorrentes chegam ao mesmo estado.
     */
    const limiteAbandono = new Date(Date.now() - 30 * 60 * 1000);
    await tx.importacaoXml.updateMany({
      where: {
        empresaId: input.empresaId,
        finalizadoEm: null,
        updatedAt: { lt: limiteAbandono },
      },
      data: {
        situacao: "INTERROMPIDA",
        lotesAtivos: 0,
        encerrarQuandoOciosa: false,
        finalizadoEm: new Date(),
      },
    });

    const importacaoAtiva = await tx.importacaoXml.findFirst({
      where: {
        empresaId: input.empresaId,
        finalizadoEm: null,
      },
      select: { id: true, arquivosEnviados: true, lotes: true },
    });
    if (importacaoAtiva) {
      throw new ErroDeclaracaoFaturamento(
        "IMPORTACAO_EM_ANDAMENTO",
        "Há uma importação de XML/ZIP em andamento para esta empresa. Aguarde terminar antes de emitir.",
        409,
      );
    }

    const mensais = await tx.faturamentoMensal.findMany({
      where: {
        empresaId: input.empresaId,
        OR: competencias.map(({ ano, mes }) => ({ ano, mes })),
      },
      orderBy: [{ ano: "asc" }, { mes: "asc" }],
    });
    const mapa = new Map(mensais.map((item) => [`${item.ano}-${item.mes}`, item]));
    const faltantes = competencias
      .filter((item) => !mapa.has(`${item.ano}-${item.mes}`))
      .map((item) => item.chave);

    if (faltantes.length > 0) {
      throw new ErroDeclaracaoFaturamento(
        "MESES_FALTANTES",
        `Preencha ${faltantes.length} competência(s) antes de emitir.`,
        409,
        { mesesFaltantes: faltantes },
      );
    }

    const linhas: LinhaDeclaracao[] = competencias.map((competencia) => {
      const item = mapa.get(`${competencia.ano}-${competencia.mes}`)!;
      return {
        idMensal: item.id,
        ano: competencia.ano,
        mes: competencia.mes,
        competencia: competencia.chave,
        label: competencia.label,
        origem: item.origem,
        valor: decimalString(item.valor),
        valorApurado: item.valorApurado === null ? null : decimalString(item.valorApurado),
        documentos: item.documentos,
        observacao: item.observacao,
        atualizadoEm: item.updatedAt.toISOString(),
      };
    });

    const valorTotal = mensais.reduce(
      (total, item) => total.plus(item.valor),
      new Prisma.Decimal(0),
    );
    const mediaMensal = valorTotal.div(MESES_DECLARACAO).toDecimalPlaces(2);
    const protocolo = await protocoloLivre(tx, fim.ano, fim.mes);

    const baseHash = conteudoParaHash({
      protocolo,
      empresaId: empresa.id,
      anoInicio: inicio.ano,
      mesInicio: inicio.mes,
      anoFim: fim.ano,
      mesFim: fim.mes,
      linhas,
      valorTotal: decimalString(valorTotal),
      mediaMensal: decimalString(mediaMensal),
      razaoSocialNaEmissao: empresa.razaoSocial,
      cnpjNaEmissao: empresa.cnpj,
      regimeNaEmissao: empresa.regime,
      finalidade: input.finalidade,
      emitidaPorId: input.usuarioId,
      emitidaPorNome: input.usuarioNome,
      versaoTemplate: VERSAO_TEMPLATE,
      createdAt: agora.toISOString(),
    });

    const criada = await tx.declaracaoFaturamento.create({
      data: {
        protocolo,
        idempotencyKey: input.idempotencyKey,
        empresaId: empresa.id,
        anoInicio: inicio.ano,
        mesInicio: inicio.mes,
        anoFim: fim.ano,
        mesFim: fim.mes,
        linhas: linhas as unknown as Prisma.InputJsonValue,
        valorTotal,
        mediaMensal,
        razaoSocialNaEmissao: empresa.razaoSocial,
        cnpjNaEmissao: empresa.cnpj,
        regimeNaEmissao: empresa.regime,
        finalidade: input.finalidade,
        emitidaPorId: input.usuarioId,
        emitidaPorNome: input.usuarioNome,
        conteudoHash: hashConteudo(baseHash),
        versaoTemplate: VERSAO_TEMPLATE,
        createdAt: agora,
      },
    });

    // Nova emissão para a mesma janela substitui a anterior; nunca a edita.
    await tx.declaracaoFaturamento.updateMany({
      where: {
        empresaId: empresa.id,
        anoInicio: inicio.ano,
        mesInicio: inicio.mes,
        anoFim: fim.ano,
        mesFim: fim.mes,
        situacao: "VIGENTE",
        id: { not: criada.id },
      },
      data: { situacao: "SUBSTITUIDA", substituidaPorId: criada.id },
    });

    // Snapshot e congelamento no MESMO commit. Não há janela em que a declaração
    // exista apontando para meses ainda editáveis.
    await tx.faturamentoMensal.updateMany({
      where: { id: { in: mensais.map((item) => item.id) }, congeladoEm: null },
      data: { congeladoEm: agora, congeladoPor: input.usuarioId },
    });

    return { declaracao: serializarDeclaracao(criada), jaExistia: false };
  });
}
