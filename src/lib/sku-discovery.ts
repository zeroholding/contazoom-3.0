import prisma from "@/lib/prisma";
import {
  getShopeeItemBaseInfo,
  getShopeeItemList,
  getShopeeModelList,
} from "@/lib/shopee";
import { fetchWithRetry } from "@/lib/v2/utils/fetch-with-retry";

const MELI_API_BASE =
  process.env.MELI_API_BASE?.replace(/\/$/, "") ||
  "https://api.mercadolibre.com";

type Marketplace = "Mercado Livre" | "Shopee";

export type SkuDiscoveryCandidate = {
  sku: string | null | undefined;
  produto?: string | null;
  plataforma: Marketplace;
  conta?: string | null;
  externalId?: string | null;
};

type DiscoveryResult = {
  found: number;
  created: number;
  existing: number;
  skipped: number;
};

type MeliCatalogAccount = {
  id: string;
  ml_user_id: number | bigint;
  nickname?: string | null;
  access_token: string;
};

type ShopeeCatalogAccount = {
  id: string;
  shop_id: string;
  shop_name?: string | null;
  access_token: string;
};

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) return "";
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function normalizeDiscoveredSku(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const sku = String(value).trim();
  if (!sku) return null;

  const lower = sku.toLowerCase();
  if (["-", "sem sku", "null", "undefined", "n/a"].includes(lower)) {
    return null;
  }

  return truncate(sku, 255) || null;
}

function candidateKey(candidate: SkuDiscoveryCandidate) {
  return normalizeDiscoveredSku(candidate.sku) || "";
}

function uniqueCandidates(candidates: SkuDiscoveryCandidate[]) {
  const map = new Map<string, SkuDiscoveryCandidate>();

  for (const candidate of candidates) {
    const sku = candidateKey(candidate);
    if (!sku) continue;

    const existing = map.get(sku);
    if (!existing) {
      map.set(sku, { ...candidate, sku });
      continue;
    }

    if (!existing.produto && candidate.produto) {
      existing.produto = candidate.produto;
    }
    if (!existing.conta && candidate.conta) {
      existing.conta = candidate.conta;
    }
    if (!existing.externalId && candidate.externalId) {
      existing.externalId = candidate.externalId;
    }
  }

  return Array.from(map.values());
}

