"use client";

/**
 * Dados e ações da tela de Contas de plataforma.
 *
 * A busca vive aqui; os avisos (toast) ficam na view, porque quem sabe o que
 * dizer ao usuário é a tela, não o hook.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { API_CONFIG } from "@/lib/api-config";
import type { CanalConta, RespostaContas } from "@/lib/contas";

export type EstadoContas = {
  dados: RespostaContas | null;
  carregando: boolean;
  atualizando: boolean;
  erro: string | null;
  atualizar: () => void;
};

export function useContas(): EstadoContas {
  const [dados, setDados] = useState<RespostaContas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const primeira = useRef(true);

  useEffect(() => {
    let vivo = true;
    if (primeira.current) setCarregando(true);
    else setAtualizando(true);

    (async () => {
      try {
        const res = await fetch("/api/contas", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const corpo = (await res.json()) as RespostaContas;
        if (!vivo) return;
        setDados(corpo);
        setErro(null);
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : "Falha ao carregar as contas");
      } finally {
        if (!vivo) return;
        primeira.current = false;
        setCarregando(false);
        setAtualizando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [recarga]);

  const atualizar = useCallback(() => setRecarga((n) => n + 1), []);

  return { dados, carregando, atualizando, erro, atualizar };
}

/* -------------------------------------------------------------------------- */
/*                                   Ações                                    */
/* -------------------------------------------------------------------------- */

/**
 * Origem usada no OAuth.
 *
 * Tem de ser a MESMA que está registrada como redirect URI no aplicativo do
 * Mercado Livre. Em desenvolvimento com túnel (ngrok) a origem da aba é
 * `localhost` mas o redirect registrado é o domínio do túnel, e usar a da aba faz
 * a plataforma recusar a autorização com `invalid_redirect_uri`.
 */
function origemAuth(): string {
  const origem =
    API_CONFIG.baseURL ||
    process.env.NEXT_PUBLIC_MELI_REDIRECT_ORIGIN ||
    (typeof window !== "undefined" ? window.location.origin : "");

  if (origem && !origem.startsWith("http")) return `https://${origem}`;
  return origem || "";
}

/**
 * Inicia a conexão de uma conta.
 *
 * Mercado Livre navega a aba inteira; Shopee abre janela. A diferença não é
 * estética: o consentimento da Shopee recusa ser carregado dentro de outra página
 * e o fluxo dela devolve o resultado por `postMessage`, que precisa de uma janela
 * separada para ter para onde responder.
 *
 * Devolve `false` quando o navegador barrou a janela, para a tela poder explicar
 * o que fazer em vez de simplesmente não acontecer nada.
 */
export function conectarConta(canal: CanalConta): boolean {
  if (typeof window === "undefined") return false;

  if (canal === "ML") {
    window.location.assign(`${origemAuth()}/api/meli/auth`);
    return true;
  }

  const largura = 520;
  const altura = 720;
  const esquerdaTela = window.screenLeft ?? window.screenX ?? 0;
  const topoTela = window.screenTop ?? window.screenY ?? 0;
  const larguraVisivel = window.innerWidth || document.documentElement.clientWidth;
  const alturaVisivel = window.innerHeight || document.documentElement.clientHeight;
  const zoom = larguraVisivel / (window.screen?.availWidth || larguraVisivel);

  const esquerda = esquerdaTela + (larguraVisivel - largura) / (2 * zoom);
  const topo = topoTela + (alturaVisivel - altura) / (2 * zoom);

  const janela = window.open(
    "/api/shopee/auth?popup=1",
    "shopee_connect",
    [
      "scrollbars=yes",
      `width=${largura}`,
      `height=${altura}`,
      `top=${Math.max(topo, 0)}`,
      `left=${Math.max(esquerda, 0)}`,
    ].join(","),
  );

  if (!janela) {
    // Reserva: sem janela, navega a aba. Melhor perder o estado da tela do que
    // deixar o botão sem efeito nenhum.
    window.location.href = "/api/shopee/auth";
    return false;
  }

  try {
    janela.focus();
  } catch {
    // Navegador restrito pode recusar o foco; a janela já está aberta.
  }
  return true;
}

/** Renova o access token a partir do refresh token guardado no servidor. */
export async function renovarToken(
  canal: CanalConta,
  contaId: string,
): Promise<{ ok: boolean; mensagem: string; precisaReconectar: boolean }> {
  const endpoint =
    canal === "ML" ? "/api/meli/refresh-token" : "/api/shopee/refresh-token";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ accountId: contaId }),
    });
    const dados = await res.json().catch(() => ({}));

    if (!res.ok || !dados.success) {
      return {
        ok: false,
        mensagem: dados.error || "Não foi possível renovar o token.",
        precisaReconectar: Boolean(dados.requiresReconnection),
      };
    }

    return { ok: true, mensagem: "Token renovado.", precisaReconectar: false };
  } catch (e) {
    return {
      ok: false,
      mensagem: e instanceof Error ? e.message : "Falha de rede ao renovar.",
      precisaReconectar: false,
    };
  }
}

/**
 * Remove a conta.
 *
 * O endpoint apaga em transação as VENDAS daquela conta junto — é o
 * comportamento que já existia. Por isso a tela precisa confirmar antes com
 * essa consequência escrita: quem lê só "excluir conta" não imagina que o
 * histórico vai embora.
 */
export async function excluirConta(
  canal: CanalConta,
  contaId: string,
): Promise<{ ok: boolean; mensagem: string }> {
  const base = canal === "ML" ? "/api/meli/accounts" : "/api/shopee/accounts";

  const controle =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  // A exclusão apaga vendas em cascata e pode demorar em conta grande. Sem teto,
  // um erro de rede deixaria o botão girando para sempre.
  const relogio = setTimeout(() => controle?.abort(), 30_000);

  try {
    const res = await fetch(`${base}?id=${encodeURIComponent(contaId)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: contaId }),
      signal: controle?.signal,
    });

    const dados = await res.json().catch(() => null);
    if (!res.ok || dados?.success === false) {
      return { ok: false, mensagem: dados?.error || "Erro ao excluir a conta." };
    }
    return { ok: true, mensagem: "Conta removida." };
  } catch (e) {
    const abortou = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      mensagem: abortou
        ? "A exclusão demorou mais que o esperado. Confira a lista antes de tentar de novo."
        : e instanceof Error
          ? e.message
          : "Erro ao excluir a conta.",
    };
  } finally {
    clearTimeout(relogio);
  }
}
