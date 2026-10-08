import { Prisma } from "@prisma/client";

type PrismaLike = {
  $executeRaw: (query: Prisma.Sql) => PromiseLike<number>;
};

type ApplySkuCostRetroactivelyParams = {
  userId: string;
  sku: string;
  custoUnitario: number;
};

export type RetroactiveCostResult = {
  total: number;
  mercadoLivre: number;
  shopee: number;
  tiktok: number;
};

/**
 * Resultado de `tryApplySkuCostRetroactively`. É o que as rotas devolvem em
 * `retroativo` para a tela saber se as vendas antigas foram atualizadas.
 */
export type RetroactiveOutcome = ({ ok: true } & RetroactiveCostResult) | { ok: false };

// Nomes fixos das tabelas, nunca vindos de entrada do usuário (por isso `raw`).
const TABELA_ML = Prisma.raw('"meli_venda"');
const TABELA_SHOPEE = Prisma.raw('"shopee_venda"');
const TABELA_TIKTOK = Prisma.raw('"tiktok_venda"');

/**
 * Preenche CMV e margem das vendas de um SKU que ainda estavam sem custo.
 *
 * É UM UPDATE por tabela de vendas, e não um update por venda. A versão antiga
 * lia as vendas e regravava uma a uma: N idas ao banco, cada uma devolvendo a
 * linha inteira com o JSON do pedido. Dentro da transação de salvar o custo, que
 * o Prisma encerra em 5 s, SKU com milhares de vendas estourava o prazo, a
 * transação inteira voltava atrás e o custo nem chegava a ser gravado (o usuário
 * via só "Erro interno do servidor").
 *
 * Por isso quem chama deve rodar isto DEPOIS de confirmar o custo e FORA de
 * transação interativa. É idempotente: só toca vendas com CMV nulo ou zero,
 * então repetir (botão "aplicar custo retroativo") completa o que tiver faltado.
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
  prismaClient: PrismaLike,
  tabela: Prisma.Sql,
  params: ApplySkuCostRetroactivelyParams,
  marcarMargemReal: boolean,
): Promise<number> {
  // Decimal + ::numeric: o custo entra exato no SQL, sem o ruído de ponto
  // flutuante do JS (21.3 * 3 dá 63.89999999999999).
  const custo = new Prisma.Decimal(params.custoUnitario);
  const cmv = Prisma.sql`${custo}::numeric * COALESCE("quantidade", 0)`;

  // Mesma conta de antes: margem = valor total + taxa + frete - CMV (taxa e frete
  // ficam gravados como negativos). `atualizado_em` imita o @updatedAt do Prisma
  // (UTC), que um UPDATE cru não preenche sozinho.
  return prismaClient.$executeRaw(Prisma.sql`
    UPDATE ${tabela}
    SET "cmv" = ROUND(${cmv}, 2),
        "margem_contribuicao" = ROUND(
          COALESCE("valor_total", 0) + COALESCE("taxa_plataforma", 0) + COALESCE("valor_frete", 0) - (${cmv}),
          2
        ),
        ${marcarMargemReal ? Prisma.sql`"is_margem_real" = true,` : Prisma.empty}
        "atualizado_em" = (now() AT TIME ZONE 'UTC')
    WHERE "user_id" = ${params.userId}
      AND "sku" = ${params.sku}
      AND ("cmv" IS NULL OR "cmv" = 0)
  `);
}

export async function applySkuCostRetroactively(
  prismaClient: PrismaLike,
  params: ApplySkuCostRetroactivelyParams,
): Promise<RetroactiveCostResult> {
  const custoUnitario = Number(params.custoUnitario);
  if (!Number.isFinite(custoUnitario) || custoUnitario <= 0 || !params.sku) {
    return { total: 0, mercadoLivre: 0, shopee: 0, tiktok: 0 };
  }

  const normalizedParams = {
    ...params,
    custoUnitario,
  };

  const mercadoLivre = await applyToSales(prismaClient, TABELA_ML, normalizedParams, true);
  const shopee = await applyToSales(prismaClient, TABELA_SHOPEE, normalizedParams, true);
  const tiktok = await applyToSales(prismaClient, TABELA_TIKTOK, normalizedParams, false);

  return {
    total: mercadoLivre + shopee + tiktok,
    mercadoLivre,
    shopee,
    tiktok,
  };
}

/**
 * Versão para quem JÁ salvou o custo: nunca lança. Se o recálculo falhar, o custo
 * continua gravado e o chamador só avisa o usuário (que pode repetir pelo botão
 * "aplicar custo retroativo", já que a operação é idempotente).
 */
export async function tryApplySkuCostRetroactively(
  prismaClient: PrismaLike,
  params: ApplySkuCostRetroactivelyParams,
): Promise<RetroactiveOutcome> {
  try {
    return { ok: true, ...(await applySkuCostRetroactively(prismaClient, params)) };
  } catch (error) {
    console.error(
      "[SKU] Custo salvo, mas falhou ao aplicar nas vendas antigas:",
      { userId: params.userId, sku: params.sku },
      error,
    );
    return { ok: false };
  }
}
