"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/frete";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";

interface ReceitaLiquidaDetailsDropdownProps {
  venda: any;
  freteExibido: number;
  children: React.ReactNode;
}

export default function ReceitaLiquidaDetailsDropdown({
  venda,
  freteExibido,
  children,
}: ReceitaLiquidaDetailsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Usar o hook inteligente de dropdown
  const dropdown = useSmartDropdown<HTMLDivElement>({
    isOpen,
    onClose: () => setIsOpen(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  const receitaLiquida = venda.valorTotal + (venda.taxaPlataforma || 0) + (freteExibido || 0);

  return (
    <>
      <div
        ref={dropdown.triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer hover:bg-gray-50 rounded px-1 py-1 transition-colors inline-block"
      >
        {children}
      </div>

      {dropdown.isVisible && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdown.dropdownRef}
          className={`smart-dropdown w-72 ${
            dropdown.isOpen ? "dropdown-enter" : "dropdown-exit"
          }`}
          style={{
            ...dropdown.position,
            zIndex: 999999, // Z-index extremamente alto para ficar acima de TUDO
            position: "fixed", // Usar fixed para escapar do contexto da tabela
            backgroundColor: "white", // Fundo branco sólido
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)", // Sombra mais forte
            border: "1px solid #e5e7eb", // Borda para definir melhor o dropdown
            borderRadius: "0.5rem", // Bordas arredondadas
            pointerEvents: "auto", // Garantir que o dropdown seja clicável
          }}
        >
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Detalhamento da Venda
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Valor Bruto */}
              <div className="border-l-3 border-emerald-500 pl-2 flex justify-between items-center">
                <div className="text-xs font-medium text-gray-700">
                  Valor Bruto
                </div>
                <div className="text-sm font-semibold text-emerald-600">
                  {formatCurrency(venda.valorTotal)}
                </div>
              </div>

              {/* Taxa */}
              <div className="border-l-3 border-orange-500 pl-2 flex justify-between items-center">
                <div className="text-xs font-medium text-gray-700">
                  Taxa Plataforma
                </div>
                <div className="text-sm font-semibold text-orange-600 flex items-center gap-1">
                  {formatCurrency(venda.taxaPlataforma || 0)}
                  {venda.valorTotal > 0 && (
                    <span className="text-[10px] text-gray-400 font-normal">
                      ({((Math.abs(venda.taxaPlataforma || 0) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Frete */}
              <div className="border-l-3 border-blue-500 pl-2 flex justify-between items-center">
                <div className="text-xs font-medium text-gray-700">
                  Frete
                </div>
                <div className="text-sm font-semibold text-blue-600 flex items-center gap-1">
                  {formatCurrency(freteExibido || 0)}
                  {venda.valorTotal > 0 && (
                    <span className="text-[10px] text-gray-400 font-normal">
                      ({((Math.abs(freteExibido || 0) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Linha Divisória */}
              <div className="border-t border-gray-100 my-2 pt-2">
                <div className="flex justify-between items-center">
                  <div className="text-xs font-bold text-gray-900">
                    Receita Líquida
                  </div>
                  <div className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                    {formatCurrency(receitaLiquida)}
                    {venda.valorTotal > 0 && (
                      <span className="text-[10px] text-gray-400 font-normal">
                        ({((receitaLiquida / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Imposto (Se Existir) */}
              {venda.imposto !== null && venda.imposto !== undefined && (
                <div className="border-l-3 border-red-500 pl-2 flex justify-between items-center mt-2 opacity-80" title="Imposto deduzido da Margem de Contribuição">
                  <div className="text-[11px] font-medium text-gray-600 flex flex-col">
                    <span>Imposto ({venda.aliquotaImposto}%)</span>
                    <span className="text-[9px] text-gray-400">Deduzido da Margem</span>
                  </div>
                  <div className="text-xs font-semibold text-red-600">
                    -{formatCurrency(venda.imposto)}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
