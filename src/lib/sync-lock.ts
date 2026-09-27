import { randomUUID } from "crypto";
import { executeRedisCommand } from "@/lib/redis";

type MemoryLock = {
  token: string;
  expiresAt: number;
};

export type SyncLock = {
  acquired: boolean;
  key: string;
  token: string;
  release: () => Promise<void>;
  renew: (ttlSeconds?: number) => Promise<boolean>;
};

const memoryLocks = new Map<string, MemoryLock>();

function normalizeLockPart(part: string | number | null | undefined) {
  return String(part ?? "all").replace(/[^a-zA-Z0-9:_-]/g, "_");
}

function buildLockKey(parts: Array<string | number | null | undefined>) {
  return `sync-lock:${parts.map(normalizeLockPart).join(":")}`;
}

async function acquireMemoryLock(
  key: string,
  token: string,
  ttlSeconds: number,
): Promise<boolean> {
  const now = Date.now();
  const current = memoryLocks.get(key);

  if (current && current.expiresAt > now) {
    return false;
  }

  memoryLocks.set(key, {
    token,
    expiresAt: now + ttlSeconds * 1000,
  });

  return true;
}

async function releaseMemoryLock(key: string, token: string) {
  const current = memoryLocks.get(key);
  if (current?.token === token) {
    memoryLocks.delete(key);
  }
}

async function renewMemoryLock(
  key: string,
  token: string,
  ttlSeconds: number,
): Promise<boolean> {
  const current = memoryLocks.get(key);
  if (current?.token !== token) return false;
  current.expiresAt = Date.now() + ttlSeconds * 1000;
  return true;
}

export async function acquireSyncLock(
  parts: Array<string | number | null | undefined>,
  ttlSeconds = 30 * 60,
): Promise<SyncLock> {
  const key = buildLockKey(parts);
  const token = randomUUID();

  const acquired = await executeRedisCommand(
    async (client) => {
      const result = await client.set(key, token, "EX", ttlSeconds, "NX");
      return result === "OK";
    },
    async () => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Redis indisponível: sincronização bloqueada por segurança");
      }
      return acquireMemoryLock(key, token, ttlSeconds);
    },
  );

  return {
    acquired,
    key,
    token,
    renew: async (nextTtlSeconds = ttlSeconds) =>
      executeRedisCommand(
        async (client) => {
          const renewed = await client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end",
            1,
            key,
            token,
            String(nextTtlSeconds),
          );
          return Number(renewed) === 1;
        },
        async () => {
          if (process.env.NODE_ENV === "production") {
            throw new Error("Redis indisponível: lock não pôde ser renovado");
          }
          return renewMemoryLock(key, token, nextTtlSeconds);
        },
      ),
    release: async () => {
      await executeRedisCommand(
        async (client) => {
          await client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            key,
            token,
          );
        },
        () => releaseMemoryLock(key, token),
      );
      await releaseMemoryLock(key, token);
    },
  };
}
