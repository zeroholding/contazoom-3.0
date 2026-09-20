/**
 * GET  /api/fiscal/declaracao?empresaId=  — lista emissões
 * POST /api/fiscal/declaracao             — emite e congela 12 meses
 */

import { NextRequest, NextResponse } from "next/server";
import { PAPEL, requireInterno, requirePapel } from "@/lib/api-guard";
import prisma from "@/lib/prisma";
import {
  ErroDeclaracaoFaturamento,
  emitirDeclaracao,
  serializarDeclaracao,
} from "@/lib/declaracao-faturamento";

export const runtime = "nodejs";

const erro = (
  mensagem: string,
  status: number,
  code?: string,
  detalhes?: Record<string, unknown>,
) => NextResponse.json({ error: mensagem, code, ...detalhes }, { status });

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const empresaId = texto(new URL(req.url).searchParams.get("empresaId"));
  if (!empresaId) return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");

  const declaracoes = await prisma.declaracaoFaturamento.findMany({
    where: { empresaId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({
    declaracoes: declaracoes.map(serializarDeclaracao),
  });
}

export async function POST(req: NextRequest) {
  const sessao = await requirePapel(req, [PAPEL.ADMIN, PAPEL.CONTABIL]);
  if (sessao instanceof NextResponse) return sessao;

  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") {
    return erro("Corpo inválido.", 400, "CORPO_INVALIDO");
  }

  const dados = corpo as Record<string, unknown>;
  const empresaId = texto(dados.empresaId);
  const fim = texto(dados.fim);
  const finalidade = texto(dados.finalidade);
  const idempotencyKey = texto(dados.idempotencyKey);

  if (!empresaId) return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");
  if (!fim) return erro("Informe o mês final.", 400, "PERIODO_OBRIGATORIO");
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey)) {
    return erro("Chave de emissão inválida.", 400, "IDEMPOTENCIA_INVALIDA");
  }
  if (finalidade && finalidade.length > 300) {
    return erro("A finalidade pode ter no máximo 300 caracteres.", 400, "FINALIDADE_GRANDE");
  }

  try {
    const resultado = await emitirDeclaracao({
      empresaId,
      fim,
      finalidade,
      idempotencyKey,
      usuarioId: sessao.userId,
      usuarioNome: sessao.nome || sessao.email,
    });
    return NextResponse.json(resultado, { status: resultado.jaExistia ? 200 : 201 });
  } catch (falha) {
    if (falha instanceof ErroDeclaracaoFaturamento) {
      return erro(falha.message, falha.status, falha.code, falha.detalhes);
    }
    console.error("Erro ao emitir declaração de faturamento:", falha);
    return erro("Erro interno ao emitir a declaração.", 500);
  }
}
