"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { NotificacaoItem, RespostaNotificacoes, ResumoTipo } from "@/lib/notificacoes/tipos";

/**
 * Estado das notificações do usuário, UM para o painel inteiro.
 *
 * O sino (no cabeçalho), o aviso do Dashboard e o drive de documentos leem o
 * mesmo estado. Cada tela monta o próprio cabeçalho, então o estado vive no
 * módulo e não num componente: trocar de tela não refaz a busca, não pisca a
 * contagem e não dispara o aviso de "novo" para o que já tinha chegado.
 *
 * Atualiza sozinho a cada minuto com a aba visível, ao voltar para a aba e
 * depois de cada ação. Marcar como lida é otimista: a tela muda na hora e o
 * servidor confirma em seguida.
 */

export type EstadoNotificacoes = {
  status: "inicial" | "carregando" | "pronto" | "erro";
  naoLidas: number;
  porTipo: ResumoTipo[];
  itens: NotificacaoItem[];
  erro: string | null;
};

const INTERVALO_MS = 60_000;
/** Ao voltar para a aba, não refaz se acabou de buscar. */
const RECARGA_MINIMA_MS = 15_000;

const INICIAL: EstadoNotificacoes = { status: "inicial", naoLidas: 0, porTipo: [], itens: [], erro: null };

let estado: EstadoNotificacoes = INICIAL;
let usuarioAtual: string | null = null;
const ouvintes = new Set<() => void>();
const ouvintesDeNovas = new Set<(novas: NotificacaoItem[]) => void>();
/** Ids já vistos nesta sessão; `null` antes da primeira carga (nada é "novo"). */
let idsConhecidos: Set<string> | null = null;
let emVoo: Promise<void> | null = null;
let ultimaCarga = 0;
let assinantes = 0;
let relogio: ReturnType<typeof setInterval> | null = null;
/** Sobe a cada mudança local; resposta que saiu antes dela é descartada. */
let versaoLocal = 0;

function definir(parcial: Partial<EstadoNotificacoes>) {
  estado = { ...estado, ...parcial };
  for (const ouvinte of ouvintes) ouvinte();
}

function zerar() {
  estado = INICIAL;
  idsConhecidos = null;
  ultimaCarga = 0;
  versaoLocal += 1;
  for (const ouvinte of ouvintes) ouvinte();
}

async function buscar(): Promise<void> {
  if (!usuarioAtual) return;
  const usuario = usuarioAtual;
  const versao = versaoLocal;
  if (estado.status === "inicial") definir({ status: "carregando" });

  try {
    const resposta = await fetch("/api/notificacoes?limite=30", { cache: "no-store", credentials: "include" });
    if (usuario !== usuarioAtual) return;
    if (resposta.status === 401) {
      zerar();
      return;
    }
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const dados = (await resposta.json()) as RespostaNotificacoes;
    if (usuario !== usuarioAtual || versao !== versaoLocal) return;

    const itens = Array.isArray(dados.itens) ? dados.itens : [];
    if (idsConhecidos) {
      const conhecidos = idsConhecidos;
      const novas = itens.filter((item) => !item.lida && !conhecidos.has(item.id));
      if (novas.length > 0) for (const ouvinte of ouvintesDeNovas) ouvinte(novas);
      for (const item of itens) conhecidos.add(item.id);
    } else {
      idsConhecidos = new Set(itens.map((item) => item.id));
    }

    definir({
      status: "pronto",
      naoLidas: Number(dados.naoLidas) || 0,
      porTipo: Array.isArray(dados.porTipo) ? dados.porTipo : [],
      itens,
      erro: null,
    });
  } catch (erro) {
    if (usuario !== usuarioAtual) return;
    // Falha na atualização automática não apaga o que já está na tela.
    definir({
      status: estado.status === "pronto" ? "pronto" : "erro",
      erro: erro instanceof Error ? erro.message : "Falha ao carregar",
    });
  } finally {
    ultimaCarga = Date.now();
  }
}

/** Busca agora. Com `forcar`, espera a busca em andamento e faz outra. */
function carregar(forcar = false): Promise<void> {
  if (emVoo && !forcar) return emVoo;
  const anterior = emVoo;
  const proxima = (async () => {
    if (anterior) await anterior.catch(() => undefined);
    await buscar();
  })();
  emVoo = proxima;
  void proxima.finally(() => {
    if (emVoo === proxima) emVoo = null;
  });
  return proxima;
}

function aoVoltarParaAba() {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - ultimaCarga < RECARGA_MINIMA_MS) return;
  void carregar();
}

function iniciarAtualizacao() {
  if (relogio) return;
  relogio = setInterval(() => {
    if (document.visibilityState === "visible") void carregar();
  }, INTERVALO_MS);
  window.addEventListener("focus", aoVoltarParaAba);
  document.addEventListener("visibilitychange", aoVoltarParaAba);
}

function pararAtualizacao() {
  if (relogio) clearInterval(relogio);
  relogio = null;
  window.removeEventListener("focus", aoVoltarParaAba);
  document.removeEventListener("visibilitychange", aoVoltarParaAba);
}

