"use client";

/**
 * Busca dos anúncios, compartilhada pelas duas telas.
 *
 * Um hook e não duas cópias: o contrato da rota `/api/anuncios` é o mesmo, e
 * duplicar a montagem da querystring garantiria que um parâmetro novo entrasse
 * numa tela e fosse esquecido na outra.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

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

/** Contas dos três canais, vindas da rota segura que nunca expõe tokens. */
export function useContas(): Conta[] {
  const [contas, setContas] = useState<Conta[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/contas", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j || !Array.isArray(j.contas)) return;
        const lista: Conta[] = [];
        for (const valor of j.contas as Array<Record<string, unknown>>) {
          const canal = valor.canal;
          if (canal !== "ML" && canal !== "SP" && canal !== "TT") continue;
          const id = String(valor.id ?? "");
          if (!id) continue;
          const nome = String(valor.nome ?? id);
          lista.push({ id, nome, canal, nickname: nome });
        }
        setContas(lista);
      })
      .catch(() => {
        // Sem contas, o filtro permanece em "Todas as contas" e a listagem segue.
      });
    return () => {
      vivo = false;
    };
  }, []);

  return contas;
}

/** Compatibilidade de AnunciosMortos: mesma UX ML, agora sem receber tokens. */
export function useContasMeli(): Conta[] {
  const contas = useContas();
  return useMemo(() => contas.filter((c) => c.canal === "ML"), [contas]);
}
