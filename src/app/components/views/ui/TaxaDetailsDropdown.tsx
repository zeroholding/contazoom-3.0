"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/frete";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";

interface TaxaDetailsDropdownProps {
  venda: {
    valorTotal: number;
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

  /**
   * As duas formas de detalhamento que existem hoje.
   *
   * Shopee: `paymentDetails.platformFeeBreakdown` (comissão, serviço, encargos).
   * TikTok: o breakdown fica na RAIZ de `paymentDetails` e tem outros nomes
   * (`sfp_service_fee`, `per_item_fee_total`, `affiliate_commission`) — ver
   * `tiktok-finance.ts`. Não dá para reaproveitar os campos da Shopee; o que dá
   * para reaproveitar é a moldura do dropdown.
   *
   * O ML não entra: lá o detalhamento de taxa é outro componente
   * (`ReceitaLiquidaDetailsDropdown`).
   */
  const ehTiktok = venda.plataforma === "TikTok Shop";
  const breakdownShopee =
    venda.plataforma === "Shopee" ? venda.paymentDetails?.platformFeeBreakdown : null;
  const breakdownTiktok =
    ehTiktok && venda.paymentDetails?.sfp_service_fee !== undefined
      ? venda.paymentDetails
      : null;

  const taxaPlataforma = venda.taxaPlataforma || 0;

  if (!breakdownShopee && !breakdownTiktok) {
    return <>{children}</>;
  }

  const pct = (valor: number) =>
    venda.valorTotal > 0 ? (
      <span className="text-[10px] text-gray-400 font-normal">
        (
        {((Math.abs(valor) / venda.valorTotal) * 100).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}
        %)
      </span>
    ) : null;

  if (breakdownTiktok) {
    const liquidado = breakdownTiktok.source === "settlement";
    const sfp = Number(breakdownTiktok.sfp_service_fee) || 0;
    const porItem = Number(breakdownTiktok.per_item_fee_total) || 0;
    const afiliado = Number(breakdownTiktok.affiliate_commission) || 0;
    const taxaSfpPct = Number(breakdownTiktok.sfp_fee_rate) || 0;

    return (
      <>
        <div
          ref={dropdown.triggerRef}
          onClick={() => setIsOpen(!isOpen)}
          className="cursor-pointer hover:bg-gray-50 rounded px-1 py-1 transition-colors"
        >
          {children}
        </div>

        {dropdown.isVisible &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={dropdown.dropdownRef}
              className={`smart-dropdown w-80 ${
                dropdown.isOpen ? "dropdown-enter" : "dropdown-exit"
              }`}
              style={{
                ...dropdown.position,
                zIndex: 999999,
                position: "fixed",
                backgroundColor: "white",
                boxShadow:
                  "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                border: "1px solid #e5e7eb",
                borderRadius: "0.5rem",
                pointerEvents: "auto",
              }}
            >
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Detalhes da Taxa (TikTok Shop)
                  </h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600 text-sm"
                    aria-label="Fechar"
                  >
                    ✕
                  </button>
                </div>

                {/* A origem é o dado mais importante aqui: com o extrato ainda não
                    liquidado, TODOS os números abaixo são projeção. */}
                <div
                  className={`mb-3 rounded px-2 py-1 text-[11px] font-medium ${
                    liquidado
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {liquidado
                    ? "Valores do extrato de liquidação (definitivos)."
                    : "Valores estimados: o extrato ainda não liquidou este pedido."}
                </div>

                <div className="space-y-3">
                  <div className="border-l-3 border-purple-500 pl-2">
                    <div className="text-xs font-medium text-gray-700">
                      Taxa do Programa de Frete (SFP)
                      {taxaSfpPct > 0 && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          {(taxaSfpPct * 100).toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })}
                          % do faturamento
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-purple-600 flex items-center gap-1">
                      {formatCurrency(sfp)}
                      {pct(sfp)}
                    </div>
                  </div>

                  <div className="border-l-3 border-blue-500 pl-2">
                    <div className="text-xs font-medium text-gray-700">
                      Taxa por item
                      {/* A quantidade sai da própria divisão (total / unitário) em
                          vez de um campo: o breakdown do sync não guarda `quantity`,
                          e ler um campo inexistente mostraria "x ?" na tela. */}
                      {Number(breakdownTiktok.per_item_fee_unit) > 0 && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          {formatCurrency(Number(breakdownTiktok.per_item_fee_unit))} x{" "}
                          {Math.round(
                            Math.abs(porItem) / Number(breakdownTiktok.per_item_fee_unit),
                          )}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-blue-600 flex items-center gap-1">
                      {formatCurrency(porItem)}
                      {pct(porItem)}
                    </div>
                  </div>

                  {/* Só o extrato conhece a comissão de afiliado: antes dele o
                      campo é null e a linha não aparece, em vez de mostrar R$ 0,00
                      como se não houvesse afiliado. */}
                  {breakdownTiktok.affiliate_commission != null && afiliado !== 0 && (
                    <div className="border-l-3 border-orange-500 pl-2">
                      <div className="text-xs font-medium text-gray-700">
                        Comissão de afiliado
                      </div>
                      <div className="text-sm font-semibold text-orange-600 flex items-center gap-1">
                        {formatCurrency(-Math.abs(afiliado))}
                        {pct(afiliado)}
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-700">
                        Total Retido:
                      </span>
                      <span className="text-sm font-bold negative-value flex items-center gap-1">
                        {formatCurrency(taxaPlataforma)}
                        {pct(taxaPlataforma)}
                      </span>
                    </div>
                    {/* O frete do comprador NÃO entra na margem: no SFP quem banca
                        o transporte é a taxa de 6% acima. Fica visível para ninguém
                        procurar um "frete" que de propósito é zero. */}
                    {breakdownTiktok.buyer_shipping_fee != null && (
                      <div className="mt-1 flex justify-between items-center text-[11px] text-gray-500">
                        <span>Frete pago pelo comprador (não é custo seu):</span>
                        <span>
                          {formatCurrency(Number(breakdownTiktok.buyer_shipping_fee))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  const breakdown = breakdownShopee;

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
                <div className="text-sm font-semibold text-blue-600 flex items-center gap-1">
                  {formatCurrency(-breakdown.commission_fee)}
                  {venda.valorTotal > 0 && (
                    <span className="text-[10px] text-gray-400 font-normal">
                      ({((Math.abs(breakdown.commission_fee) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Taxa de Serviço */}
              <div className="border-l-3 border-purple-500 pl-2">
                <div className="text-xs font-medium text-gray-700">
                  Taxa de Serviço
                </div>
                <div className="text-sm font-semibold text-purple-600 flex items-center gap-1">
                  {formatCurrency(-breakdown.service_fee)}
                  {venda.valorTotal > 0 && (
                    <span className="text-[10px] text-gray-400 font-normal">
                      ({((Math.abs(breakdown.service_fee) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Outros Encargos / Devolução Fácil */}
              {breakdown.outros_encargos > 0 && (
                <div className="border-l-3 border-orange-500 pl-2">
                  <div className="text-xs font-medium text-gray-700">
                    Taxa Devolução Fácil / Transação
                  </div>
                  <div className="text-sm font-semibold text-orange-600 flex items-center gap-1">
                    {formatCurrency(-breakdown.outros_encargos)}
                    {venda.valorTotal > 0 && (
                      <span className="text-[10px] text-gray-400 font-normal">
                        ({((Math.abs(breakdown.outros_encargos) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Total da Taxa */}
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">
                    Total Retido:
                  </span>
                  <span className="text-sm font-bold negative-value flex items-center gap-1">
                    {formatCurrency(taxaPlataforma)}
                    {venda.valorTotal > 0 && (
                      <span className="text-[10px] text-gray-400 font-normal">
                        ({((Math.abs(taxaPlataforma) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                      </span>
                    )}
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
