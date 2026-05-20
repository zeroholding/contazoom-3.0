import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

export async function PUT(
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
    const body = await request.json();

    const existingSku = await prisma.sKU.findUnique({
      where: { id },
    });

    if (!existingSku || existingSku.userId !== session.sub) {
      return NextResponse.json({ error: "SKU não encontrado" }, { status: 404 });
    }

    const {
      sku,
      produto,
      tipo,
      skuPai,
      custoUnitario,
      quantidade,
      hierarquia1,
      hierarquia2,
      ativo,
      temEstoque,
      skusFilhos,
      observacoes,
      tags,
    } = body;

    // Detect if cost changed
    const oldCusto = existingSku.custoUnitario ? Number(existingSku.custoUnitario) : 0;
    const newCusto = custoUnitario !== undefined ? Number(custoUnitario) : oldCusto;
    const custoChanged = newCusto !== oldCusto && !Number.isNaN(newCusto) && !Number.isNaN(oldCusto);

    const updatedSku = await prisma.$transaction(async (tx) => {
      const skuDataToUpdate: any = {};
      if (sku !== undefined) skuDataToUpdate.sku = sku;
      if (produto !== undefined) skuDataToUpdate.produto = produto;
      if (tipo !== undefined) skuDataToUpdate.tipo = tipo;
      if (skuPai !== undefined) skuDataToUpdate.skuPai = skuPai;
      if (custoUnitario !== undefined) skuDataToUpdate.custoUnitario = newCusto;
      if (quantidade !== undefined) skuDataToUpdate.quantidade = quantidade;
      if (hierarquia1 !== undefined) skuDataToUpdate.hierarquia1 = hierarquia1;
      if (hierarquia2 !== undefined) skuDataToUpdate.hierarquia2 = hierarquia2;
      if (ativo !== undefined) skuDataToUpdate.ativo = ativo;
      if (temEstoque !== undefined) skuDataToUpdate.temEstoque = temEstoque;
      if (skusFilhos !== undefined) skuDataToUpdate.skusFilhos = skusFilhos;
      if (observacoes !== undefined) skuDataToUpdate.observacoes = observacoes;
      if (tags !== undefined) skuDataToUpdate.tags = tags;

      const updated = await tx.sKU.update({
        where: { id },
        data: skuDataToUpdate,
      });

      if (custoChanged) {
        await tx.sKUCustoHistorico.create({
          data: {
            skuId: id,
            userId: session.sub,
            custoAnterior: oldCusto,
            custoNovo: newCusto,
            quantidade: updated.quantidade,
            motivo: "Atualização de custo unitário",
            tipoAlteracao: "manual",
            alteradoPor: session.sub,
          },
        });
      }

      return updated;
    });

    return NextResponse.json(updatedSku);
  } catch (error) {
    console.error("Erro ao atualizar SKU:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const existingSku = await prisma.sKU.findUnique({
      where: { id },
    });

    if (!existingSku || existingSku.userId !== session.sub) {
      return NextResponse.json({ error: "SKU não encontrado" }, { status: 404 });
    }

    await prisma.sKU.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir SKU:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
