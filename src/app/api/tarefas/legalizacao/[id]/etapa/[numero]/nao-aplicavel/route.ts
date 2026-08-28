/**
 * Marca uma etapa OPCIONAL como não aplicável.
 *
 * Só etapa opcional: nas aberturas de CNPJ, "Inscrição estadual" não vale para
 * prestador de serviço, e a alternativa seria o operador concluir uma etapa que
 * não aconteceu — o que transformaria o histórico em ficção. Etapa obrigatória
 * nunca é dispensada por aqui; se o fluxo estiver errado, o fluxo muda.
 *
 * Marcar não aplicável também não renumera nada: a etapa continua existindo com
 * o seu número, e o avanço a pula.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno, podeConcluirEtapa, negado } from "@/lib/api-guard";
import {
  ACAO_LOG,
  RESPONSAVEL_LABEL,
  SITUACAO_ETAPA,
} from "@/lib/tarefa-etapas";
import {
  etapaEmCurso,
  lerCorpo,
  proximaEtapaAplicavel,
  recalcularStatusProcesso,
  registrarLogProcesso,
  rotuloEtapa,
  textoLimpo,
} from "@/lib/legalizacao-service";

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error: mensagem, code } : { error: mensagem }, {
    status,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; numero: string }> }
) {
  const { id, numero } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const numeroEtapa = Number(numero);
  if (!Number.isInteger(numeroEtapa) || numeroEtapa < 1) {
    return erro("Número de etapa inválido.", 400, "ETAPA_INVALIDA");
  }

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");
  const motivo = textoLimpo(corpo.motivo);

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
        "Processo encerrado. Reabra o processo para movimentar etapas.",
        409,
        "PROCESSO_ENCERRADO"
      );
    }

    const etapa = processo.etapas.find((e) => e.numero === numeroEtapa);
    if (!etapa) {
      return erro(
        `O processo não tem etapa ${numeroEtapa}.`,
        404,
        "ETAPA_NAO_ENCONTRADA"
      );
    }

    if (!etapa.opcional) {
      return erro(
        `A etapa ${etapa.numero} (${etapa.titulo}) é obrigatória no fluxo e não pode ser marcada como não aplicável.`,
        409,
        "ETAPA_OBRIGATORIA"
      );
    }

    if (etapa.situacao === SITUACAO_ETAPA.CONCLUIDA) {
      return erro(
        `A etapa ${etapa.numero} já foi concluída.`,
        409,
        "ETAPA_JA_CONCLUIDA"
      );
    }

    if (etapa.situacao === SITUACAO_ETAPA.NAO_APLICAVEL) {
      return erro(
        `A etapa ${etapa.numero} já está marcada como não aplicável.`,
        409,
        "ETAPA_JA_NAO_APLICAVEL"
      );
    }

    // Mesma permissão de concluir: dispensar etapa é decisão de quem executa.
    if (!podeConcluirEtapa(sessao.papel, etapa.responsavelTipo)) {
      return negado(
        `Esta etapa é de responsabilidade de ${
          RESPONSAVEL_LABEL[etapa.responsavelTipo] ?? etapa.responsavelTipo
        }. Seu perfil não pode dispensá-la.`
      );
    }

    const total = processo.etapas.length;
    const eraAEtapaEmCurso = etapaEmCurso(processo.etapaAtual) === etapa.numero;
    const proxima = eraAEtapaEmCurso
      ? proximaEtapaAplicavel(processo.etapas, etapa.numero)
      : null;

    const resultado = await prisma.$transaction(async (tx) => {
      const agora = new Date();

      await tx.processoLegalizacaoEtapa.update({
        where: { id: etapa.id },
        data: {
          situacao: SITUACAO_ETAPA.NAO_APLICAVEL,
          concluidaEm: agora,
          concluidaPor: sessao.userId,
          ...(motivo ? { observacao: motivo } : {}),
        },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.ETAPA_NAO_APLICAVEL,
        para: rotuloEtapa(etapa.numero, etapa.titulo, total),
        detalhe: motivo,
        sessao,
      });

      // Só avança se a etapa dispensada era a que estava em curso. Dispensar
      // uma etapa futura não deve mover o processo.
      if (proxima) {
        await tx.processoLegalizacaoEtapa.update({
          where: { id: proxima.id },
          data: {
            situacao: SITUACAO_ETAPA.EM_ANDAMENTO,
            iniciadaEm: proxima.iniciadaEm ?? agora,
          },
        });
        await tx.processoLegalizacao.update({
          where: { id },
          data: { etapaAtual: proxima.numero },
        });
        await registrarLogProcesso(tx, {
          processoId: id,
          acao: ACAO_LOG.ETAPA_AVANCADA,
          de: String(etapa.numero),
          para: rotuloEtapa(proxima.numero, proxima.titulo, total),
          sessao,
        });
      }

      const status = await recalcularStatusProcesso(tx, id, sessao);

      const atualizado = await tx.processoLegalizacao.findUnique({
        where: { id },
        include: { etapas: { orderBy: { numero: "asc" } } },
      });

      return { processo: atualizado, status };
    });

    return NextResponse.json({
      processo: resultado.processo,
      etapaDispensada: etapa.numero,
      proximaEtapa: proxima
        ? { numero: proxima.numero, titulo: proxima.titulo }
        : null,
      status: resultado.status.novo,
    });
  } catch (e) {
    console.error("[legalizacao][nao-aplicavel] falha ao dispensar etapa:", e);
    return erro("Erro ao marcar a etapa como não aplicável.", 500);
  }
}
