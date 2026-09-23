/**
 * TikTok Shop Partner API — client.
 *
 * Terceiro canal, depois de Mercado Livre e Shopee. A autenticação é uma
 * MISTURA dos dois modelos anteriores, e é por isso que este arquivo existe em
 * vez de reaproveitar `src/lib/shopee.ts`:
 *
 *   - OAuth de verdade (auth_code -> access_token/refresh_token), como o ML;
 *   - MAIS uma assinatura HMAC-SHA256 em toda chamada, como a Shopee;
 *   - MAIS um `shop_cipher` por loja, que não existe em nenhum dos dois e é
 *     obrigatório em todo endpoint com escopo de loja.
 *
 * Hosts (a doc separa em dois, e trocar um pelo outro é erro silencioso):
 *   - auth.tiktok-shops.com         -> SÓ os endpoints de token
 *   - open-api.tiktokglobalshop.com -> todo o resto
 *
 * Credenciais: TIKTOK_APP_KEY, TIKTOK_APP_SECRET, TIKTOK_SERVICE_ID.
 */
import crypto from "crypto";

import prisma from "@/lib/prisma";

/** Endpoints de token. Não são assinados: recebem o app_secret direto. */
const TIKTOK_AUTH_HOST = "https://auth.tiktok-shops.com";

/** Endpoints de dados. Todos assinados. */
const TIKTOK_API_HOST = "https://open-api.tiktokglobalshop.com";

/**
 * Tela de consentimento do VENDEDOR no mercado "Rest of World" (inclui Brasil).
 * O mercado americano usa services.us.tiktokshop.com — se algum dia houver loja
 * nos EUA, este host passa a depender da loja.
 */
const TIKTOK_SELLER_AUTHORIZE_URL = "https://services.tiktokshop.com/open/authorize";

const HTTP_TIMEOUT_MS = 20_000;

/** Renova o token quando falta menos que isto para expirar. */
const TOKEN_REFRESH_MARGIN_MS = 30 * 60 * 1000;

/**
 * Cookies que carregam o OAuth entre `/api/tiktok/auth` e o callback.
 *
 * Moram aqui, e não no `route.ts`, porque um route handler só deve exportar os
 * verbos HTTP e a config de rota — export extra briga com a checagem de tipos
 * do build do Next.
 */
export const TIKTOK_STATE_COOKIE = "tiktok_oauth_state";
export const TIKTOK_MODE_COOKIE = "tiktok_oauth_mode";

export function getTiktokCredentials(): {
  appKey: string;
  appSecret: string;
  serviceId: string;
} {
  return {
    appKey: process.env.TIKTOK_APP_KEY ?? "",
    appSecret: process.env.TIKTOK_APP_SECRET ?? "",
    serviceId: process.env.TIKTOK_SERVICE_ID ?? "",
  };
}

/** Quais credenciais estão faltando. Vazio = tudo configurado. */
export function missingTiktokCredentials(): string[] {
  const { appKey, appSecret, serviceId } = getTiktokCredentials();
  return [
    !appKey && "TIKTOK_APP_KEY",
    !appSecret && "TIKTOK_APP_SECRET",
    !serviceId && "TIKTOK_SERVICE_ID",
  ].filter((value): value is string => typeof value === "string");
}

/**
 * Assinatura HMAC-SHA256 de uma chamada.
 *
 * A ordem dos passos é a da doc oficial e NENHUM deles é opcional:
 *   1. query sem `sign` e sem `access_token`;
 *   2. chaves em ordem alfabética;
 *   3. concatena `{chave}{valor}` (sem '=' e sem '&');
 *   4. prefixa o PATH do endpoint;
 *   5. anexa o corpo CRU, quando não é multipart/form-data;
 *   6. envolve tudo com o app_secret nas duas pontas;
 *   7. HMAC-SHA256 usando o app_secret também como chave.
 *
 * O app_secret aparece duas vezes de propósito (envelope + chave do HMAC).
 *
 * ⚠️  `body` tem que ser EXATAMENTE a string enviada na rede. Serializar o JSON
 * duas vezes (uma para assinar, outra para enviar) muda ordem/espaçamento e
 * invalida a assinatura. Serialize UMA vez e passe a mesma string para os dois.
 */
