
import crypto from "crypto";
import prisma from "@/lib/prisma";

const SHOPEE_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const SHOPEE_REQUEST_TIMEOUT_MS = 20_000;
const SHOPEE_MAX_RETRY_DELAY_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/**
 * GETs operacionais da Shopee com timeout e retry conservador.
 *
 * A carga histórica faz milhares de chamadas; uma única conexão pendurada não
 * pode congelar o lote inteiro. Só repetimos falhas transitórias e respeitamos
 * Retry-After quando a plataforma informa o ritmo permitido.
 */
async function fetchShopeeJson(
  url: string,
  attempts = 3,
): Promise<{ response: Response; data: any }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(SHOPEE_REQUEST_TIMEOUT_MS),
      });
      const data = await response.json().catch(() => null);

      const apiCode = String(data?.error ?? "").toLowerCase();
      // A Shopee também devolve limite/indisponibilidade dentro de HTTP 200.
      // Mesma classificação já validada no cliente do CyberDock.
      const transientEnvelope =
        response.ok &&
        /(system|internal|busy|timeout|too_many|rate_limit)/.test(apiCode);
      const retryableHttp = SHOPEE_RETRYABLE_STATUS.has(response.status);

      if (!retryableHttp && !transientEnvelope) {
        if (data === null) throw new Error("Resposta JSON inválida da Shopee");
        return { response, data };
      }

      lastError = new Error(
        transientEnvelope
          ? `Shopee temporariamente indisponível: ${data?.message || data?.error}`
          : `Shopee HTTP ${response.status}`,
      );
      if (attempt === attempts - 1) return { response, data };

      const delay =
        retryAfterMs(response) ??
        Math.min(
          SHOPEE_MAX_RETRY_DELAY_MS,
          500 * 2 ** attempt + Math.random() * 250,
        );
      await sleep(delay);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === attempts - 1) throw lastError;
      await sleep(Math.min(2_000, 500 * 2 ** attempt));
    }
  }

  throw lastError ?? new Error("Falha ao consultar a Shopee");
}

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
): Promise<{ access_token: string; refresh_token: string; expires_at: Date }> {
  // `createHmac` aceita string vazia, mas a assinatura seria inválida; com
  // `undefined` ele lança o TypeError exibido ao usuário antes de chamar a
  // Shopee. Validar aqui protege todos os chamadores, não só o botão manual.
  if (!partnerId?.trim() || !partnerKey?.trim()) {
    throw new Error(
      "Credenciais da integração Shopee não configuradas no servidor.",
    );
  }

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

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
  };
}

export { refreshShopeeToken as refreshShopeeAccountToken };

export type ShopeeOrderTimeRangeField = "create_time" | "update_time";

export interface GetShopeeOrderListParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  /** Campo usado pela Shopee para selecionar a janela. Mantém create_time por compatibilidade. */
  timeRangeField?: ShopeeOrderTimeRangeField;
  /** Novos nomes neutros, usados também quando o campo é update_time. */
  timeFrom?: number;
  timeTo?: number;
  /** @deprecated Use timeFrom. Mantido para os chamadores existentes. */
  createTimeFrom?: number;
  /** @deprecated Use timeTo. Mantido para os chamadores existentes. */
  createTimeTo?: number;
  pageSize: number;
  cursor?: string;
}

export async function getShopeeOrderList(params: GetShopeeOrderListParams) {
  const path = "/api/v2/order/get_order_list";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateShopeeSign(params.partnerId, params.partnerKey, path, params.accessToken, params.shopId, timestamp);
  const timeFrom = params.timeFrom ?? params.createTimeFrom;
  const timeTo = params.timeTo ?? params.createTimeTo;

  if (!Number.isFinite(timeFrom) || !Number.isFinite(timeTo)) {
    throw new Error("Shopee getOrderList requer timeFrom e timeTo validos");
  }
  
  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.append("partner_id", params.partnerId);
  url.searchParams.append("timestamp", timestamp.toString());
  url.searchParams.append("access_token", params.accessToken);
  url.searchParams.append("shop_id", params.shopId);
  url.searchParams.append("sign", sign);
  url.searchParams.append("time_range_field", params.timeRangeField ?? "create_time");
  url.searchParams.append("time_from", String(timeFrom));
  url.searchParams.append("time_to", String(timeTo));
  url.searchParams.append("page_size", params.pageSize.toString());
  if (params.cursor) {
    url.searchParams.append("cursor", params.cursor);
  }

  const { response, data } = await fetchShopeeJson(url.toString());
  if (!response.ok || data?.error) {
    throw new Error(
      `Shopee getOrderList error: ${data?.message || data?.error || `HTTP ${response.status}`}`,
    );
  }
  return data.response;
}

export interface GetShopeeOrderDetailParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  orderSnList: string;
  responseOptionalFields?: string;
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
  url.searchParams.append(
    "response_optional_fields",
    params.responseOptionalFields ||
      "buyer_user_id,buyer_username,estimated_shipping_fee,actual_shipping_fee,item_list,total_amount,package_list,shipping_carrier",
  );

  const { response, data } = await fetchShopeeJson(url.toString());
  if (!response.ok || data?.error) {
    throw new Error(
      `Shopee getOrderDetail error: ${data?.message || data?.error || `HTTP ${response.status}`}`,
    );
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

  const { response, data } = await fetchShopeeJson(url.toString());
  if (!response.ok || data?.error) {
    throw new Error(
      `Shopee getEscrowDetail error: ${data?.message || data?.error || `HTTP ${response.status}`}`,
    );
  }
  return data.response;
}

export interface GetShopeeItemListParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  offset: number;
  pageSize: number;
  itemStatus?: string;
}

export async function getShopeeItemList(params: GetShopeeItemListParams) {
  const path = "/api/v2/product/get_item_list";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateShopeeSign(
    params.partnerId,
    params.partnerKey,
    path,
    params.accessToken,
    params.shopId,
    timestamp,
  );

  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.append("partner_id", params.partnerId);
  url.searchParams.append("timestamp", timestamp.toString());
  url.searchParams.append("access_token", params.accessToken);
  url.searchParams.append("shop_id", params.shopId);
  url.searchParams.append("sign", sign);
  url.searchParams.append("offset", params.offset.toString());
  url.searchParams.append("page_size", params.pageSize.toString());
  if (params.itemStatus) {
    url.searchParams.append("item_status", params.itemStatus);
  }

  const response = await fetch(url.toString());
  const data = await response.json();
  if (data.error) {
    throw new Error(`Shopee getItemList error: ${data.message || data.error}`);
  }
  return data.response;
}

export interface GetShopeeItemBaseInfoParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  itemIdList: string;
}

export async function getShopeeItemBaseInfo(params: GetShopeeItemBaseInfoParams) {
  const path = "/api/v2/product/get_item_base_info";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateShopeeSign(
    params.partnerId,
    params.partnerKey,
    path,
    params.accessToken,
    params.shopId,
    timestamp,
  );

  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.append("partner_id", params.partnerId);
  url.searchParams.append("timestamp", timestamp.toString());
  url.searchParams.append("access_token", params.accessToken);
  url.searchParams.append("shop_id", params.shopId);
  url.searchParams.append("sign", sign);
  url.searchParams.append("item_id_list", params.itemIdList);

  const response = await fetch(url.toString());
  const data = await response.json();
  if (data.error) {
    throw new Error(
      `Shopee getItemBaseInfo error: ${data.message || data.error}`,
    );
  }
  return data.response;
}

export interface GetShopeeModelListParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  itemId: string;
}

export async function getShopeeModelList(params: GetShopeeModelListParams) {
  const path = "/api/v2/product/get_model_list";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateShopeeSign(
    params.partnerId,
    params.partnerKey,
    path,
    params.accessToken,
    params.shopId,
    timestamp,
  );

  const url = new URL(`https://partner.shopeemobile.com${path}`);
  url.searchParams.append("partner_id", params.partnerId);
  url.searchParams.append("timestamp", timestamp.toString());
  url.searchParams.append("access_token", params.accessToken);
  url.searchParams.append("shop_id", params.shopId);
  url.searchParams.append("sign", sign);
  url.searchParams.append("item_id", params.itemId);

  const response = await fetch(url.toString());
  const data = await response.json();
  if (data.error) {
    throw new Error(`Shopee getModelList error: ${data.message || data.error}`);
  }
  return data.response;
}
