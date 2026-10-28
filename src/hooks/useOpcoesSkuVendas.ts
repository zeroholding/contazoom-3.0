"use client";

import { useCallback, useEffect, useState } from "react";
import { useAoSincronizarVendas } from "@/hooks/useAoSincronizarVendas";

export type PlataformaSkuVendas = "Mercado Livre" | "Shopee" | "TikTok Shop" | "Geral";
export type OpcaoSkuVenda = { sku: string; count: number };

const CHAVE_PLATAFORMA: Record<PlataformaSkuVendas, string> = {
  Geral: "geral",
  "Mercado Livre": "meli",
  Shopee: "shopee",
  "TikTok Shop": "tiktok",
};

/**
 * Lista completa de SKUs das vendas da plataforma. Recarrega depois de sync para
 * um código recém-importado aparecer sem atualizar a página inteira.
 */
export function useOpcoesSkuVendas(
  plataforma: PlataformaSkuVendas,
  ativo = true,
): { opcoes: OpcaoSkuVenda[]; carregando: boolean; erro: string | null; recarregar: () => void } {
  const [opcoes, setOpcoes] = useState<OpcaoSkuVenda[]>([]);
  const [carregando, setCarregando] = useState(ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const recarregar = useCallback(() => setRecarga((atual) => atual + 1), []);
  useAoSincronizarVendas(recarregar);

  useEffect(() => {
    if (!ativo) {
      setCarregando(false);
      return;
    }

    const controller = new AbortController();
    setCarregando(true);
    setErro(null);

    fetch(`/api/vendas/skus?plataforma=${CHAVE_PLATAFORMA[plataforma]}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(dados.error || `Erro ${res.status}`);
        const items = Array.isArray(dados.items) ? dados.items : [];
        setOpcoes(
          items
            .filter((item: unknown): item is OpcaoSkuVenda => {
              if (!item || typeof item !== "object") return false;
              const valor = item as Partial<OpcaoSkuVenda>;
              return typeof valor.sku === "string" && valor.sku.trim() !== "";
            })
            .map((item: OpcaoSkuVenda) => ({ sku: item.sku, count: Number(item.count) || 0 })),
        );
      })
      .catch((falha) => {
        if (falha instanceof Error && falha.name === "AbortError") return;
        setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os SKUs.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });

    return () => controller.abort();
  }, [ativo, plataforma, recarga]);

  return { opcoes, carregando, erro, recarregar };
}
