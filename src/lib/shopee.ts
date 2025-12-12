
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

  return data.access_token;
}
