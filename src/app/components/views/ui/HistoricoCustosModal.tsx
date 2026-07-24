"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import { SKUCustoHistorico } from "./TabelaGestaoSKU";

interface HistoricoCustosModalProps {
  isOpen: boolean;
  onClose: () => void;
  skuId: string | null;
  skuName: string;
}

export default function HistoricoCustosModal({
  isOpen,
  onClose,
  skuId,
  skuName,
}: HistoricoCustosModalProps) {
  const [historico, setHistorico] = useState<SKUCustoHistorico[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && skuId) {
      fetchHistorico();
    }
  }, [isOpen, skuId]);

  const fetchHistorico = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sku/${skuId}/historico-custos`);
      if (!response.ok) {
        throw new Error("Erro ao buscar histórico");
      }
      const data = await response.json();
      setHistorico(data);
    } catch (err: any) {
      setError(err.message || "Erro desconhecido");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  };

  const getTipoBadge = (tipo: string) => {
    const map: Record<string, { label: string; className: string }> = {
      manual: { label: "Manual", className: "bg-blue-100 text-blue-700" },
      importacao: { label: "Importação", className: "bg-purple-100 text-purple-700" },
      importacao_planilha: { label: "Importação", className: "bg-purple-100 text-purple-700" },
      retroativo: { label: "Retroativo", className: "bg-amber-100 text-amber-700" },
      automatico: { label: "Automático", className: "bg-emerald-100 text-emerald-700" },
    };
    return (
      map[tipo?.toLowerCase?.()] || {
        label: tipo || "—",
        className: "bg-gray-100 text-gray-600",
      }
    );
  };

  // Calcula variação percentual entre custo anterior e novo
  const getDelta = (anterior: number | null | undefined, novo: number) => {
    const ant = Number(anterior ?? 0);
    if (!ant || ant <= 0) {
      return { tipo: "inicial" as const, pct: null as number | null };
    }
    const pct = ((novo - ant) / ant) * 100;
    if (Math.abs(pct) < 0.01) return { tipo: "igual" as const, pct: 0 };
    return { tipo: novo > ant ? ("subiu" as const) : ("caiu" as const), pct };
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Histórico de Custos · ${skuName}`} size="lg">
      <div className="flex flex-col space-y-4">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-xl border border-red-100">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        ) : historico.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 mb-3">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">Nenhuma alteração registrada</p>
            <p className="text-xs text-gray-400 mt-1">O histórico aparece quando o custo deste SKU muda.</p>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* Linha da timeline */}
            <span className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200" aria-hidden />
            <ul className="space-y-3">
              {historico.map((item) => {
                const tipo = getTipoBadge(item.tipoAlteracao);
                const delta = getDelta(item.custoAnterior, Number(item.custoNovo));
                return (
                  <li key={item.id} className="relative">
                    {/* Ponto da timeline */}
                    <span
                      className={`absolute -left-6 top-3 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-4 ring-white ${
                        delta.tipo === "subiu"
                          ? "bg-red-500"
                          : delta.tipo === "caiu"
                            ? "bg-emerald-500"
                            : "bg-orange-400"
                      }`}
                    >
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <circle cx="10" cy="10" r="6" />
                      </svg>
                    </span>

                    <div className="rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-300 transition-colors">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatDate(item.createdAt)}
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tipo.className}`}>
                          {tipo.label}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-400 line-through">
                          {formatCurrency(item.custoAnterior)}
                        </span>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <span className="text-base font-semibold text-gray-900">
                          {formatCurrency(item.custoNovo)}
                        </span>

                        {delta.tipo === "inicial" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700">
                            Custo inicial
                          </span>
                        ) : delta.pct !== null && delta.tipo !== "igual" ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              delta.tipo === "subiu"
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={delta.tipo === "subiu" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            </svg>
                            {Math.abs(delta.pct).toFixed(1)}%
                          </span>
                        ) : null}
                      </div>

                      {item.motivo && (
                        <p className="mt-2 text-xs text-gray-500 flex items-start gap-1.5">
                          <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{item.motivo}</span>
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="mt-3 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}
