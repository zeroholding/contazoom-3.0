/**
 * TikTok Shop OAuth — passo 1 (consentimento).
 *
 * Redireciona o navegador para a tela de autorização do TikTok Shop. Depois que
 * o vendedor aprova, o TikTok volta em `/api/tiktok/callback` com `code` e
 * `state`.
 *
 * Diferença em relação à Shopee: o TikTok não recebe a URL de retorno na query
 * da autorização. Ela é cadastrada no painel do app (Partner Center) e tem de
 * apontar para `<origem>/api/tiktok/callback`. Por isso aqui não se monta
 * `redirect=`, e a origem só é usada para decidir o `secure` do cookie.
 *
 * O `state` é gerado aqui, guardado num cookie HttpOnly e conferido no callback:
 * sem isso, qualquer um poderia disparar o callback com um code arbitrário.
 *
 * Requer: TIKTOK_APP_KEY, TIKTOK_APP_SECRET, TIKTOK_SERVICE_ID.
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken } from "@/lib/auth";
import {
  getTiktokCredentials,
  getTiktokSellerAuthUrl,
  missingTiktokCredentials,
  TIKTOK_MODE_COOKIE,
  TIKTOK_STATE_COOKIE,
} from "@/lib/tiktok";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
    if (!session) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const missing = missingTiktokCredentials();
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Credenciais TikTok ausentes: ${missing.join(", ")}`,
          hint: "Preencha as variaveis no ambiente (Coolify) e reinicie o app.",
        },
        { status: 500 },
      );
    }

    const { serviceId } = getTiktokCredentials();
    const redirectOrigin =
      process.env.TIKTOK_REDIRECT_ORIGIN ||
      (req.headers.get("x-forwarded-proto") || "http") + "://" + req.headers.get("host");

    const isPopupFlow = req.nextUrl.searchParams.get("popup") === "1";
    const state = crypto.randomUUID();

    const res = NextResponse.redirect(getTiktokSellerAuthUrl(serviceId, state), {
      status: 302,
    });

    const secure = redirectOrigin.startsWith("https");

    // 15 minutos: a tela de consentimento do TikTok tem mais passos que a da
    // Shopee (escolha de loja e revisão de escopos), e os 10 minutos usados lá
    // deixavam o state vencer no meio.
    res.cookies.set({
      name: TIKTOK_STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 900,
    });
    res.cookies.set({
      name: TIKTOK_MODE_COOKIE,
      value: isPopupFlow ? "popup" : "redirect",
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 900,
    });

    return res;
  } catch (error) {
    console.error("[TikTok Auth] Erro durante autenticacao:", error);
    return NextResponse.json(
      { error: "Erro ao iniciar autenticacao TikTok" },
      { status: 500 },
    );
  }
}
