/** GET /api/fiscal/declaracao/[id] — snapshot imutável da declaração. */

import { NextRequest, NextResponse } from "next/server";
import { requireInterno } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import { serializarDeclaracao } from "@/lib/declaracao-faturamento";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const { id } = await params;
  const declaracao = await prisma.declaracaoFaturamento.findUnique({
    where: { id },
    include: { substituidaPor: { select: { protocolo: true } } },
  });
  if (!declaracao) {
    return NextResponse.json(
      { error: "Declaração não encontrada.", code: "NAO_ENCONTRADA" },
      { status: 404 },
    );
  }

  const resposta = serializarDeclaracao(declaracao);
  if (!resposta.integridadeOk) {
    console.error(`[FISCAL] Hash da declaração ${declaracao.protocolo} não confere.`);
    return NextResponse.json(
      {
        error: "O conteúdo da declaração não confere com o snapshot emitido.",
        code: "DECLARACAO_CORROMPIDA",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ declaracao: resposta });
}
