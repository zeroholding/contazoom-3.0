/**
 * TikTok Shop OAuth — passo 2 (callback) + passo 3 (descoberta de lojas).
 *
 * O TikTok redireciona para cá com `code` (auth_code, de uso único) e `state`.
 * Aqui a gente:
 *   1. confere o `state` contra o cookie gravado em `/api/tiktok/auth`;
 *   2. troca o `code` pelos tokens do vendedor;
 *   3. chama `/authorization/202309/shops` — que é o teste real da ASSINATURA e
 *      de onde vem o `shop_cipher` de cada loja;
 *   4. grava cada loja em `tiktok_account`.
 *
 * Duas diferenças deliberadas em relação a `/api/shopee/callback`:
 *
 * - O `state` é REALMENTE conferido. A rota da Shopee grava o cookie e nunca
 *   compara, o que torna o cookie decorativo: sem a conferência, um terceiro
 *   consegue fazer o navegador de quem está logado aqui trocar um auth_code
 *   escolhido por ele, e a loja do atacante entra na conta da vítima.
 *
 * - A persistência usa o client tipado (`upsert`), não `$executeRaw`. Além de
 *   não haver motivo para SQL cru aqui, o `upsert` resolve a corrida entre dois
 *   callbacks simultâneos pela chave única, coisa que o par SELECT-depois-INSERT
 *   da Shopee não faz.
 *
 * UMA autorização pode liberar VÁRIAS lojas, então o passo 3 grava todas.
 */
