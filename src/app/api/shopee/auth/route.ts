import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken } from "@/lib/auth";
import { getShopeeAuthUrl } from "@/lib/shopee";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
    if (!session) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const partnerId = process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_CLIENT_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY || process.env.SHOPEE_CLIENT_SECRET;
    const redirectOrigin = process.env.SHOPEE_REDIRECT_ORIGIN || (req.headers.get("x-forwarded-proto") || "http") + "://" + req.headers.get("host");
    
    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        { error: "Credenciais Shopee ausentes (defina SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY)" },
        { status: 500 },
      );
    }

    const isPopupFlow = req.nextUrl.searchParams.get("popup") === "1";

    const state = crypto.randomUUID();
    
    const redirectUrl = `${redirectOrigin}/api/shopee/callback`;
    const url = getShopeeAuthUrl(partnerId, partnerKey, redirectUrl);

    const res = NextResponse.redirect(url, { status: 302 });
    
    const secure = redirectOrigin.startsWith("https");
    
    res.cookies.set({
      name: "shopee_oauth_state",
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 600,
    });
    res.cookies.set({
      name: "shopee_oauth_mode",
      value: isPopupFlow ? "popup" : "redirect",
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    console.error('[Shopee Auth] Erro durante autenticação:', error);
    return NextResponse.json(
      { error: 'Erro ao iniciar autenticação Shopee' },
      { status: 500 }
    );
  }
}
