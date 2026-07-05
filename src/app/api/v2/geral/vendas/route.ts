import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import "@/lib/metadata";
import { assertSessionToken } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { calculateShopeeFinancials } from "@/lib/shopee-finance";
import { calculateMeliFlexShipping } from "@/lib/flex-shipping";
import { loadActiveFlexShippingConfig } from "@/lib/flex-shipping-config";

export const runtime = "nodejs";

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
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
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

  const dateCondition = dataVendaMin && dataVendaMax
    ? Prisma.sql`AND "data_venda" >= ${new Date(dataVendaMin)} AND "data_venda" <= ${new Date(dataVendaMax)}`
    : Prisma.empty;

  try {
    const flexConfig = await loadActiveFlexShippingConfig(session.sub);
    // Busca paginada unindo as duas tabelas
    const vendas: any[] = await prisma.$queryRaw`
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
        NULL as "paymentDetails",
        NULL as "shipmentDetails"
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
        "payment_details" as "paymentDetails",
        "shipment_details" as "shipmentDetails"
      FROM shopee_venda
      WHERE "user_id" = ${session.sub}
      ${dateCondition}
      ${statusCondition}
      ${contaShopeeCondition}
      
      ORDER BY "dataVenda" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Contadores das ABAS (Todos / Pagos / Cancelados): NÃO aplicam o filtro de
    // status, pois cada aba precisa mostrar o total do seu próprio status dentro
    // do período/conta selecionados. A deduplicação é feita por tabela via
    // SELECT DISTINCT sobre "order_id" (order_id é @unique dentro de cada tabela);
    // a coluna "src" mantém separados eventuais order_ids iguais entre meli e
    // shopee, que representam vendas distintas em plataformas diferentes.
    const counts: any[] = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('paid', 'pago', 'payment_approved') THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status IN ('cancelled', 'cancelado') THEN 1 ELSE 0 END) as cancelled
      FROM (
        SELECT DISTINCT 'meli' AS src, "order_id", "status" FROM meli_venda 
        WHERE "user_id" = ${session.sub} ${dateCondition} ${contaMeliCondition}
        UNION ALL
        SELECT DISTINCT 'shopee' AS src, "order_id", "status" FROM shopee_venda 
        WHERE "user_id" = ${session.sub} ${dateCondition} ${contaShopeeCondition}
      ) AS t
    `;

    const allCount = Number(counts[0]?.total || 0);
    const paidCount = Number(counts[0]?.paid || 0);
    const cancelledCount = Number(counts[0]?.cancelled || 0);

    // Contagem para a PAGINAÇÃO: precisa refletir EXATAMENTE o conjunto que a
    // listagem paginada retorna, portanto aplica o mesmo statusCondition (além de
    // data/conta). Sem filtro de status, statusCondition é vazio e o resultado
    // coincide com allCount. Também deduplica por "order_id" dentro de cada tabela
    // para bater linha a linha com a listagem (UNION ALL, order_id @unique por tabela).
    const paginationCounts: any[] = statusFilter
      ? await prisma.$queryRaw`
          SELECT COUNT(*) as total
          FROM (
            SELECT DISTINCT 'meli' AS src, "order_id" FROM meli_venda 
            WHERE "user_id" = ${session.sub} ${dateCondition} ${statusCondition} ${contaMeliCondition}
            UNION ALL
            SELECT DISTINCT 'shopee' AS src, "order_id" FROM shopee_venda 
            WHERE "user_id" = ${session.sub} ${dateCondition} ${statusCondition} ${contaShopeeCondition}
          ) AS t
        `
      : counts;

    // totalItemsCount alimenta a paginação e deve seguir o filtro de status ativo.
    const totalItemsCount = Number(paginationCounts[0]?.total || 0);

    const skusUnicos = Array.from(
      new Set(vendas.map((v) => v.sku).filter(Boolean) as string[]),
    );

    const { buildHistoricalCostMap } = await import("@/lib/sku-cost-history");
    const costMap = await buildHistoricalCostMap(session.sub, skusUnicos);



    let aliquotas: any[] = [];
    try {
      if (prisma.aliquotaImposto) {
        aliquotas = await prisma.aliquotaImposto.findMany({
          where: { userId: session.sub, ativo: true },
          orderBy: { updatedAt: "desc" },
        });
      }
    } catch (error) {
      console.log('[API_GERAL_VENDAS] Modelo AliquotaImposto não disponível');
    }

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

      const valorTotal = shopeeFinancials
        ? shopeeFinancials.effectiveProductSubtotal
        : Number(venda.valorTotal);
      const taxaPlataforma = shopeeFinancials
        ? (shopeeFinancials.platformFee ?? 0)
        : venda.taxaPlataforma
          ? Number(venda.taxaPlataforma)
          : 0;
      const frete = shopeeFinancials
        ? shopeeFinancials.freight
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
      const plataformaMatch = venda.plataforma === "Mercado Livre" ? "meli" : "shopee";
      
      const aliquotaMes = aliquotas.find((aliq: any) => {
        const aliqInicio = new Date(aliq.dataInicio);
        const aliqFim = new Date(aliq.dataFim);
        const matchesStableAccount = aliq.accountId === accountId && aliq.plataforma === plataformaMatch;
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
          : Number(venda.unitario),
        imposto,
        aliquotaImposto,
        taxaPlataforma: shopeeFinancials
          ? shopeeFinancials.platformFee
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
