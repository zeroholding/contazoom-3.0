import { randomUUID } from "crypto";

import { after, NextRequest, NextResponse } from "next/server";

import { POST as syncMeli } from "@/app/api/v2/meli/vendas/sync/route";
import { POST as syncShopee } from "@/app/api/shopee/vendas/sync/route";
import { POST as syncTiktok } from "@/app/api/tiktok/vendas/sync/route";
import { assertSessionToken } from "@/lib/auth";
import { invalidateVendasCache } from "@/lib/cache";
import { backfillPrazoChunk } from "@/lib/prazo-despacho-backfill";
import prisma from "@/lib/prisma";
import {
  getSyncAllState,
  setSyncAllState,
  setSyncAllStateIfOwner,
} from "@/lib/sync-all-state";
import {
  SYNC_ALL_CHANNEL_LABEL,
  SYNC_ALL_CHANNELS,
  isSyncAllRunning,
  type StartSyncAllOptions,
  type SyncAllChannel,
  type SyncAllChannelState,
  type SyncAllState,
} from "@/lib/sync-all-types";
import { acquireSyncLock } from "@/lib/sync-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

type ChannelHandler = (request: NextRequest) => Promise<Response>;

const CHANNEL_HANDLER: Record<SyncAllChannel, ChannelHandler> = {
  ML: syncMeli,
  SP: syncShopee,
  TT: syncTiktok,
};

const STALE_JOB_MS = 4 * 60 * 1000;

/**
 * Prazos que a sincronização incremental não regrava.
 *
 * O incremental só relê pedidos que mudaram no Mercado Livre nos últimos dias.
 * Uma venda gravada antes de uma regra nova de prazo (ex.: buffering) fica com o
 * prazo antigo até alguém abrir a Expedição, e a coorte daquele dia sai errada.
 * Rodar o mesmo backfill da Expedição ANTES do estado final faz as telas, que
 * recarregam no fim da sincronização, já abrirem com o prazo certo. Mesmo lote
 * da Expedição: mais recente primeiro e escrita pequena.
 */
const LOTE_BACKFILL_PRAZO_POS_SYNC = 300;

async function reconcileStaleState(
  userId: string,
  state: SyncAllState,
): Promise<SyncAllState> {
  if (!isSyncAllRunning(state.status)) return state;

  const lastHeartbeat = new Date(state.heartbeatAt ?? state.updatedAt).getTime();
  if (Number.isFinite(lastHeartbeat) && Date.now() - lastHeartbeat <= STALE_JOB_MS) {
    return state;
  }

  const finishedAt = new Date().toISOString();
  const failedState: SyncAllState = {
    ...state,
    status: "failed",
    message: "Sincronização interrompida. Clique para retomar com segurança.",
    updatedAt: finishedAt,
    heartbeatAt: finishedAt,
    finishedAt,
  };

  if (!state.runId) return failedState;
  const updated = await setSyncAllStateIfOwner(userId, state.runId, failedState);
  return updated ? failedState : getSyncAllState(userId);
}

function normalizeChannels(input: unknown): SyncAllChannel[] {
  if (!Array.isArray(input) || input.length === 0) return [...SYNC_ALL_CHANNELS];
  const requested = new Set(input.map(String));
  return SYNC_ALL_CHANNELS.filter((channel) => requested.has(channel));
}

function normalizeAccountIds(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const ids = Array.from(
    new Set(input.map(String).map((id) => id.trim()).filter(Boolean)),
  );
  return ids.length > 0 ? ids : undefined;
}

/**
 * Quantas contas o usuário tem em cada canal, respeitando o filtro de contas.
 *
 * Igual ao Nexus: canal sem conta nem entra na execução. Antes os três handlers
 * eram chamados sempre, e o do TikTok responde 500 quando faltam as credenciais
 * do app, então toda sincronização terminava "parcial" para quem nem usa TikTok.
 * Se a contagem falhar, segue com todos os canais em vez de bloquear a sync.
 */
async function contarContasPorCanal(
  userId: string,
  accountIds?: string[],
): Promise<Record<SyncAllChannel, number> | null> {
  const where = accountIds ? { userId, id: { in: accountIds } } : { userId };
  try {
    const [ml, sp, tt] = await Promise.all([
      prisma.meliAccount.count({ where }),
      prisma.shopeeAccount.count({ where }),
      prisma.tiktokAccount.count({ where }),
    ]);
    return { ML: ml, SP: sp, TT: tt };
  } catch (error) {
    console.warn(
      "[Sync All] Não foi possível contar as contas; seguindo com todos os canais.",
      error,
    );
    return null;
  }
}

