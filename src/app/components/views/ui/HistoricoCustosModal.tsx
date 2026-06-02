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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Histórico de Custos - ${skuName}`} size="lg">
      <div className="flex flex-col space-y-4">
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-md">
            {error}
          </div>
        ) : historico.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            Nenhum histórico de alteração de custo encontrado para este SKU.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Custo Anterior
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Custo Novo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {historico.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(item.custoAnterior)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(item.custoNovo)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {item.motivo || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}
