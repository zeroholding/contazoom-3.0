import { useState } from "react";

export type DataVendaFilter = {
  min?: Date;
  max?: Date;
};

export type VendaFilters = {
  accountId?: string;
  status?: string;
  dataVenda?: DataVendaFilter;
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

    if (key === "dataVenda" && typeof value === "object") {
      if (value.min) params.append("dataVenda[min]", value.min.toISOString());
      if (value.max) params.append("dataVenda[max]", value.max.toISOString());
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
    setFilters((prev) => ({
      ...prev,
      ...partial,
      page: partial.page ?? 1, // reset page se não for paginação
    }));

    console.log(`[useVendaFilters] updateFilters to ${partial}`)
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
