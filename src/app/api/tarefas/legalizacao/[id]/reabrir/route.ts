/**
 * Reabertura de processo encerrado.
 *
 * Só administrador, e com motivo obrigatório: reabrir desfaz um encerramento, e
 * encerramento é o que o cliente já recebeu como pronto. Quem reabre tem de
 * deixar escrito por quê, porque o log é a única prova de que a alteração
 * posterior foi intencional.
 *
 * A reabertura NÃO desfaz efeito cadastral. Se o processo era desenquadramento,
 * o regime já mudou e continua mudado: reverter regime é ato contábil próprio,
 * com nova vigência, não consequência silenciosa de reabrir uma tarefa.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno, podeReabrirTarefa, negado } from "@/lib/api-guard";
import { ACAO_LOG, SITUACAO_ETAPA } from "@/lib/tarefa-etapas";
import {
  lerCorpo,
  recalcularStatusProcesso,
  registrarLogProcesso,
  rotuloEtapa,
  textoLimpo,
} from "@/lib/legalizacao-service";

const MOTIVO_MINIMO = 3;

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error: mensagem, code } : { error: mensagem }, {
    status,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  if (!podeReabrirTarefa(sessao.papel)) {
    return negado("Somente administrador pode reabrir processo encerrado.");
  }

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  const motivo = textoLimpo(corpo.motivo);
  if (!motivo || motivo.length < MOTIVO_MINIMO) {
    return erro("Informe o motivo da reabertura.", 400, "MOTIVO_OBRIGATORIO");
  }

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      include: { etapas: { orderBy: { numero: "asc" } } },
    });
    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }

    if (!processo.concluidoEm) {
      return erro(
        "Processo não está encerrado.",
        409,
        "PROCESSO_NAO_ENCERRADO"
      );
    }

    // Volta para a última etapa efetivamente CONCLUÍDA, não para a última do
    // fluxo: etapa dispensada continua dispensada, e reabrir tem de devolver o
    // processo a um ponto em que existe trabalho a refazer.
    const alvo =
      [...processo.etapas]
        .reverse()
        .find((e) => e.situacao === SITUACAO_ETAPA.CONCLUIDA) ??
      processo.etapas[0] ??
      null;

    if (!alvo) {
      return erro(
        "Processo sem etapas registradas; não é possível reabrir.",
        409,
        "SEM_ETAPAS"
      );
    }

    const total = processo.etapas.length;

    const resultado = await prisma.$transaction(async (tx) => {
      const agora = new Date();

      await tx.processoLegalizacaoEtapa.update({
        where: { id: alvo.id },
        data: {
          situacao: SITUACAO_ETAPA.EM_ANDAMENTO,
          iniciadaEm: alvo.iniciadaEm ?? agora,
          concluidaEm: null,
          concluidaPor: null,
        },
      });

      await tx.processoLegalizacao.update({
        where: { id },
        data: { concluidoEm: null, etapaAtual: alvo.numero },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.TAREFA_REABERTA,
        de: "Processo encerrado",
        para: rotuloEtapa(alvo.numero, alvo.titulo, total),
        detalhe: motivo,
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
      etapaAtual: alvo.numero,
      etapaAtualTitulo: alvo.titulo,
      status: resultado.status.novo,
    });
  } catch (e) {
    console.error("[legalizacao][reabrir] falha ao reabrir processo:", e);
    return erro("Erro ao reabrir o processo.", 500);
  }
}
