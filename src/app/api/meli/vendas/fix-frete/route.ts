import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Buscar todas as vendas Flex que estão com frete positivo (bugadas)
    const vendas = await prisma.meliVenda.findMany({
      where: {
        logisticType: { in: ["self_service", "FLEX"] },
        frete: { gt: 0 }
      }
    });

    let atualizados = 0;
    const logs = [];

    for (const venda of vendas) {
      const freteAtual = Number(venda.frete);
      const valorTotal = Number(venda.valorTotal);
      
      let novoFrete: number;

      if (valorTotal >= 79) {
        // Se >= 79, o valor positivo salvo deveria ser negativo (o custo cobrado)
        novoFrete = -freteAtual;
      } else {
        // Se < 79, o valor positivo salvo era o repasse, que deve ser net 0
        novoFrete = 0;
      }

      // Recalcular margem
      const taxaPlataforma = Number(venda.taxaPlataforma || 0);
      const cmv = Number(venda.cmv || 0);
      const novaMargem = valorTotal + taxaPlataforma + novoFrete - cmv;

      await prisma.meliVenda.update({
        where: { id: venda.id },
        data: {
          frete: novoFrete,
          margemContribuicao: novaMargem
        }
      });

      atualizados++;
      logs.push(`Venda ${venda.orderId} (Total: ${valorTotal}): Frete antigo = ${freteAtual}, Novo Frete = ${novoFrete}`);
    }

    return NextResponse.json({
      success: true,
      message: `Tudo corrigido! Total de vendas com frete atualizado: ${atualizados}`,
      logs
    });

  } catch (error) {
    console.error("Erro ao consertar fretes:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
