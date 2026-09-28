"use client";

import { useEffect, useRef } from "react";

import type { SyncAllState } from "@/lib/sync-all-types";

export const EVENTO_VENDAS_SINCRONIZADAS =
  "contazoom:vendas-sincronizadas" as const;

export type AoSincronizarVendas = (state: SyncAllState) => void;

/**
 * Executa o callback mais recente quando a sincronização global termina.
 *
 * O listener é instalado uma única vez. A ref evita remontá-lo quando o loader
 * da tela muda por filtro, mantendo cleanup previsível sem prender uma closure
 * antiga.
 */
export function useAoSincronizarVendas(callback: AoSincronizarVendas): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const aoSincronizar = (event: Event) => {
      callbackRef.current((event as CustomEvent<SyncAllState>).detail);
    };

    window.addEventListener(EVENTO_VENDAS_SINCRONIZADAS, aoSincronizar);
    return () =>
      window.removeEventListener(EVENTO_VENDAS_SINCRONIZADAS, aoSincronizar);
  }, []);
}
