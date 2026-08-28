/**
 * Retorno de etapa: devolve o processo para a etapa aplicável anterior.
 *
 * Voltar etapa apaga trabalho já registrado (a conclusão anterior deixa de
 * valer), então o motivo é obrigatório e o assistente não faz isso — quem volta
 * etapa tem de responder por que.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno, podeRetornarEtapa, negado } from "@/lib/api-guard";
import { ACAO_LOG, SITUACAO_ETAPA } from "@/lib/tarefa-etapas";
import {
  etapaAnteriorAplicavel,
  etapaEmCurso,
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

  if (!podeRetornarEtapa(sessao.papel)) {
    return negado("Seu perfil não pode retornar etapa.");
  }

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  const motivo = textoLimpo(corpo.motivo);
  if (!motivo || motivo.length < MOTIVO_MINIMO) {
    return erro(
      "Informe o motivo do retorno de etapa.",
      400,
      "MOTIVO_OBRIGATORIO"
    );
  }

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
        "Processo encerrado. Reabra o processo antes de retornar etapa.",
        409,
        "PROCESSO_ENCERRADO"
      );
    }

    const numeroAtual = etapaEmCurso(processo.etapaAtual);
    const atual = processo.etapas.find((e) => e.numero === numeroAtual) ?? null;
    const anterior = etapaAnteriorAplicavel(processo.etapas, numeroAtual);
    if (!anterior) {
      return erro(
        "O processo já está na primeira etapa aplicável.",
        409,
        "PRIMEIRA_ETAPA"
      );
    }

    const total = processo.etapas.length;

    const resultado = await prisma.$transaction(async (tx) => {
      const agora = new Date();

      // A etapa que estava em curso volta a PENDENTE: ela não foi concluída, e
      // manter marca de início daria a entender que houve trabalho registrado.
      if (atual) {
        await tx.processoLegalizacaoEtapa.update({
          where: { id: atual.id },
          data: {
            situacao: SITUACAO_ETAPA.PENDENTE,
            iniciadaEm: null,
            concluidaEm: null,
            concluidaPor: null,
          },
        });
      }

      // A anterior volta para EM_ANDAMENTO e perde a conclusão: é exatamente o
      // que "refazer a etapa" significa.
      await tx.processoLegalizacaoEtapa.update({
        where: { id: anterior.id },
        data: {
          situacao: SITUACAO_ETAPA.EM_ANDAMENTO,
          iniciadaEm: anterior.iniciadaEm ?? agora,
          concluidaEm: null,
          concluidaPor: null,
        },
      });

      await tx.processoLegalizacao.update({
        where: { id },
        data: { etapaAtual: anterior.numero },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.ETAPA_RETORNADA,
        de: atual
          ? rotuloEtapa(atual.numero, atual.titulo, total)
          : String(numeroAtual),
        para: rotuloEtapa(anterior.numero, anterior.titulo, total),
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
      etapaAtual: anterior.numero,
      etapaAtualTitulo: anterior.titulo,
      status: resultado.status.novo,
    });
  } catch (e) {
    console.error("[legalizacao][voltar] falha ao retornar etapa:", e);
    return erro("Erro ao retornar a etapa.", 500);
  }
}
