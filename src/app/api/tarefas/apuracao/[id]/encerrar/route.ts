/**
 * Encerramento da competência.
 *
 * POST /api/tarefas/apuracao/[id]/encerrar
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 16.2.
 *
 * Encerrar congela o que foi entregue ao cliente. Só ADMIN e CONTABIL, e só com
 * o fluxo efetivamente cumprido: atalho aqui transforma o painel em decoração.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { negado, podeEncerrarTarefa, requireInterno } from "@/lib/api-guard";
import { registrarLog } from "@/lib/tarefa-service";
import { ACAO_LOG, SITUACAO_ETAPA } from "@/lib/tarefa-etapas";
import { STATUS } from "@/lib/tarefa-status";

type Params = { params: Promise<{ id: string }> };
type CorpoEncerrar = { observacao?: unknown };

export async function POST(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  if (!podeEncerrarTarefa(sessao.papel)) {
    return negado(
      "Seu perfil não pode encerrar competência. Solicite à contabilidade ou ao administrador."
    );
  }

  try {
    const { id } = await params;
    const corpo = (await req.json().catch(() => null)) as CorpoEncerrar | null;
    const observacao =
      corpo && typeof corpo.observacao === "string" && corpo.observacao.trim()
        ? corpo.observacao.trim()
        : null;

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      select: {
        id: true,
        ano: true,
        mes: true,
        status: true,
        etapaAtual: true,
        bloqueada: true,
        bloqueioMotivo: true,
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
        { error: "Esta competência já está encerrada.", code: "ja_encerrada" },
        { status: 409 }
      );
    }

    // Encerrar com pendência aberta produziria uma competência simultaneamente
    // concluída e travada. O bloqueio existe para ser resolvido ou registrado como
    // resolvido; encerrar por cima apagaria a duração dele do histórico.
    if (tarefa.bloqueada) {
      return NextResponse.json(
        {
          error: `Resolva a pendência antes de encerrar. Motivo: ${
            tarefa.bloqueioMotivo ?? "não informado"
          }`,
          code: "tarefa_bloqueada",
        },
        { status: 409 }
      );
    }

    const total = tarefa.etapas.length;
    const ultima = tarefa.etapas[total - 1];
    if (!ultima) {
      return NextResponse.json(
        {
          error: "Esta competência não tem etapas registradas.",
          code: "sem_etapas",
        },
        { status: 409 }
      );
    }

    // Só a última etapa pode estar aberta: ela É o encerramento. Qualquer outra
    // etapa em aberto significa trabalho não feito, e o número de quantas faltam
    // é o que a tela precisa para dizer o que ainda falta fazer.
    const abertas = tarefa.etapas.filter(
      (e) =>
        e.numero !== ultima.numero &&
        (e.situacao === SITUACAO_ETAPA.PENDENTE ||
          e.situacao === SITUACAO_ETAPA.EM_ANDAMENTO)
    );

    if (abertas.length) {
      return NextResponse.json(
        {
          error: `Ainda ${
            abertas.length === 1 ? "falta 1 etapa" : `faltam ${abertas.length} etapas`
          } para encerrar esta competência.`,
          code: "etapas_pendentes",
          faltam: abertas.length,
          etapas: abertas.map((e) => ({ numero: e.numero, titulo: e.titulo })),
        },
        { status: 409 }
      );
    }

    const agora = new Date();

    const resultado = await prisma.$transaction(async (tx) => {
      // A última etapa é o próprio ato de encerrar; deixá-la pendente numa
      // competência concluída faria a tela de detalhe contradizer o cabeçalho.
      if (
        ultima.situacao === SITUACAO_ETAPA.PENDENTE ||
        ultima.situacao === SITUACAO_ETAPA.EM_ANDAMENTO
      ) {
        await tx.tarefaApuracaoEtapa.update({
          where: { id: ultima.id },
          data: {
            situacao: SITUACAO_ETAPA.CONCLUIDA,
            concluidaEm: agora,
            concluidaPor: sessao.nome || sessao.email,
          },
        });
        await registrarLog(tx, {
          apuracaoId: id,
          acao: ACAO_LOG.ETAPA_CONCLUIDA,
          para: `${ultima.numero} — ${ultima.titulo}`,
          detalhe: "Concluída no encerramento da competência.",
          sessao,
        });
      }

      // Status escrito direto, sem passar pela derivação: encerrar é decisão
      // humana registrada, e `etapaAtual = total` é o estado que a representa.
      await tx.tarefaApuracao.update({
        where: { id },
        data: {
          concluidaEm: agora,
          status: STATUS.CONCLUIDO,
          etapaAtual: total,
        },
      });

      await registrarLog(tx, {
        apuracaoId: id,
        acao: ACAO_LOG.TAREFA_CONCLUIDA,
        de: tarefa.status,
        para: STATUS.CONCLUIDO,
        detalhe: observacao,
        sessao,
      });

      return { concluidaEm: agora };
    });

    return NextResponse.json({
      encerrada: true,
      concluidaEm: resultado.concluidaEm,
      status: STATUS.CONCLUIDO,
      etapaAtual: total,
      totalEtapas: total,
    });
  } catch (error) {
    console.error("Erro ao encerrar competência:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
