/** Abre a sessão ANTES de o navegador expandir o primeiro ZIP. */

import { NextRequest, NextResponse } from "next/server";
import { PAPEL, requirePapel } from "@/lib/api-guard";
import {
  ErroImportacaoFiscal,
  iniciarSessaoImportacao,
} from "@/lib/fiscal-xml-import";

export const runtime = "nodejs";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!empresaId || !UUID_V4.test(sessaoId)) {
    return NextResponse.json(
      { error: "Empresa ou sessão de importação inválida.", code: "SESSAO_INVALIDA" },
      { status: 400 },
    );
  }

  try {
    const resultado = await iniciarSessaoImportacao({
      sessaoId,
      empresaId,
      usuarioId: sessao.userId,
      usuarioNome: sessao.nome || sessao.email,
    });
    return NextResponse.json(resultado, { status: 201 });
  } catch (falha) {
    if (falha instanceof ErroImportacaoFiscal) {
      return NextResponse.json(
        { error: falha.message, code: falha.code },
        { status: falha.status },
      );
    }
    console.error("Erro ao iniciar sessão de importação:", falha);
    return NextResponse.json(
      { error: "Erro interno ao iniciar a importação." },
      { status: 500 },
    );
  }
}
