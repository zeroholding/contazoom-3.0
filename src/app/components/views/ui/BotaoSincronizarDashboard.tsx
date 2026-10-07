"use client";

import { useSyncAll } from "@/contexts/SyncAllContext";
import { isSyncAllTerminal } from "@/lib/sync-all-types";
import { IconeAlerta, IconeAtualizar, IconeCerto } from "../comum/icones";
import { LogoCanal, type CanalLogo } from "../comum/logos";
import { useToast } from "./toaster";

export default function BotaoSincronizarDashboard(props: {
  onConcluido: () => void;
  canais?: CanalLogo[];
  accountIds?: string[];
}) {
  const { canais, accountIds } = props;
  const { state, running, statusUnavailable, startSync } = useSyncAll();
  const { toast } = useToast();

  const sincronizar = async () => {
    const runId = await startSync({
      channels: canais,
      accountIds,
    });

    if (runId) return;

    toast({
      variant: "error",
      title: "Não foi possível iniciar",
      description: "Tente novamente em alguns instantes.",
    });
  };

  const channelStates = Object.values(state.channels).filter(Boolean);
  const firstErrorChannel = channelStates.find((channel) => channel.errorCount > 0);
  const diagnosticMessage = firstErrorChannel?.errors[0]
    ? `${firstErrorChannel.label}: ${firstErrorChannel.errors[0].message}`
    : state.message;
  const terminal = isSyncAllTerminal(state.status);
  const showRunning = running && !statusUnavailable;

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row-reverse sm:items-center">
      <button
        type="button"
        onClick={() => void sincronizar()}
        disabled={running}
        title={
          statusUnavailable
            ? "Não foi possível confirmar o estado anterior. Clique para tentar sincronizar."
            : running
              ? "A sincronização continua enquanto você navega pelo sistema."
              : "Sincronizar vendas de todas as contas deste escopo"
        }
        className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--cz-raio)] border px-4 text-[13px] font-semibold transition-colors ${
          statusUnavailable
            ? "border-amber-300 bg-amber-600 text-white hover:bg-amber-700"
            : showRunning
              ? "cursor-progress border-[var(--cz-laranja-forte)] bg-[var(--cz-laranja-forte)] text-white"
              : "border-[var(--cz-laranja)] bg-[var(--cz-laranja)] text-white hover:border-[var(--cz-laranja-forte)] hover:bg-[var(--cz-laranja-forte)]"
        }`}
      >
        <IconeAtualizar className={`h-4 w-4 ${showRunning ? "animate-spin" : ""}`} />
        {statusUnavailable ? "Tentar sincronizar" : running ? "Sincronizando…" : "Sincronizar vendas"}
      </button>

      {(running || terminal || statusUnavailable) && (
        <div
          role="status"
          aria-live="polite"
          className={`min-w-0 flex-1 rounded-[var(--cz-raio)] border px-3 py-1.5 sm:min-w-[280px] sm:flex-none ${
            state.status === "failed"
              ? "border-rose-200 bg-rose-50"
              : state.status === "completed"
                ? "border-emerald-200 bg-emerald-50"
                : state.status === "partial"
                  ? "border-amber-200 bg-amber-50"
                  : "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)]"
          }`}
        >
          <div className="flex items-center gap-2">
            {state.status === "failed" ? (
              <IconeAlerta className="h-3.5 w-3.5 shrink-0 text-rose-600" />
            ) : state.status === "completed" ? (
              <IconeCerto className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            ) : (
              <span className="flex shrink-0 items-center gap-1">
                {channelStates.map((channel) => (
                  <LogoCanal key={channel.channel} canal={channel.channel} />
                ))}
              </span>
            )}

            <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[var(--cz-texto)]">
              {statusUnavailable
                ? "Não foi possível confirmar o estado anterior; você pode tentar sincronizar."
                : state.status === "partial" || state.status === "failed"
                  ? diagnosticMessage
                  : state.message}
            </span>
            {showRunning && (
              <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-[var(--cz-laranja-forte)]">
                {state.progress}%
              </span>
            )}
          </div>

          {showRunning && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--cz-laranja-borda)]">
              <div
                className="h-full rounded-full bg-[var(--cz-laranja)] transition-[width] duration-300"
                style={{ width: `${Math.max(2, state.progress)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
