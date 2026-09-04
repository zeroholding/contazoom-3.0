"use client";

/**
 * Busca dos anúncios, compartilhada pelas duas telas.
 *
 * Um hook e não duas cópias: o contrato da rota `/api/anuncios` é o mesmo, e
 * duplicar a montagem da querystring garantiria que um parâmetro novo entrasse
 * numa tela e fosse esquecido na outra.
 */

import { useCallback, useEffect, useState } from "react";

import type { Conta, Resposta } from "./tipos";

export type ParametrosAnuncios = Record<string, string | number | undefined>;

export type EstadoAnuncios = {
  dados: Resposta | null;
  carregando: boolean;
  erro: string | null;
  atualizando: boolean;
  /** Refaz a busca ignorando o cache do servidor. */
  atualizar: () => Promise<void>;
};

export function useAnuncios(params: ParametrosAnuncios): EstadoAnuncios {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  // Serializa os parâmetros numa string estável para servir de dependência do
  // efeito. Passar o objeto direto refaria a busca a cada recomposição, porque
  // um literal de objeto é uma referência nova toda vez.
  const chave = JSON.stringify(params);

  const buscar = useCallback(
    async (forcar: boolean): Promise<Resposta> => {
      const p = new URLSearchParams();
      for (const [nome, valor] of Object.entries(
        JSON.parse(chave) as ParametrosAnuncios,
      )) {
        if (valor === undefined || valor === "" || valor === null) continue;
        p.set(nome, String(valor));
      }
      if (forcar) p.set("atualizar", "1");

      const res = await fetch(`/api/anuncios?${p.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Resposta;
    },
    [chave],
  );

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    buscar(false)
      .then((j) => {
        if (vivo) setDados(j);
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível carregar os anúncios.");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [buscar]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    try {
      setDados(await buscar(true));
      setErro(null);
    } catch {
      setErro("Não foi possível atualizar.");
    } finally {
      setAtualizando(false);
    }
  }, [buscar]);

  return { dados, carregando, erro, atualizando, atualizar };
}

/** Contas do Mercado Livre do usuário, para o filtro de conta. */
export function useContasMeli(): Conta[] {
  const [contas, setContas] = useState<Conta[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/meli/accounts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j) return;
        const lista = Array.isArray(j) ? j : (j.accounts ?? j.contas ?? []);
        setContas(
          (lista as Array<Record<string, unknown>>).map((c) => ({
            id: String(c.id ?? ""),
            nickname: (c.nickname as string) ?? null,
          })),
        );
      })
      .catch(() => {
        // Sem a lista, o filtro fica só com "Todas as contas". Não é motivo
        // para derrubar a tela.
      });
    return () => {
      vivo = false;
    };
  }, []);

  return contas;
}
