import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";
import { PAPEIS_INTERNOS, PAPEL_LABEL, requireSessao } from "@/lib/api-guard";

/**
 * GET /api/admin/check
 *
 * `isAdmin` continua exatamente como era, calculado por `checkIsAdmin`, e a rota
 * continua respondendo 200 com `false` quando não há sessão (o `Sidebar` conta
 * com isso e cacheia o resultado por aba).
 *
 * O que foi ADICIONADO: `papel` e `interno`. O módulo de tarefas liberou acesso
 * para Comercial, Contabilidade e Assistente contábil, e nenhum desses é ADMIN.
 * Sem estes campos o `Sidebar` não teria como mostrar a entrada do módulo para
 * eles, e um comercial ficaria sem caminho até uma área que ele pode usar.
 *
 * Campos novos, nenhum removido: quem só lê `isAdmin` não percebe diferença.
 */
export async function GET(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) {
    return NextResponse.json({ isAdmin: false, papel: null, interno: false });
  }

  const isAdmin = await checkIsAdmin(session.email, session.sub);

  // O papel vem do guard porque ele usa o singleton do Prisma e tem cache curto.
  const sessao = await requireSessao(req);
  const papel = sessao instanceof NextResponse ? null : sessao.papel;

  return NextResponse.json({
    isAdmin,
    papel,
    papelLabel: papel ? PAPEL_LABEL[papel] ?? papel : null,
    // Administrador é interno por definição, mesmo se o papel vier de ADMIN_EMAIL.
    interno: isAdmin || (!!papel && PAPEIS_INTERNOS.includes(papel)),
  });
}
