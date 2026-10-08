"use client";

import { useCallback, useEffect, useState } from "react";
import { useAoSincronizarVendas } from "@/hooks/useAoSincronizarVendas";
import HeaderGestaoSKU from "./ui/HeaderGestaoSKU";
import FiltrosGestaoSKU, { type FiltrosSKU } from "./ui/FiltrosGestaoSKU";
import TabelaGestaoSKU, {
  type SKU,
  type CreateSKUInput,
} from "./ui/TabelaGestaoSKU";
import SKUsPendentesModal from "./ui/SKUsPendentesModal";
import { ImportSKUExcelModal } from "./ui/ImportSKUExcelModal";
import { useToast } from "./ui/toaster";
import { MolduraTela } from "./comum/shell";

type SKUStats = {
  totalSkus: number;
  skusSemCusto: number;
  semCusto: number;
  naoCadastrados: number;
};

const FILTROS_INICIAIS: FiltrosSKU = {
  search: "",
  tipo: "",
  ativo: null,
  temEstoque: null,
  hierarquia1: "",
  hierarquia2: "",
  page: 1,
  limit: 25,
};

export default function GestaoSKU() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skuStats, setSkuStats] = useState<SKUStats>({
    totalSkus: 0,
    skusSemCusto: 0,
    semCusto: 0,
    naoCadastrados: 0,
  });
  const [filtros, setFiltros] = useState<FiltrosSKU>(FILTROS_INICIAIS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedSKUs, setSelectedSKUs] = useState<string[]>([]);
  const [showSKUsPendentes, setShowSKUsPendentes] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [prefillNovoSku, setPrefillNovoSku] = useState<Partial<CreateSKUInput> | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("pendentes") === "1") setShowSKUsPendentes(true);
  }, []);

  const loadSKUs = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const params = new URLSearchParams();
      if (filtros.search) params.append("search", filtros.search);
      if (filtros.tipo) params.append("tipo", filtros.tipo);
      if (filtros.ativo !== null) params.append("ativo", filtros.ativo);
      if (filtros.temEstoque !== null) params.append("temEstoque", filtros.temEstoque);
      if (filtros.hierarquia1) params.append("hierarquia1", filtros.hierarquia1);
      if (filtros.hierarquia2) params.append("hierarquia2", filtros.hierarquia2);
      params.append("page", filtros.page.toString());
      params.append("limit", filtros.limit.toString());

      const response = await fetch(`/api/sku/com-status-vendas?${params}`);
      if (!response.ok) throw new Error("Erro ao carregar SKUs");

      const data = await response.json();
      const nextSkus: SKU[] = data.skus || [];
      setSkus(nextSkus);
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 });
      const visibleIds = new Set(nextSkus.map((sku) => sku.id));
      setSelectedSKUs((current) => current.filter((id) => visibleIds.has(id)));
    } catch (error) {
      console.error("Erro ao carregar SKUs:", error);
      setLoadError("Não foi possível carregar os SKUs. Verifique sua conexão e tente novamente.");
      toast({
        variant: "error",
        title: "Erro ao carregar SKUs",
        description: "Não foi possível carregar os SKUs. Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [filtros, toast]);

  const loadSKUStats = useCallback(async () => {
    try {
      const response = await fetch("/api/sku/stats");
      if (!response.ok) throw new Error("Erro ao carregar estatísticas de SKU");
      const data = await response.json();
      setSkuStats({
        totalSkus: Number(data.totalSkus || 0),
        skusSemCusto: Number(data.skusSemCusto || 0),
        semCusto: Number(data.semCusto || 0),
        naoCadastrados: Number(data.naoCadastrados || 0),
      });
    } catch (error) {
      console.error("Erro ao carregar estatísticas de SKU:", error);
    }
  }, []);

  useAoSincronizarVendas(() => {
    void Promise.all([loadSKUs(), loadSKUStats()]);
  });

  useEffect(() => {
    loadSKUs();
  }, [loadSKUs]);

  useEffect(() => {
    loadSKUStats();
  }, [loadSKUStats]);

  const handleFiltrosChange = useCallback((novosFiltros: FiltrosSKU) => {
    setFiltros(novosFiltros);
  }, []);

  const handleImportComplete = () => {
    loadSKUs();
    loadSKUStats();
  };

  const handleSKUsCreated = () => {
    loadSKUs();
    loadSKUStats();
  };

  const handlePickToCreate = (data: {
    sku: string;
    produto: string;
    custoUnitario?: number;
    quantidade?: number;
  }) => {
    setPrefillNovoSku({
      sku: data.sku,
      produto: data.produto,
      tipo: "filho",
      custoUnitario: data.custoUnitario ?? 0,
      quantidade: data.quantidade && data.quantidade > 0 ? data.quantidade : 1,
      ativo: true,
      temEstoque: true,
    });
  };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (filtros.search) params.append("search", filtros.search);
      if (filtros.tipo) params.append("tipo", filtros.tipo);
      if (filtros.ativo !== null) params.append("ativo", filtros.ativo);
      if (filtros.temEstoque !== null) params.append("temEstoque", filtros.temEstoque);
      if (filtros.hierarquia1) params.append("hierarquia1", filtros.hierarquia1);
      if (filtros.hierarquia2) params.append("hierarquia2", filtros.hierarquia2);

      const response = await fetch(`/api/sku/export?${params}`);
      if (!response.ok) throw new Error("Erro ao exportar");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `skus_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      toast({
        variant: "success",
        title: "Exportação concluída",
        description: "Arquivo Excel baixado com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast({
        variant: "error",
        title: "Erro na exportação",
        description: error instanceof Error ? error.message : "Não foi possível exportar os SKUs",
      });
    }
  };

  const handleNovoSKU = () => {
    setPrefillNovoSku({
      sku: "",
      produto: "",
      tipo: "filho",
      custoUnitario: 0,
      quantidade: 1,
      skuPai: "",
      hierarquia1: "",
      hierarquia2: "",
      ativo: true,
      temEstoque: true,
      skusFilhos: [],
    });
  };

  const handleToggleEditMode = () => {
    setIsEditMode((current) => {
      if (current) {
        setIsMultiSelect(false);
        setSelectedSKUs([]);
      }
      return !current;
    });
  };

  const handleToggleMultiSelect = () => {
    setIsMultiSelect((current) => {
      if (!current) setSelectedSKUs([]);
      return !current;
    });
  };

  const handleEditSKU = async () => {
    await Promise.all([loadSKUs(), loadSKUStats()]);
  };

  const handleCreateSKU = async (payload: CreateSKUInput) => {
    try {
      const response = await fetch("/api/sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, temEstoque: true }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error ?? "Não foi possível criar o SKU");
      }
      const criado = await response.json().catch(() => null);
      toast({
        variant: "success",
        title: payload.tipo === "pai" ? "Kit criado" : "SKU criado",
        description: `${payload.sku} foi adicionado com sucesso.`,
      });
      if (criado?.retroativo?.ok === false) {
        // O SKU e o custo já estão salvos; só o preenchimento das vendas antigas falhou.
        toast({
          variant: "warning",
          title: "Vendas antigas não foram atualizadas",
          description: `${payload.sku} foi criado, mas o custo não foi aplicado às vendas passadas. Use "Aplicar custo em vendas passadas" neste SKU para completar.`,
          duration: 9000,
        });
      }
      await Promise.all([loadSKUs(), loadSKUStats()]);
    } catch (error) {
      toast({
        variant: "error",
        title: "Erro ao criar SKU",
        description: error instanceof Error ? error.message : "Não foi possível criar o SKU",
      });
      throw error;
    }
  };

  const handleDeleteSKU = async (sku: SKU) => {
    try {
      const response = await fetch(`/api/sku/${sku.id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao excluir SKU");
      }
      await Promise.all([loadSKUs(), loadSKUStats()]);
      toast({
        variant: "success",
        title: "SKU excluído",
        description: `SKU ${sku.sku} excluído com sucesso.`,
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "Erro ao excluir SKU",
        description: error instanceof Error ? error.message : "Não foi possível excluir o SKU",
      });
      throw error;
    }
  };

  const handleSelectSKU = (skuId: string, selected: boolean) => {
    setSelectedSKUs((current) =>
      selected ? Array.from(new Set([...current, skuId])) : current.filter((id) => id !== skuId),
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedSKUs(selected ? skus.map((sku) => sku.id) : []);
  };

  const handleBulkDelete = async (skuIds: string[]) => {
    try {
      const responses = await Promise.all(skuIds.map((id) => fetch(`/api/sku/${id}`, { method: "DELETE" })));
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        const error = await failedResponse.json().catch(() => null);
        throw new Error(error?.error || "Erro ao excluir alguns SKUs");
      }
      await Promise.all([loadSKUs(), loadSKUStats()]);
      setSelectedSKUs([]);
      toast({
        variant: "success",
        title: "SKUs excluídos",
        description: `${skuIds.length} SKU(s) excluído(s) com sucesso.`,
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "Erro ao excluir SKUs",
        description: error instanceof Error ? error.message : "Não foi possível excluir alguns SKUs",
      });
      throw error;
    }
  };

  const handleToggleStatus = async (skuIds: string[], ativo: boolean) => {
    try {
      const responses = await Promise.all(
        skuIds.map((id) =>
          fetch(`/api/sku/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ativo }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) throw new Error("Erro ao atualizar alguns SKUs");
      await Promise.all([loadSKUs(), loadSKUStats()]);
      setSelectedSKUs([]);
      toast({
        variant: "success",
        title: "Status atualizado",
        description: `${skuIds.length} SKU(s) ${ativo ? "ativado(s)" : "inativado(s)"} com sucesso.`,
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "Erro ao atualizar status",
        description: error instanceof Error ? error.message : "Não foi possível atualizar o status dos SKUs",
      });
      throw error;
    }
  };

  const handleToggleEstoque = async (skuIds: string[], temEstoque: boolean) => {
    try {
      const responses = await Promise.all(
        skuIds.map((id) =>
          fetch(`/api/sku/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ temEstoque }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) throw new Error("Erro ao atualizar estoque de alguns SKUs");
      await Promise.all([loadSKUs(), loadSKUStats()]);
      setSelectedSKUs([]);
      toast({
        variant: "success",
        title: "Estoque atualizado",
        description: `${skuIds.length} SKU(s) marcado(s) ${temEstoque ? "com" : "sem"} estoque.`,
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "Erro ao atualizar estoque",
        description: error instanceof Error ? error.message : "Não foi possível atualizar o estoque dos SKUs",
      });
      throw error;
    }
  };

  const hasActiveFilters = Boolean(
    filtros.search || filtros.tipo || filtros.ativo !== null || filtros.temEstoque !== null ||
      filtros.hierarquia1 || filtros.hierarquia2,
  );

  return (
    <MolduraTela>
      <section className="mx-auto w-full max-w-[1600px] space-y-5">
        <HeaderGestaoSKU
          selectedCategory={selectedCategory || undefined}
          onBackClick={() => setSelectedCategory(null)}
          onImportExcel={() => setShowImportModal(true)}
          onExportExcel={handleExportExcel}
          onSKUsPendentes={() => setShowSKUsPendentes(true)}
          onNovoSKU={handleNovoSKU}
          isLoading={isLoading}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Resumo de SKUs">
          <div className="rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 shadow-[var(--cz-elev-1)] max-md:p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--cz-texto-fraco)] max-md:text-xs">Total cadastrado</p>
            <p className="mt-2 text-2xl font-bold text-[var(--cz-texto)]">{skuStats.totalSkus}</p>
            <p className="mt-1 text-xs text-[var(--cz-texto-suave)]">SKUs na sua operação</p>
          </div>
          <div className={`rounded-[var(--cz-raio-cartao)] border p-4 shadow-[var(--cz-elev-1)] max-md:p-3 ${skuStats.skusSemCusto > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className={`text-[11px] max-md:text-xs font-bold uppercase tracking-[0.06em] ${skuStats.skusSemCusto > 0 ? "text-amber-800" : "text-emerald-800"}`}>Pendências</p>
            <p className={`mt-2 text-2xl font-bold ${skuStats.skusSemCusto > 0 ? "text-amber-900" : "text-emerald-900"}`}>{skuStats.skusSemCusto}</p>
            <p className={`mt-1 text-xs ${skuStats.skusSemCusto > 0 ? "text-amber-800" : "text-emerald-800"}`}>{skuStats.skusSemCusto > 0 ? "Requer atenção" : "Tudo em dia"}</p>
          </div>
          <div className="col-span-2 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4 shadow-[var(--cz-elev-1)] max-md:p-3 sm:col-span-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--cz-texto-fraco)] max-md:text-xs">Detalhamento</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div><p className="text-xl font-bold text-[var(--cz-texto)]">{skuStats.semCusto}</p><p className="text-xs text-[var(--cz-texto-suave)]">sem custo</p></div>
              <div className="text-right"><p className="text-xl font-bold text-[var(--cz-texto)]">{skuStats.naoCadastrados}</p><p className="text-xs text-[var(--cz-texto-suave)]">não cadastrados</p></div>
            </div>
          </div>
        </div>

        <FiltrosGestaoSKU
          onFiltrosChange={handleFiltrosChange}
          isLoading={isLoading}
          onToggleEditMode={handleToggleEditMode}
          onToggleMultiSelect={handleToggleMultiSelect}
          isEditMode={isEditMode}
          isMultiSelect={isMultiSelect}
          selectedCount={selectedSKUs.length}
        />

        <TabelaGestaoSKU
          skus={skus}
          isLoading={isLoading}
          loadError={loadError}
          onRetry={loadSKUs}
          totalItems={pagination.total}
          hasActiveFilters={hasActiveFilters}
          isEditMode={isEditMode}
          isMultiSelect={isMultiSelect}
          selectedSKUs={selectedSKUs}
          onEditSKU={handleEditSKU}
          onCreateSKU={handleCreateSKU}
          onDeleteSKU={handleDeleteSKU}
          onSelectSKU={handleSelectSKU}
          onSelectAll={handleSelectAll}
          onBulkDelete={handleBulkDelete}
          onToggleStatus={handleToggleStatus}
          onToggleEstoque={handleToggleEstoque}
          prefillNovoSku={prefillNovoSku || undefined}
          onPrefillConsumed={() => setPrefillNovoSku(null)}
        />
      </section>

      <SKUsPendentesModal
        isOpen={showSKUsPendentes}
        onClose={() => setShowSKUsPendentes(false)}
        onSKUsCreated={handleSKUsCreated}
        onPickToCreate={handlePickToCreate}
      />
      <ImportSKUExcelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleImportComplete}
      />
    </MolduraTela>
  );
}
