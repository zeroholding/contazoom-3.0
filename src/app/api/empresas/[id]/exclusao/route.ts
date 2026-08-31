/**
 * Prévia da exclusão de uma empresa: o que seria destruído, sem destruir.
 *
 * GET /api/empresas/[id]/exclusao
 *
 * POR QUE UM GET SEPARADO, e não `DELETE ?dryRun=1`.
 *
 * O projeto já usa `?dryRun=1` em `abrir-mes`, e seria coerente repetir. Mas ali
 * o verbo é POST e o pior caso de perder o parâmetro é criar competências. Aqui o
 * verbo seria DELETE e o pior caso é APAGAR A EMPRESA — um proxy que corta a
 * query string, um retry, um copiar e colar sem o final da URL, e a prévia virou
 * exclusão. Um GET não tem esse jeito de dar errado.
 *
 * SOMENTE ADMIN, igual ao DELETE. A prévia conta quantas competências e quantos
 * anexos o cliente tem; é informação de dentro da casa, e quem não pode excluir
 * não tem por que consultá-la.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import {
  resumirExclusaoEmpresa,
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

    const resumo = await resumirExclusaoEmpresa(id);
    if (!resumo) {
      return NextResponse.json(
        { error: "Empresa não encontrada.", code: "nao_encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      tipo: resumo.tipo,
      alvoId: resumo.alvoId,
      descricao: resumo.descricao,
      detalhe: resumo.detalhe,
      // Só o que tem quantidade: "0 anexos" ocupa a largura de uma informação
      // sem ser uma, e numa lista de seis itens os zeros escondem os números que
      // decidem se a pessoa clica.
      contagens: resumo.contagens.filter((c) => c.quantidade > 0),
      arrastado: textoArrastado(resumo),
      temDependentes: temDependentes(resumo),
      avisos: resumo.avisos,
      /**
       * O texto que a pessoa vai ter de digitar para confirmar.
       *
       * SÓ EXIGIDO QUANDO A EMPRESA TEM ALGO PENDURADO. Empresa recém-cadastrada
       * por engano, sem competência e sem processo, não perde nada além de si
       * mesma — obrigar a digitar a razão social ali é atrito sem contrapartida, e
       * "cadastrei errado, quero apagar" é justamente o caso mais comum.
       *
       * Com competência ou processo atrelado, a digitação volta: aí o clique leva
       * histórico fiscal, etapas e anexos, e o que se quer é forçar a LEITURA do
       * nome — porque o erro real é apagar a empresa errada da lista.
       *
       * Vem do servidor porque é o servidor que compara, e é o servidor que
       * decide se exige. Se a tela montasse esse texto por conta própria —
       * juntando nome fantasia, aparando espaço de outro jeito — a confirmação
       * falharia por divergência de formatação e o operador leria isso como
       * sistema quebrado.
       */
      confirmacaoEsperada: temDependentes(resumo) ? resumo.descricao : undefined,
    });
  } catch (error) {
    console.error("Erro ao resumir exclusão de empresa:", error);
    return NextResponse.json(
      { error: "Erro interno ao consultar a exclusão." },
      { status: 500 }
    );
  }
}