import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  exchangeTiktokAuthCode,
  getTiktokAuthorizedShops,
  missingTiktokCredentials,
  TIKTOK_MODE_COOKIE,
  TIKTOK_STATE_COOKIE,
  type TiktokShop,
  type TiktokTokens,
} from "@/lib/tiktok";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // A doc usa `code` na descrição e `auth_code` em alguns exemplos. Aceitar os
  // dois evita um "faltou o code" que na verdade é diferença de nomenclatura.
  const code = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get(TIKTOK_STATE_COOKIE)?.value ?? null;
  const oauthMode = req.cookies.get(TIKTOK_MODE_COOKIE)?.value ?? "redirect";

  const redirectOrigin =
    process.env.TIKTOK_REDIRECT_ORIGIN ||
    (req.headers.get("x-forwarded-proto") || "http") + "://" + req.headers.get("host");
  const secure = redirectOrigin.startsWith("https");

  const clearAuthCookies = (res: NextResponse) => {
    const base = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: 0,
    };
    res.cookies.set({ name: TIKTOK_STATE_COOKIE, value: "", ...base });
    res.cookies.set({ name: TIKTOK_MODE_COOKIE, value: "", ...base });
  };

  const respondWithPopup = (options: {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
    status?: number;
  }) => {
    const payload = {
      type: options.success ? "tiktok:auth:success" : "tiktok:auth:error",
      message: options.message,
      data: options.data ?? null,
    };
    const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
    const title = options.success
      ? "Conexão TikTok Shop concluída"
      : "Conexão TikTok Shop não concluída";
    const description = options.success
      ? "Conta TikTok Shop conectada com sucesso. Esta janela pode ser fechada."
      : options.message;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; padding: 48px 32px; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f9fafb; color: #111827; }
    main { max-width: 420px; margin: 0 auto; text-align: center; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.5; margin-bottom: 12px; }
    .hint { color: #6b7280; font-size: 14px; margin-top: 28px; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${description}</p>
    <p class="hint">Esta janela será fechada automaticamente.</p>
  </main>
  <script>
    (function() {
      const payload = ${payloadJson};
      try {
        if (window.opener) {
          window.opener.postMessage(payload, window.location.origin);
        }
      } catch (err) {
        console.error('Failed to notify opener about TikTok auth result.', err);
      }
      setTimeout(function() { window.close(); }, 1600);
    })();
  </script>
</body>
</html>`;
    const res = new NextResponse(html, {
      status: options.status ?? (options.success ? 200 : 400),
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    clearAuthCookies(res);
    return res;
  };

  /**
   * No ERRO a resposta fora do popup é JSON, e não texto solto como na Shopee:
   * o que importa aqui é o código do TikTok (106001 = assinatura inválida,
   * auth_code já usado, escopo não concedido), e isso não cabe num banner.
   */
  const fail = (
    status: number,
    message: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (oauthMode === "popup") {
      return respondWithPopup({ success: false, message, status });
    }
    const res = NextResponse.json({ ok: false, error: message, ...extra }, { status });
    clearAuthCookies(res);
    return res;
  };

  if (!code) {
    return fail(400, "O TikTok nao devolveu o parametro `code`. Refaca a autorizacao.");
  }

  // O `state` prova que este callback é resposta ao NOSSO pedido de autorização.
  if (!expectedState || !state || state !== expectedState) {
    return fail(400, "State invalido ou expirado. Comece de novo pela tela de Contas.", {
      hint: "O cookie de state vale 15 minutos e exige que a autorizacao comece no mesmo navegador.",
    });
  }

  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) {
    if (oauthMode === "popup") {
      return respondWithPopup({
        success: false,
        message: "Sessao expirada. Faca login novamente.",
        status: 401,
      });
    }
    const loginUrl = new URL("/login", req.url);
    if (loginUrl.hostname === "localhost" || loginUrl.hostname === "127.0.0.1") {
      loginUrl.protocol = "http:";
    }
    loginUrl.searchParams.set("redirect", "/contas");
    loginUrl.searchParams.set("error", "session_expired");
    const redirectRes = NextResponse.redirect(loginUrl);
    clearAuthCookies(redirectRes);
    return redirectRes;
  }

  const missing = missingTiktokCredentials();
  if (missing.length > 0) {
    return fail(500, `Credenciais TikTok ausentes: ${missing.join(", ")}`);
  }

  let tokens: TiktokTokens;
  try {
    tokens = await exchangeTiktokAuthCode(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    console.error("[TikTok Callback] Falha ao trocar auth_code:", message);
    return fail(400, `Falha ao trocar o auth_code pelos tokens: ${message}`, {
      hint: "auth_code e de uso unico e vale poucos minutos. Se recarregou esta pagina, refaca a autorizacao.",
    });
  }

  // Primeira chamada assinada. Se a assinatura estiver errada, é aqui que
  // aparece (code 106001) — e não mais tarde, no meio de um sync.
  let shops: TiktokShop[];
  try {
    shops = await getTiktokAuthorizedShops(tokens.accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    console.error("[TikTok Callback] Falha ao listar lojas autorizadas:", message);
    return fail(502, `Token obtido, mas a listagem de lojas falhou: ${message}`, {
      hint: "code 106001 indica erro de assinatura; falta de escopo indica autorizacao incompleta no Partner Center.",
    });
  }

  const comId = shops.filter((shop) => shop.shopId !== "");
  if (comId.length === 0) {
    return fail(
      422,
      "A autorizacao foi concedida, mas nenhuma loja veio na resposta.",
      { hint: "Confirme no Partner Center que o app tem acesso a uma loja ativa." },
    );
  }

  try {
    for (const shop of comId) {
      const dadosComuns = {
        shop_cipher: shop.cipher,
        shop_name: shop.name,
        seller_name: tokens.sellerName,
        region: shop.region ?? tokens.sellerBaseRegion,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.accessExpiresAt,
        refresh_expires_at: tokens.refreshExpiresAt,
        // Reconectar limpa a marca de "precisa reconsentir": é justamente o que
        // acabou de acontecer.
        refresh_token_invalid_until: null,
      };

      await prisma.tiktokAccount.upsert({
        where: { userId_shop_id: { userId: session.sub, shop_id: shop.shopId } },
        update: dadosComuns,
        create: { userId: session.sub, shop_id: shop.shopId, ...dadosComuns },
      });
    }
  } catch (error) {
    console.error("[TikTok Callback] Erro ao salvar conta TikTok:", error);
    return fail(500, "Erro interno ao gravar a loja conectada.");
  }

  console.log(
    `[TikTok Callback] ${comId.length} loja(s) conectada(s) para o usuario ${session.sub}`,
  );

  if (oauthMode === "popup") {
    return respondWithPopup({
      success: true,
      message: "Conta TikTok Shop conectada com sucesso.",
      data: { shops: comId.map((shop) => ({ shopId: shop.shopId, name: shop.name })) },
      status: 200,
    });
  }

  const contasUrl = new URL("/contas", req.url);
  contasUrl.searchParams.set("tiktok_connected", "true");
  const redirectRes = NextResponse.redirect(contasUrl, { status: 302 });
  clearAuthCookies(redirectRes);
  return redirectRes;
}
