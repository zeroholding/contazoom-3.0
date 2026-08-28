/**
 * Pendência (bloqueio) do processo de legalização.
 *
 * Bloqueio não é posição no fluxo, é estado: o processo continua na etapa 5 e
 * bloqueado ao mesmo tempo. É isso que permite ler "está na etapa 5, travado há
 * 12 dias esperando a Junta Comercial", que é a informação que resolve reunião.
 *
 * Em legalização o valor TERCEIRO é o mais usado: prazo de órgão público não é
 * controlável pelo escritório, e misturar essa espera com "cliente não mandou
 * documento" faria a cobrança bater na pessoa errada.
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
      select: {
        id: true,
        bloqueada: true,
        bloqueioMotivo: true,
        bloqueioDesde: true,
        concluidoEm: true,
      },
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
    // Uma pendência por vez: o schema guarda um único bloqueio ativo, e
    // sobrescrever apagaria desde quando o processo está travado — que é
    // justamente o número que cobra ação.
    if (processo.bloqueada) {
      return erro(
        "Já existe pendência ativa neste processo. Resolva a atual antes de registrar outra.",
        409,
        "BLOQUEIO_ATIVO"
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const agora = new Date();

      await tx.processoLegalizacao.update({
        where: { id },
        data: {
          bloqueada: true,
          bloqueioMotivo: motivo,
          bloqueioResponsavel: responsavel,
          bloqueioDesde: agora,
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

      const atualizado = await tx.processoLegalizacao.findUnique({
        where: { id },
      });

      return { processo: atualizado, status };
    });

    return NextResponse.json({
      processo: resultado.processo,
      status: resultado.status.novo,
    });
  } catch (e) {
    console.error("[legalizacao][bloqueio POST] falha ao registrar pendência:", e);
    return erro("Erro ao registrar a pendência.", 500);
  }
}

/* -------------------------------------------------------------------------- */
/*                        DELETE — resolve a pendência                        */
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
  const detalheInformado = textoLimpo(corpo.detalhe);

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      select: {
        id: true,
        bloqueada: true,
        bloqueioMotivo: true,
        bloqueioDesde: true,
        bloqueioResponsavel: true,
      },
    });
    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }
    if (!processo.bloqueada) {
      return erro(
        "Este processo não tem pendência ativa.",
        409,
        "SEM_BLOQUEIO_ATIVO"
      );
    }

    const agora = new Date();
    // A duração vai para o log porque o campo `bloqueioDesde` é limpo ao
    // resolver: sem isso, "travou 18 dias na Junta" desapareceria do histórico e
    // não haveria como medir onde o processo trava.
    const dias = diasEmBloqueio(processo.bloqueioDesde, agora);
    const partes = [
      dias === null
        ? "Duração não registrada"
        : `Pendência durou ${dias} ${dias === 1 ? "dia" : "dias"}`,
      processo.bloqueioResponsavel
        ? `aguardava: ${
            BLOQUEIO_RESPONSAVEL_LABEL[processo.bloqueioResponsavel] ??
            processo.bloqueioResponsavel
          }`
        : null,
      processo.bloqueioMotivo ? `motivo: ${processo.bloqueioMotivo}` : null,
      detalheInformado ? `resolução: ${detalheInformado}` : null,
    ].filter((p): p is string => Boolean(p));

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.processoLegalizacao.update({
        where: { id },
        data: {
          bloqueada: false,
          bloqueioMotivo: null,
          bloqueioResponsavel: null,
          bloqueioDesde: null,
        },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.BLOQUEIO_RESOLVIDO,
        de: processo.bloqueioResponsavel,
        detalhe: partes.join(" | "),
        sessao,
      });

      const status = await recalcularStatusProcesso(tx, id, sessao);

      const atualizado = await tx.processoLegalizacao.findUnique({
        where: { id },
      });

      return { processo: atualizado, status };
    });

    return NextResponse.json({
      processo: resultado.processo,
      status: resultado.status.novo,
      diasBloqueado: dias,
    });
  } catch (e) {
    console.error("[legalizacao][bloqueio DELETE] falha ao resolver pendência:", e);
    return erro("Erro ao resolver a pendência.", 500);
  }
}
