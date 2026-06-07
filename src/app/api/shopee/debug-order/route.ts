import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import {
  getShopeeEscrowDetail,
  getShopeeOrderDetail,
  refreshShopeeAccountToken,
} from "@/lib/shopee";
import {
  calculateShopeeFinancials,
  SHOPEE_FINANCIAL_RULE_VERSION,
} from "@/lib/shopee-finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShopeeAccountForDebug = {
  id: string;
  shop_id: string;
  shop_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date | string;
};

const DEBUG_ORDER_DETAIL_FIELDS = [
  "buyer_user_id",
  "buyer_username",
  "estimated_shipping_fee",
  "recipient_address",
  "actual_shipping_fee",
  "goods_to_declare",
  "note",
  "note_update_time",
  "item_list",
  "pay_time",
  "dropshipper",
  "dropshipper_phone",
  "split_up",
  "shipping_carrier",
  "payment_method",
  "total_amount",
  "buyer_cancel_reason",
  "cancel_by",
  "cancel_reason",
  "actual_shipping_fee_confirmed",
  "buyer_cpf_id",
  "fulfillment_flag",
  "pickup_done_time",
  "package_list",
  "invoice_data",
  "checkout_shipping_carrier",
  "reverse_shipping_fee",
  "order_chargeable_weight_gram",
  "edt",
  "booking_sn",
  "advance_package",
  "return_request_due_date",
].join(",");

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toPlainJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlainJson);
  if (typeof value === "object") {
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
      return (value as { toJSON: () => unknown }).toJSON();
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        toPlainJson(entry),
      ]),
    );
  }
  return value;
}

function summarizeFinancials(order: unknown, paymentDetails?: unknown) {
  const financials = calculateShopeeFinancials(order as any, {
    paymentDetails,
  });

  return {
    ruleVersion: SHOPEE_FINANCIAL_RULE_VERSION,
    grossProductSubtotal: financials.grossProductSubtotal,
    effectiveProductSubtotal: financials.effectiveProductSubtotal,
    unitPrice: financials.unitPrice,
    platformFee: financials.platformFee,
    freight: financials.freight,
    netRevenue: financials.netRevenue,
    check: {
      effectivePlusFeePlusFreight: roundCurrency(
        financials.effectiveProductSubtotal +
          (financials.platformFee ?? 0) +
          financials.freight,
      ),
    },
    paymentBreakdown: financials.paymentBreakdown,
    shipmentBreakdown: financials.shipmentBreakdown,
  };
}

async function ensureFreshToken(
  account: ShopeeAccountForDebug,
  partnerId: string,
  partnerKey: string,
) {
  if (new Date(account.expires_at).getTime() > Date.now() + 60_000) {
    return account;
  }

  const refreshed = await refreshShopeeAccountToken(account, partnerId, partnerKey);
  return {
    ...account,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
  };
}

