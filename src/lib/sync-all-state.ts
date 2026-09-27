import { executeRedisCommand } from "@/lib/redis";
import {
  createIdleSyncAllState,
  type SyncAllState,
} from "@/lib/sync-all-types";

const STATE_TTL_SECONDS = 2 * 60 * 60;
const memoryStates = new Map<string, SyncAllState>();

function memoryFallback<T>(value: () => T): T {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Redis indisponível: estado global de sincronização inacessível");
  }
  return value();
}

function stateKey(userId: string) {
  return `sync-all:state:${userId}`;
}

function cloneState(state: SyncAllState): SyncAllState {
  return JSON.parse(JSON.stringify(state)) as SyncAllState;
}

export async function getSyncAllState(userId: string): Promise<SyncAllState> {
  return executeRedisCommand(
    async (client) => {
      const raw = await client.get(stateKey(userId));
      if (!raw) return cloneState(memoryStates.get(userId) ?? createIdleSyncAllState());

      try {
        const state = JSON.parse(raw) as SyncAllState;
        memoryStates.set(userId, state);
        return cloneState(state);
      } catch {
        return cloneState(memoryStates.get(userId) ?? createIdleSyncAllState());
      }
    },
    async () =>
      memoryFallback(() =>
        cloneState(memoryStates.get(userId) ?? createIdleSyncAllState()),
      ),
  );
}

export async function setSyncAllState(
  userId: string,
  state: SyncAllState,
): Promise<SyncAllState> {
  const snapshot = cloneState(state);
  memoryStates.set(userId, snapshot);

  await executeRedisCommand(
    async (client) => {
      await client.set(
        stateKey(userId),
        JSON.stringify(snapshot),
        "EX",
        STATE_TTL_SECONDS,
      );
    },
    async () => memoryFallback(() => undefined),
  );

  return cloneState(snapshot);
}

/**
 * Grava somente se o estado armazenado ainda pertencer ao mesmo runId.
 * Impede uma execução antiga de sobrescrever uma retomada mais nova após perder
 * o lease global.
 */
export async function setSyncAllStateIfOwner(
  userId: string,
  runId: string,
  state: SyncAllState,
): Promise<boolean> {
  const snapshot = cloneState(state);

  return executeRedisCommand(
    async (client) => {
      const result = await client.eval(
        `local raw = redis.call('get', KEYS[1])
         if not raw then return 0 end
         local ok, current = pcall(cjson.decode, raw)
         if not ok or current['runId'] ~= ARGV[1] then return 0 end
         redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3])
         return 1`,
        1,
        stateKey(userId),
        runId,
        JSON.stringify(snapshot),
        String(STATE_TTL_SECONDS),
      );
      const owned = Number(result) === 1;
      if (owned) memoryStates.set(userId, snapshot);
      return owned;
    },
    async () =>
      memoryFallback(() => {
        const current = memoryStates.get(userId);
        if (current?.runId !== runId) return false;
        memoryStates.set(userId, snapshot);
        return true;
      }),
  );
}
