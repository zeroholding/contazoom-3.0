type PrismaLike = {
  meliVenda: {
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<unknown>;
  };
  shopeeVenda: {
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<unknown>;
  };
};

type ApplySkuCostRetroactivelyParams = {
  userId: string;
  sku: string;
  custoUnitario: number;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function calculateMargin(
  valorTotal: unknown,
  taxaPlataforma: unknown,
  frete: unknown,
  cmv: number,
) {
  return toNumber(valorTotal) + toNumber(taxaPlataforma) + toNumber(frete) - cmv;
}

async function applyToSales(
  salesModel: PrismaLike["meliVenda"],
  params: ApplySkuCostRetroactivelyParams,
) {
  const vendas = await salesModel.findMany({
    where: {
      userId: params.userId,
      sku: params.sku,
      OR: [{ cmv: null }, { cmv: 0 }],
    },
    select: {
      id: true,
      valorTotal: true,
      taxaPlataforma: true,
      frete: true,
      quantidade: true,
    },
  });

  for (const venda of vendas) {
    const cmvTotal = params.custoUnitario * toNumber(venda.quantidade);
    const margemContribuicao = calculateMargin(
      venda.valorTotal,
      venda.taxaPlataforma,
      venda.frete,
      cmvTotal,
    );

    await salesModel.update({
      where: { id: venda.id },
      data: {
        cmv: cmvTotal,
        margemContribuicao,
        isMargemReal: true,
      },
    });
  }

  return vendas.length;
}

export async function applySkuCostRetroactively(
  prismaClient: PrismaLike,
  params: ApplySkuCostRetroactivelyParams,
) {
  const custoUnitario = Number(params.custoUnitario);
  if (!Number.isFinite(custoUnitario) || custoUnitario <= 0 || !params.sku) {
    return { total: 0, mercadoLivre: 0, shopee: 0 };
  }

  const normalizedParams = {
    ...params,
    custoUnitario,
  };

  const mercadoLivre = await applyToSales(prismaClient.meliVenda, normalizedParams);
  const shopee = await applyToSales(prismaClient.shopeeVenda, normalizedParams);

  return {
    total: mercadoLivre + shopee,
    mercadoLivre,
    shopee,
  };
}
