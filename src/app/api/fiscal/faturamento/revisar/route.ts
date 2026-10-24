/**
 * POST /api/fiscal/faturamento/revisar
 *
 * Libera, de forma auditável, uma competência congelada. A declaração antiga
 * continua imutável e vigente até uma nova emissão substituí-la; o mês atual
 * passa a usar o XML apurado hoje e pode então ser ajustado manualmente.
 */

import { NextRequest, NextResponse } from "next/server";
import { PAPEL, requirePapel } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { totaisDaCompetencia } from "@/lib/faturamento-consulta";
import { garantirRegraFaturamentoAtual } from "@/lib/faturamento-regra-atual";
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
    // O valor liberado sai dos documentos: eles precisam estar na regra atual.
    await garantirRegraFaturamentoAtual();

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`faturamento:${empresaId}:${ano}:${mes}`}))::text AS "locked"`;

      const mensal = await tx.faturamentoMensal.findUnique({
        where: { empresa_competencia_faturamento: { empresaId, ano, mes } },
      });
      if (!mensal) return { tipo: "NAO_ENCONTRADO" as const, mensal: null };
      if (!mensal.congeladoEm) return { tipo: "JA_LIBERADO" as const, mensal };

      // Mesma conta da apuração mensal: vendas menos devoluções de venda. Somar só
      // as vendas aqui desfazia o abatimento justamente no mês que foi revisado.
      const totais = await totaisDaCompetencia(tx, empresaId, ano, mes);
      const apurado = totais.liquido;
      const detalhe = `Revisão após declaração emitida: ${motivo}`;

      const atualizado = await tx.faturamentoMensal.update({
        where: { id: mensal.id },
        data: {
          origem: "XML",
          valor: apurado,
          valorApurado: apurado,
          documentos: totais.documentos,
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
