"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * O ponto de corte "celular" do produto: o mesmo em que o Tailwind liga `md:` e
 * em que a barra lateral deixa de ser gaveta e vira coluna fixa (768px).
 * Mantido junto da camada mobile de `globals.css`, que usa o mesmo 767px.
 */
export const CONSULTA_CELULAR = "(max-width: 767px)";

/**
 * Lê uma media query e re-renderiza quando ela muda (girar o aparelho, redimensionar).
 *
 * `useSyncExternalStore` em vez de `useState` + `useEffect`: a leitura acontece no
 * PRIMEIRO render do cliente, então um componente que monta depois da hidratação
 * (o caso de tudo que mora atrás do `ProtectedRoute`) já nasce com a resposta
 * certa, sem o quadro extra de "achei que era desktop".
 *
 * No servidor, e durante a hidratação, vale `valorNoServidor` (desktop por
 * padrão): é o que o HTML entregue pelo servidor assumiu, e divergir disso é
 * erro de hidratação.
 */
export function useMediaQuery(query: string, valorNoServidor = false): boolean {
  const assinar = useCallback(
    (notificar: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notificar);
      return () => mql.removeEventListener("change", notificar);
    },
    [query],
  );

  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(query).matches,
    () => valorNoServidor,
  );
}

/** Atalho: a tela está no modo celular (abaixo de 768px)? */
export function useCelular(): boolean {
  return useMediaQuery(CONSULTA_CELULAR);
}
