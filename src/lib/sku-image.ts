import prisma from "@/lib/prisma";
import { refreshMeliAccountToken } from "@/lib/meli";
import { refreshShopeeToken, getShopeeItemBaseInfo } from "@/lib/shopee";

const MELI_API_BASE = "https://api.mercadolibre.com";

function normalizeSku(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function ensureHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  return trimmed.startsWith("http://")
    ? "https://" + trimmed.slice("http://".length)
    : trimmed;
}

function getShopeePartnerCredentials() {
  return {
    partnerId: process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_CLIENT_ID || "",
    partnerKey:
      process.env.SHOPEE_PARTNER_KEY || process.env.SHOPEE_CLIENT_SECRET || "",
  };
}

// ------------------------- Mercado Livre -------------------------

// Localiza o id do anúncio (MLB) dentro do rawData de uma venda ML.
function extractMeliItemId(rawData: any, skuCode: string): string | null {
  const order = rawData?.order && typeof rawData.order === "object" ? rawData.order : rawData;
  const orderItems: any[] = Array.isArray(order?.order_items) ? order.order_items : [];
  if (orderItems.length === 0) return null;

  const target = normalizeSku(skuCode);

  // Tenta casar pelo seller_sku do item
  for (const oi of orderItems) {
    const item = oi?.item ?? {};
    const itemSku = normalizeSku(item?.seller_sku ?? item?.sku ?? oi?.seller_sku ?? oi?.sku);
    if (itemSku && itemSku === target && item?.id) {
      return String(item.id);
    }
  }

  // Fallback: primeiro item com id
  for (const oi of orderItems) {
    const item = oi?.item ?? {};
    if (item?.id) return String(item.id);
  }

  return null;
}

async function fetchMeliItemImage(
  accessToken: string,
  itemId: string,
): Promise<string | null> {
  const url = new URL(`${MELI_API_BASE}/items/${itemId}`);
  url.searchParams.set("attributes", "id,secure_thumbnail,thumbnail,pictures");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  const data: any = await response.json();
  const pictureUrl =
    data?.pictures?.[0]?.secure_url || data?.pictures?.[0]?.url || null;

  return (
    ensureHttps(data?.secure_thumbnail) ||
    ensureHttps(pictureUrl) ||
    ensureHttps(data?.thumbnail)
  );
}

async function resolveMeliImage(
  userId: string,
  skuCode: string,
): Promise<string | null> {
  const venda = await prisma.meliVenda.findFirst({
    where: { userId, sku: skuCode },
    orderBy: { dataVenda: "desc" },
    include: { meliAccount: true },
  });

  if (!venda || !venda.rawData || !venda.meliAccount) return null;

  const itemId = extractMeliItemId(venda.rawData as any, skuCode);
  if (!itemId) return null;

  const account = await refreshMeliAccountToken(venda.meliAccount);
  return fetchMeliItemImage(account.access_token, itemId);
}

// ------------------------- Shopee -------------------------

// Localiza item_id (e possível imagem embutida) no rawData da venda Shopee.
function extractShopeeItem(
  rawData: any,
  skuCode: string,
): { itemId: string | null; embeddedImage: string | null } {
  const root = rawData?.order && typeof rawData.order === "object" ? rawData.order : rawData;
  const itemList: any[] = Array.isArray(root?.item_list)
    ? root.item_list
    : Array.isArray(rawData?.item_list)
      ? rawData.item_list
      : [];

  if (itemList.length === 0) return { itemId: null, embeddedImage: null };

  const target = normalizeSku(skuCode);

  const pick = (item: any) => ({
    itemId: item?.item_id != null ? String(item.item_id) : null,
    embeddedImage: ensureHttps(item?.image_info?.image_url ?? null),
  });

  for (const item of itemList) {
    const itemSku = normalizeSku(item?.item_sku ?? item?.model_sku ?? item?.variation_sku);
    if (itemSku && itemSku === target && item?.item_id != null) {
      return pick(item);
    }
  }

  return pick(itemList[0]);
}

