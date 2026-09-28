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
import { EVENTO_VENDAS_SINCRONIZADAS } from "@/hooks/useAoSincronizarVendas";
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

/**
 * Intervalo até a próxima consulta do estado.
 *
 * Aba oculta consulta bem menos: ninguém está olhando o card, e cada aba aberta
 * esquecida fazia 12 requisições por minuto para sempre. Ao voltar a ficar
 * visível a consulta é imediata (ver `visibilitychange` abaixo), então o card
 * nunca aparece desatualizado. Erro também espaça, para uma indisponibilidade
 * do servidor não virar uma rajada de 40 requisições por minuto por aba.
 */
function proximoIntervalo(
  latest: SyncAllState | null,
  ultimoConhecido: SyncAllState,
): number {
  const oculto =
    typeof document !== "undefined" && document.visibilityState === "hidden";
  const emAndamento = isSyncAllRunning((latest ?? ultimoConhecido).status);

  if (emAndamento) {
    if (oculto) return 5_000;
    return latest ? 800 : 1_500;
  }
  return oculto ? 60_000 : 5_000;
}

export function SyncAllProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const [state, setState] = useState<SyncAllState>(createIdleSyncAllState);
  const [pollError, setPollError] = useState<string | null>(null);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<string | null>(null);
  const stateRef = useRef(state);
  const terminalRunRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const wakeRef = useRef<(() => void) | null>(null);

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

      if (!hydratedRef.current) {
        hydratedRef.current = true;
        // Execução que terminou ANTES de a página abrir: as telas acabaram de
        // carregar com esse dado. Reemitir o evento de fim fazia Dashboard,
        // Vendas e Expedição carregarem duas vezes a cada recarga, por até 2 h.
        if (payload.state.runId && isSyncAllTerminal(payload.state.status)) {
          terminalRunRef.current = payload.state.runId;
        }
      }

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
      hydratedRef.current = false;
      terminalRunRef.current = null;
      setState(createIdleSyncAllState());
      setPollError(null);
      setLastConfirmedAt(null);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const agendar = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(poll, ms);
    };

    async function poll() {
      // Uma consulta por vez: a volta da visibilidade e o timer podem cair juntos.
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const latest = await refreshState();
        if (cancelled) return;
        agendar(proximoIntervalo(latest, stateRef.current));
      } finally {
        inFlight = false;
      }
    }

    const aoMudarVisibilidade = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void poll();
    };

    // Chamado logo depois de iniciar uma execução: sem isso o primeiro retrato
    // do progresso esperava o intervalo de ocioso (5 s).
    wakeRef.current = () => {
      if (!cancelled && !inFlight) agendar(800);
    };

    void poll();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      cancelled = true;
      wakeRef.current = null;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [isAuthenticated, isLoading, refreshState]);

  useEffect(() => {
    if (!state.runId || !isSyncAllTerminal(state.status)) return;
    if (terminalRunRef.current === state.runId) return;
    terminalRunRef.current = state.runId;

    window.dispatchEvent(
      new CustomEvent(EVENTO_VENDAS_SINCRONIZADAS, { detail: state }),
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
          wakeRef.current?.();
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