function initialChannel(channel: SyncAllChannel): SyncAllChannelState {
  return {
    channel,
    label: SYNC_ALL_CHANNEL_LABEL[channel],
    status: "pending",
    message: "Aguardando início",
    saved: 0,
    errorCount: 0,
    errors: [],
    startedAt: null,
    finishedAt: null,
  };
}

function buildChannelRequest({
  origin,
  cookie,
  channel,
  accountIds,
}: {
  origin: string;
  cookie: string;
  channel: SyncAllChannel;
  accountIds?: string[];
}) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "x-contazoom-sync-all": "1",
  });
  if (cookie) headers.set("Cookie", cookie);

  return new NextRequest(`${origin}/api/sync-all/internal/${channel}`, {
    method: "POST",
    headers,
    body: JSON.stringify(accountIds ? { accountIds } : {}),
  });
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function numberFrom(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function savedFromPayload(payload: Record<string, unknown>): number {
  const totals = payload.totals as Record<string, unknown> | undefined;
  return numberFrom(totals?.saved ?? payload.saved ?? payload.totalSaved);
}

function errorsFromPayload(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.errors)) return [];

  return payload.errors.slice(0, 5).map((item) => {
    const error = item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : {};
    const rawMessage = String(error.message ?? error.error ?? "Falha na conta");
    return {
      accountId: error.accountId ? String(error.accountId).slice(0, 80) : null,
      message: rawMessage.replace(/[\r\n]+/g, " ").slice(0, 240),
    };
  });
}

class SyncOwnershipLostError extends Error {
  constructor() {
    super("A execução perdeu o lease global");
    this.name = "SyncOwnershipLostError";
  }
}

