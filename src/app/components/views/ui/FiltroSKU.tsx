"use client";

import { useState } from "react";
import { useSmartDropdown } from "../../../../hooks/useSmartDropdown";

export type FiltroAgrupamentoSKU = "mlb" | "sku" | "hierarquia1" | "hierarquia2" | "kit";

interface FiltroSKUProps {
  agrupamentoAtivo: FiltroAgrupamentoSKU;
  onAgrupamentoChange: (v: FiltroAgrupamentoSKU) => void;
}

export default function FiltroSKU({
  agrupamentoAtivo,
  onAgrupamentoChange,
}: FiltroSKUProps) {

  const [showAgrupamentoDropdown, setShowAgrupamentoDropdown] = useState(false);

  const agrupamentoDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showAgrupamentoDropdown,
    onClose: () => setShowAgrupamentoDropdown(false),
    preferredPosition: 'bottom-right',
    offset: 8,
    minDistanceFromEdge: 16
  });

  const getAgrupamentoLabel = (agrupamento: FiltroAgrupamentoSKU) => {
    switch (agrupamento) {
      case "mlb": return "MLB (Padrão)";
      case "sku": return "SKU";
      case "hierarquia1": return "Hierarquia 1";
      case "hierarquia2": return "Hierarquia 2";
      case "kit": return "Kit";
      default: return "MLB (Padrão)";
    }
  };

  const getAgrupamentoDescription = (agrupamento: FiltroAgrupamentoSKU) => {
    switch (agrupamento) {
      case "mlb": return "Agrupa por código MLB do produto";
      case "sku": return "Agrupa por SKU individual";
      case "hierarquia1": return "Agrupa por categoria principal";
      case "hierarquia2": return "Agrupa por subcategoria";
      case "kit": return "Agrupa apenas produtos do tipo Kit";
      default: return "Agrupa por código MLB do produto";
    }
  };

  return (
    <div className="relative">
      <button
        ref={agrupamentoDropdown.triggerRef}
        onClick={() => setShowAgrupamentoDropdown(!showAgrupamentoDropdown)}
        /*
         * LARANJA DA MARCA, não azul.
         *
         * O azul aqui não significava nada: no produto, laranja quer dizer "foi
         * você que escolheu isto" (é a cor da pastilha ativa em `GrupoRecorte`,
         * dos botões primários e do menu). Um filtro azul ao lado de controles
         * laranja parecia de outro sistema, e sugeria uma categoria de estado que
         * não existe.
         */
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all duration-200 ${
          showAgrupamentoDropdown
            ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
            : "border-[var(--cz-hairline-forte)] bg-white text-gray-700 hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-laranja-forte)]"
        }`}
        title={getAgrupamentoDescription(agrupamentoAtivo)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"/>
          <path d="M7 12h10"/>
          <path d="M10 18h4"/>
        </svg>
        <span>Agrupar por: {getAgrupamentoLabel(agrupamentoAtivo)}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showAgrupamentoDropdown ? 'rotate-180' : ''}`}>
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </button>


      {agrupamentoDropdown.isVisible && (
        <div 
          ref={agrupamentoDropdown.dropdownRef}
          className={`smart-dropdown w-64 ${
            agrupamentoDropdown.isOpen ? 'dropdown-enter' : 'dropdown-exit'
          }`}
          style={agrupamentoDropdown.position}
        >
          <div className="p-2">
            <div className="space-y-1">
              {[
                { 
                  id: "mlb" as FiltroAgrupamentoSKU, 
                  label: "MLB (Padrão)", 
                  description: "Agrupa por código MLB do produto" 
                },
                { 
                  id: "sku" as FiltroAgrupamentoSKU, 
                  label: "SKU", 
                  description: "Agrupa por SKU individual" 
                },
                { 
                  id: "hierarquia1" as FiltroAgrupamentoSKU, 
                  label: "Hierarquia 1", 
                  description: "Agrupa por categoria principal" 
                },
                { 
                  id: "hierarquia2" as FiltroAgrupamentoSKU, 
                  label: "Hierarquia 2", 
                  description: "Agrupa por subcategoria" 
                },
                { 
                  id: "kit" as FiltroAgrupamentoSKU, 
                  label: "Kit", 
                  description: "Agrupa apenas produtos do tipo Kit" 
                },
              ].map((opcao) => (
                <button
                  key={opcao.id}
                  onClick={() => { onAgrupamentoChange(opcao.id); setShowAgrupamentoDropdown(false); }}
                  /*
                   * A opção ATIVA usa o laranja cheio, e não o suave do gatilho:
                   * dentro de uma lista de cinco linhas, fundo pálido some — foi
                   * o defeito do `bg-blue-100`, que só se distinguia do branco em
                   * tela boa. O contraste aqui é o que diz qual está valendo.
                   */
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    agrupamentoAtivo === opcao.id
                      ? "bg-[var(--cz-laranja)] font-semibold text-white"
                      : "text-gray-700 hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)]"
                  }`}
                  title={opcao.description}
                >
                  <div className="font-medium">{opcao.label}</div>
                  <div
                    className={`text-xs mt-0.5 ${
                      agrupamentoAtivo === opcao.id ? "text-white/80" : "text-gray-500"
                    }`}
                  >
                    {opcao.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

