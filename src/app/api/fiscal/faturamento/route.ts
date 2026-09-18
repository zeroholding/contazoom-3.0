/**
 * GET /api/fiscal/faturamento?empresaId=&competencia=AAAA-MM
 *
 * O resumo que a tela de Faturamento (XML) monta em volta da tabela: contexto da
 * empresa, indicadores da competência, faturamento declarado, resumo por canal,
 * painel "fora do faturamento" e as importações recentes.
 *
 * UMA ROTA e não seis: a tela carrega tudo isso de uma vez ao abrir, e seis
 * requisições paralelas para a mesma competência significariam seis vezes a mesma
 * resolução de empresa e de mapa série->canal.
 *
 * PUT define o faturamento à mão, para o mês que não tem XML.
 */

import { NextRequest, NextResponse } from "next/server";
import { PAPEL, requireInterno, requirePapel } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import {
  carregarMapaSerieCanal,
  competenciasComDocumento,
  resumirForaDoFaturamento,
  resumirPorCanal,
} from "@/lib/faturamento-consulta";
import { MOTIVO_EXCLUSAO_LABEL, type MotivoExclusao } from "@/lib/faturamento-regras";
import { competenciaChave, competenciaLabel, parseCompetencia } from "@/lib/tarefa-status";

export const runtime = "nodejs";

const erro = (mensagem: string, status: number, code?: string) =>
  NextResponse.json({ error: mensagem, code }, { status });

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { searchParams } = new URL(req.url);
  const empresaId = texto(searchParams.get("empresaId"));
  const competenciaParam = texto(searchParams.get("competencia"));

  if (!empresaId) {
    return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, regime: true, grupo: true },
  });
  if (!empresa) {
    return erro("Empresa não encontrada.", 404, "EMPRESA_NAO_ENCONTRADA");
  }

  const disponiveis = await competenciasComDocumento(empresaId);

  /*
   * Competência padrão: a mais recente COM DOCUMENTO, não o mês corrente.
   *
   * Abrir no mês atual mostraria tela vazia para quem acabou de importar agosto em
   * setembro — e tela vazia depois de uma importação bem-sucedida parece falha.
   */
  const pedida = competenciaParam ? parseCompetencia(competenciaParam) : null;
  if (competenciaParam && !pedida) {
    return erro("Competência inválida. Use o formato AAAA-MM.", 400, "COMPETENCIA_INVALIDA");
  }

  const referencia = pedida ?? disponiveis[0] ?? null;

  if (!referencia) {
    // Sem nenhum documento: a tela precisa saber disso para mostrar o estado
    // inicial ("importe o primeiro XML") em vez de zeros que parecem apuração.
    return NextResponse.json({
      empresa,
      competencia: null,
      competenciasDisponiveis: [],
      kpis: { apurado: 0, arquivosLidos: 0, notasValidas: 0, notasCanceladas: 0, precisamConferencia: 0 },
      faturamento: null,
      canais: [],
      foraDoFaturamento: [],
      importacoes: [],
      vazio: true,
    });
  }

  const { ano, mes } = referencia;

  const mapa = await carregarMapaSerieCanal(empresaId);

  const [somaValida, totalDocumentos, canceladas, conferencia, faturamento, canais, fora, importacoes] =
    await Promise.all([
      prisma.documentoFiscal.aggregate({
        where: { empresaId, ano, mes, contaFaturamento: true },
        _sum: { valorTotal: true },
        _count: { _all: true },
      }),
      prisma.documentoFiscal.count({ where: { empresaId, ano, mes } }),
      prisma.documentoFiscal.count({ where: { empresaId, ano, mes, situacao: "CANCELADA" } }),
      prisma.documentoFiscal.count({ where: { empresaId, ano, mes, precisaConferencia: true } }),
      prisma.faturamentoMensal.findUnique({
        where: { empresa_competencia_faturamento: { empresaId, ano, mes } },
      }),
      resumirPorCanal(empresaId, ano, mes, mapa),
      resumirForaDoFaturamento(empresaId, ano, mes),
      prisma.importacaoXml.findMany({
        where: { empresaId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          createdAt: true,
          arquivosEnviados: true,
          importados: true,
          duplicados: true,
          ignorados: true,
          comErro: true,
          situacao: true,
          importadoPorNome: true,
        },
      }),
    ]);

  return NextResponse.json({
    empresa,
    competencia: { ano, mes, chave: competenciaChave(ano, mes), label: competenciaLabel(ano, mes) },
    competenciasDisponiveis: disponiveis.map((c) => ({
      valor: competenciaChave(c.ano, c.mes),
      texto: competenciaLabel(c.ano, c.mes),
    })),
    kpis: {
      apurado: Number(somaValida._sum.valorTotal ?? 0),
      // "Arquivos lidos" conta TODO documento da competência, não só os que somam.
      // É o número que dá sentido ao painel "fora do faturamento".
      arquivosLidos: totalDocumentos,
      notasValidas: somaValida._count._all,
      notasCanceladas: canceladas,
      precisamConferencia: conferencia,
    },
    faturamento: faturamento
      ? {
          origem: faturamento.origem,
          valor: Number(faturamento.valor),
          valorApurado: faturamento.valorApurado === null ? null : Number(faturamento.valorApurado),
          documentos: faturamento.documentos,
          observacao: faturamento.observacao,
          congeladoEm: faturamento.congeladoEm,
          definidoPorNome: faturamento.definidoPorNome,
          apuradoEm: faturamento.apuradoEm,
        }
      : null,
    canais,
    // O rótulo em prosa vem do servidor junto do código: a tela não precisa manter
    // uma segunda cópia do dicionário de motivos.
    foraDoFaturamento: fora.map((linha) => ({
      ...linha,
      rotulo: MOTIVO_EXCLUSAO_LABEL[linha.code as MotivoExclusao] ?? linha.code,
    })),
    importacoes,
    vazio: totalDocumentos === 0,
  });
}

