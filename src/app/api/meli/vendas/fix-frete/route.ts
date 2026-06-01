import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Buscar vendas do Mercado Livre do dia atual (ou todas pra garantir)
    const vendas = await prisma.meliVenda.findMany({
      where: {
        freteCalculation: { not: null }
      }
    });

    let atualizados = 0;
    const logs = [];

    for (const venda of vendas) {
      if (!venda.freteCalculation) continue;

      const calc = venda.freteCalculation as any;
      const logisticType = calc.logisticType;
      const totalAmount = calc.totalAmount;
      const chargedCost = calc.chargedCost;
      const optCost = calc.shippingOptionCost;
      const baseCost = calc.baseCost;
      const shipCost = calc.shipmentCost;
      const listCost = calc.listCost;

      let adjustedCost: number | null = null;
      let mudou = false;

      // Nova lógica do Flex (self_service / FLEX)
      if (logisticType === "self_service" || logisticType === "FLEX") {
        const totalAmountNum = Number(totalAmount) || 0;
        if (totalAmountNum >= 79) {
          if (chargedCost !== null && chargedCost > 0) {
            adjustedCost = -chargedCost; // AGORA NEGATIVO
          } else {
            adjustedCost = 0;
          }
        } else {
          // FLEX < 79 é pass-through (Zero)
          adjustedCost = 0;
        }

        // Atualizar se for diferente
        if (adjustedCost !== null && Number(venda.frete) !== adjustedCost) {
          await prisma.meliVenda.update({
            where: { id: venda.id },
            data: {
              frete: adjustedCost,
              margemContribuicao: Number(venda.valorTotal) + Number(venda.taxaPlataforma || 0) + adjustedCost - Number(venda.cmv || 0)
            }
          });
          atualizados++;
          logs.push(`Venda ${venda.orderId} (Flex): Frete antigo = ${venda.frete}, Novo = ${adjustedCost}`);
          mudou = true;
        }
      }
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
