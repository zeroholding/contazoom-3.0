/** Encerra como parcial uma sessão cujo ZIP/lote falhou no navegador. */

import { NextRequest, NextResponse } from "next/server";
import { PAPEL, requirePapel } from "@/lib/api-guard";
import {
  ErroImportacaoFiscal,
  encerrarSessaoImportacao,
} from "@/lib/fiscal-xml-import";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sessao = await requirePapel(req, [
    PAPEL.ADMIN,
    PAPEL.CONTABIL,
    PAPEL.CONTABIL_ASSISTENTE,
  ]);
  if (sessao instanceof NextResponse) return sessao;

  const corpo = await req.json().catch(() => null);
  const empresaId =
    corpo && typeof corpo.empresaId === "string" ? corpo.empresaId.trim() : "";
  const sessaoId =
    corpo && typeof corpo.sessaoId === "string" ? corpo.sessaoId.trim() : "";
  const desfecho =
    corpo && typeof corpo.desfecho === "string" ? corpo.desfecho.trim() : "";

  if (
    !empresaId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessaoId)
  ) {
    return NextResponse.json(
      { error: "Empresa ou sessão de importação inválida.", code: "SESSAO_INVALIDA" },
      { status: 400 },
    );
  }
  if (desfecho !== "ABORTAR") {
    return NextResponse.json(
      {
        error:
          "Desfecho inválido. O sucesso é encerrado pelo último lote; este endpoint serve apenas para abortar uma seleção interrompida.",
        code: "DESFECHO_INVALIDO",
      },
      { status: 400 },
    );
  }

  try {
    await encerrarSessaoImportacao({
      sessaoId,
      empresaId,
      usuarioId: sessao.userId,
      desfecho,
    });
    return NextResponse.json({ ok: true });
  } catch (falha) {
    if (falha instanceof ErroImportacaoFiscal) {
      return NextResponse.json(
        { error: falha.message, code: falha.code },
        { status: falha.status },
      );
    }
    console.error("Erro ao encerrar sessão de importação:", falha);
    return NextResponse.json(
      { error: "Erro interno ao encerrar a importação." },
      { status: 500 },
    );
  }
}
