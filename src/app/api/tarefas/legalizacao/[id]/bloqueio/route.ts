/**
 * Pendências (bloqueios) do processo de legalização.
 *
 * POST   /api/tarefas/legalizacao/[id]/bloqueio — registra UMA pendência
 * DELETE /api/tarefas/legalizacao/[id]/bloqueio — resolve UMA pendência
 *         (corpo com `pendenciaId`; `detalhe` da resolução é opcional)
 *
 * Bloqueio não é posição no fluxo, é estado: o processo continua na etapa 5 e
 * bloqueado ao mesmo tempo. É isso que permite ler "está na etapa 5, travado há
 * 12 dias esperando a Junta Comercial", que é a informação que resolve reunião.
 *
 * Várias pendências coexistem e são INDEPENDENTES: cada uma tem motivo,
 * responsável e contagem de dias próprios. Resolver uma não resolve as outras —
 * o processo só destrava quando a última for resolvida.
 *
 * Em legalização o valor TERCEIRO é o mais usado: prazo de órgão público não é
 * controlável pelo escritório, e misturar essa espera com "cliente não mandou
 * documento" faria a cobrança bater na pessoa errada. Por isso o responsável é
 * por pendência, não por processo.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno, podeGerenciarBloqueio, negado } from "@/lib/api-guard";
import {
  ACAO_LOG,
  BLOQUEIO_RESPONSAVEIS_VALIDOS,
  BLOQUEIO_RESPONSAVEL_LABEL,
} from "@/lib/tarefa-etapas";
import { diasEmBloqueio } from "@/lib/tarefa-status";
import {
  lerCorpo,
  recalcularStatusProcesso,
  registrarLogProcesso,
  textoLimpo,
} from "@/lib/legalizacao-service";

const MOTIVO_MINIMO = 3;

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error: mensagem, code } : { error: mensagem }, {
    status,
  });
}

/* -------------------------------------------------------------------------- */
/*                          POST — registra pendência                         */
/* -------------------------------------------------------------------------- */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;
  if (!podeGerenciarBloqueio(sessao.papel)) {
    return negado("Seu perfil não pode registrar pendência.");
  }

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  const motivo = textoLimpo(corpo.motivo);
  if (!motivo || motivo.length < MOTIVO_MINIMO) {
    return erro("Informe o motivo da pendência.", 400, "MOTIVO_OBRIGATORIO");
  }

  const responsavel = textoLimpo(corpo.responsavel);
  if (!responsavel) {
    return erro(
      "Informe de quem se espera a resolução (responsavel).",
      400,
      "RESPONSAVEL_OBRIGATORIO"
    );
  }
  if (!BLOQUEIO_RESPONSAVEIS_VALIDOS.includes(responsavel)) {
    return erro(
      `Responsável pela pendência inválido: ${responsavel}. Valores aceitos: ${BLOQUEIO_RESPONSAVEIS_VALIDOS.join(
        ", "
      )} (use TERCEIRO quando a espera é de órgão público).`,
      400,
      "RESPONSAVEL_INVALIDO"
    );
  }

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      select: { id: true, concluidoEm: true },
    });
    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }
    if (processo.concluidoEm) {
      return erro(
        "Processo encerrado não recebe pendência.",
        409,
        "PROCESSO_ENCERRADO"
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const agora = new Date();

      // Pendências são independentes: registrar uma nova nunca exige resolver
      // as anteriores. `bloqueada` e status macro são sincronizados pelo
      // recálculo, dentro desta mesma transação.
      const pendencia = await tx.processoLegalizacaoPendencia.create({
        data: {
          processoId: id,
          motivo,
          responsavel,
          desde: agora,
        },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.BLOQUEIO_REGISTRADO,
        para: BLOQUEIO_RESPONSAVEL_LABEL[responsavel] ?? responsavel,
        detalhe: motivo,
        sessao,
      });

      const status = await recalcularStatusProcesso(tx, id, sessao);

      const abertas = await tx.processoLegalizacaoPendencia.count({
        where: { processoId: id, resolvidaEm: null },
      });

      return { pendencia, status, abertas };
    });

    return NextResponse.json({
      pendencia: resultado.pendencia,
      status: resultado.status.novo,
      pendenciasAbertas: resultado.abertas,
    });
  } catch (e) {
    console.error("[legalizacao][bloqueio POST] falha ao registrar pendência:", e);
    return erro("Erro ao registrar a pendência.", 500);
  }
}

/* -------------------------------------------------------------------------- */
/*                        DELETE — resolve UMA pendência                      */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;
  if (!podeGerenciarBloqueio(sessao.papel)) {
    return negado("Seu perfil não pode resolver pendência.");
  }

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  const pendenciaId = textoLimpo(corpo.pendenciaId);
  if (!pendenciaId) {
    return erro(
      "Informe qual pendência resolver (pendenciaId).",
      400,
      "PENDENCIA_OBRIGATORIA"
    );
  }
  const detalheInformado = textoLimpo(corpo.detalhe);

  try {
    const pendencia = await prisma.processoLegalizacaoPendencia.findUnique({
      where: { id: pendenciaId },
      select: {
        id: true,
        processoId: true,
        motivo: true,
        responsavel: true,
        desde: true,
        resolvidaEm: true,
      },
    });
    if (!pendencia || pendencia.processoId !== id) {
      return erro("Pendência não encontrada neste processo.", 404, "PENDENCIA_NAO_ENCONTRADA");
    }
    if (pendencia.resolvidaEm) {
      return erro("Esta pendência já foi resolvida.", 409, "PENDENCIA_JA_RESOLVIDA");
    }

    const agora = new Date();
    // A duração vai para o log junto do detalhe: é o que permite medir onde o
    // processo trava, pendência a pendência.
    const dias = diasEmBloqueio(pendencia.desde, agora);
    const partes = [
      dias === null
        ? "Duração não registrada"
        : `Pendência durou ${dias} ${dias === 1 ? "dia" : "dias"}`,
      `aguardava: ${
        BLOQUEIO_RESPONSAVEL_LABEL[pendencia.responsavel] ?? pendencia.responsavel
      }`,
      `motivo: ${pendencia.motivo}`,
      detalheInformado ? `resolução: ${detalheInformado}` : null,
    ].filter((p): p is string => Boolean(p));

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.processoLegalizacaoPendencia.update({
        where: { id: pendencia.id },
        data: {
          resolvidaEm: agora,
          resolucaoDetalhe: detalheInformado,
        },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.BLOQUEIO_RESOLVIDO,
        de: pendencia.responsavel,
        detalhe: partes.join(" | "),
        sessao,
      });

      // Recalcular é o que destrava o processo quando esta era a última
      // pendência — e o mantém travado quando ainda restam outras.
      const status = await recalcularStatusProcesso(tx, id, sessao);

      const abertas = await tx.processoLegalizacaoPendencia.count({
        where: { processoId: id, resolvidaEm: null },
      });

      return { status, abertas };
    });

    return NextResponse.json({
      status: resultado.status.novo,
      diasBloqueado: dias,
      pendenciasAbertas: resultado.abertas,
    });
  } catch (e) {
    console.error("[legalizacao][bloqueio DELETE] falha ao resolver pendência:", e);
    return erro("Erro ao resolver a pendência.", 500);
  }
}
