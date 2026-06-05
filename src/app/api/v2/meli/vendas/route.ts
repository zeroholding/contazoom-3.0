import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import "@/lib/metadata";
import { assertSessionToken } from "@/lib/auth";
import { cache, createCacheKey } from "@/lib/cache";
import {
  DataVendaDTO,
  VendaSearcherValidationDTO,
} from "@/validation/dtos/venda-searcher.dto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { buildPaginationMeta } from "@/validation/validation.interface";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

type JsonRecord = Record<string, unknown>;

type OrderItem = {
  item?: {
    listing_type_id?: string | null;
  } | null;
};

type RawDataWithOrder = JsonRecord & {
  order?: JsonRecord;
  freight?: JsonRecord;
  shipment?: JsonRecord | null;
};

async function dtoValidatorInterceptor(req: NextRequest): Promise<{
  dto: VendaSearcherValidationDTO | null;
  errors:
    | {
        field: string;
        constraints?: {
          [type: string]: string;
        };
      }[]
    | null;
}> {
  let queryParams = Object.fromEntries(new URL(req.url).searchParams);
  let dataVendaField;
  if (queryParams["dataVenda[min]"] || queryParams["dataVenda[max]"]) {
    const {
      "dataVenda[min]": minDate,
      "dataVenda[max]": maxDate,
      ...rest
    } = queryParams;
    queryParams = rest;
    dataVendaField = {
      min: minDate,
      max: maxDate,
    };
  }

  const parsedQuery = {
    ...queryParams,
    dataVenda: dataVendaField ?? undefined,
  };

  const dto = plainToInstance(VendaSearcherValidationDTO, parsedQuery);

  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    return {
      dto: null,
      errors: errors.map((err) => ({
        field: err.property,
        constraints: err.constraints,
        value: err.value,
      })),
    };
  }

  return {
    dto,
    errors: null,
  };
}

type Where = Prisma.MeliVendaFindManyArgs["where"];

async function processVendas(
  session: { sub: string },
  options: {
    where?: any;
    skip?: any;
    take?: any;
  } = { where: {} },
) {
  const where = { userId: session.sub, ...options.where };

  const [vendas, totalItemsCount, allCount, paidCount, cancelledCount] = await prisma.$transaction([
    prisma.meliVenda.findMany({
      where,
      skip: options?.skip ?? 0,
      take: options?.take ?? 10,
      select: {
        orderId: true,
        dataVenda: true,
        status: true,
        conta: true,
        meliAccountId: true,
        valorTotal: true,
        quantidade: true,
        unitario: true,
        taxaPlataforma: true,
        frete: true,
        freteAjuste: true,
        titulo: true,
        sku: true,
        comprador: true,
        logisticType: true,
        envioMode: true,
        shippingStatus: true,
        shippingId: true,
        exposicao: true,
        tipoAnuncio: true,
        ads: true,
        plataforma: true,
        canal: true,
        tags: true,
        internalTags: true,
        latitude: true,
        longitude: true,
        rawData: true,
        sincronizadoEm: true,
        meliAccount: {
          select: { nickname: true, ml_user_id: true },
        },
      },
      orderBy: { dataVenda: "desc" },
    }),
    prisma.meliVenda.count({ where }),
    prisma.meliVenda.count({ where: { ...where, status: undefined } }),
    prisma.meliVenda.count({ where: { ...where, status: "paid" } }),
    prisma.meliVenda.count({ where: { ...where, status: "cancelled" } }),
  ]);

  console.log(
    `[API_MELI_VENDAS] Encontradas ${vendas.length} vendas no banco.`,
  );

  const skusUnicos = Array.from(
    new Set(vendas.map((v) => v.sku).filter(Boolean) as string[]),
  );

  const { buildHistoricalCostMap } = await import("@/lib/sku-cost-history");
  const costMap = await buildHistoricalCostMap(session.sub, skusUnicos);

  const vendasFormatted = vendas.map((venda) => {
    let cmv: number | null = null;
    if (venda.sku) {
      const custoUnitario = costMap.getCostAtDate(venda.sku, venda.dataVenda);
      if (custoUnitario > 0) {
        cmv = roundCurrency(custoUnitario * venda.quantidade);
      }
    }

    const valorTotal = Number(venda.valorTotal);
    const taxaPlataforma = venda.taxaPlataforma
      ? Number(venda.taxaPlataforma)
      : 0;
    let freteRecalculado = Number(venda.frete);

    const frete = freteRecalculado;

    const rawData =
      venda.rawData && typeof venda.rawData === "object"
        ? (venda.rawData as RawDataWithOrder)
        : null;

    const freightData =
      rawData && rawData.freight && typeof rawData.freight === "object"
        ? (rawData.freight as JsonRecord)
        : {};

    let margemContribuicao: number;
    let isMargemReal: boolean;
    if (cmv !== null && cmv > 0) {
      margemContribuicao = roundCurrency(
        valorTotal + taxaPlataforma + frete - cmv,
      );
      isMargemReal = true;
    } else {
      margemContribuicao = roundCurrency(valorTotal + taxaPlataforma + frete);
      isMargemReal = false;
    }


    const shipmentData =
      rawData && rawData.shipment && typeof rawData.shipment === "object"
        ? (rawData.shipment as JsonRecord)
        : null;

    const receiverAddress =
      shipmentData &&
      typeof (shipmentData as JsonRecord).receiver_address === "object"
        ? ((shipmentData as JsonRecord).receiver_address as JsonRecord)
        : null;

    const rawOrder =
      rawData && rawData.order && typeof rawData.order === "object"
        ? (rawData.order as JsonRecord)
        : null;

    let orderItems: OrderItem[] = [];
    if (rawOrder && "order_items" in rawOrder) {
      const maybeItems = (rawOrder as { order_items?: unknown }).order_items;
      if (Array.isArray(maybeItems)) {
        orderItems = maybeItems.filter(
          (entry): entry is OrderItem =>
            typeof entry === "object" && entry !== null,
        );
      }
    }

    const firstOrderItem = orderItems[0] ?? null;
    const listingTypeId =
      firstOrderItem && typeof firstOrderItem === "object"
        ? ((firstOrderItem.item?.listing_type_id as string | undefined) ?? null)
        : null;

    // Conversão segura de ml_user_id para string
    const contaId = venda.meliAccount?.ml_user_id
      ? String(venda.meliAccount.ml_user_id)
      : "";

    return {
      id: venda.orderId,
      dataVenda: venda.dataVenda.toISOString(),
      status: venda.status,
      conta: venda.conta,
      meliAccountId: venda.meliAccountId,
      contaId, // Usar a versão stringificada
      valorTotal,
      quantidade: venda.quantidade,
      unitario: Number(venda.unitario),
      taxaPlataforma: venda.taxaPlataforma
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
      tags: venda.tags,
      internalTags: venda.internalTags,
      latitude:
        venda.latitude !== null && venda.latitude !== undefined
          ? Number(venda.latitude)
          : null,
      longitude:
        venda.longitude !== null && venda.longitude !== undefined
          ? Number(venda.longitude)
          : null,
      raw: {
        listing_type_id: listingTypeId,
        tags: venda.tags,
        internal_tags: venda.internalTags,
      },
      preco: valorTotal,
      shipping: freightData,
      shipment: shipmentData,
      receiverAddress,
    };
  });

  return {
    items: vendasFormatted,
    count: {
      totalItems: totalItemsCount,
      all: allCount,
      paid: paidCount,
      cancelled: cancelledCount
    },
    lastSync: vendas.length > 0 ? vendas[0].sincronizadoEm.toISOString() : null,
  };
}

