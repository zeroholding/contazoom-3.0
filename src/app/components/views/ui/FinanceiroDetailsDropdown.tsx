"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/frete";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";

interface FinanceiroDetailsDropdownProps {
  venda: {
    valorTotal: number;
    quantidade: number;
    unitario: number;
    plataforma: string;
    canal?: string | null;
    paymentDetails?: any;
    raw?: any;
  };
  children: React.ReactNode;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positive(value: unknown): number {
  const parsed = toNumber(value);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

function firstPositive(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = positive(value);
    if (parsed > 0) return parsed;
  }
  return null;
}

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function getShopeeFinanceiroBreakdown(venda: FinanceiroDetailsDropdownProps["venda"]) {
  const paymentDetails = venda.paymentDetails || venda.raw?.paymentDetails || {};
  const productBreakdown = paymentDetails.productValueBreakdown || {};
  const income = paymentDetails.order_income || venda.raw?.escrow_details?.order_income || {};
  const buyerPaymentInfo =
    paymentDetails.buyer_payment_info ||
    venda.raw?.escrow_details?.buyer_payment_info ||
    {};
  const invoice = venda.raw?.invoice_data || {};

  const grossSubtotal =
    firstPositive(
      productBreakdown.product_gross_subtotal,
      invoice.products_total_value,
      income.original_cost_of_goods_sold,
      income.order_selling_price,
      venda.quantidade * venda.unitario,
    ) ?? 0;
  const effectiveSubtotal =
    firstPositive(
      productBreakdown.product_effective_subtotal,
      invoice.total_value,
      venda.valorTotal,
    ) ?? 0;

  const pixAdjustment = firstPositive(
    productBreakdown.pix_payment_adjustment,
    income.pix_discount,
    income.seller_transaction_fee,
    Math.abs(toNumber(buyerPaymentInfo.discount_pix) ?? 0),
  ) ?? 0;

  const sellerVoucher = firstPositive(
    productBreakdown.voucher_from_seller,
    income.voucher_from_seller,
    Math.abs(toNumber(buyerPaymentInfo.seller_voucher) ?? 0),
  ) ?? 0;
  const shopeeVoucher = firstPositive(
    productBreakdown.voucher_from_shopee,
    productBreakdown.shopee_discount,
    income.voucher_from_shopee,
    Math.abs(toNumber(buyerPaymentInfo.shopee_voucher) ?? 0),
  ) ?? 0;

  const totalDiscount = roundCurrency(Math.max(0, grossSubtotal - effectiveSubtotal));
  const knownDiscounts = roundCurrency(pixAdjustment + sellerVoucher + shopeeVoucher);
  const otherDiscount = roundCurrency(Math.max(0, totalDiscount - knownDiscounts));

  return {
    grossSubtotal: roundCurrency(grossSubtotal),
    effectiveSubtotal: roundCurrency(effectiveSubtotal),
    pixAdjustment: roundCurrency(pixAdjustment),
    sellerVoucher: roundCurrency(sellerVoucher),
    shopeeVoucher: roundCurrency(shopeeVoucher),
    otherDiscount,
    totalDiscount,
  };
}

export default function FinanceiroDetailsDropdown({
  venda,
  children,
}: FinanceiroDetailsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isShopee =
    venda.plataforma === "Shopee" || venda.canal === "SP" || venda.canal === "Shopee";
  const details = getShopeeFinanceiroBreakdown(venda);
  const canShowDetails =
    isShopee && details.grossSubtotal > 0 && details.effectiveSubtotal > 0;

  const dropdown = useSmartDropdown<HTMLDivElement>({
    isOpen,
    onClose: () => setIsOpen(false),
    preferredPosition: "bottom-right",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  if (!canShowDetails) {
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
                  Detalhes do Financeiro (Shopee)
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  x
                </button>
              </div>

              <div className="space-y-3">
                <div className="border-l-3 border-slate-500 pl-2">
                  <div className="text-xs font-medium text-gray-700">
                    Valor bruto dos produtos
                  </div>
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                    {formatCurrency(details.grossSubtotal)}
                    {venda.valorTotal > 0 && (
                      <span className="text-[10px] text-gray-400 font-normal">
                        ({((Math.abs(details.grossSubtotal) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                      </span>
                    )}
                  </div>
                </div>

                {details.pixAdjustment > 0 && (
                  <div className="border-l-3 border-orange-500 pl-2">
                    <div className="text-xs font-medium text-gray-700">
                      Ajuste por pagamento via PIX
                    </div>
                    <div className="text-sm font-semibold negative-value flex items-center gap-1">
                      {formatCurrency(-details.pixAdjustment)}
                      {venda.valorTotal > 0 && (
                        <span className="text-[10px] text-gray-400 font-normal">
                          ({((Math.abs(details.pixAdjustment) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {details.shopeeVoucher > 0 && (
                  <div className="border-l-3 border-pink-500 pl-2">
                    <div className="text-xs font-medium text-gray-700">
                      Cupom usado pelo comprador
                    </div>
                    <div className="text-sm font-semibold negative-value flex items-center gap-1">
                      {formatCurrency(-details.shopeeVoucher)}
                      {venda.valorTotal > 0 && (
                        <span className="text-[10px] text-gray-400 font-normal">
                          ({((Math.abs(details.shopeeVoucher) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {details.sellerVoucher > 0 && (
                  <div className="border-l-3 border-indigo-500 pl-2">
                    <div className="text-xs font-medium text-gray-700">
                      Cupom do vendedor
                    </div>
                    <div className="text-sm font-semibold negative-value flex items-center gap-1">
                      {formatCurrency(-details.sellerVoucher)}
                      {venda.valorTotal > 0 && (
                        <span className="text-[10px] text-gray-400 font-normal">
                          ({((Math.abs(details.sellerVoucher) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {details.otherDiscount > 0.005 && (
                  <div className="border-l-3 border-gray-400 pl-2">
                    <div className="text-xs font-medium text-gray-700">
                      Outros abatimentos
                    </div>
                    <div className="text-sm font-semibold negative-value flex items-center gap-1">
                      {formatCurrency(-details.otherDiscount)}
                      {venda.valorTotal > 0 && (
                        <span className="text-[10px] text-gray-400 font-normal">
                          ({((Math.abs(details.otherDiscount) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t pt-2 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-700">
                      Total abatido:
                    </span>
                    <span className="text-sm font-bold negative-value flex items-center gap-1">
                      {formatCurrency(-details.totalDiscount)}
                      {venda.valorTotal > 0 && (
                        <span className="text-[10px] text-gray-400 font-normal">
                          ({((Math.abs(details.totalDiscount) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-700">
                      Faturamento / NF:
                    </span>
                    <span className="text-sm font-bold text-gray-900 flex items-center gap-1">
                      {formatCurrency(details.effectiveSubtotal)}
                      {venda.valorTotal > 0 && (
                        <span className="text-[10px] text-gray-400 font-normal">
                          ({((Math.abs(details.effectiveSubtotal) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
