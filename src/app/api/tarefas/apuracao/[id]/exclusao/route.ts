/**
 * Prévia da exclusão de uma competência: o que seria destruído, sem destruir.
 *
 * GET /api/tarefas/apuracao/[id]/exclusao
 *
 * GET separado em vez de `DELETE ?dryRun=1` pelo mesmo motivo da empresa: num
 * DELETE, perder a query string — proxy, retry, copiar a URL sem o final — deixa
 * de ser prévia e passa a ser exclusão. Um GET não tem esse jeito de dar errado.
 *
 * SOMENTE ADMIN, igual ao DELETE: quem não pode excluir não precisa da prévia.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import {
  resumirExclusaoApuracao,
  temDependentes,
  textoArrastado,
} from "@/lib/exclusao";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireAdmin(req);
  if (sessao instanceof NextResponse) return sessao;

  try {
    const { id } = await params;

    const resumo = await resumirExclusaoApuracao(id);
    if (!resumo) {
      return NextResponse.json(
        { error: "Competência não encontrada.", code: "nao_encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      tipo: resumo.tipo,
      alvoId: resumo.alvoId,
      descricao: resumo.descricao,
      detalhe: resumo.detalhe,
      // Contagem zero fica fora: numa lista curta, o zero ocupa a largura de uma
      // informação sem ser uma.
      contagens: resumo.contagens.filter((c) => c.quantidade > 0),
      arrastado: textoArrastado(resumo),
      temDependentes: temDependentes(resumo),
      // Aqui entra o aviso de competência encerrada. Ele informa, não bloqueia.
      avisos: resumo.avisos,
    });
  } catch (error) {
    console.error("Erro ao resumir exclusão de competência:", error);
    return NextResponse.json(
      { error: "Erro interno ao consultar a exclusão." },
      { status: 500 }
    );
  }
}
