/**
 * Prévia da exclusão de um processo de legalização: o que seria destruído, sem
 * destruir.
 *
 * GET /api/tarefas/legalizacao/[id]/exclusao
 *
 * GET separado em vez de `DELETE ?dryRun=1` pelo mesmo motivo das outras duas:
 * num DELETE, perder a query string deixa de ser prévia e passa a ser exclusão.
 *
 * SOMENTE ADMIN, igual ao DELETE.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import {
  resumirExclusaoProcesso,
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

    const resumo = await resumirExclusaoProcesso(id);
    if (!resumo) {
      return NextResponse.json(
        { error: "Processo não encontrado.", code: "nao_encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      tipo: resumo.tipo,
      alvoId: resumo.alvoId,
      descricao: resumo.descricao,
      detalhe: resumo.detalhe,
      contagens: resumo.contagens.filter((c) => c.quantidade > 0),
      arrastado: textoArrastado(resumo),
      temDependentes: temDependentes(resumo),
      // Aqui entra o aviso de protocolo em órgão externo: apagar daqui não
      // cancela nada na JUCESP.
      avisos: resumo.avisos,
    });
  } catch (error) {
    console.error("Erro ao resumir exclusão de processo:", error);
    return NextResponse.json(
      { error: "Erro interno ao consultar a exclusão." },
      { status: 500 }
    );
  }
}
