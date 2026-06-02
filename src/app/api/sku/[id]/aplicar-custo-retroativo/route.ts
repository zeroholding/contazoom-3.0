import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const session = await verifySessionToken(sessionCookie);

    const { id } = await params;

    // Verificar se o SKU pertence ao usuário
    const skuObj = await prisma.sKU.findUnique({
      where: { id },
    });

    if (!skuObj || skuObj.userId !== session.sub) {
      return NextResponse.json({ error: "SKU não encontrado" }, { status: 404 });
    }

    const custoUnitario = Number(skuObj.custoUnitario);
    
    if (isNaN(custoUnitario) || custoUnitario <= 0) {
      return NextResponse.json({ error: "Custo do SKU inválido ou zero." }, { status: 400 });
    }

    let vendasAtualizadas = 0;

    // Função auxiliar para recalcular a margem
    const recalcularMargem = (valorTotal: any, taxaPlataforma: any, frete: any, cmv: number) => {
      const vTotal = valorTotal ? Number(valorTotal) : 0;
      const vTaxa = taxaPlataforma ? Number(taxaPlataforma) : 0;
      const vFrete = frete ? Number(frete) : 0;
      // Taxas e fretes costumam ser salvos como negativos, mas por garantia usamos a soma (se estiverem negativos)
      return vTotal + vTaxa + vFrete - cmv;
    };

    await prisma.$transaction(async (tx) => {
      // 1. Atualizar MeliVenda
      const meliVendas = await tx.meliVenda.findMany({
        where: {
          userId: session.sub,
          sku: skuObj.sku,
          OR: [
            { cmv: null },
            { cmv: 0 }
          ]
        }
      });

      for (const venda of meliVendas) {
        const cmvTotal = custoUnitario * venda.quantidade;
        const novaMargem = recalcularMargem(venda.valorTotal, venda.taxaPlataforma, venda.frete, cmvTotal);
        
        await tx.meliVenda.update({
          where: { id: venda.id },
          data: {
            cmv: cmvTotal,
            margemContribuicao: novaMargem,
            isMargemReal: true,
          }
        });
        vendasAtualizadas++;
      }

      // 2. Atualizar ShopeeVenda
      const shopeeVendas = await tx.shopeeVenda.findMany({
        where: {
          userId: session.sub,
          sku: skuObj.sku,
          OR: [
            { cmv: null },
            { cmv: 0 }
          ]
        }
      });

      for (const venda of shopeeVendas) {
        const cmvTotal = custoUnitario * venda.quantidade;
        const novaMargem = recalcularMargem(venda.valorTotal, venda.taxaPlataforma, venda.frete, cmvTotal);
        
        await tx.shopeeVenda.update({
          where: { id: venda.id },
          data: {
            cmv: cmvTotal,
            margemContribuicao: novaMargem,
            isMargemReal: true,
          }
        });
        vendasAtualizadas++;
      }
    });

    return NextResponse.json({
      success: true,
      message: `Custo aplicado retroativamente em ${vendasAtualizadas} venda(s).`,
      vendasAtualizadas
    });
  } catch (error) {
    console.error("Erro ao aplicar custo retroativo:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
