"use client";

import { useState } from "react";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";
import { ListaOpcoes, resumoSelecao, type OpcaoSelecao } from "@/app/components/views/comum/filtros";
import { MAX_SKUS_FILTRO_VENDAS } from "@/lib/vendas-sku";

type Props = {
  opcoes: OpcaoSelecao[];
  selecionados: string[];
  onMudar: (valores: string[]) => void;
  carregando?: boolean;
  erro?: string | null;
};

/**
 * Pastilha desktop do filtro múltiplo de SKU.
 *
 * Usa `useSmartDropdown` (position: fixed) porque a barra das vendas tem
 * overflow horizontal. Um painel `absolute` seria cortado por ela. No celular a
 * mesma `ListaOpcoes` é renderizada diretamente na folha de filtros.
 */
export default function FiltroSkuVendas({
  opcoes,
  selecionados,
  onMudar,
  carregando = false,
  erro = null,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const dropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: aberto,
    onClose: () => setAberto(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  return (
    <div className="relative">
      <button
        ref={dropdown.triggerRef}
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
        className={`inline-flex h-10 max-w-[16rem] items-center gap-1.5 rounded-[var(--cz-raio)] border px-3 text-[13px] transition-colors ${
          selecionados.length > 0
            ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
            : "border-[var(--cz-hairline-forte)] bg-white text-[var(--cz-texto)] hover:border-[var(--cz-laranja-borda)]"
        }`}
      >
        <svg className="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 7h16M4 12h10M4 17h7" />
        </svg>
        <span className="shrink-0 text-[var(--cz-texto-suave)]">SKU:</span>
        <span className="min-w-0 truncate font-semibold">
          {resumoSelecao(opcoes, selecionados, "Todos")}
        </span>
        <svg className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${aberto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {dropdown.isVisible && (
        <div
          ref={dropdown.dropdownRef}
          className={`smart-dropdown w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden ${
            dropdown.isOpen ? "dropdown-enter" : "dropdown-exit"
          }`}
          style={dropdown.position}
        >
          <ListaOpcoes
            opcoes={opcoes}
            selecionados={selecionados}
            onMudar={onMudar}
            buscaPlaceholder="Buscar SKU…"
            vazio={carregando ? "Carregando SKUs…" : erro || "Nenhum SKU encontrado nas vendas"}
            maxSelecionados={MAX_SKUS_FILTRO_VENDAS}
          />
        </div>
      )}
    </div>
  );
}
