"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuthContext } from "@/contexts/AuthContext";
import {
  createIdleSyncAllState,
  isSyncAllRunning,
  isSyncAllTerminal,
  type StartSyncAllOptions,
  type SyncAllState,
} from "@/lib/sync-all-types";

type SyncAllContextValue = {
  state: SyncAllState;
  running: boolean;
  statusUnavailable: boolean;
  lastConfirmedAt: string | null;
  startSync: (options?: StartSyncAllOptions) => Promise<string | null>;
  refreshState: () => Promise<SyncAllState | null>;
};

const SyncAllContext = createContext<SyncAllContextValue | null>(null);

export function SyncAllProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const [state, setState] = useState<SyncAllState>(createIdleSyncAllState);
  const [pollError, setPollError] = useState<string | null>(null);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<string | null>(null);
  const stateRef = useRef(state);
  const terminalRunRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refreshState = useCallback(async (): Promise<SyncAllState | null> => {
    if (!isAuthenticated) return null;

    try {
      const response = await fetch("/api/sync-all", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Status indisponível (${response.status})`);
      const payload = (await response.json()) as { state?: SyncAllState };
      if (!payload.state) throw new Error("Resposta de status inválida");
      setState(payload.state);
      setPollError(null);
      setLastConfirmedAt(new Date().toISOString());
      return payload.state;
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Status indisponível");
      return null;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setState(createIdleSyncAllState());
      setPollError(null);
      setLastConfirmedAt(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const latest = await refreshState();
      if (cancelled) return;
      const interval = latest
        ? isSyncAllRunning(latest.status)
          ? 800
          : 5000
        : 1500;
      timer = setTimeout(poll, interval);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, isLoading, refreshState]);

  useEffect(() => {
    if (!state.runId || !isSyncAllTerminal(state.status)) return;
    if (terminalRunRef.current === state.runId) return;
    terminalRunRef.current = state.runId;

    window.dispatchEvent(
      new CustomEvent("contazoom:vendas-sincronizadas", { detail: state }),
    );
  }, [state]);

  const startSync = useCallback(
    async (options: StartSyncAllOptions = {}): Promise<string | null> => {
      if (
        !isAuthenticated ||
        pollError ||
        isSyncAllRunning(stateRef.current.status)
      ) {
        return stateRef.current.runId;
      }

      setState((current) => ({
        ...current,
        status: "preparing",
        message: "Preparando sincronização…",
        progress: 1,
        saved: 0,
        finishedAt: null,
        updatedAt: new Date().toISOString(),
      }));

      try {
        const response = await fetch("/api/sync-all", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          state?: SyncAllState;
          message?: string;
        };

        if (payload.state) {
          setState(payload.state);
          setPollError(null);
          setLastConfirmedAt(new Date().toISOString());
          return payload.state.runId;
        }

        throw new Error(payload.message || `Erro ${response.status}`);
      } catch (error) {
        const failed: SyncAllState = {
          ...stateRef.current,
          status: "failed",
          message: error instanceof Error ? error.message : "Falha ao iniciar sincronização",
          progress: 0,
          updatedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
        setState(failed);
        return null;
      }
    },
    [isAuthenticated, pollError],
  );

  const value = useMemo<SyncAllContextValue>(
    () => ({
      state,
      running: isSyncAllRunning(state.status),
      statusUnavailable: Boolean(pollError),
      lastConfirmedAt,
      startSync,
      refreshState,
    }),
    [lastConfirmedAt, pollError, refreshState, startSync, state],
  );

  return <SyncAllContext.Provider value={value}>{children}</SyncAllContext.Provider>;
}

export function useSyncAll() {
  const context = useContext(SyncAllContext);
  if (!context) {
    throw new Error("useSyncAll deve ser usado dentro de SyncAllProvider");
  }
  return context;
}
