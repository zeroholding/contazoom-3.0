import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Busca todas as contas da Shopee cadastradas
    const contas = await prisma.shopeeAccount.findMany({
      select: {
        id: true,
        shop_id: true,
        shop_name: true,
      }
    });

    let totalAtualizado = 0;

    // Para cada conta, atualiza todas as vendas associadas
    for (const conta of contas) {
      const nomeAmigavel = conta.shop_name ?? conta.shop_id;
      
      const updateResult = await prisma.shopeeVenda.updateMany({
        where: { shopeeAccountId: conta.id },
        data: { conta: nomeAmigavel }
      });

      totalAtualizado += updateResult.count;
    }

    return NextResponse.json({
      success: true,
      message: `As contas foram corrigidas com sucesso! Total de vendas atualizadas: ${totalAtualizado}`,
      contas: contas.map(c => ({ shop_id: c.shop_id, shop_name: c.shop_name }))
    });

  } catch (error) {
    console.error("Erro ao consertar contas da Shopee:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