async function ensureFreshShopeeToken(account: {
  id: string;
  shop_id: string;
  refresh_token: string;
  access_token: string;
  expires_at: Date;
}): Promise<string> {
  const stillValid = new Date(account.expires_at).getTime() > Date.now() + 60_000;
  if (stillValid) return account.access_token;

  const { partnerId, partnerKey } = getShopeePartnerCredentials();
  if (!partnerId || !partnerKey) return account.access_token;

  try {
    const refreshed = await refreshShopeeToken(account, partnerId, partnerKey);
    return refreshed.access_token;
  } catch {
    return account.access_token;
  }
}

async function fetchShopeeItemImage(
  account: { id: string; shop_id: string; refresh_token: string; access_token: string; expires_at: Date },
  itemId: string,
): Promise<string | null> {
  const { partnerId, partnerKey } = getShopeePartnerCredentials();
  if (!partnerId || !partnerKey) return null;

  const accessToken = await ensureFreshShopeeToken(account);

  const result: any = await getShopeeItemBaseInfo({
    partnerId,
    partnerKey,
    accessToken,
    shopId: account.shop_id,
    itemIdList: itemId,
  });

  const itemList: any[] = Array.isArray(result?.item_list)
    ? result.item_list
    : Array.isArray(result?.item)
      ? result.item
      : [];

  const image = itemList[0]?.image;
  const url =
    image?.image_url_list?.[0] ||
    (Array.isArray(image?.image_url) ? image.image_url[0] : null) ||
    null;

  return ensureHttps(url);
}

async function resolveShopeeImage(
  userId: string,
  skuCode: string,
): Promise<string | null> {
  const venda = await prisma.shopeeVenda.findFirst({
    where: { userId, sku: skuCode },
    orderBy: { dataVenda: "desc" },
    include: { shopeeAccount: true },
  });

  if (!venda || !venda.rawData || !venda.shopeeAccount) return null;

  const { itemId, embeddedImage } = extractShopeeItem(venda.rawData as any, skuCode);
  if (embeddedImage) return embeddedImage;
  if (!itemId) return null;

  try {
    return await fetchShopeeItemImage(venda.shopeeAccount, itemId);
  } catch {
    return null;
  }
}

// ------------------------- Origem da descoberta -------------------------

// Extrai plataforma, conta e id de origem do texto de observação gravado
// pela descoberta automática: "... - Mercado Livre - conta X - origem MLB123".
function parseDiscoverySource(observacoes: unknown): {
  plataforma: "ml" | "shopee" | null;
  conta: string | null;
  externalId: string | null;
} {
  const text = String(observacoes ?? "");
  if (!text) return { plataforma: null, conta: null, externalId: null };

  let plataforma: "ml" | "shopee" | null = null;
  if (/mercado\s*livre/i.test(text)) plataforma = "ml";
  else if (/shopee/i.test(text)) plataforma = "shopee";

  const origemMatch = text.match(/origem\s+(\S+)/i);
  const externalId = origemMatch ? origemMatch[1].trim() : null;

  const contaMatch =
    text.match(/conta\s+(.+?)\s*-\s*origem/i) || text.match(/conta\s+(.+)$/i);
  const conta = contaMatch ? contaMatch[1].trim() : null;

  return { plataforma, conta, externalId };
}

async function resolveMeliImageByItemId(
  userId: string,
  itemIdRaw: string,
  contaNome: string | null,
): Promise<string | null> {
  const itemId = String(itemIdRaw).split(":")[0].trim();
  if (!itemId) return null;

  const accounts = await prisma.meliAccount.findMany({ where: { userId } });
  if (accounts.length === 0) return null;

  const target = normalizeSku(contaNome);
  const ordered = [...accounts].sort((a, b) => {
    const am = target && normalizeSku(a.nickname) === target ? 0 : 1;
    const bm = target && normalizeSku(b.nickname) === target ? 0 : 1;
    return am - bm;
  });

  for (const acc of ordered) {
    try {
      const refreshed = await refreshMeliAccountToken(acc);
      const img = await fetchMeliItemImage(refreshed.access_token, itemId);
      if (img) return img;
    } catch {
      // tenta a próxima conta
    }
  }
  return null;
}