export async function GET(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const orderSn =
    req.nextUrl.searchParams.get("orderSn") ||
    req.nextUrl.searchParams.get("orderId") ||
    "";
  const normalizedOrderSn = orderSn.trim();

  if (!normalizedOrderSn) {
    return NextResponse.json(
      { error: "Informe orderSn. Ex: /api/shopee/debug-order?orderSn=260606C2N30B1S" },
      { status: 400 },
    );
  }

  const partnerId = process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_CLIENT_ID;
  const partnerKey =
    process.env.SHOPEE_PARTNER_KEY || process.env.SHOPEE_CLIENT_SECRET;

  if (!partnerId || !partnerKey) {
    return NextResponse.json(
      { error: "Credenciais Shopee ausentes no ambiente" },
      { status: 500 },
    );
  }

  const dbRecord = await prisma.shopeeVenda.findFirst({
    where: {
      userId: session.sub,
      orderId: normalizedOrderSn,
    },
    select: {
      id: true,
      orderId: true,
      conta: true,
      shopeeAccountId: true,
      dataVenda: true,
      status: true,
      valorTotal: true,
      quantidade: true,
      unitario: true,
      taxaPlataforma: true,
      frete: true,
      cmv: true,
      margemContribuicao: true,
      isMargemReal: true,
      titulo: true,
      sku: true,
      comprador: true,
      rawData: true,
      paymentDetails: true,
      shipmentDetails: true,
      sincronizadoEm: true,
      atualizadoEm: true,
    },
  });

  const accounts = await prisma.$queryRaw<ShopeeAccountForDebug[]>`
    SELECT id, shop_id, shop_name, access_token, refresh_token, expires_at
    FROM shopee_account
    WHERE user_id = ${session.sub}
    ORDER BY
      CASE WHEN id = ${dbRecord?.shopeeAccountId ?? ""} THEN 0 ELSE 1 END,
      created_at DESC
  `;

  const attempts: Array<{
    accountId: string;
    shopId: string;
    shopName: string | null;
    found: boolean;
    detailError?: string;
    escrowError?: string;
  }> = [];

  let matchedAccount: { id: string; shop_id: string; shop_name: string | null } | null =
    null;
  let shopeeOrderDetail: unknown = null;
  let shopeeEscrowDetail: unknown = null;

  for (const rawAccount of accounts) {
    const account = await ensureFreshToken(rawAccount, partnerId, partnerKey);
    const attempt = {
      accountId: account.id,
      shopId: account.shop_id,
      shopName: account.shop_name,
      found: false,
    };

    let detailResponse: any = null;
    try {
      detailResponse = await getShopeeOrderDetail({
        partnerId,
        partnerKey,
        accessToken: account.access_token,
        shopId: account.shop_id,
        orderSnList: normalizedOrderSn,
        responseOptionalFields: DEBUG_ORDER_DETAIL_FIELDS,
      });
      const orderList = Array.isArray(detailResponse?.order_list)
        ? detailResponse.order_list
        : [];
      if (orderList.length > 0) {
        shopeeOrderDetail = detailResponse;
        attempt.found = true;
      }
    } catch (error) {
      attempt.detailError = error instanceof Error ? error.message : String(error);
    }

    if (attempt.found) {
      try {
        shopeeEscrowDetail = await getShopeeEscrowDetail({
          partnerId,
          partnerKey,
          accessToken: account.access_token,
          shopId: account.shop_id,
          orderSn: normalizedOrderSn,
        });
      } catch (error) {
        attempt.escrowError = error instanceof Error ? error.message : String(error);
      }

      matchedAccount = {
        id: account.id,
        shop_id: account.shop_id,
        shop_name: account.shop_name,
      };
      attempts.push(attempt);
      break;
    }

    attempts.push(attempt);
  }

  const orderFromApi =
    (shopeeOrderDetail as any)?.order_list?.[0] ||
    (shopeeOrderDetail as any)?.orders?.[0] ||
    null;
  const combinedApiOrder = orderFromApi
    ? {
        ...orderFromApi,
        escrow_details: shopeeEscrowDetail || {},
      }
    : null;

  const dbCalculation = dbRecord
    ? summarizeFinancials(dbRecord.rawData, dbRecord.paymentDetails)
    : null;
  const apiCalculation = combinedApiOrder
    ? summarizeFinancials(combinedApiOrder, shopeeEscrowDetail)
    : null;

  return NextResponse.json(
    toPlainJson({
      mode: "shopee_debug_order",
      orderSn: normalizedOrderSn,
      financialRuleVersion: SHOPEE_FINANCIAL_RULE_VERSION,
      matchedAccount,
      attempts,
      dbRecord,
      calculations: {
        fromDatabase: dbCalculation,
        fromShopeeApi: apiCalculation,
      },
      shopeeApi: {
        orderDetail: shopeeOrderDetail,
        escrowDetail: shopeeEscrowDetail,
        combinedOrder: combinedApiOrder,
      },
    }),
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
