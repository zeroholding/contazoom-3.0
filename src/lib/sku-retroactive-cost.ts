type SalesModel = {
  findMany: (args: any) => Promise<any[]>;
  update: (args: any) => Promise<unknown>;
};

type PrismaLike = {
  meliVenda: SalesModel;
  shopeeVenda: SalesModel;
  tiktokVenda: SalesModel;
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

/**
 * Preenche CMV e margem das vendas de um SKU que ainda estavam sem custo.
 *
 * `marcarMargemReal` existe porque `is_margem_real` NAO quer dizer a mesma coisa
 * nas tres tabelas:
 *
 * - ML e Shopee: quer dizer "a margem embute custo real de mercadoria", ou seja,
 *   e exatamente isso que acabamos de fazer -> marcar true.
 * - TikTok: quer dizer "o financeiro veio do extrato de liquidacao". E a coluna
 *   que alimenta a fila do passo 2 do sync (indice `tiktokAccountId,
 *   isMargemReal`). Marcar true aqui tiraria o pedido dessa fila e ele nunca
 *   receberia a taxa real -> NAO marcar, so gravar cmv e margem.
 */
async function applyToSales(
  salesModel: SalesModel,
  params: ApplySkuCostRetroactivelyParams,
  marcarMargemReal: boolean,
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
        ...(marcarMargemReal ? { isMargemReal: true } : {}),
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
    return { total: 0, mercadoLivre: 0, shopee: 0, tiktok: 0 };
  }

  const normalizedParams = {
    ...params,
    custoUnitario,
  };

  const mercadoLivre = await applyToSales(prismaClient.meliVenda, normalizedParams, true);
  const shopee = await applyToSales(prismaClient.shopeeVenda, normalizedParams, true);
  const tiktok = await applyToSales(prismaClient.tiktokVenda, normalizedParams, false);

  return {
    total: mercadoLivre + shopee + tiktok,
    mercadoLivre,
    shopee,
    tiktok,
  };
}
