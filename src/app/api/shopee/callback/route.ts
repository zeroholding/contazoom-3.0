import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { tryVerifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const shop_id = url.searchParams.get("shop_id") || url.searchParams.get("shopid");
  const oauthMode = req.cookies.get("shopee_oauth_mode")?.value ?? "redirect";
  
  const redirectOrigin = process.env.SHOPEE_REDIRECT_ORIGIN || (req.headers.get("x-forwarded-proto") || "http") + "://" + req.headers.get("host");
  const secure = redirectOrigin.startsWith("https");

  const clearAuthCookies = (res: NextResponse) => {
    const base = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: 0,
    };
    res.cookies.set({ name: "shopee_oauth_state", value: "", ...base });
    res.cookies.set({ name: "shopee_oauth_mode", value: "", ...base });
  };

  const respondWithPopup = (options: {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
    status?: number;
  }) => {
    const payload = {
      type: options.success ? "shopee:auth:success" : "shopee:auth:error",
      message: options.message,
      data: options.data ?? null,
    };
    const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
    const title = options.success ? "Conexão Shopee concluída" : "Conexão Shopee não concluída";
    const description = options.success
      ? "Conta Shopee conectada com sucesso. Esta janela pode ser fechada."
      : "Não foi possível conectar a conta Shopee. Esta janela pode ser fechada.";
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
        console.error('Failed to notify opener about Shopee auth result.', err);
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

  const respondWithText = (body: string, status: number) => {
    const res = new NextResponse(body, { status });
    clearAuthCookies(res);
    return res;
  };

  if (!code || !shop_id) {
    if (oauthMode === "popup") {
      return respondWithPopup({ success: false, message: "Missing code or shop_id", status: 400 });
    }
    return respondWithText("Missing code/shop_id", 400);
  }

  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) {
    if (oauthMode === "popup") {
      return respondWithPopup({ success: false, message: "Sessao expirada. Faca login novamente.", status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    if (loginUrl.hostname === "localhost" || loginUrl.hostname === "127.0.0.1") loginUrl.protocol = "http:";
    loginUrl.searchParams.set("redirect", "/contas");
    loginUrl.searchParams.set("error", "session_expired");
    const redirectRes = NextResponse.redirect(loginUrl);
    clearAuthCookies(redirectRes);
    return redirectRes;
  }

  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  if (!partnerId || !partnerKey) {
    if (oauthMode === "popup") {
      return respondWithPopup({ success: false, message: "Credenciais Shopee ausentes.", status: 500 });
    }
    return respondWithText("Shopee credentials missing", 500);
  }

  // Token exchange
  const ts = Math.floor(Date.now() / 1000);
  const path = "/api/v2/auth/token/get";
  const baseString = `${partnerId}${path}${ts}`;
  const sign = crypto.createHmac("sha256", partnerKey).update(baseString).digest("hex");

  const tokenUrl = `https://partner.shopeemobile.com${path}?partner_id=${partnerId}&timestamp=${ts}&sign=${sign}`;

  const body = {
    code,
    shop_id: Number(shop_id),
    partner_id: Number(partnerId),
  };

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || payload?.error) {
    const message = `Erro ao obter token Shopee: ${JSON.stringify(payload)}`;
    if (oauthMode === "popup") {
      return respondWithPopup({ success: false, message, status: 400 });
    }
    return respondWithText(message, 400);
  }

  const access_token: string | undefined = payload?.access_token;
  const refresh_token: string | undefined = payload?.refresh_token;
  const expire_in: number | undefined = payload?.expire_in;
  const resp_shop_id: string | number | undefined = payload?.shop_id ?? shop_id;
  const merchant_id: string | number | undefined = payload?.merchant_id ?? null;

  if (!access_token || !refresh_token || !expire_in || !resp_shop_id) {
    const message = `Resposta invalida de token Shopee: ${JSON.stringify(payload)}`;
    if (oauthMode === "popup") {
      return respondWithPopup({ success: false, message, status: 400 });
    }
    return respondWithText(message, 400);
  }

  const expiresAt = new Date(Date.now() + Math.max(30, expire_in - 60) * 1000);
  const shopIdStr = String(resp_shop_id);
  const merchantIdStr = merchant_id ? String(merchant_id) : null;

  // Buscar nome da loja
  let shopName: string | null = null;
  try {
    const pathShopInfo = "/api/v2/shop/get_shop_info";
    const ts2 = Math.floor(Date.now() / 1000);
    const baseString2 = `${partnerId}${pathShopInfo}${ts2}${access_token}${shopIdStr}`;
    const sign2 = crypto.createHmac("sha256", partnerKey).update(baseString2).digest("hex");
    const shopInfoUrl = `https://partner.shopeemobile.com${pathShopInfo}?partner_id=${partnerId}&timestamp=${ts2}&access_token=${access_token}&shop_id=${shopIdStr}&sign=${sign2}`;
    
    const infoRes = await fetch(shopInfoUrl);
    const infoData = await infoRes.json();
    if (infoData?.response?.shop_name) {
      shopName = infoData.response.shop_name;
    }
  } catch (err) {
    console.warn("Não foi possível buscar nome da loja Shopee:", err);
  }

  try {
    // Escapar corretamente as variáveis na raw query
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM shopee_account
      WHERE user_id = ${session.sub} AND shop_id = ${shopIdStr}
      LIMIT 1
    `;

    if (existing && existing.length > 0) {
      await prisma.$executeRaw`
        UPDATE shopee_account
        SET
          access_token = ${access_token},
          refresh_token = ${refresh_token},
          expires_at = ${expiresAt},
          merchant_id = ${merchantIdStr},
          shop_name = ${shopName},
          updated_at = NOW()
        WHERE user_id = ${session.sub} AND shop_id = ${shopIdStr}
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO shopee_account (
          id, user_id, shop_id, shop_name, merchant_id,
          access_token, refresh_token, expires_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid()::text,
          ${session.sub},
          ${shopIdStr},
          ${shopName},
          ${merchantIdStr},
          ${access_token},
          ${refresh_token},
          ${expiresAt},
          NOW(),
          NOW()
        )
      `;
    }
  } catch (err) {
    console.error("Erro ao salvar conta Shopee:", err);
    if (oauthMode === "popup") {
      return respondWithPopup({ success: false, message: "Erro interno", status: 500 });
    }
    return respondWithText("Erro interno", 500);
  }

  if (oauthMode === "popup") {
    return respondWithPopup({
      success: true,
      message: "Conta Shopee conectada com sucesso.",
      data: { shopId: shopIdStr },
      status: 200,
    });
  }

  const contasUrl = new URL("/contas", req.url);
  contasUrl.searchParams.set("shopee_connected", "true");
  const redirectRes = NextResponse.redirect(contasUrl, { status: 302 });
  clearAuthCookies(redirectRes);
  return redirectRes;
}
