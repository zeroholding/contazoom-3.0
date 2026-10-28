import { useState } from "react";
import { normalizarSkusFiltro } from "@/lib/vendas-sku";

export type DataVendaFilter = {
  min?: Date;
  max?: Date;
};

export type VendaFilters = {
  accountId?: string;
  status?: string;
  dataVenda?: DataVendaFilter;
  /** OR entre os códigos; combinado por AND com os outros filtros. */
  skus?: string[];
  logisticType?: "fulfillment" | "flex" | "agencia" | "drop_off";
  ads?: boolean;
  anuncio?: "catalogo" | "proprio";
  exposicao?: "premium" | "classico";
  page: number;
  limit: number;
};

export function serializeVendaFilters(filters: VendaFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    // Uma chave por SKU. CSV não serve: SKU pode conter vírgula, `&`, `=` e
    // Unicode. Ordem canônica evita duas requisições/cache keys para a mesma seleção.
    if (key === "skus" && Array.isArray(value)) {
      for (const sku of normalizarSkusFiltro(value)) params.append("sku", sku);
      return;
    }

    if (key === "dataVenda" && typeof value === "object" && !Array.isArray(value)) {
      const data = value as DataVendaFilter;
      if (data.min) params.append("dataVenda[min]", data.min.toISOString());
      if (data.max) params.append("dataVenda[max]", data.max.toISOString());
      return;
    }

    params.append(key, String(value));
  });

  return params.toString();
}

export const DEFAULT_FILTERS: VendaFilters = {
  page: 1,
  limit: 10,
};

type PropsType = {
  initialFilters?: VendaFilters;
};

export function useVendaFilters({ initialFilters }: PropsType = {}) {
  const [filters, setFilters] = useState<VendaFilters>(
    initialFilters ?? DEFAULT_FILTERS,
  );

  function updateFilters(partial: Partial<VendaFilters>) {
    const normalizado = Object.prototype.hasOwnProperty.call(partial, "skus")
      ? {
          ...partial,
          skus: partial.skus && partial.skus.length > 0
            ? normalizarSkusFiltro(partial.skus)
            : undefined,
        }
      : partial;

    setFilters((prev) => ({
      ...prev,
      ...normalizado,
      page: normalizado.page ?? 1, // reset page se não for paginação
    }));

    console.log(`[useVendaFilters] updateFilters to ${JSON.stringify(normalizado)}`)
  }

  function setPage(page: number) {
    setFilters((prev) => ({ ...prev, page }));
    console.log(`[useVendaFilters] SetPage to ${page}`)
  }

  function setLimit(limit: number) {
    setFilters((prev) => ({ ...prev, limit, page: 1 }));
    console.log(`[useVendaFilters] setLimit to ${limit}`)

  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    console.log(`[useVendaFilters] resetFilters to ${DEFAULT_FILTERS}`)
  }

  return {
    filters,
    updateFilters,
    setPage,
    setLimit,
    resetFilters,
  };
}
