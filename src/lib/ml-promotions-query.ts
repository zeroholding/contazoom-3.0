/**
 * Filtros da tela /promocoes, lidos da URL.
 *
 * Tudo na URL (e não em estado de cliente) para o link poder ser copiado e para
 * o servidor renderizar a página já filtrada — mesmo padrão das outras telas.
 */

export type PromoItemStatus = "started" | "candidate" | "todos";

export type PromoWindow = "todas" | "hoje" | "amanha" | "3" | "7" | "30" | "sem-data";

export type PromoSort = "fim" | "desconto" | "preco";

export type PromotionFilters = {
  accounts: string[];
  types: string[];
  window: PromoWindow;
  status: PromoItemStatus;
  q: string;
  sort: PromoSort;
  /** Desconto mínimo em %, ou null para qualquer. */
  minDiscount: number | null;
  page: number;
  perPage: number;
};

export const PROMO_WINDOWS: { value: PromoWindow; label: string }[] = [
  { value: "todas", label: "Qualquer prazo" },
  { value: "hoje", label: "Termina hoje" },
  { value: "amanha", label: "Termina amanhã" },
  { value: "3", label: "Em até 3 dias" },
  { value: "7", label: "Em até 7 dias" },
  { value: "30", label: "Em até 30 dias" },
  { value: "sem-data", label: "Sem data informada" },
];

/** Faixas de desconto oferecidas no filtro. */
export const PROMO_DISCOUNTS: { value: number | null; label: string }[] = [
  { value: null, label: "Qualquer desconto" },
  { value: 5, label: "A partir de 5%" },
  { value: 10, label: "A partir de 10%" },
  { value: 20, label: "A partir de 20%" },
  { value: 30, label: "A partir de 30%" },
  { value: 50, label: "A partir de 50%" },
];

export const PROMO_STATUSES: { value: PromoItemStatus; label: string }[] = [
  { value: "started", label: "Em promoção" },
  { value: "candidate", label: "Convites" },
  { value: "todos", label: "Tudo" },
];

const PER_PAGE_DEFAULT = 50;
const PER_PAGE_MAX = 200;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function many(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  // Aceita tanto `?contas=A,B` quanto `?contas=A&contas=B`.
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

export function parsePromotionFilters(
  sp: Record<string, string | string[] | undefined>,
): PromotionFilters {
  const windowRaw = first(sp.janela);
  const window: PromoWindow =
    windowRaw === "hoje" ||
    windowRaw === "amanha" ||
    windowRaw === "3" ||
    windowRaw === "7" ||
    windowRaw === "30" ||
    windowRaw === "sem-data"
      ? windowRaw
      : "todas";

  const statusRaw = first(sp.situacao);
  const status: PromoItemStatus =
    statusRaw === "candidate" || statusRaw === "todos" ? statusRaw : "started";

  const sortRaw = first(sp.ordem);
  const sort: PromoSort = sortRaw === "desconto" || sortRaw === "preco" ? sortRaw : "fim";

  const discountRaw = Number.parseInt(first(sp.desconto), 10);
  const minDiscount = Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : null;

  const page = Math.max(1, Number.parseInt(first(sp.pagina), 10) || 1);
  const perPageRaw = Number.parseInt(first(sp.porPagina), 10) || PER_PAGE_DEFAULT;

  return {
    accounts: many(sp.contas),
    types: many(sp.tipos),
    window,
    status,
    q: first(sp.q).trim(),
    sort,
    minDiscount,
    page,
    perPage: Math.min(PER_PAGE_MAX, Math.max(10, perPageRaw)),
  };
}

/** Monta a query string preservando o que não mudou. Usado pelos links da tela. */
export function buildPromotionQuery(
  filters: PromotionFilters,
  overrides: Partial<Record<string, string | number | undefined>> = {},
): string {
  const params = new URLSearchParams();

  if (filters.accounts.length > 0) params.set("contas", filters.accounts.join(","));
  if (filters.types.length > 0) params.set("tipos", filters.types.join(","));
  if (filters.window !== "todas") params.set("janela", filters.window);
  if (filters.status !== "started") params.set("situacao", filters.status);
  if (filters.sort !== "fim") params.set("ordem", filters.sort);
  if (filters.minDiscount !== null) params.set("desconto", String(filters.minDiscount));
  if (filters.q) params.set("q", filters.q);
  if (filters.perPage !== PER_PAGE_DEFAULT) params.set("porPagina", String(filters.perPage));

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Rótulo humano do tipo de promoção (o enum da API não é para a tela). */
export const PROMO_TYPE_LABELS: Record<string, string> = {
  DEAL: "Oferta do dia",
  SMART: "Promoção inteligente",
  SMART_LIGHTNING: "Relâmpago inteligente",
  LIGHTNING: "Oferta relâmpago",
  UNHEALTHY_STOCK: "Estoque parado (Full)",
  MARKETPLACE_CAMPAIGN: "Campanha do marketplace",
  PRICE_DISCOUNT: "Desconto individual",
  VOLUME: "Desconto por volume",
  PRE_NEGOTIATED: "Pré-negociada",
  SELLER_CAMPAIGN: "Campanha do vendedor",
  DOD: "Oferta do dia (DOD)",
  PRICE_MATCHING: "Acompanha preço",
  SELLER_COUPON_CAMPAIGN: "Cupom do vendedor",
};

export function promoTypeLabel(type: string | null | undefined): string {
  if (!type) return "Promoção";
  return PROMO_TYPE_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
}

/**
 * Quem define a data de término — o painel precisa dizer isso, porque a
 * ausência de data em `LIGHTNING` não é falha do sistema, é limitação da API.
 */
export function finishSource(type: string | null | undefined): "item" | "campanha" | "nenhuma" {
  if (!type) return "nenhuma";
  // Tipos em que a data de término é do próprio anúncio. PRICE_DISCOUNT entra
  // aqui porque cada desconto individual tem o seu prazo, sem campanha.
  if (
    type === "SMART" ||
    type === "SMART_LIGHTNING" ||
    type === "SELLER_CAMPAIGN" ||
    type === "PRICE_DISCOUNT"
  ) {
    return "item";
  }
  if (type === "LIGHTNING" || type === "DOD") return "nenhuma";
  return "campanha";
}