export function signTiktokRequest(params: {
  path: string;
  query: Record<string, string>;
  body?: string;
  appSecret: string;
}): string {
  const { path, query, body, appSecret } = params;

  const base = Object.keys(query)
    .filter((key) => key !== "sign" && key !== "access_token")
    .sort()
    .map((key) => `${key}${query[key]}`)
    .join("");

  let signString = `${path}${base}`;
  if (body) signString += body;
  signString = `${appSecret}${signString}${appSecret}`;

  return crypto.createHmac("sha256", appSecret).update(signString).digest("hex");
}

/** URL da tela de consentimento. `state` volta no callback e amarra a sessão. */
export function getTiktokSellerAuthUrl(serviceId: string, state: string): string {
  const url = new URL(TIKTOK_SELLER_AUTHORIZE_URL);
  url.searchParams.set("service_id", serviceId);
  url.searchParams.set("state", state);
  return url.toString();
}

/* -------------------------------------------------------------------------- */
/*                Transporte: timeout, envelope e retry de cota               */
/* -------------------------------------------------------------------------- */

/** Erro de chamada à API, já com o código de negócio quando existe. */
export class TiktokApiError extends Error {
  readonly httpStatus: number;
  readonly code: number | null;
  /** Espera pedida pelo header `Retry-After`, quando veio. */
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    httpStatus: number,
    code: number | null,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "TiktokApiError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }

  /**
   * Throttling. A doc é explícita: HTTP 429 e o código de negócio 36009002
   * significam a MESMA coisa e podem vir separados, então os dois contam.
   */
  get isRateLimited(): boolean {
    return this.httpStatus === 429 || this.code === 36009002;
  }

  /** Token inválido/expirado — vale tentar de novo depois de renovar. */
  get isInvalidToken(): boolean {
    return this.httpStatus === 401 || this.code === 105002 || this.code === 105000;
  }

  /**
   * A autorização foi retirada pelo vendedor. Diferente de token expirado:
   * renovar não resolve, só passar pelo consentimento de novo. É o que alimenta
   * a situação `reconectar` na tela de Contas.
   */
  get requiresReauthorization(): boolean {
    return this.code === 105001 || this.code === 105003;
  }
}

async function rawFetch(
  url: string,
  init: RequestInit,
): Promise<{ status: number; retryAfter: string | null; payload: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const payload: unknown = await res.json().catch(() => null);
    return { status: res.status, retryAfter: res.headers.get("retry-after"), payload };
  } finally {
    clearTimeout(timer);
  }
}

