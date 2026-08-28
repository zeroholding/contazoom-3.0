/**
 * Reabertura de competência encerrada.
 *
 * POST /api/tarefas/apuracao/[id]/reabrir
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 13.1 e 16.2.
 *
 * Só ADMIN: reabrir desfaz um encerramento, que é o ato que congelou o que foi
 * entregue ao cliente. O motivo é obrigatório pela mesma razão do retorno de
 * etapa — uma competência reaberta sem justificativa registrada é um furo no
 * histórico exatamente no ponto em que alguém vai querer entender o que houve.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { negado, podeReabrirTarefa, requireInterno } from "@/lib/api-guard";
import { recalcularStatus, registrarLog } from "@/lib/tarefa-service";
import { ACAO_LOG, SITUACAO_ETAPA } from "@/lib/tarefa-etapas";

type Params = { params: Promise<{ id: string }> };
type CorpoReabrir = { motivo?: unknown };

const MINIMO_MOTIVO = 5;

export async function POST(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  if (!podeReabrirTarefa(sessao.papel)) {
    return negado(
      "Apenas o administrador pode reabrir uma competência encerrada."
    );
  }

  try {
    const { id } = await params;
    const corpo = (await req.json().catch(() => null)) as CorpoReabrir | null;
    const motivo =
      corpo && typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";

    if (motivo.length < MINIMO_MOTIVO) {
      return NextResponse.json(
        {
          error: "Informe o motivo da reabertura.",
          code: "motivo_obrigatorio",
        },
        { status: 400 }
      );
    }

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        etapaAtual: true,
        concluidaEm: true,
        etapas: {
          orderBy: { numero: "asc" },
          select: { id: true, numero: true, titulo: true, situacao: true },
        },
      },
    });

    if (!tarefa) {
      return NextResponse.json(
        { error: "Competência não encontrada.", code: "nao_encontrada" },
        { status: 404 }
      );
    }
    if (!tarefa.concluidaEm) {
      return NextResponse.json(
        {
          error: "Esta competência não está encerrada.",
          code: "nao_encerrada",
        },
        { status: 409 }
      );
    }

    const numeroAtual = Math.max(1, tarefa.etapaAtual);
    const etapaAtual =
      tarefa.etapas.find((e) => e.numero === numeroAtual) ?? null;

    const agora = new Date();

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.tarefaApuracao.update({
        where: { id },
        data: { concluidaEm: null },
      });

      // A etapa em que a tarefa parou volta a ser trabalho em curso. Sem isto ela
      // permanece CONCLUIDA e a rota de conclusão recusa a próxima ação: a
      // competência ficaria reaberta e ao mesmo tempo impossível de trabalhar.
      if (etapaAtual && etapaAtual.situacao === SITUACAO_ETAPA.CONCLUIDA) {
        await tx.tarefaApuracaoEtapa.update({
          where: { id: etapaAtual.id },
          data: {
            situacao: SITUACAO_ETAPA.EM_ANDAMENTO,
            concluidaEm: null,
            concluidaPor: null,
          },
        });
      }

      await registrarLog(tx, {
        apuracaoId: id,
        acao: ACAO_LOG.TAREFA_REABERTA,
        de: tarefa.status,
        para: `Etapa ${numeroAtual}`,
        detalhe: motivo,
        sessao,
      });

      const status = await recalcularStatus(tx, id);
      if (status.mudou) {
        await registrarLog(tx, {
          apuracaoId: id,
          acao: ACAO_LOG.STATUS_ALTERADO,
          de: status.de,
          para: status.para,
          detalhe: "Competência reaberta.",
          sessao,
        });
      }
      return status;
    });

    return NextResponse.json({
      reaberta: true,
      etapaAtual: numeroAtual,
      tituloEtapaAtual: etapaAtual?.titulo ?? null,
      status: resultado.para,
      motivo,
    });
  } catch (error) {
    console.error("Erro ao reabrir competência:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
