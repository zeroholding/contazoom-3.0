"use client";

import { useState } from "react";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";

interface HeaderGestaoSKUProps {
  selectedCategory?: string;
  onBackClick?: () => void;
  onImportExcel?: () => void;
  onExportExcel?: () => void;
  onSKUsPendentes?: () => void;
  onNovoSKU?: () => void;
  isLoading?: boolean;
}

export default function HeaderGestaoSKU({
  selectedCategory,
  onBackClick,
  onImportExcel,
  onExportExcel,
  onSKUsPendentes,
  onNovoSKU,
  isLoading = false,
}: HeaderGestaoSKUProps) {
  const [showExcelDropdown, setShowExcelDropdown] = useState(false);
  const excelDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showExcelDropdown,
    onClose: () => setShowExcelDropdown(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  if (selectedCategory) {
    return (
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cz-laranja)]">Catálogo</p>
          <h1 className="cz-titulo mt-1 text-[24px] leading-8">SKUs · {selectedCategory}</h1>
          <p className="mt-1 text-[13.5px] text-[var(--cz-texto-suave)]">Gerencie os SKUs desta categoria.</p>
        </div>
        <button type="button" onClick={onBackClick} aria-label="Voltar para todas as categorias" className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-4 text-sm font-semibold text-[var(--cz-texto)] transition-colors hover:bg-[var(--cz-fundo)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 12h14M9 16l-4-4 4-4" /></svg>
          Voltar
        </button>
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cz-laranja)]">Catálogo</p>
        <h1 className="cz-titulo mt-1 text-[26px] leading-8 sm:text-[30px]">Gestão de SKU</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--cz-texto-suave)]">Organize produtos, kits, custos e disponibilidade em um único lugar.</p>
      </div>

      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
        <button type="button" onClick={onSKUsPendentes} disabled={isLoading} aria-label="Abrir SKUs pendentes" className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] border border-amber-200 bg-amber-50 px-3.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 9v4m0 4h.01M10.3 4.3 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /></svg>
          Pendências
        </button>

        <div className="relative">
          <button ref={excelDropdown.triggerRef} type="button" onClick={() => setShowExcelDropdown((value) => !value)} disabled={isLoading} aria-label="Abrir ações de Excel" aria-expanded={showExcelDropdown} className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--cz-raio)] border px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${showExcelDropdown ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]" : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto)] hover:bg-[var(--cz-fundo)]"}`}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6" /></svg>
            Excel
            <svg className={`h-3.5 w-3.5 transition-transform ${showExcelDropdown ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {excelDropdown.isVisible && (
            <div ref={excelDropdown.dropdownRef} className={`smart-dropdown w-56 overflow-hidden border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] ${excelDropdown.isOpen ? "dropdown-enter" : "dropdown-exit"}`} style={excelDropdown.position}>
              <button type="button" onClick={() => { onImportExcel?.(); setShowExcelDropdown(false); }} className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-[var(--cz-texto)] transition-colors hover:bg-[var(--cz-fundo)]" aria-label="Importar SKUs de arquivo Excel">
                <svg className="h-4 w-4 text-[var(--cz-laranja)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 16V4m0 0L8 8m4-4 4 4M5 14v6h14v-6" /></svg>
                Importar Excel
              </button>
              <button type="button" onClick={() => { onExportExcel?.(); setShowExcelDropdown(false); }} className="flex min-h-11 w-full items-center gap-3 border-t border-[var(--cz-hairline)] px-4 py-2 text-left text-sm font-medium text-[var(--cz-texto)] transition-colors hover:bg-[var(--cz-fundo)]" aria-label="Exportar SKUs para arquivo Excel">
                <svg className="h-4 w-4 text-[var(--cz-laranja)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 4v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg>
                Exportar Excel
              </button>
            </div>
          )}
        </div>

        <button type="button" onClick={onNovoSKU} disabled={isLoading} aria-label="Criar novo SKU" className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-[var(--cz-raio)] bg-[var(--cz-laranja)] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          Novo SKU
        </button>
      </div>
    </header>
  );
}
