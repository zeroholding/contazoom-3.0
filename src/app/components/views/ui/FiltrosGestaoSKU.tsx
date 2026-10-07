"use client";

import { useEffect, useMemo, useState } from "react";
import { CaixaBusca } from "../comum/shell";
import FiltrosSheet, { CampoDaFolha, GrupoDePilulas } from "@/components/ui/FiltrosSheet";
import { useCelular } from "@/hooks/useMediaQuery";

interface FiltrosGestaoSKUProps {
  onFiltrosChange: (filtros: FiltrosSKU) => void;
  isLoading?: boolean;
  onSKUsPendentes?: () => void;
  onToggleEditMode?: () => void;
  onToggleMultiSelect?: () => void;
  isEditMode?: boolean;
  isMultiSelect?: boolean;
  selectedCount?: number;
}

export interface FiltrosSKU {
  search: string;
  tipo: string;
  ativo: string | null;
  temEstoque: string | null;
  hierarquia1: string;
  hierarquia2: string;
  page: number;
  limit: number;
}

type FiltroStatus = "todos" | "ativos" | "inativos" | "sem-estoque";

const FILTROS_INICIAIS: FiltrosSKU = {
  search: "",
  tipo: "",
  ativo: null,
  temEstoque: null,
  hierarquia1: "",
  hierarquia2: "",
  page: 1,
  limit: 25,
};

