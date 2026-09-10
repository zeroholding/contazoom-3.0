"use client";

/**
 * Estado da tela de Expedição: filtros, busca no servidor e exportação.
 *
 * Mesmo formato do `useAnuncios`: os filtros são o parâmetro, a chave estável do
 * efeito é o JSON deles, e a rota faz todo o trabalho. Nada é filtrado ou
 * ordenado no navegador — a fila é paginada por PACOTE no banco, e refazer isso
 * aqui daria contadores diferentes dos do servidor na mesma tela.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  FILTROS_PADRAO,
  type FiltrosExpedicao,
  type ResultadoExpedicao,
} from "@/lib/expedicao";

/** Filtros -> query string. Só o que difere do padrão vai para a URL. */
export function paraQuery(filtros: FiltrosExpedicao): URLSearchParams {
  const p = new URLSearchParams();

  if (filtros.canais.length) p.set("canais", filtros.canais.join(","));
  if (filtros.contas.length) p.set("contas", filtros.contas.join(","));
  if (filtros.urgencias.length) p.set("urgencias", filtros.urgencias.join(","));
  if (filtros.modalidades.length) p.set("modalidades", filtros.modalidades.join(","));
  if (filtros.hierarquias1.length) p.set("hierarquias1", filtros.hierarquias1.join(","));
  if (filtros.hierarquias2.length) p.set("hierarquias2", filtros.hierarquias2.join(","));
  if (filtros.busca.trim()) p.set("busca", filtros.busca.trim());

  if (filtros.prazoPreset !== FILTROS_PADRAO.prazoPreset) {
    p.set("prazoPreset", filtros.prazoPreset);
  }
  // As datas só vão junto no modo personalizado. Nos atalhos elas são DERIVADAS
  // no servidor, e mandá-las na URL congelaria a faixa: um link de "vencem hoje"
  // salvo ontem abriria mostrando ontem, o que é o oposto do que o atalho promete.
  if (filtros.prazoPreset === "personalizado") {
    if (filtros.prazoDe) p.set("prazoDe", filtros.prazoDe);
    if (filtros.prazoAte) p.set("prazoAte", filtros.prazoAte);
  }

  if (filtros.vendaDe) p.set("vendaDe", filtros.vendaDe);
  if (filtros.vendaAte) p.set("vendaAte", filtros.vendaAte);

  if (filtros.statusVenda !== FILTROS_PADRAO.statusVenda) {
    p.set("statusVenda", filtros.statusVenda);
  }
  if (filtros.temPrazo !== FILTROS_PADRAO.temPrazo) p.set("temPrazo", filtros.temPrazo);

  if (filtros.janelaDias !== FILTROS_PADRAO.janelaDias) {
    p.set("janelaDias", String(filtros.janelaDias));
  }
  if (filtros.ordem !== FILTROS_PADRAO.ordem) p.set("ordem", filtros.ordem);
  if (filtros.direcao !== FILTROS_PADRAO.direcao) p.set("direcao", filtros.direcao);
  if (filtros.pagina !== 1) p.set("pagina", String(filtros.pagina));
  if (filtros.porPagina !== FILTROS_PADRAO.porPagina) {
    p.set("porPagina", String(filtros.porPagina));
  }

  return p;
}

export type EstadoExpedicao = {
  dados: ResultadoExpedicao | null;
  carregando: boolean;
  atualizando: boolean;
  erro: string | null;
  atualizar: () => void;
};

export function useExpedicao(filtros: FiltrosExpedicao): EstadoExpedicao {
  // JSON como dependência do efeito: o objeto de filtros é recriado a cada
  // render, então usá-lo direto dispararia uma requisição por render. É o mesmo
  // recurso do `useAnuncios`.
  const chave = useMemo(() => JSON.stringify(filtros), [filtros]);

  const [dados, setDados] = useState<ResultadoExpedicao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Contador de pedidos de recarga. Trocar o valor reexecuta o efeito sem mexer
  // nos filtros — se `atualizar` chamasse `buscar` direto, uma resposta lenta
  // poderia chegar depois de uma troca de filtro e sobrescrever a lista certa
  // pela antiga.
  const [recarga, setRecarga] = useState(0);
  const primeiraCarga = useRef(true);

  useEffect(() => {
    let vivo = true;
    const forcar = recarga > 0;

    if (primeiraCarga.current) setCarregando(true);
    else if (forcar) setAtualizando(true);
    else setCarregando(true);

    (async () => {
      try {
        const p = paraQuery(JSON.parse(chave) as FiltrosExpedicao);
        if (forcar) p.set("atualizar", "1");

        const res = await fetch(`/api/expedicao?${p}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const corpo = (await res.json()) as ResultadoExpedicao;

        if (!vivo) return;
        setDados(corpo);
        setErro(null);
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : "Falha ao carregar a fila");
      } finally {
        if (!vivo) return;
        primeiraCarga.current = false;
        setCarregando(false);
        setAtualizando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [chave, recarga]);

  const atualizar = useCallback(() => setRecarga((n) => n + 1), []);

  return { dados, carregando, atualizando, erro, atualizar };
}

/**
 * Dispara o download do CSV.
 *
 * `pagina=1` e `porPagina=500` porque a lista de separação é do conjunto
 * filtrado, não da página que está na tela — quem imprime quer tudo o que
 * precisa sair hoje. O teto de 500 pacotes é o mesmo da rota; acima disso a
 * pessoa filtra por urgência ou por conta, que é o uso real.
 *
 * Âncora e não `fetch` + `Blob`: a rota já devolve `Content-Disposition`, e
 * deixar o navegador cuidar do download preserva o nome do arquivo e não carrega
 * o CSV inteiro na memória da aba.
 */
export function baixarCsv(filtros: FiltrosExpedicao): void {
  const p = paraQuery({ ...filtros, pagina: 1, porPagina: 500 });
  p.set("porPagina", "500");
  p.set("formato", "csv");

  const a = document.createElement("a");
  a.href = `/api/expedicao?${p}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
