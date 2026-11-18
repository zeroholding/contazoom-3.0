import { pMap } from "./concorrencia";

export type MeliSalePrice = { current: number; original: number | null };
type PriceRef = { accountId: string; itemId: string };
type CacheEntry = { price: MeliSalePrice | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export function parseMeliSalePrice(data: unknown): MeliSalePrice | null {
  if (!data || typeof data !== "object") return null;
  const { amount, regular_amount: regular, currency_id: currency } = data as Record<string, unknown>;
  if (currency !== "BRL" || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    current: amount,
    original: typeof regular === "number" && Number.isFinite(regular) && regular > amount ? regular : null,
  };
}

export async function fetchMeliSalePrices(
  refs: readonly PriceRef[],
  getToken: (accountId: string) => Promise<string | null>,
): Promise<Map<string, MeliSalePrice>> {
  const prices = new Map<string, MeliSalePrice>();
  const pending = new Map<string, PriceRef>();
  for (const ref of refs) {
    if (!/^MLB\d+$/.test(ref.itemId)) continue;
    const key = `${ref.accountId}:${ref.itemId}`;
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) pending.set(key, ref);
    else if (entry.price) prices.set(key, entry.price);
  }
  if (!pending.size) return prices;

  const deadline = AbortSignal.timeout(8_000);
  const tokens = new Map<string, Promise<string | null>>();
  await pMap([...pending], 10, async ([key, { accountId, itemId }]) => {
    if (deadline.aborted) return;
    let tokenPromise = tokens.get(accountId);
    if (!tokenPromise) {
      tokenPromise = getToken(accountId).catch(() => null);
      tokens.set(accountId, tokenPromise);
    }
    const token = await tokenPromise;
    if (!token || deadline.aborted) return;

    let price: MeliSalePrice | null = null;
    try {
      const response = await fetch(
        `https://api.mercadolibre.com/items/${itemId}/sale_price?context=channel_marketplace`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.any([deadline, AbortSignal.timeout(2_500)]),
        },
      );
      if (response.ok) price = parseMeliSalePrice(await response.json());
    } catch {
      // O cartão pode usar o preço de tabela quando a API estiver indisponível.
    }
    if (price) prices.set(key, price);
    if (cache.size >= 10_000) cache.delete(cache.keys().next().value!);
    cache.set(key, { price, expiresAt: Date.now() + (price ? 120_000 : 20_000) });
  });
  return prices;
}
