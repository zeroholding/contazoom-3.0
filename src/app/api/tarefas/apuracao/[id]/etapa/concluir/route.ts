/**
 * Conclusão da etapa atual, com avanço para a próxima.
 *
 * POST /api/tarefas/apuracao/[id]/etapa/concluir
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 16.2 e 16.5.
 *
 * É a operação mais usada do módulo: é o clique que move o trabalho.
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

type Params = { params: Promise<{ id: string }> };
type CorpoConcluir = { observacao?: unknown };

export async function POST(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { id } = await params;
    const corpo = (await req.json().catch(() => null)) as CorpoConcluir | null;
    const observacao =
      corpo && typeof corpo.observacao === "string" && corpo.observacao.trim()
        ? corpo.observacao.trim()
        : null;

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      select: {
        id: true,
        regime: true,
        etapaAtual: true,
        bloqueada: true,
        bloqueioMotivo: true,
        bloqueioResponsavel: true,
        concluidaEm: true,
        etapas: {
          orderBy: { numero: "asc" },
          select: {
            id: true,
            numero: true,
            titulo: true,
            responsavelTipo: true,
            situacao: true,
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
          error:
            "Esta competência já está encerrada. Reabra antes de alterar etapas.",
          code: "tarefa_concluida",
        },
        { status: 409 }
      );
    }

    // Bloqueio impede avanço de propósito: se a tarefa está travada esperando
    // documento do cliente, concluir etapa por cima registraria trabalho que não
    // foi feito, e o tempo de espera desapareceria do histórico — que é
    // justamente o número usado para cobrar quem está devendo.
    if (tarefa.bloqueada) {
      return NextResponse.json(
        {
          error: `Existe pendência aberta nesta competência. Resolva antes de concluir a etapa. Motivo: ${
            tarefa.bloqueioMotivo ?? "não informado"
          }`,
          code: "tarefa_bloqueada",
          bloqueioResponsavel: tarefa.bloqueioResponsavel,
        },
        { status: 409 }
      );
    }

    const numeroAtual = Math.max(1, tarefa.etapaAtual);
    const etapaAtual = tarefa.etapas.find((e) => e.numero === numeroAtual);
    if (!etapaAtual) {
      return NextResponse.json(
        {
          error: "A etapa atual não existe nesta competência.",
          code: "etapa_inexistente",
        },
        { status: 409 }
      );
    }

    if (etapaAtual.situacao === SITUACAO_ETAPA.CONCLUIDA) {
      return NextResponse.json(
        {
          error: `A etapa ${etapaAtual.numero} já está concluída.`,
          code: "etapa_ja_concluida",
        },
        { status: 409 }
      );
    }

    // Você só conclui etapa que é sua. É o que impede o comercial marcar apuração
    // como feita e o escritório marcar como recebido documento que não recebeu.
    if (!podeConcluirEtapa(sessao.papel, etapaAtual.responsavelTipo)) {
      return negado(
        `Esta etapa é de responsabilidade de ${
          RESPONSAVEL_LABEL[etapaAtual.responsavelTipo] ??
          etapaAtual.responsavelTipo
        }. Seu perfil não pode concluí-la.`
      );
    }

    // Próxima etapa aplicável: etapa marcada como NAO_APLICAVEL é pulada, senão o
    // fluxo pararia numa etapa que alguém já declarou que não vale para este
    // cliente, e exigiria concluir trabalho inexistente para seguir.
    const proxima =
      tarefa.etapas.find(
        (e) =>
          e.numero > etapaAtual.numero &&
          e.situacao !== SITUACAO_ETAPA.NAO_APLICAVEL
      ) ?? null;

    const agora = new Date();
    const autor = sessao.nome || sessao.email;

    /*
     * Transação obrigatória.
     *
     * Uma conclusão faz quatro escritas: fecha a etapa, move `etapaAtual`, abre a
     * próxima e grava o log. Sem transação, uma falha no meio deixa a tarefa na
     * etapa 5 com o log dizendo que ainda está na 4 — e aí o log deixa de ser
     * confiável, que é a única coisa que ele precisa ser. Log que às vezes mente
     * é pior que log nenhum, porque ninguém sabe qual linha acreditar.
     */
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.tarefaApuracaoEtapa.update({
        where: { id: etapaAtual.id },
        data: {
          situacao: SITUACAO_ETAPA.CONCLUIDA,
          concluidaEm: agora,
          concluidaPor: autor,
          ...(observacao ? { observacao } : {}),
        },
      });

      await registrarLog(tx, {
        apuracaoId: id,
        acao: ACAO_LOG.ETAPA_CONCLUIDA,
        de: null,
        para: `${etapaAtual.numero} — ${etapaAtual.titulo}`,
        detalhe: observacao,
        sessao,
      });

      let tarefaConcluida = false;

      if (proxima) {
        await tx.tarefaApuracao.update({
          where: { id },
          data: { etapaAtual: proxima.numero },
        });
        await tx.tarefaApuracaoEtapa.update({
          where: { id: proxima.id },
          data: {
            situacao: SITUACAO_ETAPA.EM_ANDAMENTO,
            iniciadaEm: agora,
          },
        });
        await registrarLog(tx, {
          apuracaoId: id,
          acao: ACAO_LOG.ETAPA_AVANCADA,
          de: String(etapaAtual.numero),
          para: String(proxima.numero),
          detalhe: proxima.titulo,
          sessao,
        });
      } else {
        // Era a última etapa aplicável: a competência acabou.
        await tx.tarefaApuracao.update({
          where: { id },
          data: { etapaAtual: etapaAtual.numero, concluidaEm: agora },
        });
        tarefaConcluida = true;
      }

      const status = await recalcularStatus(tx, id);

      if (tarefaConcluida) {
        await registrarLog(tx, {
          apuracaoId: id,
          acao: ACAO_LOG.TAREFA_CONCLUIDA,
          para: "CONCLUIDO",
          detalhe: "Última etapa do fluxo concluída.",
          sessao,
        });
      } else if (status.mudou) {
        // Log de status só quando houve mudança de verdade. Registrar
        // "EM_ELABORACAO -> EM_ELABORACAO" a cada etapa enche a linha do tempo
        // de linhas que não informam nada.
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
      concluida: {
        numero: etapaAtual.numero,
        titulo: etapaAtual.titulo,
      },
      etapaAtual: proxima?.numero ?? etapaAtual.numero,
      proximaEtapa: proxima
        ? { numero: proxima.numero, titulo: proxima.titulo }
        : null,
      status: resultado.status.para,
      tarefaConcluida: resultado.tarefaConcluida,
    });
  } catch (error) {
    console.error("Erro ao concluir etapa:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
