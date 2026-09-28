import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export interface SessionPayload extends JWTPayload {
  sub: string;
  email?: string;
  name?: string;
}

type AdminCacheEntry = {
  isAdmin: boolean;
  expiresAt: number;
};

const ADMIN_CACHE_TTL_MS = 30_000;
const adminCache = new Map<string, AdminCacheEntry>();

export function getAuthSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    console.error("❌ JWT_SECRET não encontrado nas variáveis de ambiente!");
    throw new Error(
      "JWT_SECRET não configurado. Defina a variável de ambiente antes de usar autenticação.",
    );
  }
  return secret;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a plain text password with a hashed password
 */
export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Generate a JWT session token
 */
export async function generateSessionToken(userData: {
  userId: string;
  email: string;
  name: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(getAuthSecret());

  const token = await new SignJWT({
    sub: userData.userId,
    email: userData.email,
    name: userData.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d") // 7 days
    .sign(secret);

  return token;
}

export async function tryVerifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(getAuthSecret());
    const { payload } = await jwtVerify(token, secret);

    if (!payload || typeof payload === "string" || !payload.sub) return null;
    return payload as SessionPayload;
  } catch (error) {
    // Token inválido/expirado é fluxo normal (usuário deslogado) — não poluir
    // o log a cada request. Só reporta o caso crítico de config ausente.
    if (error instanceof Error && error.message.includes("JWT_SECRET")) {
      console.error("CRÍTICO: JWT_SECRET não está configurado corretamente!");
    }
    return null;
  }
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload> {
  const session = await tryVerifySessionToken(token);
  if (!session) throw new Error("Sessão inválida ou expirada.");
  return session;
}

export async function assertSessionToken(token: string | undefined): Promise<SessionPayload> {
  const session = await tryVerifySessionToken(token);
  if (!session) throw new Error("Sessão inválida ou expirada.");
  return session;
}

export async function checkIsAdmin(email?: string, userId?: string): Promise<boolean> {
  // Verificação 1: O email está na variável de ambiente? (Dono)
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && email && adminEmail.toLowerCase() === email.toLowerCase()) {
    return true;
  }

  // Verificação 2: Tem a role ADMIN no banco?
  if (!userId) return false;

  const now = Date.now();
  const cached = adminCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.isAdmin;
  if (cached) adminCache.delete(userId);

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const isAdmin = user?.role === "ADMIN";
    adminCache.set(userId, {
      isAdmin,
      expiresAt: now + ADMIN_CACHE_TTL_MS,
    });
    return isAdmin;
  } catch (error) {
    console.error("Erro ao verificar role:", error);
    return false;
  }
}
