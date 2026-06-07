import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import "@/lib/metadata";
import { assertSessionToken } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { calculateShopeeFinancials } from "@/lib/shopee-finance";

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

    // Buscar as contagens com UNION
    const counts: any[] = await prisma.$queryRaw`
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
      ) AS t
    `;

    const totalItemsCount = Number(counts[0]?.total || 0);
    const paidCount = Number(counts[0]?.paid || 0);
    const cancelledCount = Number(counts[0]?.cancelled || 0);

    const skusUnicos = Array.from(
      new Set(vendas.map((v) => v.sku).filter(Boolean) as string[]),
    );

    const { buildHistoricalCostMap } = await import("@/lib/sku-cost-history");
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

      let margemContribuicao: number;
      let isMargemReal: boolean;
      if (cmv !== null && cmv > 0) {
        margemContribuicao = roundCurrency(valorTotal + taxaPlataforma + frete - cmv);
        isMargemReal = true;
      } else {
        margemContribuicao = roundCurrency(valorTotal + taxaPlataforma + frete);
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
        taxaPlataforma: shopeeFinancials
          ? shopeeFinancials.platformFee
          : venda.taxaPlataforma
            ? Number(venda.taxaPlataforma)
            : null,
        frete,
        freteAjuste: venda.freteAjuste ? Number(venda.freteAjuste) : null,
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
        all: totalItemsCount,
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