async function resolveShopeeImageByItemId(
  userId: string,
  itemIdRaw: string,
  contaNome: string | null,
): Promise<string | null> {
  const itemId = String(itemIdRaw).split(":")[0].trim();
  if (!itemId) return null;

  const accounts = await prisma.shopeeAccount.findMany({ where: { userId } });
  if (accounts.length === 0) return null;

  const target = normalizeSku(contaNome);
  const ordered = [...accounts].sort((a, b) => {
    const am = target && normalizeSku(a.shop_name) === target ? 0 : 1;
    const bm = target && normalizeSku(b.shop_name) === target ? 0 : 1;
    return am - bm;
  });

  for (const acc of ordered) {
    try {
      const img = await fetchShopeeItemImage(acc, itemId);
      if (img) return img;
    } catch {
      // tenta a próxima loja
    }
  }
  return null;
}

// ------------------------- Público -------------------------

/**
 * Resolve a miniatura a partir do registro do SKU. Tenta primeiro pela origem
 * da descoberta (id do anúncio gravado nas observações, sem precisar de venda)
 * e, se não achar, cai no fallback pela venda mais recente.
 */
export async function resolveSkuImageForRecord(sku: {
  userId: string;
  sku: string;
  observacoes?: string | null;
}): Promise<string | null> {
  const src = parseDiscoverySource(sku.observacoes);
  if (src.externalId) {
    if (src.plataforma === "ml") {
      const img = await resolveMeliImageByItemId(sku.userId, src.externalId, src.conta);
      if (img) return img;
    } else if (src.plataforma === "shopee") {
      const img = await resolveShopeeImageByItemId(sku.userId, src.externalId, src.conta);
      if (img) return img;
    } else {
      const img =
        (await resolveMeliImageByItemId(sku.userId, src.externalId, src.conta)) ||
        (await resolveShopeeImageByItemId(sku.userId, src.externalId, src.conta));
      if (img) return img;
    }
  }

  // Fallback: procura pela venda mais recente
  return resolveSkuImage(sku.userId, sku.sku);
}

/**
 * Resolve a miniatura de um SKU buscando o anúncio correspondente na venda
 * mais recente (ML ou Shopee). Escolhe a plataforma com a venda mais nova.
 * Retorna a URL da imagem ou null se não encontrar.
 */
export async function resolveSkuImage(
  userId: string,
  skuCode: string,
): Promise<string | null> {
  const code = String(skuCode ?? "").trim();
  if (!code) return null;

  const [meliVenda, shopeeVenda] = await Promise.all([
    prisma.meliVenda.findFirst({
      where: { userId, sku: code },
      orderBy: { dataVenda: "desc" },
      select: { dataVenda: true },
    }),
    prisma.shopeeVenda.findFirst({
      where: { userId, sku: code },
      orderBy: { dataVenda: "desc" },
      select: { dataVenda: true },
    }),
  ]);

  const meliTime = meliVenda ? new Date(meliVenda.dataVenda).getTime() : -1;
  const shopeeTime = shopeeVenda ? new Date(shopeeVenda.dataVenda).getTime() : -1;

  // Ordem de tentativa pela venda mais recente
  const order: Array<"ml" | "shopee"> =
    meliTime >= shopeeTime ? ["ml", "shopee"] : ["shopee", "ml"];

  for (const platform of order) {
    try {
      const image =
        platform === "ml"
          ? await resolveMeliImage(userId, code)
          : await resolveShopeeImage(userId, code);
      if (image) return image;
    } catch (error) {
      console.error(`[sku-image] Falha ao resolver imagem (${platform}) para SKU ${code}:`, error);
    }
  }

  return null;
}
