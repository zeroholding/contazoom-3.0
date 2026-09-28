import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import "@/lib/metadata";
import { assertSessionToken } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { calculateShopeeFinancials } from "@/lib/shopee-finance";
import { calculateMeliFlexShipping } from "@/lib/flex-shipping";
import { loadActiveFlexShippingConfig } from "@/lib/flex-shipping-config";
import {
  applyTiktokSettlement,
  calculateTiktokEstimatedFinancials,
} from "@/lib/tiktok-finance";

export const runtime = "nodejs";

/**
 * Rótulo de plataforma do `UNION ALL` -> chave usada em
 * `AliquotaImposto.plataforma` (o `tipo` de `listTaxAccounts`).
 *
 * As duas pontas precisam falar a mesma língua, senão a alíquota cadastrada para
 * uma conta nunca casa com a venda dela.
 */
const PLATAFORMA_ALIQUOTA: Record<string, string> = {
  "Mercado Livre": "meli",
  Shopee: "shopee",
  "TikTok Shop": "tiktok",
};

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const parsedPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const parsedLimit = Number.parseInt(searchParams.get("limit") || "10", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : 10;
  const offset = (page - 1) * limit;

  // Filters
  const dataVendaMin = searchParams.get("dataVenda[min]");
  const dataVendaMax = searchParams.get("dataVenda[max]");
  const statusFilter = searchParams.get("status");
  const contaFilter = searchParams.get("conta");
  
  const statusCondition = statusFilter 
    ? Prisma.sql`AND "status" = ${statusFilter}`
    : Prisma.empty;
    
  const contaMeliCondition = contaFilter
    ? Prisma.sql`AND "meli_account_id" = ${contaFilter}`
    : Prisma.empty;
    
  const contaShopeeCondition = contaFilter
    ? Prisma.sql`AND "shopee_account_id" = ${contaFilter}`
    : Prisma.empty;

  const contaTiktokCondition = contaFilter
    ? Prisma.sql`AND "tiktok_account_id" = ${contaFilter}`
    : Prisma.empty;

  const dateCondition = dataVendaMin && dataVendaMax
    ? Prisma.sql`AND "data_venda" >= ${new Date(dataVendaMin)} AND "data_venda" <= ${new Date(dataVendaMax)}`
    : Prisma.empty;

  try {
    const flexConfigPromise = loadActiveFlexShippingConfig(session.sub);
    // Busca paginada unindo as três tabelas
    const vendasPromise = prisma.$queryRaw<any[]>`
      SELECT 
        'Mercado Livre' as plataforma,
        "order_id" as "orderId",
        "data_venda" as "dataVenda",
        "status",
        "conta",
        "meli_account_id" as "accountId",
        "valor_total" as "valorTotal",
        "quantidade",
        "valor_unitario" as "unitario",
        "taxa_plataforma" as "taxaPlataforma",
        "valor_frete" as "frete",
        "frete_ajuste" as "freteAjuste",
        "titulo",
        "sku",
        "comprador",
        "logistic_type" as "logisticType",
        "envio_mode" as "envioMode",
        "shipping_status" as "shippingStatus",
        "shipping_id" as "shippingId",
        "exposicao",
        "tipo_anuncio" as "tipoAnuncio",
        "ads",
        "canal",
        "sincronizado_em" as "sincronizadoEm",
        "latitude",
        "longitude",
        NULL as "rawData",
        NULL as "paymentDetails"
      FROM meli_venda
      WHERE "user_id" = ${session.sub} 
      ${dateCondition} 
      ${statusCondition}
      ${contaMeliCondition}
      
      UNION ALL
      
      SELECT 
        'Shopee' as plataforma,
        "order_id" as "orderId",
        "data_venda" as "dataVenda",
        "status",
        "conta",
        "shopee_account_id" as "accountId",
        "valor_total" as "valorTotal",
        "quantidade",
        "valor_unitario" as "unitario",
        "taxa_plataforma" as "taxaPlataforma",
        "valor_frete" as "frete",
        "frete_ajuste" as "freteAjuste",
        "titulo",
        "sku",
        "comprador",
        "logistic_type" as "logisticType",
        "envio_mode" as "envioMode",
        "shipping_status" as "shippingStatus",
        "shipping_id" as "shippingId",
        NULL as "exposicao",
        NULL as "tipoAnuncio",
        NULL as "ads",
        "canal",
        "sincronizado_em" as "sincronizadoEm",
        "latitude",
        "longitude",
        "raw_data" as "rawData",
        "payment_details" as "paymentDetails"
      FROM shopee_venda
      WHERE "user_id" = ${session.sub}
      ${dateCondition}
      ${statusCondition}
      ${contaShopeeCondition}

      UNION ALL

      SELECT
        'TikTok Shop' as plataforma,
        "order_id" as "orderId",
        "data_venda" as "dataVenda",
        "status",
        "conta",
        "tiktok_account_id" as "accountId",
        "valor_total" as "valorTotal",
        "quantidade",
        "valor_unitario" as "unitario",
        "taxa_plataforma" as "taxaPlataforma",
        "valor_frete" as "frete",
        "frete_ajuste" as "freteAjuste",
        "titulo",
        "sku",
        "comprador",
        "logistic_type" as "logisticType",
        "envio_mode" as "envioMode",
        "shipping_status" as "shippingStatus",
        "shipping_id" as "shippingId",
        NULL as "exposicao",
        NULL as "tipoAnuncio",
        NULL as "ads",
        "canal",
        "sincronizado_em" as "sincronizadoEm",
        "latitude",
        "longitude",
        "raw_data" as "rawData",
        "payment_details" as "paymentDetails"
      FROM tiktok_venda
      WHERE "user_id" = ${session.sub}
      ${dateCondition}
      ${statusCondition}
      ${contaTiktokCondition}

      ORDER BY "dataVenda" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Contadores das abas: não aplicam o status ativo. Cada order_id é único
    // dentro de sua tabela e UNION ALL mantém as plataformas separadas, portanto
    // a cardinalidade é a mesma da listagem sem custo de DISTINCT.
    const countsPromise = prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('paid', 'pago', 'payment_approved') THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status IN ('cancelled', 'cancelado') THEN 1 ELSE 0 END) as cancelled
      FROM (
        SELECT "status" FROM meli_venda
        WHERE "user_id" = ${session.sub} ${dateCondition} ${contaMeliCondition}
        UNION ALL
        SELECT "status" FROM shopee_venda
        WHERE "user_id" = ${session.sub} ${dateCondition} ${contaShopeeCondition}
        UNION ALL
        SELECT "status" FROM tiktok_venda
        WHERE "user_id" = ${session.sub} ${dateCondition} ${contaTiktokCondition}
      ) AS t
    `;

    // Contagem da paginação aplica exatamente os mesmos filtros da listagem.
    // order_id é único em cada tabela, então contar as linhas evita DISTINCT.
    const paginationCountsPromise = statusFilter
      ? prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as total
          FROM (
            SELECT 1 FROM meli_venda
            WHERE "user_id" = ${session.sub} ${dateCondition} ${statusCondition} ${contaMeliCondition}
            UNION ALL
            SELECT 1 FROM shopee_venda
            WHERE "user_id" = ${session.sub} ${dateCondition} ${statusCondition} ${contaShopeeCondition}
            UNION ALL
            SELECT 1 FROM tiktok_venda
            WHERE "user_id" = ${session.sub} ${dateCondition} ${statusCondition} ${contaTiktokCondition}
          ) AS t
        `
      : null;

    const aliquotasPromise = (async (): Promise<any[]> => {
      try {
        if (!prisma.aliquotaImposto) return [];
        return await prisma.aliquotaImposto.findMany({
          where: { userId: session.sub, ativo: true },
          orderBy: { updatedAt: "desc" },
        });
      } catch {
        console.log('[API_GERAL_VENDAS] Modelo AliquotaImposto não disponível');
        return [];
      }
    })();

    const [
      vendas,
      counts,
      paginationCountsResult,
      flexConfig,
      aliquotas,
      { buildHistoricalCostMap },
    ] = await Promise.all([
      vendasPromise,
      countsPromise,
      paginationCountsPromise,
      flexConfigPromise,
      aliquotasPromise,
      import("@/lib/sku-cost-history"),
    ]);

    const allCount = Number(counts[0]?.total || 0);
    const paidCount = Number(counts[0]?.paid || 0);
    const cancelledCount = Number(counts[0]?.cancelled || 0);
    const paginationCounts = statusFilter
      ? (paginationCountsResult ?? [])
      : counts;
    const totalItemsCount = Number(paginationCounts[0]?.total || 0);

    const skusUnicos = Array.from(
      new Set(vendas.map((v) => v.sku).filter(Boolean) as string[]),
    );
    const costMap = await buildHistoricalCostMap(session.sub, skusUnicos);

    const items = vendas.map((venda) => {
      let cmv: number | null = null;
      if (venda.sku) {
        const custoUnitario = costMap.getCostAtDate(venda.sku, new Date(venda.dataVenda));
        if (custoUnitario > 0) {
          cmv = roundCurrency(custoUnitario * venda.quantidade);
        }
      }

      const shopeeFinancials =
        venda.plataforma === "Shopee"
          ? calculateShopeeFinancials(venda.rawData, {
              valorTotal: Number(venda.valorTotal),
              unitario: Number(venda.unitario),
              quantidade: venda.quantidade,
              taxaPlataforma: venda.taxaPlataforma
                ? Number(venda.taxaPlataforma)
                : null,
              frete: Number(venda.frete),
              paymentDetails: venda.paymentDetails || null,
            })
          : null;

      /*
       * TikTok Shop: estimado a partir do pedido cru e, se o extrato já estiver
       * guardado em `paymentDetails.statement`, o real por cima. Sem o segundo
       * passo um pedido liquidado voltaria ao estimado e a comissão de afiliado
       * (que só existe no extrato) desapareceria do consolidado.
       */
      const tiktokFinancials = (() => {
        if (venda.plataforma !== "TikTok Shop") return null;
        const estimado = calculateTiktokEstimatedFinancials(venda.rawData ?? {});
        const statement = (venda.paymentDetails as Record<string, unknown> | null)
          ?.statement as Record<string, unknown> | undefined;
        return (statement ? applyTiktokSettlement(estimado, statement) : null) ?? estimado;
      })();

      const valorTotal = shopeeFinancials
        ? shopeeFinancials.effectiveProductSubtotal
        : tiktokFinancials
          ? tiktokFinancials.effectiveProductSubtotal
          : Number(venda.valorTotal);
      const taxaPlataforma = shopeeFinancials
        ? (shopeeFinancials.platformFee ?? 0)
        : tiktokFinancials
          ? tiktokFinancials.platformFee
          : venda.taxaPlataforma
            ? Number(venda.taxaPlataforma)
            : 0;
      const frete = shopeeFinancials
        ? shopeeFinancials.freight
        : tiktokFinancials
          ? tiktokFinancials.freight
          : Number(venda.frete);
      const flex =
        venda.plataforma === "Mercado Livre"
          ? calculateMeliFlexShipping({
              frete,
              quantidade: venda.quantidade,
              logisticType: venda.logisticType,
              config: flexConfig,
            })
          : null;
      const freteParaMargem = flex?.freteLiquidoFlex ?? frete;

      const dataVenda = new Date(venda.dataVenda);
      const contaNormalizada = (venda.conta || "").trim().toLocaleLowerCase("pt-BR");
      const accountId = venda.accountId || "";
      /*
       * Rótulo por extenso -> chave de `AliquotaImposto.plataforma`.
       *
       * Era um ternário binário (`=== "Mercado Livre" ? "meli" : "shopee"`), que
       * com a terceira plataforma passaria a classificar TODA venda do TikTok
       * como Shopee: a alíquota da Shopee seria aplicada ao faturamento do TikTok
       * e a do TikTok nunca casaria. Mapa explícito não tem esse ramo cego.
       */
      const plataformaMatch = PLATAFORMA_ALIQUOTA[venda.plataforma] ?? null;
      
      const aliquotaMes = aliquotas.find((aliq: any) => {
        const aliqInicio = new Date(aliq.dataInicio);
        const aliqFim = new Date(aliq.dataFim);
        // `plataformaMatch !== null` na frente: plataforma desconhecida não deve
        // casar com alíquota que também tenha `plataforma` nula, senão um rótulo
        // novo herdaria a alíquota de um cadastro legado por acidente.
        const matchesStableAccount =
          plataformaMatch !== null &&
          aliq.accountId === accountId &&
          aliq.plataforma === plataformaMatch;
        const matchesLegacyAccount = !aliq.accountId && String(aliq.conta).trim().toLocaleLowerCase("pt-BR") === contaNormalizada;

        return (
          (matchesStableAccount || matchesLegacyAccount) &&
          dataVenda <= aliqFim &&
          dataVenda >= aliqInicio
        );
      });

      let imposto: number | null = null;
      let aliquotaImposto: number | null = null;
      if (aliquotaMes) {
        aliquotaImposto = Number(aliquotaMes.aliquota);
        imposto = roundCurrency(valorTotal * (aliquotaImposto / 100));
      }

      let margemContribuicao: number;
      let isMargemReal: boolean;
      if (cmv !== null && cmv > 0) {
        margemContribuicao = roundCurrency(
          valorTotal + taxaPlataforma + freteParaMargem - cmv - (imposto || 0),
        );
        isMargemReal = true;
      } else {
        margemContribuicao = roundCurrency(
          valorTotal + taxaPlataforma + freteParaMargem - (imposto || 0),
        );
        isMargemReal = false;
      }

      return {
        id: venda.orderId,
        orderId: venda.orderId,
        dataVenda: new Date(venda.dataVenda).toISOString(),
        status: venda.status,
        conta: venda.conta,
        contaId: venda.accountId,
        valorTotal,
        quantidade: venda.quantidade,
        unitario: shopeeFinancials
          ? shopeeFinancials.unitPrice
          : tiktokFinancials
            ? tiktokFinancials.unitPrice
            : Number(venda.unitario),
        imposto,
        aliquotaImposto,
        taxaPlataforma: shopeeFinancials
          ? shopeeFinancials.platformFee
          : tiktokFinancials
            ? tiktokFinancials.platformFee
            : venda.taxaPlataforma
              ? Number(venda.taxaPlataforma)
              : null,
        frete,
        freteAjuste: venda.freteAjuste ? Number(venda.freteAjuste) : null,
        receitaFlex: flex?.isFlex ? flex.receitaFlex : null,
        custoFlex: flex?.isFlex ? flex.custoFlex : null,
        freteLiquidoFlex: flex?.isFlex ? flex.freteLiquidoFlex : null,
        cobrancasFlex: flex?.isFlex ? flex.cobrancasFlex : null,
        flexConfigApplied: flex?.configApplied ?? false,
        cmv,
        margemContribuicao,
        isMargemReal,
        // Só o TikTok tem estado intermediário: enquanto o pedido não liquida, a
        // taxa da plataforma é estimada. ML e Shopee já entregam número final.
        financeiroLiquidado: tiktokFinancials ? tiktokFinancials.isReal : true,
        titulo: venda.titulo,
        sku: venda.sku,
        comprador: venda.comprador,
        logisticType: venda.logisticType,
        envioMode: venda.envioMode,
        shippingStatus: venda.shippingStatus,
        shippingId: venda.shippingId,
        exposicao: venda.exposicao,
        tipoAnuncio: venda.tipoAnuncio,
        ads: venda.ads,
        plataforma: venda.plataforma,
        canal: venda.canal,
        latitude: venda.latitude !== null ? Number(venda.latitude) : null,
        longitude: venda.longitude !== null ? Number(venda.longitude) : null,
      };
    });

    const totalPages = Math.ceil(totalItemsCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      items,
      pagination: {
        totalItems: totalItemsCount,
        totalPages,
        page,
        limit,
        hasNextPage,
        hasPrevPage,
      },
      count: {
        totalItems: totalItemsCount,
        all: allCount,
        paid: paidCount,
        cancelled: cancelledCount,
      },
      lastSync: vendas.length > 0 ? new Date(vendas[0].sincronizadoEm).toISOString() : null,
    });
  } catch (error) {
    console.error("[API_VENDAS_GERAL] Erro ao buscar vendas gerais:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