type FiltroLeitura = { ids?: string[]; documentoIds?: string[]; todas?: boolean; tipo?: string };

/** Marca no estado local, na hora, o que o servidor vai marcar. */
function aplicarLeituraLocal(filtro: FiltroLeitura) {
  const ids = new Set(filtro.ids ?? []);
  const documentoIds = new Set(filtro.documentoIds ?? []);
  const atinge = (item: NotificacaoItem) =>
    filtro.todas
      ? !filtro.tipo || item.tipo === filtro.tipo
      : ids.has(item.id) || (item.documentoId !== null && documentoIds.has(item.documentoId));

  const lidasPorTipo = new Map<string, number>();
  const itens = estado.itens.map((item) => {
    if (item.lida || !atinge(item)) return item;
    lidasPorTipo.set(item.tipo, (lidasPorTipo.get(item.tipo) ?? 0) + 1);
    return { ...item, lida: true };
  });

  let porTipo: ResumoTipo[];
  let naoLidas: number;
  if (filtro.todas) {
    // "Todas" vale também para o que não está carregado na lista.
    porTipo = estado.porTipo.map((grupo) =>
      !filtro.tipo || grupo.tipo === filtro.tipo ? { ...grupo, naoLidas: 0 } : grupo,
    );
    naoLidas = filtro.tipo
      ? Math.max(0, estado.naoLidas - (estado.porTipo.find((grupo) => grupo.tipo === filtro.tipo)?.naoLidas ?? 0))
      : 0;
  } else {
    porTipo = estado.porTipo.map((grupo) => ({
      ...grupo,
      naoLidas: Math.max(0, grupo.naoLidas - (lidasPorTipo.get(grupo.tipo) ?? 0)),
    }));
    const total = [...lidasPorTipo.values()].reduce((soma, valor) => soma + valor, 0);
    naoLidas = Math.max(0, estado.naoLidas - total);
  }

  versaoLocal += 1;
  definir({ itens, porTipo, naoLidas });
}

async function marcarLidas(filtro: FiltroLeitura): Promise<void> {
  if (!usuarioAtual) return;
  aplicarLeituraLocal(filtro);
  try {
    await fetch("/api/notificacoes", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filtro),
    });
  } catch {
    // Sem rede: a próxima atualização traz o que o servidor tem de verdade.
  }
  await carregar(true);
}

export function marcarNotificacoesComoLidas(ids: string[]) {
  if (ids.length === 0) return Promise.resolve();
  return marcarLidas({ ids });
}

export function marcarTodasNotificacoesComoLidas(tipo?: string) {
  return marcarLidas(tipo ? { todas: true, tipo } : { todas: true });
}

/**
 * Avisos dos documentos abertos agora (o servidor também marca ao abrir o
 * arquivo). Com a lista carregada, só vai ao servidor se ela mostra aviso não
 * lido do documento; antes disso (quem chega pelo link do e-mail) não dá para
 * saber, então pergunta ao servidor.
 */
export function marcarDocumentosComoVistos(documentoIds: string[]) {
  const alvo =
    estado.status === "pronto"
      ? documentoIds.filter((id) => estado.itens.some((item) => !item.lida && item.documentoId === id))
      : documentoIds;
  if (alvo.length === 0) return Promise.resolve();
  return marcarLidas({ documentoIds: alvo });
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

const lerEstado = () => estado;
const lerEstadoServidor = () => INICIAL;

/**
 * Notificações do usuário logado. `usuarioId` nulo (ainda carregando a sessão,
 * ou deslogado) não busca nada; trocar de usuário zera o estado, para os avisos
 * de uma conta não aparecerem na outra.
 */
export function useNotificacoes(usuarioId: string | null | undefined) {
  const atual = useSyncExternalStore(assinar, lerEstado, lerEstadoServidor);

  useEffect(() => {
    const id = usuarioId ?? null;
    if (id !== usuarioAtual) {
      usuarioAtual = id;
      zerar();
    }
    if (!id) return;

    assinantes += 1;
    if (assinantes === 1) iniciarAtualizacao();
    if (estado.status === "inicial" || Date.now() - ultimaCarga > RECARGA_MINIMA_MS) void carregar();

    return () => {
      assinantes -= 1;
      if (assinantes === 0) pararAtualizacao();
    };
  }, [usuarioId]);

  return {
    ...atual,
    recarregar: () => carregar(true),
  };
}

/** Chamado quando chega notificação que não estava aqui antes. */
export function useAoChegarNotificacoes(callback: (novas: NotificacaoItem[]) => void) {
  const referencia = useRef(callback);
  useEffect(() => {
    referencia.current = callback;
  }, [callback]);

  useEffect(() => {
    const ouvinte = (novas: NotificacaoItem[]) => referencia.current(novas);
    ouvintesDeNovas.add(ouvinte);
    return () => {
      ouvintesDeNovas.delete(ouvinte);
    };
  }, []);
}
