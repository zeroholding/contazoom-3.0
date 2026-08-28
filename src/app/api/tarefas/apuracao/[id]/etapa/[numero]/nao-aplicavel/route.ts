/**
 * Marcação de etapa opcional como não aplicável.
 *
 * POST /api/tarefas/apuracao/[id]/etapa/[numero]/nao-aplicavel
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 16.2.
 *
 * Só vale para etapa `opcional`. Etapa obrigatória marcada como não aplicável
 * seria uma porta para fechar competência sem fazer o trabalho — e o fluxo
 * deixaria de descrever o que a contabilidade precisa entregar.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { negado, podeConcluirEtapa, requireInterno } from "@/lib/api-guard";
import { recalcularStatus, registrarLog } from "@/lib/tarefa-service";
import {
  ACAO_LOG,
  RESPONSAVEL_LABEL,
  SITUACAO_ETAPA,
} from "@/lib/tarefa-etapas";

type Params = { params: Promise<{ id: string; numero: string }> };
type CorpoNaoAplicavel = { motivo?: unknown };

export async function POST(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { id, numero } = await params;
    const numeroEtapa = Number(numero);
    if (!Number.isInteger(numeroEtapa) || numeroEtapa < 1) {
      return NextResponse.json(
        { error: "Número de etapa inválido.", code: "etapa_invalida" },
        { status: 400 }
      );
    }

    const corpo = (await req
      .json()
      .catch(() => null)) as CorpoNaoAplicavel | null;
    const motivo =
      corpo && typeof corpo.motivo === "string" && corpo.motivo.trim()
        ? corpo.motivo.trim()
        : null;

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      select: {
        id: true,
        etapaAtual: true,
        concluidaEm: true,
        etapas: {
          orderBy: { numero: "asc" },
          select: {
            id: true,
            numero: true,
            titulo: true,
            opcional: true,
            situacao: true,
            responsavelTipo: true,
          },
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
          error: "Esta competência está encerrada. Reabra antes de alterar etapas.",
          code: "tarefa_concluida",
        },
        { status: 409 }
      );
    }

    const etapa = tarefa.etapas.find((e) => e.numero === numeroEtapa);
    if (!etapa) {
      return NextResponse.json(
        {
          error: "Etapa não encontrada nesta competência.",
          code: "etapa_inexistente",
        },
        { status: 404 }
      );
    }

    if (!etapa.opcional) {
      return NextResponse.json(
        {
          error: `A etapa ${etapa.numero} é obrigatória e não pode ser marcada como não aplicável.`,
          code: "etapa_obrigatoria",
        },
        { status: 400 }
      );
    }

    if (etapa.situacao === SITUACAO_ETAPA.NAO_APLICAVEL) {
      return NextResponse.json(
        {
          error: "Esta etapa já está marcada como não aplicável.",
          code: "etapa_ja_nao_aplicavel",
        },
        { status: 409 }
      );
    }

    if (etapa.situacao === SITUACAO_ETAPA.CONCLUIDA) {
      return NextResponse.json(
        {
          error:
            "Esta etapa já foi concluída. Retorne a etapa antes de marcá-la como não aplicável.",
          code: "etapa_ja_concluida",
        },
        { status: 409 }
      );
    }

    // Dispensar uma etapa é decidir sobre o trabalho dela, então vale a mesma
    // regra de quem poderia concluí-la.
    if (!podeConcluirEtapa(sessao.papel, etapa.responsavelTipo)) {
      return negado(
        `Esta etapa é de responsabilidade de ${
          RESPONSAVEL_LABEL[etapa.responsavelTipo] ?? etapa.responsavelTipo
        }. Seu perfil não pode dispensá-la.`
      );
    }

    // Se a etapa dispensada é a atual, o fluxo tem de andar junto: deixar
    // `etapaAtual` numa etapa não aplicável travaria a competência numa posição
    // em que não existe trabalho a concluir.
    const ehEtapaAtual = Math.max(1, tarefa.etapaAtual) === etapa.numero;
    const proxima = ehEtapaAtual
      ? tarefa.etapas.find(
          (e) =>
            e.numero > etapa.numero &&
            e.situacao !== SITUACAO_ETAPA.NAO_APLICAVEL
        ) ?? null
      : null;

    const agora = new Date();

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.tarefaApuracaoEtapa.update({
        where: { id: etapa.id },
        data: {
          situacao: SITUACAO_ETAPA.NAO_APLICAVEL,
          concluidaEm: agora,
          concluidaPor: sessao.nome || sessao.email,
          ...(motivo ? { observacao: motivo } : {}),
        },
      });

      await registrarLog(tx, {
        apuracaoId: id,
        acao: ACAO_LOG.ETAPA_NAO_APLICAVEL,
        para: `${etapa.numero} — ${etapa.titulo}`,
        detalhe: motivo,
        sessao,
      });

      let tarefaConcluida = false;

      if (ehEtapaAtual) {
        if (proxima) {
          await tx.tarefaApuracao.update({
            where: { id },
            data: { etapaAtual: proxima.numero },
          });
          await tx.tarefaApuracaoEtapa.update({
            where: { id: proxima.id },
            data: { situacao: SITUACAO_ETAPA.EM_ANDAMENTO, iniciadaEm: agora },
          });
          await registrarLog(tx, {
            apuracaoId: id,
            acao: ACAO_LOG.ETAPA_AVANCADA,
            de: String(etapa.numero),
            para: String(proxima.numero),
            detalhe: proxima.titulo,
            sessao,
          });
        } else {
          await tx.tarefaApuracao.update({
            where: { id },
            data: { concluidaEm: agora },
          });
          tarefaConcluida = true;
        }
      }

      const status = await recalcularStatus(tx, id);

      if (tarefaConcluida) {
        await registrarLog(tx, {
          apuracaoId: id,
          acao: ACAO_LOG.TAREFA_CONCLUIDA,
          para: "CONCLUIDO",
          detalhe: "Última etapa aplicável dispensada.",
          sessao,
        });
      } else if (status.mudou) {
        await registrarLog(tx, {
          apuracaoId: id,
          acao: ACAO_LOG.STATUS_ALTERADO,
          de: status.de,
          para: status.para,
          sessao,
        });
      }

      return { status, tarefaConcluida };
    });

    return NextResponse.json({
      etapa: { numero: etapa.numero, titulo: etapa.titulo },
      situacao: SITUACAO_ETAPA.NAO_APLICAVEL,
      etapaAtual: proxima?.numero ?? Math.max(1, tarefa.etapaAtual),
      status: resultado.status.para,
      tarefaConcluida: resultado.tarefaConcluida,
    });
  } catch (error) {
    console.error("Erro ao marcar etapa como não aplicável:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
