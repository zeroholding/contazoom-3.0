import { NextRequest, NextResponse } from "next/server";
import {
  PAPEL,
  PAPEIS_INTERNOS,
  PAPEL_LABEL,
  requireSessao,
} from "@/lib/api-guard";

/**
 * GET /api/admin/check
 *
 * A sessão e o usuário são resolvidos uma única vez pelo guard. O guard mantém
 * o atalho de ADMIN_EMAIL e o cache curto de papel, enquanto a rota preserva o
 * contrato 200 usado pelo cliente quando não há sessão.
 */
export async function GET(req: NextRequest) {
  const sessao = await requireSessao(req);
  if (sessao instanceof NextResponse) {
    return NextResponse.json({ isAdmin: false, papel: null, interno: false });
  }

  const papel = sessao.papel;
  const isAdmin = papel === PAPEL.ADMIN;

  return NextResponse.json({
    isAdmin,
    papel,
    papelLabel: PAPEL_LABEL[papel] ?? papel,
    interno: isAdmin || PAPEIS_INTERNOS.includes(papel),
  });
}