export async function registerDiscoveredSkus(
  userId: string,
  candidates: SkuDiscoveryCandidate[],
): Promise<DiscoveryResult> {
  const unique = uniqueCandidates(candidates);
  if (unique.length === 0) {
    return { found: 0, created: 0, existing: 0, skipped: 0 };
  }

  const skuList = unique.map((candidate) => candidate.sku as string);
  const existing = await prisma.sKU.findMany({
    where: { userId, sku: { in: skuList } },
    select: { sku: true },
  });
  const existingSet = new Set(existing.map((item) => item.sku));

  let created = 0;
  let skipped = 0;

  for (const candidate of unique) {
    const sku = candidate.sku as string;
    if (existingSet.has(sku)) continue;

    const produto =
      truncate(candidate.produto || `SKU ${sku}`, 500) || `SKU ${sku}`;
    const sourceText = [
      "Descoberto automaticamente na sincronizacao",
      candidate.plataforma,
      candidate.conta ? `conta ${candidate.conta}` : null,
      candidate.externalId ? `origem ${candidate.externalId}` : null,
    ]
      .filter(Boolean)
      .join(" - ");

    try {
      await prisma.$transaction(async (tx) => {
        const createdSku = await tx.sKU.create({
          data: {
            userId,
            sku,
            produto,
            tipo: "filho",
            custoUnitario: 0,
            quantidade: 1,
            ativo: true,
            temEstoque: true,
            proporcao: 1,
            observacoes: sourceText,
            tags: ["auto-sync", candidate.plataforma],
          },
        });

        await tx.sKUCustoHistorico.create({
          data: {
            skuId: createdSku.id,
            userId,
            custoNovo: 0,
            quantidade: 1,
            motivo: sourceText,
            tipoAlteracao: "auto-sync",
            alteradoPor: "system",
          },
        });
      });

      existingSet.add(sku);
      created += 1;
    } catch (error) {
      skipped += 1;
      console.warn("[SKU Discovery] Nao foi possivel cadastrar SKU", {
        sku,
        plataforma: candidate.plataforma,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    found: unique.length,
    created,
    existing: unique.length - created - skipped,
    skipped,
  };
}

function readAttributeSku(attributes: unknown): string | null {
  if (!Array.isArray(attributes)) return null;

  for (const attribute of attributes) {
    const attr = attribute as any;
    const id = String(attr?.id || "").toUpperCase();
    const name = String(attr?.name || "").toUpperCase();
    if (id === "SELLER_SKU" || name === "SELLER_SKU" || name === "SKU") {
      return normalizeDiscoveredSku(
        attr?.value_name ?? attr?.value_id ?? attr?.values?.[0]?.name,
      );
    }
  }

  return null;
}

export function collectSkuCandidatesFromMeliOrders(
  orders: Array<{ accountNickname?: string | null; order?: unknown }>,
): SkuDiscoveryCandidate[] {
  const candidates: SkuDiscoveryCandidate[] = [];

  for (const payload of orders) {
    const order = (payload.order || {}) as any;
    const items = Array.isArray(order.order_items) ? order.order_items : [];

    for (const orderItem of items) {
      const item = orderItem?.item || {};
      const sku =
        normalizeDiscoveredSku(item?.seller_sku) ||
        normalizeDiscoveredSku(item?.sku) ||
        normalizeDiscoveredSku(orderItem?.seller_sku) ||
        normalizeDiscoveredSku(orderItem?.sku);

      if (!sku) continue;

      candidates.push({
        sku,
        produto: item?.title || order?.title || "Produto Mercado Livre",
        plataforma: "Mercado Livre",
        conta: payload.accountNickname,
        externalId: item?.id ? String(item.id) : null,
      });
    }
  }

  return candidates;
}

function collectMeliSkuCandidatesFromItem(
  item: any,
  account: MeliCatalogAccount,
): SkuDiscoveryCandidate[] {
  const candidates: SkuDiscoveryCandidate[] = [];
  const baseTitle = item?.title || "Produto Mercado Livre";
  const accountName = account.nickname || String(account.ml_user_id);
  const baseSku =
    normalizeDiscoveredSku(item?.seller_custom_field) ||
    normalizeDiscoveredSku(item?.seller_sku) ||
    readAttributeSku(item?.attributes);

  if (baseSku) {
    candidates.push({
      sku: baseSku,
      produto: baseTitle,
      plataforma: "Mercado Livre",
      conta: accountName,
      externalId: item?.id ? String(item.id) : null,
    });
  }

  const variations = Array.isArray(item?.variations) ? item.variations : [];
  for (const variation of variations) {
    const variationSku =
      normalizeDiscoveredSku(variation?.seller_custom_field) ||
      normalizeDiscoveredSku(variation?.seller_sku) ||
      readAttributeSku(variation?.attributes) ||
      readAttributeSku(variation?.attribute_combinations);

    if (!variationSku) continue;

    const variationName = Array.isArray(variation?.attribute_combinations)
      ? variation.attribute_combinations
          .map((attr: any) => attr?.value_name)
          .filter(Boolean)
          .join(" ")
      : "";

    candidates.push({
      sku: variationSku,
      produto: variationName ? `${baseTitle} ${variationName}` : baseTitle,
      plataforma: "Mercado Livre",
      conta: accountName,
      externalId:
        item?.id && variation?.id ? `${item.id}:${variation.id}` : item?.id,
    });
  }

  return candidates;
}

async function fetchMeliItemIds(
  account: MeliCatalogAccount,
  userId: string,
): Promise<string[]> {
  const ids: string[] = [];
  const headers = { Authorization: `Bearer ${account.access_token}` };
  const limit = 100;
  let scrollId: string | null = null;

  for (let page = 0; page < 200; page += 1) {
    const url = new URL(
      `${MELI_API_BASE}/users/${account.ml_user_id.toString()}/items/search`,
    );
    url.searchParams.set("search_type", "scan");
    url.searchParams.set("limit", String(limit));
    if (scrollId) url.searchParams.set("scroll_id", scrollId);

    const response = await fetchWithRetry(url.toString(), { headers }, 2, userId);
    if (!response.ok) break;

    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    for (const id of results) {
      if (id) ids.push(String(id));
    }

    scrollId = payload?.scroll_id ? String(payload.scroll_id) : null;
    if (results.length === 0 || !scrollId) break;
  }

  return Array.from(new Set(ids));
}

export async function fetchMeliCatalogSkuCandidates(
  account: MeliCatalogAccount,
  userId: string,
): Promise<SkuDiscoveryCandidate[]> {
  const itemIds = await fetchMeliItemIds(account, userId);
  if (itemIds.length === 0) return [];

  const headers = { Authorization: `Bearer ${account.access_token}` };
  const candidates: SkuDiscoveryCandidate[] = [];
  const batchSize = 20;

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    const url = new URL(`${MELI_API_BASE}/items`);
    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set(
      "attributes",
      "id,title,seller_custom_field,seller_sku,attributes,variations,status",
    );

    const response = await fetchWithRetry(url.toString(), { headers }, 2, userId);
    if (!response.ok) continue;

    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : [];
    for (const entry of items) {
      const item = entry?.body || entry;
      candidates.push(...collectMeliSkuCandidatesFromItem(item, account));
    }
  }

  return candidates;
}

export function collectSkuCandidatesFromShopeeOrders(
  orders: unknown[],
  account: { shop_id: string; shop_name?: string | null },
): SkuDiscoveryCandidate[] {
  const candidates: SkuDiscoveryCandidate[] = [];
  const accountName = account.shop_name || account.shop_id;

  for (const order of orders) {
    const itemList = Array.isArray((order as any)?.item_list)
      ? (order as any).item_list
      : [];

    for (const item of itemList) {
      const sku =
        normalizeDiscoveredSku(item?.item_sku) ||
        normalizeDiscoveredSku(item?.model_sku) ||
        normalizeDiscoveredSku(item?.variation_sku);

      if (!sku) continue;

      candidates.push({
        sku,
        produto: item?.item_name || "Produto Shopee",
        plataforma: "Shopee",
        conta: accountName,
        externalId:
          item?.item_id && item?.model_id
            ? `${item.item_id}:${item.model_id}`
            : item?.item_id
              ? String(item.item_id)
              : null,
      });
    }
  }

  return candidates;
}

export function collectShopeeSkuCandidatesFromProducts(
  itemList: unknown[],
  account: ShopeeCatalogAccount,
): SkuDiscoveryCandidate[] {
  const candidates: SkuDiscoveryCandidate[] = [];
  const accountName = account.shop_name || account.shop_id;

  for (const rawItem of itemList) {
    const item = rawItem as any;
    const itemSku = normalizeDiscoveredSku(item?.item_sku);
    const itemName = item?.item_name || "Produto Shopee";

    if (itemSku) {
      candidates.push({
        sku: itemSku,
        produto: itemName,
        plataforma: "Shopee",
        conta: accountName,
        externalId: item?.item_id ? String(item.item_id) : null,
      });
    }

    const modelList = Array.isArray(item?.model_list) ? item.model_list : [];
    for (const model of modelList) {
      const modelSku =
        normalizeDiscoveredSku(model?.model_sku) ||
        normalizeDiscoveredSku(model?.variation_sku);

      if (!modelSku) continue;

      const modelName =
        model?.model_name ||
        model?.tier_index?.join?.(" ") ||
        model?.name ||
        "";

      candidates.push({
        sku: modelSku,
        produto: modelName ? `${itemName} ${modelName}` : itemName,
        plataforma: "Shopee",
        conta: accountName,
        externalId:
          item?.item_id && model?.model_id
            ? `${item.item_id}:${model.model_id}`
            : item?.item_id
              ? String(item.item_id)
              : null,
      });
    }
  }

  return candidates;
}

function mergeShopeeModelListIntoItems(
  itemList: unknown[],
  modelListsByItemId: Map<string, unknown[]>,
) {
  return itemList.map((rawItem) => {
    const item = rawItem as any;
    const itemId = item?.item_id;
    if (itemId === undefined || itemId === null) return item;

    const modelList = modelListsByItemId.get(String(itemId));
    if (!modelList || modelList.length === 0) return item;

    return {
      ...item,
      model_list: Array.isArray(item?.model_list)
        ? [...item.model_list, ...modelList]
        : modelList,
    };
  });
}

async function fetchShopeeProductItems(
  account: ShopeeCatalogAccount,
  credentials: { partnerId: string; partnerKey: string },
) {
  const itemIds: string[] = [];
  const pageSize = 100;
  let offset = 0;

  for (let page = 0; page < 200; page += 1) {
    const result = await getShopeeItemList({
      ...credentials,
      accessToken: account.access_token,
      shopId: account.shop_id,
      offset,
      pageSize,
      itemStatus: "NORMAL",
    });

    const items = Array.isArray(result?.item)
      ? result.item
      : Array.isArray(result?.item_list)
        ? result.item_list
        : [];

    for (const item of items) {
      const itemId = item?.item_id;
      if (itemId !== undefined && itemId !== null) {
        itemIds.push(String(itemId));
      }
    }

    const hasMore = Boolean(result?.has_next_page || result?.more);
    const nextOffset =
      typeof result?.next_offset === "number"
        ? result.next_offset
        : offset + pageSize;

    if (!hasMore || items.length === 0) break;
    offset = nextOffset;
  }

  return Array.from(new Set(itemIds));
}

export async function fetchShopeeCatalogSkuCandidates(
  account: ShopeeCatalogAccount,
  credentials: { partnerId: string; partnerKey: string },
): Promise<SkuDiscoveryCandidate[]> {
  const itemIds = await fetchShopeeProductItems(account, credentials);
  if (itemIds.length === 0) return [];

  const candidates: SkuDiscoveryCandidate[] = [];
  const batchSize = 50;

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    const result = await getShopeeItemBaseInfo({
      ...credentials,
      accessToken: account.access_token,
      shopId: account.shop_id,
      itemIdList: batch.join(","),
    });

    const itemList = Array.isArray(result?.item_list)
      ? result.item_list
      : Array.isArray(result?.item)
        ? result.item
        : [];

    const modelListsByItemId = new Map<string, unknown[]>();
    await Promise.allSettled(
      batch.map(async (itemId) => {
        const modelResult = await getShopeeModelList({
          ...credentials,
          accessToken: account.access_token,
          shopId: account.shop_id,
          itemId,
        });

        const modelList = Array.isArray(modelResult?.model)
          ? modelResult.model
          : Array.isArray(modelResult?.model_list)
            ? modelResult.model_list
            : [];
        modelListsByItemId.set(itemId, modelList);
      }),
    );

    const itemsWithModels = mergeShopeeModelListIntoItems(
      itemList,
      modelListsByItemId,
    );

    candidates.push(
      ...collectShopeeSkuCandidatesFromProducts(itemsWithModels, account),
    );
  }

  return candidates;
}
