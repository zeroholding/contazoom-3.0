import prisma from "@/lib/prisma";
import type { FlexShippingConfigValues } from "@/lib/flex-shipping";
import { cache, createCacheKey } from "@/lib/cache";

// O config de Flex muda raríssimo, mas é lido em quase TODA requisição do
// dashboard (13 por carga) + rotas de vendas. Cachear em memória elimina
// essas batidas repetidas no banco. Invalidado explicitamente quando o
// usuário salva um novo config (ver invalidateFlexConfigCache), então o
// TTL é só uma rede de segurança.
const FLEX_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function loadActiveFlexShippingConfig(
  userId: string,
): Promise<FlexShippingConfigValues | null> {
  const cacheKey = createCacheKey("flex-config", userId);
  // Envolvemos em { v } porque `null` (usuário sem config) é um valor válido
  // de cache — e o MemoryCache.get retorna null tanto em miss quanto em
  // "hit com null". O wrapper distingue os dois: miss => get retorna null;
  // hit => retorna { v: config|null }.
  const cached = cache.get<{ v: FlexShippingConfigValues | null }>(
    cacheKey,
    FLEX_CONFIG_CACHE_TTL,
  );
  if (cached) {
    return cached.v;
  }

  const config = await prisma.flexShippingConfig.findFirst({
    where: { userId, ativo: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      custoPorPacote: true,
      unidadesPorCobranca: true,
      descricao: true,
      updatedAt: true,
    },
  });

  const result: FlexShippingConfigValues | null = config
    ? {
        id: config.id,
        custoPorPacote: Number(config.custoPorPacote),
        unidadesPorCobranca: config.unidadesPorCobranca,
        descricao: config.descricao,
        updatedAt: config.updatedAt,
      }
    : null;

  cache.set(cacheKey, { v: result });
  return result;
}

/** Invalida o cache do config de Flex de um usuário (chamar ao salvar config). */
export function invalidateFlexConfigCache(userId: string): void {
  cache.delete(createCacheKey("flex-config", userId));
}
