"use client";

import { useState, useEffect } from "react";
import { useToast } from "./toaster";
import Modal from "./Modal";

interface SKUPendente {
  sku: string;
  produto: string;
  plataforma: string;
  primeiraVenda?: string;
  ultimaVenda?: string;
  cadastrado?: boolean;
  skuId?: string;
  custoUnitario?: number;
  situacao?: "Sem custo" | "Nao cadastrado";
  estatisticas: {
    totalVendas: number;
    totalQuantidadeVendida: number;
    totalValorVendido: number;
    statusPorPlataforma: Record<string, {
      vendas: number;
      quantidade: number;
      valor: number;
    }>;
  };
}

interface SKUsPendentesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSKUsCreated: () => void;
  // Quando selecionar 1 SKU e optar por criar preenchendo a linha da tabela
  onPickToCreate?: (data: { sku: string; produto: string; custoUnitario?: number }) => void;
}

export default function SKUsPendentesModal({ 
  isOpen, 
  onClose, 
  onSKUsCreated,
  onPickToCreate,
}: SKUsPendentesModalProps) {
  const { toast } = useToast();
  const [skusPendentes, setSkusPendentes] = useState<SKUPendente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedSKUs, setSelectedSKUs] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (isOpen && !hasLoaded) {
      loadSKUsPendentes();
    }
  }, [isOpen, hasLoaded]);

  const loadSKUsPendentes = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/sku/pendentes');
      if (!response.ok) throw new Error('Erro ao carregar SKUs pendentes');
      
      const data = await response.json();
      setSkusPendentes(data.skusPendentes || []);
      setHasLoaded(true);
    } catch (error) {
      console.error('Erro ao carregar SKUs pendentes:', error);
      toast({
        variant: "error",
        title: "Erro ao carregar SKUs pendentes",
        description: "Não foi possível carregar os SKUs pendentes",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSKU = (sku: string) => {
    setSelectedSKUs(prev => 
      prev.includes(sku) 
        ? prev.filter(s => s !== sku)
        : [...prev, sku]
    );
  };

  const handleSelectAll = () => {
    if (selectedSKUs.length === skusPendentes.length) {
      setSelectedSKUs([]);
    } else {
      setSelectedSKUs(skusPendentes.map(sku => sku.sku));
    }
  };

  const handleCreateSKUs = async () => {
    if (selectedSKUs.length === 0) {
      toast({
        variant: "error",
        title: "Nenhum SKU selecionado",
        description: "Selecione pelo menos um SKU para criar",
      });
      return;
    }

    const selectedItems = skusPendentes.filter(sku =>
      selectedSKUs.includes(sku.sku)
    );
    const skusCriaveis = selectedItems.filter(sku => !sku.cadastrado);

    if (skusCriaveis.length === 0) {
      toast({
        variant: "error",
        title: "SKU já cadastrado",
        description: "Ajuste o custo unitário na tabela de Gestão de SKU",
      });
      return;
    }

    // Caso de criação assistida: se houver exatamente 1 selecionado não cadastrado e callback disponível,
    // apenas preenche a linha na tabela e fecha o modal (não chama API aqui)
    if (selectedSKUs.length === 1 && skusCriaveis.length === 1 && onPickToCreate) {
      const unico = skusPendentes.find(s => s.sku === selectedSKUs[0]);
      if (unico) {
        onPickToCreate({
          sku: unico.sku,
          produto: unico.produto,
          custoUnitario: 0, // Custo padrão será 0
        });
        onClose();
        toast({
          variant: "success",
          title: "Pré-preenchido",
          description: `SKU ${unico.sku} foi carregado nos inputs da tabela`,
        });
        return;
      }
    }

    try {
      setIsCreating(true);
      const skusToCreate = skusCriaveis
        .map(sku => ({
          sku: sku.sku,
          produto: sku.produto,
          plataforma: sku.plataforma,
          custoUnitario: 0, // Custo padrão será 0
        }));

      const response = await fetch('/api/sku/pendentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          skus: skusToCreate
        }),
      });

      if (!response.ok) throw new Error('Erro ao criar SKUs');
      
      const data = await response.json();
      
      toast({
        variant: "success",
        title: "SKUs criados com sucesso",
        description: `${data.results.success} SKU(s) foram criados`,
      });

      onSKUsCreated();
      setHasLoaded(false); // Força recarregamento na próxima abertura
      onClose();
    } catch (error) {
      console.error('Erro ao criar SKUs:', error);
      toast({
        variant: "error",
        title: "Erro ao criar SKUs",
        description: "Não foi possível criar os SKUs selecionados",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const selectedItems = skusPendentes.filter(sku =>
    selectedSKUs.includes(sku.sku)
  );
  const selectedCreatableCount = selectedItems.filter(sku => !sku.cadastrado).length;
  const totalPendingCount = skusPendentes.length;
  const semCustoCount = skusPendentes.filter(sku => sku.cadastrado).length;
  const naoCadastradosCount = skusPendentes.filter(sku => !sku.cadastrado).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SKUs Pendentes"
      size="full"
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {/* Descrição */}
        <p className="text-sm text-gray-600">
          SKUs sem custo unitário ou encontrados nas vendas ainda sem cadastro
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Pendentes
            </p>
            <p className="text-xl font-bold text-gray-900">
              {isLoading ? '-' : totalPendingCount}
            </p>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-orange-700">
              Sem custo
            </p>
            <p className="text-xl font-bold text-orange-800">
              {isLoading ? '-' : semCustoCount}
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
              Sem cadastro
            </p>
            <p className="text-xl font-bold text-blue-800">
              {isLoading ? '-' : naoCadastradosCount}
            </p>
          </div>
        </div>

        {/* Ações em lote */}
        {selectedSKUs.length > 0 && (
          <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">
                {selectedSKUs.length} SKU(s) selecionado(s)
              </span>
              <button
                onClick={handleCreateSKUs}
                disabled={isCreating || selectedCreatableCount === 0}
                className="px-4 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {isCreating
                  ? 'Criando...'
                  : selectedCreatableCount > 0
                    ? `Criar ${selectedCreatableCount} SKU(s)`
                    : 'Ajuste custo na tabela'}
              </button>
            </div>
          </div>
        )}

        {/* Conteúdo */}
        <div className="min-h-0 flex-1 border border-gray-200 rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="flex h-full min-h-64 items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
            </div>
          ) : skusPendentes.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum SKU pendente</h3>
              <p className="text-gray-600">Todos os SKUs estão cadastrados e com custo.</p>
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <table className="w-full table-fixed divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-12 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedSKUs.length === skusPendentes.length && skusPendentes.length > 0}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                      />
                    </th>
                    <th className="w-[18%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="w-[30%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Produto
                    </th>
                    <th className="w-[10%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plataforma
                    </th>
                    <th className="w-[10%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Situação
                    </th>
                    <th className="w-[8%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vendas
                    </th>
                    <th className="w-[10%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor Total
                    </th>
                    <th className="w-[8%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Primeira Venda
                    </th>
                    <th className="w-[8%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Última Venda
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {skusPendentes.map((sku) => (
                    <tr 
                      key={sku.sku}
                      className={`hover:bg-gray-50 transition-colors ${
                        selectedSKUs.includes(sku.sku) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedSKUs.includes(sku.sku)}
                          onChange={() => handleSelectSKU(sku.sku)}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900 font-mono">
                        <span className="block truncate" title={sku.sku}>{sku.sku}</span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div className="min-w-0">
                          <p className="truncate">{sku.produto}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {sku.plataforma}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          sku.cadastrado
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {sku.cadastrado ? 'Sem custo' : 'Não cadastrado'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div>
                          <div className="font-medium">{sku.estatisticas.totalVendas}</div>
                          <div className="text-xs text-gray-500">
                            {sku.estatisticas.totalQuantidadeVendida} unidades
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <span className="font-medium">
                          {formatCurrency(sku.estatisticas.totalValorVendido)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {sku.primeiraVenda ? formatDate(sku.primeiraVenda) : '-'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {sku.ultimaVenda ? formatDate(sku.ultimaVenda) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            {skusPendentes.length} SKU(s) pendente(s)
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Fechar
            </button>
            {selectedSKUs.length > 0 && (
              <button
                onClick={handleCreateSKUs}
                disabled={isCreating || selectedCreatableCount === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {isCreating
                  ? 'Criando...'
                  : selectedCreatableCount > 0
                    ? `Criar ${selectedCreatableCount} SKU(s)`
                    : 'Ajuste custo na tabela'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

