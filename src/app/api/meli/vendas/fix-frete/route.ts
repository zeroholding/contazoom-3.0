import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const vendas = await prisma.meliVenda.findMany({
      select: {
        orderId: true,
        frete: true,
        rawData: true,
        conta: true,
        dataVenda: true
      }
    });

    let updatedCount = 0;
    const logs: string[] = [];

    const CHUNK_SIZE = 500;
    
    for (let i = 0; i < vendas.length; i += CHUNK_SIZE) {
      const chunk = vendas.slice(i, i + CHUNK_SIZE);
      const updates = [];

      for (const venda of chunk) {
        const rawData = venda.rawData as any;
        const freightData = rawData?.freight || {};
        
        let correctFrete = 0;
        
        if (freightData.adjustedCost !== undefined && freightData.adjustedCost !== null) {
          correctFrete = Number(freightData.adjustedCost);
        } else {
          // If adjustedCost is missing in rawData, fallback to old logic
          continue;
        }

        const currentFrete = Number(venda.frete);
        
        // If there's a difference of more than 1 cent, update it
        if (Math.abs(currentFrete - correctFrete) > 0.01) {
          updates.push(
            prisma.meliVenda.update({
              where: { orderId: venda.orderId },
              data: { frete: correctFrete }
            })
          );
          
          if (updatedCount < 20) {
            logs.push(`Venda ${venda.orderId} (${venda.dataVenda.toISOString().split('T')[0]}): Frete DB ${currentFrete} -> Recalculado ${correctFrete}`);
          }
          updatedCount++;
        }
      }

      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Corrigidas ${updatedCount} vendas com base no rawData.freight.adjustedCost!`,
      logs: logs
    });

  } catch (error: any) {
    console.error("Erro no fix-frete:", error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
