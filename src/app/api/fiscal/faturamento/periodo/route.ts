/** GET /api/fiscal/faturamento/periodo?empresaId=&fim=AAAA-MM */

import { NextRequest, NextResponse } from "next/server";
import { requireInterno } from "@/lib/api-guard";
import {
  ErroDeclaracaoFaturamento,
  carregarPeriodo,
} from "@/lib/declaracao-faturamento";

export const runtime = "nodejs";

const erro = (
  mensagem: string,
  status: number,
  code?: string,
  detalhes?: Record<string, unknown>,
) => NextResponse.json({ error: mensagem, code, ...detalhes }, { status });

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const params = new URL(req.url).searchParams;
  const empresaId = (params.get("empresaId") ?? "").trim();
  const fim = (params.get("fim") ?? "").trim();
  if (!empresaId) return erro("Informe a empresa.", 400, "EMPRESA_OBRIGATORIA");
  if (!fim) return erro("Informe o mês final.", 400, "PERIODO_OBRIGATORIO");

  try {
    return NextResponse.json(await carregarPeriodo(empresaId, fim));
  } catch (falha) {
    if (falha instanceof ErroDeclaracaoFaturamento) {
      return erro(falha.message, falha.status, falha.code, falha.detalhes);
    }
    console.error("Erro ao carregar período de faturamento:", falha);
    return erro("Erro interno ao carregar o período.", 500);
  }
}
