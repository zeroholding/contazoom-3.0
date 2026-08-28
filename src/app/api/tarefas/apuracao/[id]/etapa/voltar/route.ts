/**
 * Retorno de etapa.
 *
 * POST /api/tarefas/apuracao/[id]/etapa/voltar
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 13.2 e 16.2.
 *
 * O motivo é OBRIGATÓRIO. Voltar da 7 para a 4 é o evento mais informativo do
 * sistema: é onde o processo falhou. Sem exigir o motivo, ninguém escreve, e a
 * informação mais valiosa do histórico se perde — sobra "voltou" sem "por quê",
 * que não permite corrigir nada.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { negado, podeRetornarEtapa, requireInterno } from "@/lib/api-guard";
import { recalcularStatus, registrarLog } from "@/lib/tarefa-service";
import { ACAO_LOG, SITUACAO_ETAPA } from "@/lib/tarefa-etapas";

type Params = { params: Promise<{ id: string }> };
type CorpoVoltar = { motivo?: unknown };

/** Motivo curto ("erro") não explica nada; o mínimo evita log inútil. */
const MINIMO_MOTIVO = 5;

export async function POST(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  // Voltar etapa apaga trabalho registrado: assistente não faz isso.
  if (!podeRetornarEtapa(sessao.papel)) {
    return negado(
      "Seu perfil não pode retornar etapa. Solicite à contabilidade ou ao administrador."
    );
  }

  try {
    const { id } = await params;
    const corpo = (await req.json().catch(() => null)) as CorpoVoltar | null;
    const motivo =
      corpo && typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";

    if (motivo.length < MINIMO_MOTIVO) {
      return NextResponse.json(
        {
          error:
            "Informe o motivo do retorno. É o registro de onde o processo falhou.",
          code: "motivo_obrigatorio",
        },
        { status: 400 }
      );
    }

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      select: {
        id: true,
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

    if (tarefa.concluidaEm) {
      return NextResponse.json(
        {
          error:
            "Esta competência está encerrada. Reabra antes de retornar etapa.",
          code: "tarefa_concluida",
        },
        { status: 409 }
      );
    }

    const numeroAtual = Math.max(1, tarefa.etapaAtual);
    if (numeroAtual <= 1) {
      return NextResponse.json(
        {
          error: "A competência já está na primeira etapa.",
          code: "primeira_etapa",
        },
        { status: 409 }
      );
    }

    const etapaAtual = tarefa.etapas.find((e) => e.numero === numeroAtual);
    // Etapa não aplicável é pulada na volta também: retornar para uma etapa que
    // alguém declarou inexistente para este cliente travaria o fluxo.
    const anterior = [...tarefa.etapas]
      .reverse()
      .find(
        (e) =>
          e.numero < numeroAtual && e.situacao !== SITUACAO_ETAPA.NAO_APLICAVEL
      );

    if (!etapaAtual || !anterior) {
      return NextResponse.json(
        {
          error: "Não há etapa anterior para retornar.",
          code: "sem_etapa_anterior",
        },
        { status: 409 }
      );
    }

    const agora = new Date();

    // Mesma razão da conclusão: mover a etapa e gravar o log são a mesma
    // operação. Se o log não gravar, o retorno não pode ter acontecido.
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.tarefaApuracaoEtapa.update({
        where: { id: etapaAtual.id },
        data: {
          situacao: SITUACAO_ETAPA.PENDENTE,
          iniciadaEm: null,
          concluidaEm: null,
          concluidaPor: null,
        },
      });

      // A etapa anterior volta a ser trabalho em curso. `concluidaEm` e
      // `concluidaPor` são limpos porque ela precisa ser refeita — quem a havia
      // concluído continua registrado no log, que é append-only.
      await tx.tarefaApuracaoEtapa.update({
        where: { id: anterior.id },
        data: {
          situacao: SITUACAO_ETAPA.EM_ANDAMENTO,
          iniciadaEm: agora,
          concluidaEm: null,
          concluidaPor: null,
        },
      });

      await tx.tarefaApuracao.update({
        where: { id },
        data: { etapaAtual: anterior.numero },
      });

      await registrarLog(tx, {
        apuracaoId: id,
        acao: ACAO_LOG.ETAPA_RETORNADA,
        de: `${etapaAtual.numero} — ${etapaAtual.titulo}`,
        para: `${anterior.numero} — ${anterior.titulo}`,
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
          detalhe: "Retorno de etapa.",
          sessao,
        });
      }

      return status;
    });

    return NextResponse.json({
      etapaAtual: anterior.numero,
      tituloEtapaAtual: anterior.titulo,
      etapaRetornada: etapaAtual.numero,
      status: resultado.para,
      motivo,
    });
  } catch (error) {
    console.error("Erro ao retornar etapa:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
