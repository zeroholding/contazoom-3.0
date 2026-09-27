export type SyncAllChannel = "ML" | "SP" | "TT";

export type SyncAllChannelStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "skipped";

export type SyncAllStatus =
  | "idle"
  | "preparing"
  | "running"
  | "completed"
  | "partial"
  | "failed";

export type SyncAllChannelError = {
  accountId: string | null;
  message: string;
};

export type SyncAllChannelState = {
  channel: SyncAllChannel;
  label: string;
  status: SyncAllChannelStatus;
  message: string;
  saved: number;
  errorCount: number;
  errors: SyncAllChannelError[];
  startedAt: string | null;
  finishedAt: string | null;
};

export type SyncAllState = {
  runId: string | null;
  status: SyncAllStatus;
  message: string;
  progress: number;
  saved: number;
  channels: Partial<Record<SyncAllChannel, SyncAllChannelState>>;
  startedAt: string | null;
  updatedAt: string;
  heartbeatAt: string | null;
  finishedAt: string | null;
};

export type StartSyncAllOptions = {
  channels?: SyncAllChannel[];
  accountIds?: string[];
};

export const SYNC_ALL_CHANNEL_LABEL: Record<SyncAllChannel, string> = {
  ML: "Mercado Livre",
  SP: "Shopee",
  TT: "TikTok Shop",
};

export const SYNC_ALL_CHANNELS: readonly SyncAllChannel[] = ["ML", "SP", "TT"];

export function createIdleSyncAllState(): SyncAllState {
  return {
    runId: null,
    status: "idle",
    message: "Pronto para sincronizar",
    progress: 0,
    saved: 0,
    channels: {},
    startedAt: null,
    updatedAt: new Date().toISOString(),
    heartbeatAt: null,
    finishedAt: null,
  };
}

export function isSyncAllRunning(status: SyncAllStatus): boolean {
  return status === "preparing" || status === "running";
}

export function isSyncAllTerminal(status: SyncAllStatus): boolean {
  return status === "completed" || status === "partial" || status === "failed";
}
