"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  formatCurrency,
  formatarFreteShopee,
  detectarSubsidioFrete,
} from "@/lib/frete";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";

interface FreteDetailsDropdownProps {
  venda: {
    frete: number;
    plataforma: string;
    logisticType?: string | null;
    receitaFlex?: number | null;
    custoFlex?: number | null;
    freteLiquidoFlex?: number | null;
    cobrancasFlex?: number | null;
    flexConfigApplied?: boolean;
    shipmentDetails?: any;
    paymentDetails?: any;
  };
  children: React.ReactNode;
}

export default function FreteDetailsDropdown({
  venda,
  children,
}: FreteDetailsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Usar o hook inteligente de dropdown
  const dropdown = useSmartDropdown<HTMLDivElement>({
    isOpen,
    onClose: () => setIsOpen(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  const isShopee = venda.plataforma === "Shopee";
  const isMeliFlex = venda.plataforma === "Mercado Livre"
    && (venda.logisticType?.toLowerCase() === "flex" || venda.logisticType === "self_service")
    && venda.flexConfigApplied === true;

  if (!isShopee && !isMeliFlex) {
    return <>{children}</>;
  }

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
                Detalhes do Frete ({isShopee ? "Shopee" : "Flex Mercado Livre"})
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            {isShopee ? (
              <ShopeeFreteDetails venda={venda} />
            ) : (
              <MeliFlexFreteDetails venda={venda} />
            )}
            
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function ShopeeFreteDetails({ venda }: { venda: any }) {
  // Extrair dados do frete para análise inteligente
  const shipmentDetails = venda.shipmentDetails || {};
  const paymentDetails = venda.paymentDetails || {};

  // Preparar dados para análise de subsídio
  const freteData = {
    actual_shipping_fee: shipmentDetails.actual_shipping_fee || 0,
    shopee_shipping_rebate: shipmentDetails.shopee_shipping_rebate || 0,
    buyer_paid_shipping_fee: shipmentDetails.buyer_paid_shipping_fee || 0,
    shipping_fee_discount_from_3pl:
      shipmentDetails.shipping_fee_discount_from_3pl || 0,
    reverse_shipping_fee: shipmentDetails.reverse_shipping_fee || 0,
    productSubtotal:
      paymentDetails.product_subtotal || paymentDetails.order_cost || 0,
    totalTaxas: paymentDetails.total_taxas || 0,
    rendaLiquida: paymentDetails.renda_liquida || 0,
  };

  // Usar a nova lógica inteligente de detecção de subsídio
  const freteFormatado = formatarFreteShopee(freteData);
  const { temSubsidio } = detectarSubsidioFrete(freteData);

  const custoVendedorFinal = freteFormatado.freteOriginal - freteFormatado.subsidioShopee - freteFormatado.freteComprador;
  const isCustoZero = custoVendedorFinal <= 0.005;

  return (
    <>
      {isCustoZero && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-3">
          <div className="text-xs text-green-800 font-medium">
            🎉 Frete 100% subsidiado/pago pelo comprador!
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* Custo Real do Frete */}
        <div className="border-l-3 border-blue-500 pl-2">
          <div className="text-xs font-medium text-gray-700">
            Custo Real Total do Frete
          </div>
          <div className="text-sm font-semibold text-blue-600">
            {formatCurrency(freteFormatado.freteOriginal)}
          </div>
        </div>

        <div className="space-y-2">
          {/* Pago pelo Comprador */}
          {freteFormatado.freteComprador > 0 && (
            <div className="border-l-3 border-purple-500 pl-2">
              <div className="text-xs font-medium text-gray-700">
                Taxa de frete paga pelo comprador
              </div>
              <div className="text-sm font-semibold text-purple-600">
                {formatCurrency(freteFormatado.freteComprador)}
              </div>
            </div>
          )}

          {/* Subsídio da Shopee */}
          {freteFormatado.subsidioShopee > 0 && (
            <div className="border-l-3 border-green-500 pl-2">
              <div className="text-xs font-medium text-gray-700">
                Taxa de Frete Paga pela Shopee para Você
              </div>
              <div className="text-sm font-semibold text-green-600">
                -{formatCurrency(freteFormatado.subsidioShopee)}
              </div>
            </div>
          )}
        </div>

        {/* Custo Líquido Final */}
        <div className="border-t pt-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-700">
              Custo Líquido para o Vendedor:
            </span>
            <span
              className={`text-sm font-bold ${isCustoZero ? 'text-green-600' : 'text-red-600'}`}
            >
              {isCustoZero ? formatCurrency(0) : formatCurrency(-custoVendedorFinal)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function MeliFlexFreteDetails({ venda }: { venda: FreteDetailsDropdownProps["venda"] }) {
  const receitaML = venda.receitaFlex ?? venda.frete ?? 0;
  const custoFlex = venda.custoFlex ?? 0;
  const freteLiquidoFlex = venda.freteLiquidoFlex ?? receitaML;
  const cobrancasFlex = venda.cobrancasFlex ?? 0;
  const freteNegativo = freteLiquidoFlex < 0;

  return (
    <div className="space-y-3">
      {/* Receita Flex */}
      <div className="border-l-3 border-blue-500 pl-2">
        <div className="text-xs font-medium text-gray-700">
          Repasse/Receita Mercado Livre
        </div>
        <div className="text-sm font-semibold text-blue-600">
          +{formatCurrency(receitaML)}
        </div>
      </div>

      {/* Custo Transportadora */}
      {custoFlex > 0 && (
        <div className="border-l-3 border-orange-500 pl-2">
          <div className="text-xs font-medium text-gray-700">
            Custo Transportadora Flex
          </div>
          <div className="text-sm font-semibold text-orange-600">
            -{formatCurrency(custoFlex)}
          </div>
          {cobrancasFlex > 0 && (
            <div className="text-[11px] text-gray-500 mt-0.5">
              {cobrancasFlex} {cobrancasFlex === 1 ? "cobrança" : "cobranças"} da transportadora
            </div>
          )}
        </div>
      )}

      {/* Resultado Líquido */}
      <div className="border-t pt-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-gray-700">
            Resultado Líquido do Frete:
          </span>
          <span
            className={`text-sm font-bold ${freteNegativo ? 'text-red-600' : 'text-green-600'}`}
          >
            {formatCurrency(freteLiquidoFlex)}
          </span>
        </div>
      </div>
    </div>
  );
}
