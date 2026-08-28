/**
 * Protocolo e órgão externo do processo.
 *
 * Campo próprio, não observação: é o primeiro dado que o cliente pergunta ("qual
 * o número do protocolo?"), precisa ser exibível, copiável e pesquisável na
 * lista. Enterrado em texto livre, ninguém acha e ninguém filtra por ele.
 *
 * Aceita atualização mesmo com o processo encerrado, de propósito: o número vem
 * do órgão e às vezes chega depois. É registro de fato, não movimento de fluxo.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";
import {
  ACAO_LOG,
  ORGAOS_EXTERNOS_VALIDOS,
  ORGAO_EXTERNO_LABEL,
} from "@/lib/tarefa-etapas";
import {
  lerCorpo,
  registrarLogProcesso,
  textoLimpo,
} from "@/lib/legalizacao-service";

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error: mensagem, code } : { error: mensagem }, {
    status,
  });
}

/** "1234567890 (Junta Comercial)" — formato único para os dois lados do log. */
function descrever(
  protocolo: string | null,
  orgao: string | null
): string {
  const orgaoLabel = orgao ? ORGAO_EXTERNO_LABEL[orgao] ?? orgao : null;
  if (!protocolo && !orgaoLabel) return "sem protocolo";
  if (!orgaoLabel) return protocolo as string;
  if (!protocolo) return `sem protocolo (${orgaoLabel})`;
  return `${protocolo} (${orgaoLabel})`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const corpo = await lerCorpo(req);
  if (!corpo) return erro("Corpo da requisição inválido.", 400, "CORPO_INVALIDO");

  const alteraProtocolo = "protocoloExterno" in corpo;
  const alteraOrgao = "orgaoExterno" in corpo;
  if (!alteraProtocolo && !alteraOrgao) {
    return erro(
      "Informe protocoloExterno e/ou orgaoExterno.",
      400,
      "NADA_A_ALTERAR"
    );
  }

  const protocoloNovo = alteraProtocolo ? textoLimpo(corpo.protocoloExterno) : null;
  const orgaoNovo = alteraOrgao ? textoLimpo(corpo.orgaoExterno) : null;

  // Órgão vazio limpa o campo; órgão preenchido tem de ser um dos conhecidos,
  // senão a lista deixa de poder filtrar e agrupar por órgão.
  if (alteraOrgao && orgaoNovo && !ORGAOS_EXTERNOS_VALIDOS.includes(orgaoNovo)) {
    return erro(
      `Órgão externo inválido: ${orgaoNovo}. Valores aceitos: ${ORGAOS_EXTERNOS_VALIDOS.join(
        ", "
      )}.`,
      400,
      "ORGAO_INVALIDO"
    );
  }

  try {
    const processo = await prisma.processoLegalizacao.findUnique({
      where: { id },
      select: { id: true, protocoloExterno: true, orgaoExterno: true },
    });
    if (!processo) {
      return erro("Processo não encontrado.", 404, "PROCESSO_NAO_ENCONTRADO");
    }

    const protocoloFinal = alteraProtocolo
      ? protocoloNovo
      : processo.protocoloExterno;
    const orgaoFinal = alteraOrgao ? orgaoNovo : processo.orgaoExterno;

    if (
      protocoloFinal === processo.protocoloExterno &&
      orgaoFinal === processo.orgaoExterno
    ) {
      return NextResponse.json({
        processo,
        alterado: false,
      });
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      const registro = await tx.processoLegalizacao.update({
        where: { id },
        data: {
          protocoloExterno: protocoloFinal,
          orgaoExterno: orgaoFinal,
        },
      });

      await registrarLogProcesso(tx, {
        processoId: id,
        acao: ACAO_LOG.PROTOCOLO_ATUALIZADO,
        de: descrever(processo.protocoloExterno, processo.orgaoExterno),
        para: descrever(protocoloFinal, orgaoFinal),
        sessao,
      });

      return registro;
    });

    return NextResponse.json({ processo: atualizado, alterado: true });
  } catch (e) {
    console.error("[legalizacao][protocolo] falha ao gravar protocolo:", e);
    return erro("Erro ao gravar o protocolo.", 500);
  }
}
