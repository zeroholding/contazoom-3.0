/**
 * Encerramento do processo de legalização.
 *
 * Exige todas as etapas resolvidas (concluídas ou marcadas como não aplicáveis).
 * Sem essa trava, encerrar viraria atalho para "sair da minha lista", e o
 * histórico deixaria de mostrar o que realmente foi feito.
 *
 * A rota é o encerramento MANUAL. O caminho normal é a conclusão da última
 * etapa, que já fecha o processo (e, no desenquadramento, aplica o novo regime).
 * Este endpoint serve ao caso em que as etapas restantes foram dispensadas e não
 * há última etapa para concluir.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno, podeEncerrarTarefa, negado } from "@/lib/api-guard";
import { ACAO_LOG } from "@/lib/tarefa-etapas";
import {
  etapasNaoResolvidas,
  lerCorpo,
  recalcularStatusProcesso,
  registrarLogProcesso,
  textoLimpo,
} from "@/lib/legalizacao-service";

function erro(
  mensagem: string,
  status: number,
  code?: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error: mensagem, ...(code ? { code } : {}), ...(extra ?? {}) },
    { status }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  if (!podeEncerrarTarefa(sessao.papel)) {
    return negado("Seu perfil não pode encerrar processos.");
  }

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");
  const observacao = textoLimpo(corpo.observacao);

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      include: { etapas: { orderBy: { numero: "asc" } } },
    });
    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }

    if (processo.concluidoEm) {
      return erro(
        "Processo já está encerrado.",
        409,
        "PROCESSO_JA_ENCERRADO"
      );
    }

    if (processo.bloqueada) {
      return erro(
        "Processo com pendência ativa. Resolva a pendência antes de encerrar.",
        409,
        "PROCESSO_BLOQUEADO"
      );
    }

    const pendentes = etapasNaoResolvidas(processo.etapas);
    if (pendentes.length) {
      return erro(
        `Ainda há etapas não resolvidas: ${pendentes.join(
          ", "
        )}. Conclua ou marque como não aplicável antes de encerrar.`,
        409,
        "ETAPAS_PENDENTES",
        { etapasPendentes: pendentes }
      );
    }

    const ultima = processo.etapas[processo.etapas.length - 1];

    const resultado = await prisma.$transaction(async (tx) => {
      const agora = new Date();

      await tx.processoLegalizacao.update({
        where: { id },
        data: {
          concluidoEm: agora,
          // `etapaAtual` na última etapa do fluxo é o que faz a derivação de
          // status enxergar CONCLUIDO.
          etapaAtual: ultima ? ultima.numero : processo.etapaAtual,
        },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.TAREFA_CONCLUIDA,
        para: "Processo encerrado",
        detalhe: observacao,
        sessao,
      });

      const status = await recalcularStatusProcesso(tx, id, sessao);

      const atualizado = await tx.processoLegalizacao.findUnique({
        where: { id },
        include: { etapas: { orderBy: { numero: "asc" } } },
      });

      return { processo: atualizado, status };
    });

    return NextResponse.json({
      processo: resultado.processo,
      status: resultado.status.novo,
    });
  } catch (e) {
    console.error("[legalizacao][encerrar] falha ao encerrar processo:", e);
    return erro("Erro ao encerrar o processo.", 500);
  }
}
