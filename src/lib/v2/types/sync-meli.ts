export type FreightSource = "shipment" | "order" | "shipping_option" | null;

export type MeliOrderFreight = {
  logisticType: string | null;
  logisticTypeSource: FreightSource | null;
  shippingMode: string | null;

  baseCost: number | null;
  listCost: number | null;
  shippingOptionCost: number | null;
  shipmentCost: number | null;
  orderCostFallback: number | null;
  finalCost: number | null;
  finalCostSource: FreightSource;
  chargedCost: number | null;
  chargedCostSource: FreightSource;

  discount: number | null;
  totalAmount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  diffBaseList: number | null;

  adjustedCost: number | null;
  adjustmentSource: string | null;

  sellerShippingCost: number | null;
  costsGrossAmount: number | null;  // gross_amount do /costs endpoint (usado para receita FLEX)
};

export type MeliOrderPayload = {
  accountId: string;
  accountNickname: string | null | undefined;
  mlUserId: number | bigint;
  order: unknown;
  shipment?: unknown;
  freight: MeliOrderFreight;
};

export type OrdersFetchResult = {
  orders: MeliOrderPayload[];
  expectedTotal: number;
};

export type FetchOrdersResult = {
  orders: MeliOrderPayload[];
  expectedTotal: number;
  forcedStop: boolean;
};

export type SyncError = {
  accountId: string;
  mlUserId: bigint;
  message: string;
};

export type AccountSummary = {
  id: string;
  nickname: string | null;
  ml_user_id: number;
  expires_at: string;
};

export type DateRangeWindow = {
  from: Date;
  to: Date;
  total: number;
  depth: number;
};

export type SyncWindow = {
  from: Date;
  to: Date;
  mode: "initial" | "historical" | "manual";
};

export type SkuCacheEntry = {
  custoUnitario: number | null;
  tipo: string | null;
};

export type MeliAccount = {
  id: string;
  ml_user_id: bigint;
  nickname: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  updated_at: Date;
};

export type FetchOrdersPageOptions = {
  account: MeliAccount;
  headers: Record<string, string>;
  userId: string;
  offset: number;
  pageNumber: number;
  dateFrom?: Date;
  dateTo?: Date;
};

export type FetchOrdersPageResult = {
  offset: number;
  pageNumber: number;
  total: number | null;
  orders: MeliOrderPayload[];
};