/** Envelope padrão de resposta: `{ code, message, data }`. code 0 = sucesso. */
function unwrap(
  payload: unknown,
  status: number,
  context: string,
  retryAfter: string | null = null,
): Record<string, unknown> {
  const env = (payload ?? {}) as { code?: number; message?: string; data?: unknown };
  const code = typeof env.code === "number" ? env.code : null;

  if (status < 200 || status >= 300 || (code !== null && code !== 0)) {
    throw new TiktokApiError(
      `TikTok ${context}: http=${status} code=${code ?? "-"} ${env.message ?? ""}`.trim(),
      status,
      code,
      parseRetryAfterMs(retryAfter),
    );
  }
  return (env.data ?? {}) as Record<string, unknown>;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

const MAX_RATE_LIMIT_RETRIES = 5;
const BACKOFF_CAP_MS = 60_000;

/**
 * Backoff exponencial com jitter, honrando `Retry-After`.
 *
 * O TikTok NÃO publica um QPS fixo: a cota é dinâmica por app x loja, então a
 * única estratégia correta é reagir ao sinal de throttling em vez de tentar
 * adivinhar um limite.
 */
async function withRateLimitRetry<T>(context: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const rateLimited = error instanceof TiktokApiError && error.isRateLimited;
      if (!rateLimited || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;

      const generated = Math.min(1000 * 2 ** attempt + Math.random() * 500, BACKOFF_CAP_MS);
      // Quando a API diz quanto esperar, ela ganha do nosso backoff — mas
      // limitado ao teto, senão um Retry-After absurdo travaria o job inteiro.
      const requested = Math.min(error.retryAfterMs ?? 0, BACKOFF_CAP_MS);
      const wait = Math.max(generated, requested);
      console.warn(`[TikTok] throttled em ${context}; aguardando ${Math.round(wait)}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

export type TiktokCallParams = {
  path: string;
  method?: "GET" | "POST";
  accessToken: string;
  /** Vai na query E na assinatura. Obrigatório em endpoints de loja. */
  shopCipher?: string | null;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
};

/**
 * Uma chamada assinada à Open API. Centraliza assinatura, envelope e retry —
 * nenhum endpoint deve montar isso à mão.
 */
export async function tiktokApiCall(
  params: TiktokCallParams,
): Promise<Record<string, unknown>> {
  const { path, method = "GET", accessToken, shopCipher, query = {}, body } = params;
  const { appKey, appSecret } = getTiktokCredentials();

  const signedQuery: Record<string, string> = {
    app_key: appKey,
    timestamp: Math.floor(Date.now() / 1000).toString(),
  };
  if (shopCipher) signedQuery.shop_cipher = shopCipher;
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      signedQuery[key] = String(value);
    }
  }

  // Serializa UMA vez: a mesma string é assinada e enviada.
  const bodyString = body ? JSON.stringify(body) : undefined;
  signedQuery.sign = signTiktokRequest({
    path,
    query: signedQuery,
    body: bodyString,
    appSecret,
  });

  const url = new URL(`${TIKTOK_API_HOST}${path}`);
  for (const [key, value] of Object.entries(signedQuery)) {
    url.searchParams.set(key, value);
  }

  return withRateLimitRetry(path, async () => {
    const { status, retryAfter, payload } = await rawFetch(url.toString(), {
      method,
      headers: {
        "x-tts-access-token": accessToken,
        "content-type": "application/json",
      },
      body: bodyString,
    });
    return unwrap(payload, status, path, retryAfter);
  });
}

/* -------------------------------------------------------------------------- */
/*                        Helpers de leitura de payload                       */
/* -------------------------------------------------------------------------- */

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Epoch em SEGUNDOS para `Date`, tratando o `0` da API como ausente.
 *
 * O `0` é o "não se aplica" do TikTok em campos de prazo. Convertido
 * literalmente daria 1970, e a tela de Expedição anunciaria atraso de vinte mil
 * dias — o mesmo tropeço que a Shopee já documenta em `ship_by_date`.
 */
export function epochSecondsToDate(value: unknown): Date | null {
  const seconds = toFiniteNumber(value);
  if (seconds === null || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date : null;
}

/* -------------------------------------------------------------------------- */
/*                                   Tokens                                   */
/* -------------------------------------------------------------------------- */

export type TiktokTokens = {
  accessToken: string;
  refreshToken: string;
  /** Instante de expiração do access token (com margem de segurança). */
  accessExpiresAt: Date;
  /** Instante de expiração do refresh token, quando informado. */
  refreshExpiresAt: Date | null;
  sellerName: string | null;
  sellerBaseRegion: string | null;
};

async function tokenCall(url: string, context: string): Promise<TiktokTokens> {
  const { status, payload } = await rawFetch(url, { method: "GET" });
  const data = unwrap(payload, status, context);

  const accessToken = str(data.access_token);
  const refreshToken = str(data.refresh_token);
  if (!accessToken || !refreshToken) {
    throw new Error(`TikTok ${context}: resposta sem access_token/refresh_token.`);
  }

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: resolveExpiry(data.access_token_expire_in) ?? new Date(Date.now() + 3_600_000),
    refreshExpiresAt: resolveExpiry(data.refresh_token_expire_in),
    sellerName: str(data.seller_name),
    sellerBaseRegion: str(data.seller_base_region),
  };
}

/**
 * `access_token_expire_in` / `refresh_token_expire_in` vêm como EPOCH absoluto
 * em segundos. Tratamos os dois formatos: valor pequeno é duração, valor grande
 * é epoch — assim a conta não quebra se a API mudar. Descontamos 5 minutos de
 * margem, igual ao refresh da Shopee.
 *
 * Valores observados: access ~7 dias, refresh ~100 anos.
 */
function resolveExpiry(value: unknown, marginSeconds = 300): Date | null {
  const raw = toFiniteNumber(value);
  if (raw === null || raw <= 0) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const epoch = raw > nowSeconds ? raw : nowSeconds + raw;
  return new Date(Math.max(0, epoch - marginSeconds) * 1000);
}

/** Troca o auth_code do callback pelos tokens do vendedor. */
export async function exchangeTiktokAuthCode(authCode: string): Promise<TiktokTokens> {
  const { appKey, appSecret } = getTiktokCredentials();
  const url = new URL(`${TIKTOK_AUTH_HOST}/api/v2/token/get`);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("app_secret", appSecret);
  url.searchParams.set("auth_code", authCode);
  url.searchParams.set("grant_type", "authorized_code");
  return tokenCall(url.toString(), "token/get");
}

/** Renova o access token a partir do refresh token (sem persistir). */
export async function refreshTiktokToken(refreshToken: string): Promise<TiktokTokens> {
  const { appKey, appSecret } = getTiktokCredentials();
  const url = new URL(`${TIKTOK_AUTH_HOST}/api/v2/token/refresh`);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("app_secret", appSecret);
  url.searchParams.set("refresh_token", refreshToken);
  url.searchParams.set("grant_type", "refresh_token");
  return tokenCall(url.toString(), "token/refresh");
}

/** Conta conectada, na forma mínima que o sync precisa carregar. */
export type TiktokAccountRef = {
  id: string;
  /** Multi-tenant: toda escrita é filtrada por dono. */
  userId: string;
  shopId: string;
  shopCipher: string | null;
  shopName: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

/**
 * Garante um access token válido, renovando e PERSISTINDO quando necessário.
 *
 * ⚠️  O refresh do TikTok devolve um refresh_token NOVO. Se a gente renovar e
 * não gravar o novo, o antigo pode deixar de valer e a loja cai na próxima
 * renovação. Por isso a persistência acontece aqui, junto da renovação, e a
 * conta recebida é mutada para o restante do job usar o token novo.
 *
 * Diferente do v2 (single-tenant), o `update` é filtrado por `userId` além do
 * `id`: `updateMany` com os dois garante que um id vazado não escreva na conta
 * de outro usuário.
 */
export async function ensureTiktokAccessToken(account: TiktokAccountRef): Promise<string> {
  if (account.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return account.accessToken;
  }

  let refreshed: TiktokTokens;
  try {
    refreshed = await refreshTiktokToken(account.refreshToken);
  } catch (error) {
    // Autorização retirada: marca a conta para a tela pedir reconexão, em vez
    // de o sync tentar de novo a cada rodada contra um refresh token morto.
    if (error instanceof TiktokApiError && error.requiresReauthorization) {
      await markTiktokAccountInvalid(account.id, account.userId);
    }
    throw error;
  }

  await prisma.tiktokAccount.updateMany({
    where: { id: account.id, userId: account.userId },
    data: {
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      expires_at: refreshed.accessExpiresAt,
      refresh_expires_at: refreshed.refreshExpiresAt,
      refresh_token_invalid_until: null,
    },
  });

  account.accessToken = refreshed.accessToken;
  account.refreshToken = refreshed.refreshToken;
  account.expiresAt = refreshed.accessExpiresAt;
  console.log(`[TikTok] token renovado para loja ${account.shopId}`);
  return refreshed.accessToken;
}

/**
 * Marca a conta como precisando de reconsentimento.
 *
 * Usa a mesma coluna `refresh_token_invalid_until` que ML e Shopee, para a
 * situação `reconectar` de `/api/contas` valer igual nas três plataformas.
 */
export async function markTiktokAccountInvalid(
  accountId: string,
  userId: string,
  hours = 24,
): Promise<void> {
  await prisma.tiktokAccount.updateMany({
    where: { id: accountId, userId },
    data: { refresh_token_invalid_until: new Date(Date.now() + hours * 3_600_000) },
  });
}

/**
 * Executa uma operação de loja, renovando o token UMA vez se ele for recusado.
 * Espelha o `executeWithTokenRetry` da Shopee.
 */
export async function withTiktokTokenRetry<T>(
  account: TiktokAccountRef,
  run: (accessToken: string) => Promise<T>,
): Promise<T> {
  const token = await ensureTiktokAccessToken(account);
  try {
    return await run(token);
  } catch (error) {
    if (!(error instanceof TiktokApiError) || !error.isInvalidToken) throw error;
    // Força a renovação zerando a validade conhecida.
    account.expiresAt = new Date(0);
    const fresh = await ensureTiktokAccessToken(account);
    return run(fresh);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Endpoints                                 */
/* -------------------------------------------------------------------------- */

export type TiktokShop = {
  shopId: string;
  /** Obrigatório em toda chamada com escopo de loja E entra na assinatura. */
  cipher: string | null;
  name: string | null;
  region: string | null;
  sellerType: string | null;
  code: string | null;
};

/**
 * Lojas que este token pode acessar.
 *
 * É o MENOR teste possível da assinatura: só exige app_key, timestamp e sign na
 * query, sem shop_cipher e sem corpo. Se responder, o HMAC está correto; se vier
 * 106001 "signature is invalid", o erro está no algoritmo e não em outra coisa.
 */
export async function getTiktokAuthorizedShops(accessToken: string): Promise<TiktokShop[]> {
  const data = await tiktokApiCall({ path: "/authorization/202309/shops", accessToken });
  const shops = Array.isArray(data.shops) ? (data.shops as Array<Record<string, unknown>>) : [];
  return shops.map((shop) => ({
    shopId: String(shop.id ?? ""),
    cipher: str(shop.cipher),
    name: str(shop.name),
    region: str(shop.region),
    sellerType: str(shop.seller_type),
    code: str(shop.code),
  }));
}

/** Objeto de pedido cru da API (muitos campos opcionais e fracamente tipados). */
export type TiktokOrder = Record<string, unknown>;

export type TiktokOrderPage = {
  orders: TiktokOrder[];
  nextPageToken: string | null;
  totalCount: number | null;
};

/**
 * Busca pedidos por JANELA DE ATUALIZAÇÃO.
 *
 * É POST (não GET): o filtro vai no corpo, e o corpo entra na assinatura. A
 * paginação é por `page_token` opaco — não existe offset, então não há o teto
 * de ~1000 que obriga o ML a usar keyset.
 *
 * `update_time` (e não `create_time`) é o que permite sync incremental: pedido
 * antigo que mudou de status volta na janela. A doc avisa que o update_time
 * retornado PODE cair fora da janela pedida, porque os dados são atualizados
 * durante a varredura — daí a sobreposição que o sync aplica no watermark.
 */
export async function searchTiktokOrders(params: {
  accessToken: string;
  shopCipher: string | null;
  updateTimeGe: number;
  updateTimeLt: number;
  pageSize?: number;
  pageToken?: string | null;
}): Promise<TiktokOrderPage> {
  const {
    accessToken,
    shopCipher,
    updateTimeGe,
    updateTimeLt,
    pageSize = 50,
    pageToken,
  } = params;

  const data = await tiktokApiCall({
    path: "/order/202309/orders/search",
    method: "POST",
    accessToken,
    shopCipher,
    query: {
      page_size: pageSize,
      sort_field: "update_time",
      sort_order: "ASC",
      page_token: pageToken ?? undefined,
    },
    body: {
      update_time_ge: updateTimeGe,
      update_time_lt: updateTimeLt,
    },
  });

  const orders = Array.isArray(data.orders) ? (data.orders as TiktokOrder[]) : [];
  return {
    orders,
    nextPageToken: str(data.next_page_token),
    totalCount: toFiniteNumber(data.total_count),
  };
}

/**
 * Financeiro REAL de um pedido (extrato).
 *
 * Só existe depois da liquidação (entrega + ~7 dias no BR). Antes disso a API
 * devolve vazio, e é por isso que o sync grava o estimado primeiro e marca
 * `is_margem_real = false`.
 */
export async function getTiktokOrderStatement(params: {
  accessToken: string;
  shopCipher: string | null;
  orderId: string;
}): Promise<Record<string, unknown>> {
  const { accessToken, shopCipher, orderId } = params;
  return tiktokApiCall({
    path: `/finance/202309/orders/${encodeURIComponent(orderId)}/statement_transactions`,
    accessToken,
    shopCipher,
  });
}

/* -------------------------------------------------------------------------- */
/*                              Status de pedido                              */
/* -------------------------------------------------------------------------- */

/** Não conta como venda: pedido cancelado ou ainda sem pagamento. */
export const TIKTOK_NON_SALE_STATUS = new Set(["CANCELLED", "UNPAID"]);

/** Fila de expedição: aguardando despacho ou coleta. */
export const TIKTOK_SHIPPING_QUEUE_STATUS = new Set([
  "AWAITING_SHIPMENT",
  "AWAITING_COLLECTION",
  "PARTIALLY_SHIPPING",
]);

/** Estado final: não muda mais, então o financeiro pode ser considerado firme. */
export const TIKTOK_TERMINAL_STATUS = new Set(["COMPLETED", "CANCELLED"]);
