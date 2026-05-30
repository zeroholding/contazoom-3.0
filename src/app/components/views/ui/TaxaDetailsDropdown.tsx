"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/frete";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";

interface TaxaDetailsDropdownProps {
  venda: {
    taxaPlataforma?: number | null;
    plataforma: string;
    paymentDetails?: any;
  };
  children: React.ReactNode;
}

export default function TaxaDetailsDropdown({
  venda,
  children,
}: TaxaDetailsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Usar o hook inteligente de dropdown
  const dropdown = useSmartDropdown<HTMLDivElement>({
    isOpen,
    onClose: () => setIsOpen(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  if (venda.plataforma !== "Shopee" || !venda.paymentDetails?.platformFeeBreakdown) {
    return <>{children}</>;
  }

  const breakdown = venda.paymentDetails.platformFeeBreakdown;
  const taxaPlataforma = venda.taxaPlataforma || 0;

  return (
    <>
      <div
        ref={dropdown.triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer hover:bg-gray-50 rounded px-1 py-1 transition-colors"
      >
        {children}
      </div>

      {dropdown.isVisible && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdown.dropdownRef}
          className={`smart-dropdown w-80 ${
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
                Detalhes da Taxa (Shopee)
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Comissão Líquida */}
              <div className="border-l-3 border-blue-500 pl-2">
                <div className="text-xs font-medium text-gray-700">
                  Comissão Líquida
                </div>
                <div className="text-sm font-semibold text-blue-600">
                  {formatCurrency(-breakdown.commission_fee)}
                </div>
              </div>

              {/* Taxa de Serviço */}
              <div className="border-l-3 border-purple-500 pl-2">
                <div className="text-xs font-medium text-gray-700">
                  Taxa de Serviço
                </div>
                <div className="text-sm font-semibold text-purple-600">
                  {formatCurrency(-breakdown.service_fee)}
                </div>
              </div>

              {/* Outros Encargos / Devolução Fácil */}
              {breakdown.outros_encargos > 0 && (
                <div className="border-l-3 border-orange-500 pl-2">
                  <div className="text-xs font-medium text-gray-700">
                    Taxa Devolução Fácil / Transação
                  </div>
                  <div className="text-sm font-semibold text-orange-600">
                    {formatCurrency(-breakdown.outros_encargos)}
                  </div>
                </div>
              )}

              {/* Total da Taxa */}
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">
                    Total Retido:
                  </span>
                  <span className="text-sm font-bold negative-value">
                    {formatCurrency(taxaPlataforma)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
