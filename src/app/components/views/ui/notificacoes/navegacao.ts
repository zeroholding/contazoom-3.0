"use client";

import type { NotificacaoItem } from "@/lib/notificacoes/tipos";

/**
 * Abrir o documento de uma notificação.
 *
 * Fora do drive é uma navegação comum para `/documentos?documento=<id>`, e o
 * drive lê o parâmetro ao montar. JÁ DENTRO do drive a navegação para a mesma
 * tela não remonta o componente, então o pedido vai por evento: o drive abre a
 * pasta do documento e o destaca sem recarregar a lista.
 */
export const EVENTO_ABRIR_DOCUMENTO = "cz:abrir-documento";

export function documentoDoLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link, "https://painel.local");
    return url.pathname === "/documentos" ? url.searchParams.get("documento") : null;
  } catch {
    return null;
  }
}

export function irParaNotificacao(router: { push: (href: string) => void }, item: NotificacaoItem): void {
  const destino = item.link ?? "/documentos";
  const documentoId = documentoDoLink(destino);
  if (documentoId && typeof window !== "undefined" && window.location.pathname === "/documentos") {
    window.dispatchEvent(new CustomEvent<string>(EVENTO_ABRIR_DOCUMENTO, { detail: documentoId }));
    return;
  }
  router.push(destino);
}
