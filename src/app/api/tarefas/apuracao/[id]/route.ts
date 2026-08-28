/**
 * Detalhe e edição de uma competência.
 *
 * GET   /api/tarefas/apuracao/[id] — cabeçalho, etapas e histórico
 * PATCH /api/tarefas/apuracao/[id] — responsável, prazo e observações
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 15.4 e 16.2.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";
import { registrarLog } from "@/lib/tarefa-service";
import { ACAO_LOG } from "@/lib/tarefa-etapas";
import {
  competenciaLabel,
  diasEmBloqueio,
  situacaoPrazo,
} from "@/lib/tarefa-status";

/** Quantas linhas de histórico o cartão carrega de uma vez. */
const LIMITE_LOGS = 100;

type Params = { params: Promise<{ id: string }> };

/** Data legível para o log. O histórico é lido por gente, não por parser. */
function dataLegivel(valor: Date | null | undefined): string | null {
  if (!valor) return null;
  return valor.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export async function GET(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { id } = await params;

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      include: {
        empresa: {
          select: {
            id: true,
            cnpj: true,
            razaoSocial: true,
            nomeFantasia: true,
            regime: true,
            tributoLocal: true,
            situacao: true,
            uf: true,
            municipio: true,
          },
        },
        responsavel: { select: { id: true, name: true, email: true } },
        etapas: { orderBy: { numero: "asc" } },
        logs: {
          orderBy: { createdAt: "desc" },
          take: LIMITE_LOGS,
        },
      },
    });

    if (!tarefa) {
      return NextResponse.json(
        { error: "Competência não encontrada.", code: "nao_encontrada" },
        { status: 404 }
      );
    }

    const agora = new Date();
    const prazoInfo = situacaoPrazo(
      tarefa.prazoEntrega,
      Boolean(tarefa.concluidaEm),
      agora
    );
    const etapaAtual =
      tarefa.etapas.find((e) => e.numero === tarefa.etapaAtual) ?? null;

    return NextResponse.json({
      tarefa: {
        id: tarefa.id,
        ano: tarefa.ano,
        mes: tarefa.mes,
        competencia: `${tarefa.ano}-${String(tarefa.mes).padStart(2, "0")}`,
        competenciaLabel: competenciaLabel(tarefa.ano, tarefa.mes),
        regime: tarefa.regime,
        status: tarefa.status,
        etapaAtual: tarefa.etapaAtual,
        totalEtapas: tarefa.etapas.length,
        tituloEtapaAtual: etapaAtual?.titulo ?? null,
        responsavelEtapaAtual: etapaAtual?.responsavelTipo ?? null,
        prazoEntrega: tarefa.prazoEntrega,
        prazo: { situacao: prazoInfo.situacao, dias: prazoInfo.dias },
        bloqueada: tarefa.bloqueada,
        bloqueioMotivo: tarefa.bloqueioMotivo,
        bloqueioDesde: tarefa.bloqueioDesde,
        bloqueioResponsavel: tarefa.bloqueioResponsavel,
        diasEmBloqueio: tarefa.bloqueada
          ? diasEmBloqueio(tarefa.bloqueioDesde, agora)
          : null,
        iniciadaEm: tarefa.iniciadaEm,
        concluidaEm: tarefa.concluidaEm,
        observacoes: tarefa.observacoes,
        responsavel: tarefa.responsavel,
        criadaEm: tarefa.createdAt,
        atualizadaEm: tarefa.updatedAt,
      },
      empresa: tarefa.empresa,
      etapas: tarefa.etapas,
      logs: tarefa.logs,
    });
  } catch (error) {
    console.error("Erro ao carregar apuração:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */

type CorpoPatch = {
  responsavelId?: unknown;
  prazoEntrega?: unknown;
  observacoes?: unknown;
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { id } = await params;
    const corpo = (await req.json().catch(() => null)) as CorpoPatch | null;
    if (!corpo || typeof corpo !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    const tarefa = await prisma.tarefaApuracao.findUnique({
      where: { id },
      select: {
        id: true,
        responsavelId: true,
        prazoEntrega: true,
        observacoes: true,
        concluidaEm: true,
        responsavel: { select: { name: true, email: true } },
      },
    });
    if (!tarefa) {
      return NextResponse.json(
        { error: "Competência não encontrada.", code: "nao_encontrada" },
        { status: 404 }
      );
    }

    const dados: {
      responsavelId?: string | null;
      prazoEntrega?: Date | null;
      observacoes?: string | null;
    } = {};

    // Cada mudança vira um log próprio, com de -> para legível. Um log só
    // dizendo "tarefa editada" não responde a pergunta que se faz três meses
    // depois: quem passou isso para outra pessoa, e quando.
    const registros: {
      acao: string;
      de: string | null;
      para: string | null;
      detalhe: string | null;
    }[] = [];

    if ("responsavelId" in corpo) {
      const novo =
        typeof corpo.responsavelId === "string" && corpo.responsavelId.trim()
          ? corpo.responsavelId.trim()
          : null;

      if (novo !== tarefa.responsavelId) {
        let nomeNovo: string | null = null;
        if (novo) {
          const usuario = await prisma.user.findUnique({
            where: { id: novo },
            select: { name: true, email: true },
          });
          if (!usuario) {
            return NextResponse.json(
              {
                error: "Responsável informado não existe.",
                code: "responsavel_invalido",
              },
              { status: 400 }
            );
          }
          nomeNovo = usuario.name || usuario.email;
        }
        dados.responsavelId = novo;
        registros.push({
          acao: ACAO_LOG.RESPONSAVEL_ALTERADO,
          de:
            tarefa.responsavel?.name ||
            tarefa.responsavel?.email ||
            "Sem responsável",
          para: nomeNovo ?? "Sem responsável",
          detalhe: null,
        });
      }
    }

    if ("prazoEntrega" in corpo) {
      let novo: Date | null = null;
      if (corpo.prazoEntrega) {
        const data = new Date(String(corpo.prazoEntrega));
        if (Number.isNaN(data.getTime())) {
          return NextResponse.json(
            { error: "Prazo de entrega inválido.", code: "prazo_invalido" },
            { status: 400 }
          );
        }
        novo = data;
      }
      const mudou =
        (novo?.getTime() ?? null) !== (tarefa.prazoEntrega?.getTime() ?? null);
      if (mudou) {
        dados.prazoEntrega = novo;
        registros.push({
          acao: ACAO_LOG.PRAZO_ALTERADO,
          de: dataLegivel(tarefa.prazoEntrega) ?? "Sem prazo",
          para: dataLegivel(novo) ?? "Sem prazo",
          detalhe: null,
        });
      }
    }

    if ("observacoes" in corpo) {
      const novo =
        typeof corpo.observacoes === "string" && corpo.observacoes.trim()
          ? corpo.observacoes.trim()
          : null;
      if (novo !== tarefa.observacoes) {
        dados.observacoes = novo;
        registros.push({
          acao: ACAO_LOG.OBSERVACAO_ADICIONADA,
          de: null,
          para: null,
          // A observação vai no detalhe, e não em `para`, porque o log preserva
          // o texto de cada versão: o campo `observacoes` da tarefa é sobrescrito,
          // o histórico não.
          detalhe: novo ?? "Observação removida",
        });
      }
    }

    if (!registros.length) {
      return NextResponse.json({
        atualizada: false,
        mensagem: "Nenhuma alteração a aplicar.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.tarefaApuracao.update({ where: { id }, data: dados });
      for (const registro of registros) {
        await registrarLog(tx, {
          apuracaoId: id,
          acao: registro.acao,
          de: registro.de,
          para: registro.para,
          detalhe: registro.detalhe,
          sessao,
        });
      }
    });

    return NextResponse.json({
      atualizada: true,
      alteracoes: registros.map((r) => r.acao),
    });
  } catch (error) {
    console.error("Erro ao atualizar apuração:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