const exposicaoWhereAdapter = (
  dto: VendaSearcherValidationDTO,
): string | undefined => {
  return dto.exposicao === "classico"
    ? "clássico"
    : dto.exposicao?.trim().toLowerCase();
};

const logisticTypeWhereAdapter = (
  dto: VendaSearcherValidationDTO,
): string | undefined => {
  return dto.logisticType === "agencia"
    ? "agência"
    : dto.logisticType?.trim().toLowerCase();
};

export async function GET(req: NextRequest) {
  console.log("[API_MELI_VENDAS] Inciando busca de vendas");
  const { dto, errors } = await dtoValidatorInterceptor(req);

  if (errors && errors?.length > 0) {
    return Response.json(
      {
        errors: errors,
      },
      { status: 400 },
    );
  }

  const sessionCookie = req.cookies.get("session")?.value;
  let session;
  try {
    session = await assertSessionToken(sessionCookie);
    console.log(`[API_MELI_VENDAS] Usuário autenticado: ${session.sub}`);
  } catch (e) {
    console.error("[API_MELI_VENDAS] Erro de autenticação:", e);
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    console.log("[API_MELI_VENDAS] Buscando no banco de dados...");

    let where: any = {};
    let skip = 0;
    let take = 10;
    if (dto) {
      where = {
        ...(dto?.accountId && {
          conta: {
            equals: dto.accountId.trim().toLowerCase(),
            mode: "insensitive",
          },
        }),
        ...(dto?.status && {
          status: {
            equals: dto.status.trim().toLowerCase(),
            mode: "insensitive",
          },
        }),
        ...(dto?.logisticType && {
          logisticType: {
            equals: logisticTypeWhereAdapter(dto),
            mode: "insensitive",
          },
        }),
        ...(dto?.anuncio && {
          tipoAnuncio: {
            equals: dto.anuncio.trim().toLowerCase(),
            mode: "insensitive",
          },
        }),
        ...(dto?.exposicao && {
          exposicao: {
            equals: exposicaoWhereAdapter(dto),
            mode: "insensitive",
          },
        }),
        ...(dto?.ads !== undefined && {
          ads: dto?.ads ? "ADS" : null,
        }),
        ...(dto?.dataVenda && {
          dataVenda: {
            ...(dto?.dataVenda.min && {
              gte: dto?.dataVenda.min,
            }),
            ...(dto?.dataVenda.max && {
              lte: dto?.dataVenda.max,
            }),
          },
        }),
      } as Where;

      skip = (dto.page - 1) * dto.limit;
      take = dto.limit;
    }

    const result = await processVendas(session, {
      skip,
      take,
      where,
    });

    const response = {
      ...result,
      pagination: buildPaginationMeta(
        dto?.page ?? 1,
        dto?.limit ?? 10,
        result.count.totalItems,
      ),
    };

    console.log(`[API_MELI_VENDAS] Vendas retornadas.`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API_MELI_VENDAS] Erro fatal ao buscar vendas:", error);
    return new NextResponse(
      `Erro interno do servidor: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 },
    );
  }
}