export default function FiltrosGestaoSKU({
  onFiltrosChange,
  isLoading = false,
  onToggleEditMode,
  onToggleMultiSelect,
  isEditMode = false,
  isMultiSelect = false,
  selectedCount = 0,
}: FiltrosGestaoSKUProps) {
  const [filtros, setFiltros] = useState<FiltrosSKU>(FILTROS_INICIAIS);
  const [searchDraft, setSearchDraft] = useState("");
  const celular = useCelular();

  useEffect(() => {
    onFiltrosChange(filtros);
  }, [filtros, onFiltrosChange]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFiltros((current) => current.search === searchDraft ? current : { ...current, search: searchDraft, page: 1 });
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchDraft]);

  const statusAtivo: FiltroStatus = filtros.temEstoque === "false"
    ? "sem-estoque"
    : filtros.ativo === "true"
      ? "ativos"
      : filtros.ativo === "false"
        ? "inativos"
        : "todos";

  const activeCount = useMemo(() => {
    return [filtros.search, filtros.tipo, filtros.ativo, filtros.temEstoque].filter((value) => value !== "" && value !== null).length;
  }, [filtros]);

  const changeStatus = (status: FiltroStatus) => {
    setFiltros((current) => ({
      ...current,
      ativo: status === "ativos" ? "true" : status === "inativos" ? "false" : null,
      temEstoque: status === "sem-estoque" ? "false" : null,
      page: 1,
    }));
  };

  const clearFilters = () => {
    setSearchDraft("");
    setFiltros(FILTROS_INICIAIS);
  };

  const statusOptions: Array<{ id: FiltroStatus; label: string; activeClass: string }> = [
    { id: "todos", label: "Todos", activeClass: "border-[var(--cz-hairline-forte)] bg-[var(--cz-texto)] text-white" },
    { id: "ativos", label: "Ativos", activeClass: "border-emerald-200 bg-emerald-100 text-emerald-900" },
    { id: "inativos", label: "Inativos", activeClass: "border-rose-200 bg-rose-100 text-rose-900" },
    { id: "sem-estoque", label: "Sem estoque", activeClass: "border-amber-200 bg-amber-100 text-amber-900" },
  ];

  // Celular: a busca fica SEMPRE à vista e, ao lado dela, o botão "Filtros" abre uma
  // folha com tipo e situação. Antes, título + busca + tipo + modos + pastilhas
  // ocupavam ~310px do topo e a lista só aparecia depois da primeira dobra.
  if (celular) {
    const naFolha = [filtros.tipo, filtros.ativo, filtros.temEstoque].filter((value) => value !== "" && value !== null).length;
    return (
      <section className="rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-3 shadow-[var(--cz-elev-1)]" aria-label="Filtros de SKU">
        <div className="flex flex-col gap-3">
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1">
              <CaixaBusca valor={searchDraft} onMudar={setSearchDraft} placeholder="Buscar SKU ou produto…" rotuloAcessivel="Buscar SKU ou produto" />
            </div>
            <FiltrosSheet titulo="Filtros" ativos={naFolha} onLimpar={clearFilters} classeBotao="shrink-0">
              <CampoDaFolha rotulo="Tipo de SKU">
                <GrupoDePilulas
                  rotulo="Tipo de SKU"
                  opcoes={[
                    { id: "", rotulo: "Todos" },
                    { id: "pai", rotulo: "Kits" },
                    { id: "filho", rotulo: "Individuais" },
                  ]}
                  estaAtiva={(id) => filtros.tipo === id}
                  onEscolher={(id) => setFiltros((current) => ({ ...current, tipo: id, page: 1 }))}
                />
              </CampoDaFolha>
              <CampoDaFolha rotulo="Situação">
                <GrupoDePilulas
                  rotulo="Situação"
                  opcoes={statusOptions.map(({ id, label }) => ({ id, rotulo: label }))}
                  estaAtiva={(id) => statusAtivo === id}
                  onEscolher={(id) => changeStatus(id as FiltroStatus)}
                />
              </CampoDaFolha>
            </FiltrosSheet>
          </div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Modos da listagem">
            <button type="button" onClick={onToggleEditMode} disabled={isLoading} aria-pressed={isEditMode} className={`inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border px-3 text-[13px] font-semibold transition-colors disabled:opacity-50 ${isEditMode ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]" : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)]"}`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m4 20 4-1 11-11-3-3L5 16zM14 6l3 3" /></svg>
              Editar
            </button>
            <button type="button" onClick={onToggleMultiSelect} disabled={isLoading || !isEditMode} aria-pressed={isMultiSelect} className={`inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isMultiSelect ? "border-blue-200 bg-blue-50 text-blue-800" : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)]"}`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m9 12 2 2 4-4M4 5h16M4 19h16" /></svg>
              Selecionar{isMultiSelect && selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 shadow-[var(--cz-elev-1)]" aria-label="Filtros de SKU">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--cz-texto)]">Encontre e organize</h2>
            <p className="mt-0.5 text-xs text-[var(--cz-texto-suave)]">Busque por código ou produto e refine a lista.</p>
          </div>
          {activeCount > 0 && (
            <button type="button" onClick={clearFilters} disabled={isLoading} className="inline-flex h-11 shrink-0 items-center justify-center rounded-[var(--cz-raio)] px-3 text-xs font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:bg-[var(--cz-laranja-suave)] disabled:opacity-50" aria-label={`Limpar ${activeCount} filtros ativos`}>
              Limpar ({activeCount})
            </button>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_200px_auto]">
          <CaixaBusca valor={searchDraft} onMudar={setSearchDraft} placeholder="Buscar por SKU ou produto…" rotuloAcessivel="Buscar SKU ou produto" />
          <label>
            <span className="sr-only">Tipo de SKU</span>
            <select value={filtros.tipo} onChange={(event) => setFiltros((current) => ({ ...current, tipo: event.target.value, page: 1 }))} disabled={isLoading} className="h-11 w-full rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-[13.5px] font-medium text-[var(--cz-texto)] outline-none transition-colors focus:border-[var(--cz-laranja)] focus:ring-2 focus:ring-[var(--cz-laranja-suave)] disabled:opacity-50" aria-label="Filtrar por tipo de SKU">
              <option value="">Todos os tipos</option>
              <option value="pai">Kits</option>
              <option value="filho">Individuais</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Modos da listagem">
            <button type="button" onClick={onToggleEditMode} disabled={isLoading} aria-pressed={isEditMode} className={`inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${isEditMode ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]" : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)] hover:bg-[var(--cz-fundo)]"}`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m4 20 4-1 11-11-3-3L5 16zM14 6l3 3" /></svg>
              Editar
            </button>
            <button type="button" onClick={onToggleMultiSelect} disabled={isLoading || !isEditMode} aria-pressed={isMultiSelect} className={`inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isMultiSelect ? "border-blue-200 bg-blue-50 text-blue-800" : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)] hover:bg-[var(--cz-fundo)]"}`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m9 12 2 2 4-4M4 5h16M4 19h16" /></svg>
              Selecionar{isMultiSelect && selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por status">
          {statusOptions.map((option) => {
            const active = statusAtivo === option.id;
            return (
              <button key={option.id} type="button" onClick={() => changeStatus(option.id)} aria-pressed={active} disabled={isLoading} className={`inline-flex h-11 shrink-0 items-center justify-center rounded-full border px-4 text-xs font-semibold transition-colors disabled:opacity-50 ${active ? option.activeClass : "border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-hairline-forte)] hover:text-[var(--cz-texto)]"}`}>
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
