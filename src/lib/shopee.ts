
import crypto from "crypto";
import prisma from "@/lib/prisma";

/**
 * Gera uma URL de autorização para Shopee
 */
export function getShopeeAuthUrl(
  partnerId: string,
  partnerKey: string,
  redirectUrl: string
): string {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${partnerId}${path}${timestamp}`;
  const sign = crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");

  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.append("partner_id", partnerId);
  url.searchParams.append("timestamp", timestamp.toString());
  url.searchParams.append("sign", sign);
  url.searchParams.append("redirect", redirectUrl);

  return url.toString();
}

/**
 * Gera assinatura para requisições de API Shopee V2
 */
export function generateShopeeSign(
  partnerId: string,
  partnerKey: string,
  path: string,
  accessToken: string,
  shopId: string,
  timestamp: number
): string {
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}

/**
 * Refresh token da Shopee
 */
export async function refreshShopeeToken(
  account: {
    id: string;
    shop_id: string;
    refresh_token: string;
  },
  partnerId: string,
  partnerKey: string
): Promise<string> {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Assinatura para refresh token é diferente: partner_id + path + timestamp
  const baseString = `${partnerId}${path}${timestamp}`;
  const sign = crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");

  const url = `https://partner.shopeemobile.com${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

  const body = {
    refresh_token: account.refresh_token,
    partner_id: Number(partnerId),
    shop_id: Number(account.shop_id)
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Shopee refresh error: ${data.message || data.error}`);
  }

  // Atualiza no banco
  const expiresAt = new Date(Date.now() + (data.expire_in - 300) * 1000); // 5 min margem
  
  await prisma.shopeeAccount.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date(),
    }
  });

  return data;
}

export { refreshShopeeToken as refreshShopeeAccountToken };

export interface GetShopeeOrderListParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  createTimeFrom: number;
  createTimeTo: number;
  pageSize: number;
  cursor?: string;
}

export async function getShopeeOrderList(params: GetShopeeOrderListParams) {
  const path = "/api/v2/order/get_order_list";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateShopeeSign(params.partnerId, params.partnerKey, path, params.accessToken, params.shopId, timestamp);
  
  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.append("partner_id", params.partnerId);
  url.searchParams.append("timestamp", timestamp.toString());
  url.searchParams.append("access_token", params.accessToken);
  url.searchParams.append("shop_id", params.shopId);
  url.searchParams.append("sign", sign);
  url.searchParams.append("time_range_field", "create_time");
  url.searchParams.append("time_from", params.createTimeFrom.toString());
  url.searchParams.append("time_to", params.createTimeTo.toString());
  url.searchParams.append("page_size", params.pageSize.toString());
  if (params.cursor) {
    url.searchParams.append("cursor", params.cursor);
  }

  const response = await fetch(url.toString());
  const data = await response.json();
  if (data.error) {
    throw new Error(`Shopee getOrderList error: ${data.message || data.error}`);
  }
  return data.response;
}

export interface GetShopeeOrderDetailParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  orderSnList: string;
}

export async function getShopeeOrderDetail(params: GetShopeeOrderDetailParams) {
  const path = "/api/v2/order/get_order_detail";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateShopeeSign(params.partnerId, params.partnerKey, path, params.accessToken, params.shopId, timestamp);
  
  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.append("partner_id", params.partnerId);
  url.searchParams.append("timestamp", timestamp.toString());
  url.searchParams.append("access_token", params.accessToken);
  url.searchParams.append("shop_id", params.shopId);
  url.searchParams.append("sign", sign);
  url.searchParams.append("order_sn_list", params.orderSnList);
  url.searchParams.append("response_optional_fields", "buyer_user_id,buyer_username,estimated_shipping_fee,actual_shipping_fee,item_list");

  const response = await fetch(url.toString());
  const data = await response.json();
  if (data.error) {
    throw new Error(`Shopee getOrderDetail error: ${data.message || data.error}`);
  }
  return data.response;
}

export interface GetShopeeEscrowDetailParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  orderSn: string;
}

export async function getShopeeEscrowDetail(params: GetShopeeEscrowDetailParams) {
  const path = "/api/v2/payment/get_escrow_detail";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateShopeeSign(params.partnerId, params.partnerKey, path, params.accessToken, params.shopId, timestamp);
  
  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.append("partner_id", params.partnerId);
  url.searchParams.append("timestamp", timestamp.toString());
  url.searchParams.append("access_token", params.accessToken);
  url.searchParams.append("shop_id", params.shopId);
  url.searchParams.append("sign", sign);
  url.searchParams.append("order_sn", params.orderSn);

  const response = await fetch(url.toString());
  const data = await response.json();
  if (data.error) {
    throw new Error(`Shopee getEscrowDetail error: ${data.message || data.error}`);
  }
  return data.response;
}
