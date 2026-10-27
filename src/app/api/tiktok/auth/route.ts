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
 * O `state` é gerado aqui, guardado em cookie HttpOnly E, pelo hash, no banco.
 * O banco preserva a origem caso o Partner Center devolva a callback entre
 * `contazoom.com.br` e `app.contazoom.com.br`; cookie + sessão continuam sendo
 * conferidos no host original, sem enfraquecer a proteção contra CSRF.
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
import {
  criarEstadoOauthTiktok,
  origemOauthTiktok,
  VALIDADE_STATE_TIKTOK_MS,
} from "@/lib/tiktok-oauth-state";

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
    const origin = origemOauthTiktok(req);
    const isPopupFlow = req.nextUrl.searchParams.get("popup") === "1";
    const mode = isPopupFlow ? "popup" : "redirect";
    const state = crypto.randomUUID();

    // O banco guarda só o hash e a origem. Se o Partner Center devolver a
    // callback em contazoom.com.br após o OAuth começar em app.contazoom.com.br,
    // o callback consegue voltar ao host que possui estes cookies.
    await criarEstadoOauthTiktok({ state, userId: session.sub, mode, origin });

    const res = NextResponse.redirect(getTiktokSellerAuthUrl(serviceId, state), {
      status: 302,
    });

    const secure = origin.startsWith("https");

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
      maxAge: VALIDADE_STATE_TIKTOK_MS / 1000,
    });
    res.cookies.set({
      name: TIKTOK_MODE_COOKIE,
      value: isPopupFlow ? "popup" : "redirect",
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: VALIDADE_STATE_TIKTOK_MS / 1000,
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