async function runSyncAll({
  userId,
  origin,
  cookie,
  channels,
  accountIds,
  initialState,
  ownership,
}: {
  userId: string;
  origin: string;
  cookie: string;
  channels: SyncAllChannel[];
  accountIds?: string[];
  initialState: SyncAllState;
  ownership: { lost: boolean };
}) {
  let state = initialState;
  let writeChain: Promise<unknown> = Promise.resolve();

  const update = async (updater: (current: SyncAllState) => SyncAllState) => {
    if (ownership.lost) throw new SyncOwnershipLostError();
    state = updater(state);
    const snapshot = state;
    writeChain = writeChain
      .catch((error) => {
        if (error instanceof SyncOwnershipLostError || ownership.lost) throw error;
        console.warn("[Sync All] Escrita anterior falhou; tentando próximo snapshot.", error);
      })
      .then(async () => {
        if (ownership.lost) throw new SyncOwnershipLostError();
        const owned = await setSyncAllStateIfOwner(
          userId,
          initialState.runId!,
          snapshot,
        );
        if (!owned) {
          ownership.lost = true;
          throw new SyncOwnershipLostError();
        }
      });
    await writeChain;
  };

  const heartbeat = setInterval(() => {
    const heartbeatAt = new Date().toISOString();
    void update((current) => ({
      ...current,
      updatedAt: heartbeatAt,
      heartbeatAt,
    })).catch((error) => {
      console.error("[Sync All] Falha ao persistir heartbeat:", error);
    });
  }, 15_000);

  try {
    await update((current) => ({
      ...current,
      status: "running",
      message: "Sincronizando canais conectados…",
      progress: 5,
      updatedAt: new Date().toISOString(),
    }));

    let finishedChannels = 0;

    await Promise.all(
      channels.map(async (channel) => {
        const startedAt = new Date().toISOString();
        await update((current) => ({
          ...current,
          message: `${SYNC_ALL_CHANNEL_LABEL[channel]} em andamento…`,
          channels: {
            ...current.channels,
            [channel]: {
              ...current.channels[channel]!,
              status: "running",
              message: "Buscando e gravando vendas",
              startedAt,
            },
          },
          updatedAt: startedAt,
        }));

        try {
          const response = await CHANNEL_HANDLER[channel](
            buildChannelRequest({ origin, cookie, channel, accountIds }),
          );
          const payload = await responsePayload(response);
          const alreadyRunning = payload.alreadyRunning === true;
          const noAccounts = response.status === 404;
          const partial = response.ok && payload.success === false;
          const saved = savedFromPayload(payload);
          const reportedErrors = errorsFromPayload(payload);
          const channelErrors =
            reportedErrors.length > 0
              ? reportedErrors
              : !response.ok && !alreadyRunning && !noAccounts
                ? [
                    {
                      accountId: null,
                      message: String(
                        payload.message ?? payload.error ?? `Erro ${response.status}`,
                      )
                        .replace(/[\r\n]+/g, " ")
                        .slice(0, 240),
                    },
                  ]
                : [];
          const errorCount = Array.isArray(payload.errors)
            ? payload.errors.length
            : channelErrors.length;
          const finishedAt = new Date().toISOString();

          finishedChannels += 1;
          await update((current) => ({
            ...current,
            progress: Math.round(5 + (finishedChannels / channels.length) * 90),
            saved: current.saved + saved,
            channels: {
              ...current.channels,
              [channel]: {
                ...current.channels[channel]!,
                status: alreadyRunning
                  ? "partial"
                  : noAccounts
                    ? "skipped"
                    : !response.ok
                      ? "failed"
                      : partial
                        ? "partial"
                        : "completed",
                message: alreadyRunning
                  ? "Já estava sincronizando"
                  : noAccounts
                    ? "Nenhuma conta conectada"
                    : !response.ok
                      ? channelErrors[0]?.message ?? `Erro ${response.status}`
                      : partial
                        ? `${errorCount} conta(s) com erro: ${channelErrors[0]?.message ?? "verifique as contas conectadas"}`
                        : `${saved} venda(s) processada(s)`,
                saved,
                errorCount,
                errors: channelErrors,
                finishedAt,
              },
            },
            updatedAt: finishedAt,
          }));
        } catch (error) {
          if (error instanceof SyncOwnershipLostError || ownership.lost) throw error;
          const finishedAt = new Date().toISOString();
          const message = (error instanceof Error ? error.message : "Falha inesperada")
            .replace(/[\r\n]+/g, " ")
            .slice(0, 240);
          finishedChannels += 1;
          await update((current) => ({
            ...current,
            progress: Math.round(5 + (finishedChannels / channels.length) * 90),
            channels: {
              ...current.channels,
              [channel]: {
                ...current.channels[channel]!,
                status: "failed",
                message,
                errorCount: 1,
                errors: [{ accountId: null, message }],
                finishedAt,
              },
            },
            updatedAt: finishedAt,
          }));
        }
      }),
    );

    await update((current) => ({
      ...current,
      message: "Atualizando prazos de despacho…",
      progress: Math.max(current.progress, 97),
      updatedAt: new Date().toISOString(),
    }));
    try {
      const prazos = await backfillPrazoChunk(LOTE_BACKFILL_PRAZO_POS_SYNC, userId);
      if (prazos.preenchidas > 0 || prazos.semPrazo > 0) {
        console.log(
          `[Sync All] Prazos revisados: ${prazos.preenchidas} preenchido(s), ${prazos.semPrazo} sem prazo, ${prazos.restantes} pendente(s).`,
        );
      }
    } catch (error) {
      // Acessório: a venda já foi gravada. A Expedição tenta de novo na visita.
      console.warn("[Sync All] Backfill de prazo não rodou:", error);
    }

    invalidateVendasCache(userId);

    const channelStates = channels.map((channel) => state.channels[channel]!);
    const failures = channelStates.filter((channel) => channel.status === "failed");
    const partials = channelStates.filter((channel) => channel.status === "partial");
    const affectedLabels = [...failures, ...partials]
      .map((channel) => channel.label)
      .join(", ");
    const finishedAt = new Date().toISOString();
    const finalStatus =
      failures.length === channels.length
        ? "failed"
        : failures.length > 0 || partials.length > 0
          ? "partial"
          : "completed";

    await update((current) => ({
      ...current,
      status: finalStatus,
      message:
        finalStatus === "failed"
          ? "Não foi possível sincronizar os canais"
          : finalStatus === "partial"
            ? `Sincronização parcial em ${affectedLabels} · ${current.saved} venda(s) processada(s)`
            : current.saved > 0
              ? `Sincronização concluída · ${current.saved} venda(s) atualizada(s)`
              : "Sincronização concluída · tudo em dia",
      progress: 100,
      updatedAt: finishedAt,
      heartbeatAt: finishedAt,
      finishedAt,
    }));
  } catch (error) {
    if (error instanceof SyncOwnershipLostError || ownership.lost) {
      console.warn("[Sync All] Execução antiga interrompida após perda do lease.");
      return;
    }
    const finishedAt = new Date().toISOString();
    invalidateVendasCache(userId);
    await update((current) => ({
      ...current,
      status: "failed",
      message: error instanceof Error ? error.message : "Falha inesperada",
      updatedAt: finishedAt,
      heartbeatAt: finishedAt,
      finishedAt,
    }));
  } finally {
    clearInterval(heartbeat);
  }
}

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await assertSessionToken(request.cookies.get("session")?.value);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await reconcileStaleState(
      session.sub,
      await getSyncAllState(session.sub),
    );
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Estado de sincronização indisponível",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await assertSessionToken(request.cookies.get("session")?.value);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = session.sub;
  let current: SyncAllState;
  try {
    current = await reconcileStaleState(userId, await getSyncAllState(userId));
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Sincronização indisponível",
      },
      { status: 503 },
    );
  }
  if (isSyncAllRunning(current.status)) {
    return NextResponse.json(
      { state: current, message: "Já existe uma sincronização em andamento" },
      { status: 409 },
    );
  }

  let body: StartSyncAllOptions & { canais?: SyncAllChannel[] } = {};
  try {
    body = (await request.json()) as StartSyncAllOptions & {
      canais?: SyncAllChannel[];
    };
  } catch {
    body = {};
  }

  const channels = normalizeChannels(body.channels ?? body.canais);
  if (channels.length === 0) {
    return NextResponse.json({ message: "Nenhum canal válido informado" }, { status: 400 });
  }

  const accountIds = normalizeAccountIds(body.accountIds);
  let lock: Awaited<ReturnType<typeof acquireSyncLock>>;
  try {
    lock = await acquireSyncLock(["vendas", "todos", userId], 3 * 60);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Sincronização indisponível",
      },
      { status: 503 },
    );
  }
  if (!lock.acquired) {
    return NextResponse.json(
      { state: await getSyncAllState(userId), message: "Sincronização já em andamento" },
      { status: 409 },
    );
  }

  // Contado com o lock na mão: assim um clique sem conta nunca sobrescreve o
  // estado de uma execução que outra aba acabou de iniciar.
  const contas = await contarContasPorCanal(userId, accountIds);
  const activeChannels = contas
    ? channels.filter((channel) => contas[channel] > 0)
    : channels;

  const now = new Date().toISOString();
  const runId = randomUUID();

  if (activeChannels.length === 0) {
    const emptyState: SyncAllState = {
      runId,
      status: "completed",
      message: "Nenhuma conta de marketplace conectada",
      progress: 100,
      saved: 0,
      channels: {},
      startedAt: now,
      updatedAt: now,
      heartbeatAt: now,
      finishedAt: now,
    };
    try {
      await setSyncAllState(userId, emptyState);
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error ? error.message : "Sincronização indisponível",
        },
        { status: 503 },
      );
    } finally {
      await lock.release();
    }
    return NextResponse.json({ state: emptyState });
  }

  const initialState: SyncAllState = {
    runId,
    status: "preparing",
    message: "Preparando canais conectados…",
    progress: 1,
    saved: 0,
    channels: Object.fromEntries(
      activeChannels.map((channel) => [channel, initialChannel(channel)]),
    ),
    startedAt: now,
    updatedAt: now,
    heartbeatAt: now,
    finishedAt: null,
  };

  try {
    await setSyncAllState(userId, initialState);
  } catch (error) {
    await lock.release();
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Sincronização indisponível",
      },
      { status: 503 },
    );
  }

  const origin = request.nextUrl.origin;
  const cookie = request.headers.get("cookie") ?? "";
  after(async () => {
    const ownership = { lost: false };
    const renewLock = setInterval(() => {
      void lock
        .renew(3 * 60)
        .then((renewed) => {
          if (!renewed) ownership.lost = true;
        })
        .catch((error) => {
          ownership.lost = true;
          console.error("[Sync All] Falha ao renovar lock global:", error);
        });
    }, 60_000);

    try {
      await runSyncAll({
        userId,
        origin,
        cookie,
        channels: activeChannels,
        accountIds,
        initialState,
        ownership,
      });
    } finally {
      clearInterval(renewLock);
      await lock.release();
    }
  });

  return NextResponse.json({ state: initialState }, { status: 202 });
}
