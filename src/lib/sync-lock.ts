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
    () => acquireMemoryLock(key, token, ttlSeconds),
  );

  return {
    acquired,
    key,
    token,
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
