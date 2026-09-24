/**
 * POST /api/fiscal/faturamento/revisar
 *
 * Libera, de forma auditável, uma competência congelada. A declaração antiga
 * continua imutável e vigente até uma nova emissão substituí-la; o mês atual
 * passa a usar o XML apurado hoje e pode então ser ajustado manualmente.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { PAPEL, requirePapel } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { parseCompetencia } from "@/lib/tarefa-status";

export const runtime = "nodejs";

const erro = (message: string, status: number, code: string) =>
  NextResponse.json({ error: message, code }, { status });

export async function POST(req: NextRequest) {
  const sessao = await requirePapel(req, [PAPEL.ADMIN, PAPEL.CONTABIL]);
  if (sessao instanceof NextResponse) return sessao;

  const corpo = await req.json().catch(() => null);
  const empresaId =
    corpo && typeof corpo.empresaId === "string" ? corpo.empresaId.trim() : "";
  const competencia =
    corpo && typeof corpo.competencia === "string" ? corpo.competencia.trim() : "";
  const motivo =
    corpo && typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";
  const referencia = parseCompetencia(competencia);

  if (!empresaId) return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");
  if (!referencia) return erro("Competência inválida.", 400, "COMPETENCIA_INVALIDA");
  if (motivo.length < 10 || motivo.length > 500) {
    return erro(
      "Explique o motivo da revisão em 10 a 500 caracteres.",
      400,
      "MOTIVO_INVALIDO",
    );
  }

  const { ano, mes } = referencia;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`faturamento:${empresaId}:${ano}:${mes}`}))::text AS "locked"`;

      const mensal = await tx.faturamentoMensal.findUnique({
        where: { empresa_competencia_faturamento: { empresaId, ano, mes } },
      });
      if (!mensal) return { tipo: "NAO_ENCONTRADO" as const, mensal: null };
      if (!mensal.congeladoEm) return { tipo: "JA_LIBERADO" as const, mensal };

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
      const detalhe = `Revisão após declaração emitida: ${motivo}`;

      const atualizado = await tx.faturamentoMensal.update({
        where: { id: mensal.id },
        data: {
          origem: "XML",
          valor: apurado,
          valorApurado: apurado,
          documentos: agregado._count._all,
          apuradoEm: new Date(),
          observacao: detalhe,
          congeladoEm: null,
          congeladoPor: null,
          definidoPorId: sessao.userId,
          definidoPorNome: sessao.nome || sessao.email,
        },
      });

      await tx.faturamentoMensalHistorico.create({
        data: {
          faturamentoId: mensal.id,
          empresaId,
          ano,
          mes,
          acao: "LIBERADO_PARA_REVISAO",
          origemAnterior: mensal.origem,
          origemNova: "XML",
          valorAnterior: mensal.valor,
          valorNovo: apurado,
          detalhe,
          autorId: sessao.userId,
          autorNome: sessao.nome || sessao.email,
        },
      });

      return { tipo: "LIBERADO" as const, mensal: atualizado };
    });

    if (resultado.tipo === "NAO_ENCONTRADO") {
      return erro("Faturamento mensal não encontrado.", 404, "NAO_ENCONTRADO");
    }

    return NextResponse.json({
      liberado: resultado.tipo === "LIBERADO",
      faturamento: resultado.mensal
        ? {
            origem: resultado.mensal.origem,
            valor: Number(resultado.mensal.valor),
            valorApurado:
              resultado.mensal.valorApurado === null
                ? null
                : Number(resultado.mensal.valorApurado),
            observacao: resultado.mensal.observacao,
            congeladoEm: resultado.mensal.congeladoEm,
          }
        : null,
    });
  } catch (falha) {
    console.error("Erro ao preparar revisão de faturamento:", falha);
    return erro("Erro interno ao preparar a revisão.", 500, "ERRO_INTERNO");
  }
}