/**
 * PUT /api/fiscal/faturamento
 *
 * Define o valor do mês à mão. É o caminho para competência sem XML: mês anterior
 * à adoção do sistema, receita sem nota, empresa de serviço antes de a NFS-e
 * entrar.
 *
 * Exige ADMIN ou CONTABIL: é decisão contábil, mesmo critério de
 * `podeAlterarRegime`.
 */
export async function PUT(req: NextRequest) {
  const sessao = await requirePapel(req, [PAPEL.ADMIN, PAPEL.CONTABIL]);
  if (sessao instanceof NextResponse) return sessao;

  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") {
    return erro("Corpo inválido.", 400, "CORPO_INVALIDO");
  }

  const { empresaId, competencia, valor, observacao, origem } = corpo as Record<string, unknown>;

  const empresa = texto(empresaId);
  if (!empresa) return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");

  const referencia = parseCompetencia(texto(competencia) ?? "");
  if (!referencia) {
    return erro("Competência inválida. Use o formato AAAA-MM.", 400, "COMPETENCIA_INVALIDA");
  }

  const valorNumero = Number(valor);
  if (!Number.isFinite(valorNumero) || valorNumero < 0) {
    return erro("Valor inválido.", 400, "VALOR_INVALIDO");
  }

  const origemFinal = texto(origem) ?? "MANUAL";
  if (origemFinal !== "MANUAL" && origemFinal !== "XML" && origemFinal !== "MISTO") {
    return erro("Origem inválida.", 400, "ORIGEM_INVALIDA");
  }

  const justificativa = texto(observacao);
  /*
   * Justificativa obrigatória no valor digitado.
   *
   * Sem ela, ninguém sabe depois por que o número era outro — e "depois" é quando
   * o banco questiona a declaração. Não é burocracia: é a única coisa que
   * diferencia um ajuste legítimo de um erro de digitação.
   */
  if (origemFinal !== "XML" && !justificativa) {
    return erro(
      "Informe a justificativa do valor digitado.",
      400,
      "OBSERVACAO_OBRIGATORIA",
    );
  }

  const { ano, mes } = referencia;

  const existente = await prisma.faturamentoMensal.findUnique({
    where: { empresa_competencia_faturamento: { empresaId: empresa, ano, mes } },
    select: { id: true, congeladoEm: true },
  });

  // Congelada é congelada: o valor já foi para uma declaração assinada.
  if (existente?.congeladoEm) {
    return erro(
      "Esta competência está congelada porque já entrou numa declaração emitida.",
      409,
      "COMPETENCIA_CONGELADA",
    );
  }

  const apurado = await prisma.documentoFiscal.aggregate({
    where: { empresaId: empresa, ano, mes, contaFaturamento: true },
    _sum: { valorTotal: true },
    _count: { _all: true },
  });

  const dados = {
    origem: origemFinal,
    valor: valorNumero,
    valorApurado: Number(apurado._sum.valorTotal ?? 0),
    documentos: apurado._count._all,
    apuradoEm: new Date(),
    observacao: justificativa,
    definidoPorId: sessao.userId,
    definidoPorNome: sessao.nome || sessao.email,
  };

  try {
    const salvo = await prisma.faturamentoMensal.upsert({
      where: { empresa_competencia_faturamento: { empresaId: empresa, ano, mes } },
      create: { empresaId: empresa, ano, mes, ...dados },
      update: dados,
    });

    return NextResponse.json({
      faturamento: {
        origem: salvo.origem,
        valor: Number(salvo.valor),
        valorApurado: salvo.valorApurado === null ? null : Number(salvo.valorApurado),
        documentos: salvo.documentos,
        observacao: salvo.observacao,
        congeladoEm: salvo.congeladoEm,
        definidoPorNome: salvo.definidoPorNome,
        apuradoEm: salvo.apuradoEm,
      },
    });
  } catch (falha) {
    console.error("Erro ao definir faturamento:", falha);
    return erro("Erro interno ao salvar o faturamento.", 500);
  }
}
