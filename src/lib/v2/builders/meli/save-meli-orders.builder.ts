import { sendProgressToUser } from "@/lib/sse-progress";
import { MeliOrderPayload, SyncError } from "../../types/sync-meli";
import MeliSyncService from "../../services/meli-sync.service";
import { processSalesDirect } from "@/lib/sync-worker";
import { QueuedSale } from "@/lib/redis-queue";

type AccountData = {
  id: string;
  userId: string;
  ml_user_id: bigint;
  nickname: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  refresh_token_invalid_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SaveMeliOrderBuilderCtx = {
  userId: string;
  errors: SyncError[];
  forcedStop: boolean;

  current: {
    accountId: string;
    accountName: string;
    mlUserId: number;
    accountIndex: number;
    accountData: AccountData;
    syncStep: "pending" | "fetching" | "saving" | "completed" | "error";
    expiresAt: string;
    error?: string;
  };
  progress: {
    percentage: number;
    saved: number;
    expected: number;
    errors: number;
  };
};

// TODO: move the process and save sales from lib/sync-worker to here
export class SaveMeliOrdersBuilder {
  private _ctx: SaveMeliOrderBuilderCtx;
  private _meliSyncService: MeliSyncService;

  public get ctx() {
    return this._ctx;
  }

  constructor(params: {
    account: AccountData;
    userId: string;
    meliSyncService: MeliSyncService;
    accountIndex?: number;
  }) {
    // Cada conta precisa de estado próprio: os builders rodam em paralelo.
    this._ctx = {
      errors: [],
      forcedStop: false,
      progress: {
        percentage: 0,
        saved: 0,
        expected: 0,
        errors: 0,
      },
      userId: params.userId,
      current: {
        accountData: params.account,
        accountId: params.account.id,
        accountIndex: params.accountIndex ?? 0,
        accountName:
          params.account.nickname || `Conta ${params.account.ml_user_id}`,
        mlUserId: Number(params.account.ml_user_id),
        syncStep: "saving",
        expiresAt: params.account.expires_at.toISOString(),
      },
    };
    this._meliSyncService = params.meliSyncService;
  }

  async saveOrdersDirect(orders: MeliOrderPayload[]): Promise<this> {
    const queuedSales: QueuedSale[] = orders.map((order) => ({
      accountId: order.accountId,
      accountNickname: order.accountNickname ?? null,
      mlUserId: Number(order.mlUserId),
      order: order.order,
      shipment: order.shipment,
      freight: order.freight,
    }));

    const workerResult = await processSalesDirect(this._ctx.userId, queuedSales);
    console.log(
      `[Sync] ✅ Salvamento direto completou: ${workerResult.totalProcessed} salvas, ${workerResult.totalErrors} erros`,
    );

    this._ctx.progress.expected = orders.length;
    this._ctx.progress.saved = workerResult.totalProcessed;
    this._ctx.progress.errors = workerResult.totalErrors;
    this._ctx.progress.percentage =
      orders.length === 0
        ? 100
        : Math.min(100, (workerResult.totalProcessed / orders.length) * 100);

    sendProgressToUser(this._ctx.userId, {
      type: "sync_save_complete",
      message: `✅ ${workerResult.totalProcessed} vendas salvas diretamente no banco`,
      current: workerResult.totalProcessed,
      total: orders.length,
      phase: "complete",
      accountId: this._ctx.current.accountId,
      accountNickname: this._ctx.current.accountName,
    });

    return this;
  }

  finish() {
    return this;
  }
}
