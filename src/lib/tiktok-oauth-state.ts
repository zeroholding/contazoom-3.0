/**
 * Estado durável do OAuth TikTok Shop.
 *
 * O TikTok usa uma callback fixa cadastrada no Partner Center. O painel vive em
 * `app.contazoom.com.br`, enquanto a callback pode estar cadastrada em
 * `contazoom.com.br`; cookies HttpOnly são host-only e não atravessam essa
 * fronteira. A linha no banco guarda QUAL origem iniciou o fluxo. Ao voltar no
 * outro host, o callback apenas retransmite a URL para a origem certa; lá ele
 * volta a exigir o cookie e a sessão originais.
 *
 * Segurança:
 * - guarda SHA-256 do state, nunca o nonce bruto;
 * - origem aceita somente hosts explícitos do produto (ou localhost em dev);
 * - expira em 15 minutos;
 * - consumo é condicional/atômico, impedindo duas trocas do mesmo auth_code;
 * - o registro NÃO substitui cookie e sessão: serve só para chegar ao host que
 *   possui os dois.
 */

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export type ModoOauthTiktok = "popup" | "redirect";

export type EstadoOauthTiktok = {
  id: string;
  userId: string;
  mode: ModoOauthTiktok;
  origin: string;
  expiresAt: Date;
};

export const VALIDADE_STATE_TIKTOK_MS = 15 * 60_000;

const HOSTS_PRODUCAO = new Set(["contazoom.com.br", "app.contazoom.com.br"]);

function hashState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

function primeiraParte(valor: string | null): string {
  return valor?.split(",", 1)[0]?.trim() ?? "";
}

function origemNormalizada(valor: string): string | null {
  try {
    const url = new URL(valor);
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Origem pública vista pelo navegador, validada contra uma lista fechada.
 * Cabeçalhos `x-forwarded-*` vêm do proxy do deploy e têm prioridade; em teste
 * local, `nextUrl.origin` é suficiente.
 */
export function origemOauthTiktok(req: NextRequest): string {
  const host =
    primeiraParte(req.headers.get("x-forwarded-host")) ||
    primeiraParte(req.headers.get("host")) ||
    req.nextUrl.host;
  const protocolo =
    primeiraParte(req.headers.get("x-forwarded-proto")) ||
    req.nextUrl.protocol.replace(/:$/, "") ||
    "http";
  const candidata = origemNormalizada(`${protocolo}://${host}`) ?? req.nextUrl.origin;
  const url = new URL(candidata);

  const configurada = process.env.TIKTOK_REDIRECT_ORIGIN?.trim();
  const origemConfigurada = configurada ? origemNormalizada(configurada) : null;
  const explicitamenteConfigurada = origemConfigurada === url.origin;
  const hostDoProduto = HOSTS_PRODUCAO.has(url.hostname.toLowerCase());
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);

  if (hostDoProduto && url.protocol === "https:") return url.origin;
  if (explicitamenteConfigurada && url.protocol === "https:") return url.origin;
  if (process.env.NODE_ENV !== "production" && local) return url.origin;

  throw new Error(`Origem não autorizada para OAuth TikTok: ${url.origin}`);
}

export async function criarEstadoOauthTiktok(entrada: {
  state: string;
  userId: string;
  mode: ModoOauthTiktok;
  origin: string;
}): Promise<void> {
  const agora = new Date();
  // Tabela pequena e fluxo raro. Remover vencidos aqui evita cron só para lixo
  // de OAuth sem fazer uma varredura no boot.
  await prisma.tiktokOauthState.deleteMany({
    where: { expiresAt: { lt: agora } },
  });
  await prisma.tiktokOauthState.create({
    data: {
      stateHash: hashState(entrada.state),
      userId: entrada.userId,
      mode: entrada.mode,
      origin: entrada.origin,
      expiresAt: new Date(agora.getTime() + VALIDADE_STATE_TIKTOK_MS),
    },
  });
}

/** Localiza state ainda válido e ainda não consumido. */
export async function buscarEstadoOauthTiktok(state: string): Promise<EstadoOauthTiktok | null> {
  const encontrado = await prisma.tiktokOauthState.findUnique({
    where: { stateHash: hashState(state) },
    select: {
      id: true,
      userId: true,
      mode: true,
      origin: true,
      expiresAt: true,
      consumedAt: true,
    },
  });
  if (!encontrado || encontrado.consumedAt || encontrado.expiresAt <= new Date()) return null;
  if (encontrado.mode !== "popup" && encontrado.mode !== "redirect") return null;
  return { ...encontrado, mode: encontrado.mode };
}

/**
 * Reserva o state para uma única troca de token. `updateMany` faz o teste e a
 * escrita numa instrução: callbacks concorrentes não passam juntos.
 */
export async function consumirEstadoOauthTiktok(estado: EstadoOauthTiktok): Promise<boolean> {
  const { count } = await prisma.tiktokOauthState.updateMany({
    where: {
      id: estado.id,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  return count === 1;
}
