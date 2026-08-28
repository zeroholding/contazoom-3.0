/**
 * Pendência (bloqueio) de uma competência.
 *
 * POST   /api/tarefas/apuracao/[id]/bloqueio — registra
 * DELETE /api/tarefas/apuracao/[id]/bloqueio — resolve
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 16.2.
 *
 * Bloqueio não é posição no fluxo: a etapa continua onde estava. É isso que
 * permite ler "está na etapa 4, travada há 6 dias esperando o cliente", que é a
 * informação que resolve reunião. Quem está devendo (`responsavel`) é obrigatório
 * porque "pendência" sem dono não é cobrável de ninguém.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { negado, podeGerenciarBloqueio, requireInterno } from "@/lib/api-guard";
import { recalcularStatus, registrarLog } from "@/lib/tarefa-service";
import {
  ACAO_LOG,
  BLOQUEIO_RESPONSAVEIS_VALIDOS,
  BLOQUEIO_RESPONSAVEL_LABEL,
} from "@/lib/tarefa-etapas";
import { diasEmBloqueio } from "@/lib/tarefa-status";

type Params = { params: Promise<{ id: string }> };
type CorpoBloqueio = { motivo?: unknown; responsavel?: unknown };
type CorpoResolucao = { observacao?: unknown };

const MINIMO_MOTIVO = 5;

export async function POST(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  if (!podeGerenciarBloqueio(sessao.papel)) {
    return negado("Seu perfil não pode registrar pendência.");
  }

  try {
    const { id } = await params;
    const corpo = (await req.json().catch(() => null)) as CorpoBloqueio | null;

    const motivo =
      corpo && typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";
    if (motivo.length < MINIMO_MOTIVO) {
      return NextResponse.json(
        {
          error: "Descreva o motivo da pendência.",
          code: "motivo_obrigatorio",
        },
        { status: 400 }
      );
    }

    const responsavel =
      corpo && typeof corpo.responsavel === "string"
        ? corpo.responsavel.trim()
        : "";
    if (!BLOQUEIO_RESPONSAVEIS_VALIDOS.includes(responsavel)) {
      return NextResponse.json(
        {
          error: `Informe de quem se espera a resolução. Valores aceitos: ${BLOQUEIO_RESPONSAVEIS_VALIDOS.join(
            ", "
          )}.`,
          code: "responsavel_invalido",
        },
        { status: 400 }
      );
    }

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      select: {
        id: true,
        bloqueada: true,
        bloqueioMotivo: true,
        concluidaEm: true,
        etapaAtual: true,
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
            "Esta competência está encerrada. Reabra antes de registrar pendência.",
          code: "tarefa_concluida",
        },
        { status: 409 }
      );
    }
    if (tarefa.bloqueada) {
      return NextResponse.json(
        {
          error: `Já existe pendência aberta: ${
            tarefa.bloqueioMotivo ?? "sem motivo registrado"
          }. Resolva a atual antes de registrar outra.`,
          code: "bloqueio_ja_existe",
        },
        { status: 409 }
      );
    }

    const agora = new Date();

    // Transação: o bloqueio muda o status macro derivado (passa a
    // AGUARDANDO_DOCUMENTACAO ou PENDENCIA_IDENTIFICADA). Gravar o bloqueio sem o
    // status novo deixaria a tela mostrando "em elaboração" numa tarefa travada.
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.tarefaApuracao.update({
        where: { id },
        data: {
          bloqueada: true,
          bloqueioMotivo: motivo,
          bloqueioDesde: agora,
          bloqueioResponsavel: responsavel,
        },
      });

      await registrarLog(tx, {
        apuracaoId: id,
        acao: ACAO_LOG.BLOQUEIO_REGISTRADO,
        para: BLOQUEIO_RESPONSAVEL_LABEL[responsavel] ?? responsavel,
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
          detalhe: "Pendência registrada.",
          sessao,
        });
      }
      return status;
    });

    return NextResponse.json({
      bloqueada: true,
      bloqueioMotivo: motivo,
      bloqueioResponsavel: responsavel,
      bloqueioDesde: agora,
      status: resultado.para,
    });
  } catch (error) {
    console.error("Erro ao registrar pendência:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */

export async function DELETE(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  if (!podeGerenciarBloqueio(sessao.papel)) {
    return negado("Seu perfil não pode resolver pendência.");
  }

  try {
    const { id } = await params;
    const corpo = (await req.json().catch(() => null)) as CorpoResolucao | null;
    const observacao =
      corpo && typeof corpo.observacao === "string" && corpo.observacao.trim()
        ? corpo.observacao.trim()
        : null;

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      select: {
        id: true,
        bloqueada: true,
        bloqueioMotivo: true,
        bloqueioDesde: true,
        bloqueioResponsavel: true,
      },
    });
    if (!tarefa) {
      return NextResponse.json(
        { error: "Competência não encontrada.", code: "nao_encontrada" },
        { status: 404 }
      );
    }
    if (!tarefa.bloqueada) {
      return NextResponse.json(
        {
          error: "Não há pendência aberta nesta competência.",
          code: "sem_bloqueio",
        },
        { status: 409 }
      );
    }

    // A duração vai para o log no momento da resolução porque os campos de
    // bloqueio são limpos aqui. Se o número não for gravado agora, ninguém
    // conseguirá mais responder "quanto tempo esta competência ficou parada" —
    // e é esse número que mostra onde o processo perde tempo.
    const dias = diasEmBloqueio(tarefa.bloqueioDesde) ?? 0;
    const quem = tarefa.bloqueioResponsavel
      ? BLOQUEIO_RESPONSAVEL_LABEL[tarefa.bloqueioResponsavel] ??
        tarefa.bloqueioResponsavel
      : "não informado";
    const partes = [
      `Duração: ${dias} ${dias === 1 ? "dia" : "dias"}`,
      `Aguardava: ${quem}`,
      `Motivo original: ${tarefa.bloqueioMotivo ?? "não informado"}`,
    ];
    if (observacao) partes.push(`Resolução: ${observacao}`);

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.tarefaApuracao.update({
        where: { id },
        data: {
          bloqueada: false,
          bloqueioMotivo: null,
          bloqueioDesde: null,
          bloqueioResponsavel: null,
        },
      });

      await registrarLog(tx, {
        apuracaoId: id,
        acao: ACAO_LOG.BLOQUEIO_RESOLVIDO,
        de: quem,
        para: `${dias} ${dias === 1 ? "dia" : "dias"}`,
        detalhe: partes.join(" | "),
        sessao,
      });

      const status = await recalcularStatus(tx, id);
      if (status.mudou) {
        await registrarLog(tx, {
          apuracaoId: id,
          acao: ACAO_LOG.STATUS_ALTERADO,
          de: status.de,
          para: status.para,
          detalhe: "Pendência resolvida.",
          sessao,
        });
      }
      return status;
    });

    return NextResponse.json({
      bloqueada: false,
      diasEmBloqueio: dias,
      status: resultado.para,
    });
  } catch (error) {
    console.error("Erro ao resolver pendência:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
