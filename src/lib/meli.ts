import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { MeliAccount } from "@prisma/client";

export async function saveMeliOauthState(state: string, userId: string) {
    await prisma.meliOauthState.create({
        data: {
            state,
            userId,
            expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        },
    });
}

export async function findMeliOauthState(state: string) {
    return prisma.meliOauthState.findUnique({
        where: { state },
        select: { userId: true },
    });
}

export async function deleteMeliOauthState(state: string) {
    try {
        await prisma.meliOauthState.delete({
            where: { state },
        });
    } catch {
        // Ignore if not found
    }
}

export function resolveMeliRedirectUri(req: NextRequest): string {
    const origin = process.env.NEXT_PUBLIC_MELI_REDIRECT_ORIGIN || req.nextUrl.origin;
    // Ensure we don't have double slashes if origin ends with /
    const cleanOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    return `${cleanOrigin}/api/meli/callback`;
}

export function resolveMeliCookieSettings(req: NextRequest) {
    const secure = process.env.NODE_ENV === "production";
    // For localhost, domain should be undefined to allow host-only cookie
    // For production, it might need to be set if using subdomains, but usually undefined is fine for same-origin
    const domain = undefined;
    return { secure, domain };
}

export async function refreshMeliAccountToken(account: MeliAccount): Promise<MeliAccount> {
  // Se o token ainda Ã© vÃ¡lido por pelo menos 1 hora, nÃ£o precisa renovar
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  
  if (account.expires_at > oneHourFromNow) {
    return account;
  }

  console.log(`[Meli Auth] Token expirando em breve (ou expirado) para conta ${account.id}. Renovando...`);

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("client_id", process.env.MELI_CLIENT_ID || process.env.MELI_APP_ID!);
  params.append("client_secret", process.env.MELI_CLIENT_SECRET || process.env.MELI_SECRET_KEY!);
  params.append("refresh_token", account.refresh_token);

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: params,
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error(`[Meli Auth] Erro ao renovar token: ${response.status}`, errorData);
    throw new Error(`Falha ao renovar token do Mercado Livre: ${response.status} ${errorData}`);
  }

  const data = await response.json();

  // Atualizar no banco
  const updatedAccount = await prisma.meliAccount.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000),
      updated_at: new Date(),
    },
  });

  console.log(`[Meli Auth] Token renovado com sucesso para conta ${account.id}`);
  return updatedAccount;
}

export async function smartRefreshMeliAccountToken(account: MeliAccount, retries = 3): Promise<MeliAccount> {
  for (let i = 0; i < retries; i++) {
    try {
      return await refreshMeliAccountToken(account);
    } catch (error) {
      console.warn(`[Meli Auth] Tentativa ${i + 1}/${retries} de renovação falhou:`, error);
      if (i === retries - 1) throw error;
      // Esperar 1s antes de tentar de novo (exponential backoff simples)
      await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Falha após múltiplas tentativas de renovação");
}
