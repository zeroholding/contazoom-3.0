"use client";

/**
 * Sessão com PAPEL e permissões, para o módulo de tarefas.
 *
 * `useAuth` já resolve "está logado?" e é usado por todo o app — não mexo nele.
 * O que falta é "logado COMO O QUE?", porque `/api/auth/me` não devolve o papel.
 *
 * Cache em módulo com o mesmo padrão de `useAuth` (`authCache`) e de
 * `api-guard.ts`: quatro componentes da mesma tela pedindo a sessão não podem
 * virar quatro requisições. Trinta segundos casa com o cache do servidor, então
 * uma troca de permissão vale em no máximo um minuto.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type Permissoes = {
  concluirEtapaComercial: boolean;
  concluirEtapaEscritorio: boolean;
  concluirEtapaAmbos: boolean;
  retornarEtapa: boolean;
  encerrarTarefa: boolean;
  reabrirTarefa: boolean;
  gerenciarBloqueio: boolean;
  criarProcesso: boolean;
  gerenciarEmpresa: boolean;
  alterarRegime: boolean;
  gerenciarUsuarios: boolean;
  /** Excluir empresa, competência ou processo. Só administrador. */
  excluir: boolean;
};

export type Sessao = {
  userId: string;
  email: string;
  nome: string;
  papel: string;
  papelLabel: string;
  papelDescricao: string;
  papelResumo: string;
  papelIcone: string;
  interno: boolean;
  permissoes: Permissoes;
};

/** Nenhuma permissão. Usado enquanto carrega e quando a sessão falha. */
export const SEM_PERMISSAO: Permissoes = {
  concluirEtapaComercial: false,
  concluirEtapaEscritorio: false,
  concluirEtapaAmbos: false,
  retornarEtapa: false,
  encerrarTarefa: false,
  reabrirTarefa: false,
  gerenciarBloqueio: false,
  criarProcesso: false,
  gerenciarEmpresa: false,
  alterarRegime: false,
  gerenciarUsuarios: false,
  excluir: false,
};

const CACHE_MS = 30_000;
let cache: { sessao: Sessao | null; em: number } | null = null;
let emVoo: Promise<Sessao | null> | null = null;

/** Limpa o cache. Chamar depois de alterar o papel de alguém. */
export function invalidarSessao(): void {
  cache = null;
  emVoo = null;
}

async function buscarSessao(): Promise<Sessao | null> {
  const resposta = await fetch("/api/sessao", {
    cache: "no-store",
    credentials: "include",
  });
  if (!resposta.ok) return null;
  return (await resposta.json()) as Sessao;
}

export function useSessao() {
  const [sessao, setSessao] = useState<Sessao | null>(cache?.sessao ?? null);
  const [carregando, setCarregando] = useState(!cache);
  const montado = useRef(true);

  const carregar = useCallback(async (forcar = false) => {
    if (!forcar && cache && Date.now() - cache.em < CACHE_MS) {
      if (montado.current) {
        setSessao(cache.sessao);
        setCarregando(false);
      }
      return cache.sessao;
    }

    if (forcar) invalidarSessao();

    // Deduplica requisições concorrentes da mesma tela.
    if (!emVoo) {
      emVoo = buscarSessao()
        .catch((erro) => {
          console.error("[useSessao] falha ao carregar sessão:", erro);
          return null;
        })
        .then((resultado) => {
          cache = { sessao: resultado, em: Date.now() };
          emVoo = null;
          return resultado;
        });
    }

    const resultado = await emVoo;
    if (montado.current) {
      setSessao(resultado);
      setCarregando(false);
    }
    return resultado;
  }, []);

  useEffect(() => {
    montado.current = true;
    void carregar();
    return () => {
      montado.current = false;
    };
  }, [carregar]);

  return {
    sessao,
    carregando,
    papel: sessao?.papel ?? null,
    interno: sessao?.interno ?? false,
    permissoes: sessao?.permissoes ?? SEM_PERMISSAO,
    recarregar: () => carregar(true),
  };
}
