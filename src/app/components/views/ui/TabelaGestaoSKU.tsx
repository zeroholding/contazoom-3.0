"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import gsap from "gsap";
import { useToast } from "./toaster";
import { EmptyState } from "./CardsContas";
import EditModal from "./EditModal";
import DeleteModal from "./DeleteModal";
import Modal from "./Modal";
import HistoricoCustosModal from "./HistoricoCustosModal";

// Tipos atualizados para SKU
export interface SKU {
  id: string;
  userId: string;
  sku: string;
  produto: string;
  tipo: "pai" | "filho";
  skuPai?: string;
  custoUnitario: number;
  // Proporção do custo no kit (0.0000 a 1.0000)
  proporcao?: number;
  quantidade: number;
  hierarquia1?: string;
  hierarquia2?: string;
  ativo: boolean;
  temEstoque: boolean;
  skusFilhos?: string[];
  observacoes?: string;
  imagemUrl?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  custoHistorico?: SKUCustoHistorico[];
  statusVendas?: StatusVendas;
}

export interface SKUCustoHistorico {
  id: string;
  custoAnterior?: number;
  custoNovo: number;
  quantidade: number;
  motivo?: string;
  tipoAlteracao: string;
  alteradoPor?: string;
  createdAt: string;
}

export interface StatusVendas {
  totalVendas: number;
  totalQuantidadeVendida: number;
  totalValorVendido: number;
  margemMedia: number;
  ultimaVenda?: {
    data: string;
    valor: number;
    quantidade: number;
    plataforma: string;
    status: string;
  };
  statusPorPlataforma: Record<string, {
    vendas: number;
    quantidade: number;
    valor: number;
  }>;
}

export interface CreateSKUInput {
  sku: string;
  produto: string;
  tipo: "pai" | "filho";
  custoUnitario: number;
  quantidade: number;
  skuPai?: string;
  hierarquia1?: string;
  hierarquia2?: string;
  ativo: boolean;
  temEstoque: boolean;
  skusFilhos?: string[];
}

type NovoSkuState = {
  sku: string;
  produto: string;
  tipo: "pai" | "filho";
  skuPai: string;
  custoUnitario: number;
  quantidade: number;
  hierarquia1: string;
  hierarquia2: string;
  ativo: boolean;
  temEstoque: boolean;
  skusFilhos: string[];
};

type PrefillNovoSku = Partial<NovoSkuState>;

function parseDecimalInput(value: string): number {
  const cleaned = value.trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimalForInput(value: number | undefined): string {
  if (!value || value <= 0) return "";
  return String(value).replace(".", ",");
}

interface TabelaGestaoSKUProps {
  skus: SKU[];
  isLoading?: boolean;
  isEditMode?: boolean;
  isMultiSelect?: boolean;
  selectedSKUs?: string[];
  onEditSKU?: (sku: SKU) => void;
  onCreateSKU?: (sku: CreateSKUInput) => Promise<void> | void;
  onDeleteSKU?: (sku: SKU) => Promise<void> | void;
  onSelectSKU?: (skuId: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  onBulkDelete?: (skuIds: string[]) => Promise<void> | void;
  onToggleStatus?: (skuIds: string[], ativo: boolean) => void;
  onToggleEstoque?: (skuIds: string[], temEstoque: boolean) => void;
  prefillNovoSku?: PrefillNovoSku;
  onPrefillConsumed?: () => void;
}

export default function TabelaGestaoSKU({
  skus,
  isLoading = false,
  isEditMode = false,
  isMultiSelect = false,
  selectedSKUs = [],
  onEditSKU,
  onCreateSKU,
  onDeleteSKU,
  onSelectSKU,
  onSelectAll,
  onBulkDelete,
  onToggleStatus,
  onToggleEstoque,
  prefillNovoSku,
  onPrefillConsumed,
}: TabelaGestaoSKUProps) {
  const { toast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showEstoqueModal, setShowEstoqueModal] = useState(false);
  const [skusToDelete, setSkusToDelete] = useState<string[]>([]);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  
  // Estados para modais de ação individual
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteSingleModal, setShowDeleteSingleModal] = useState(false);
  const [showToggleStatusModal, setShowToggleStatusModal] = useState(false);
  const [selectedSKU, setSelectedSKU] = useState<SKU | null>(null);
  
  // Estados para histórico e retroativo
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);
  const [selectedSKUForHistorico, setSelectedSKUForHistorico] = useState<SKU | null>(null);
  const [isApplyingRetroactive, setIsApplyingRetroactive] = useState<string | null>(null);

  // Miniatura do SKU (busca sob demanda)
  const [imagemOverrides, setImagemOverrides] = useState<Record<string, string>>({});
  const [loadingImagem, setLoadingImagem] = useState<string | null>(null);

  const getImagemUrl = (sku: SKU): string | null =>
    imagemOverrides[sku.id] || sku.imagemUrl || null;

  const handleBuscarImagem = async (sku: SKU) => {
    setLoadingImagem(sku.id);
    try {
      const response = await fetch(`/api/sku/${sku.id}/imagem`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível buscar a imagem");
      }
      setImagemOverrides((prev) => ({ ...prev, [sku.id]: data.imagemUrl }));
      toast({
        variant: "success",
        title: "Miniatura atualizada",
        description: `Imagem do SKU ${sku.sku} carregada.`,
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "Imagem não encontrada",
        description: error instanceof Error ? error.message : "Falha ao buscar imagem",
      });
    } finally {
      setLoadingImagem(null);
    }
  };

  const filhosDisponiveis = useMemo(
    () => skus.filter((sku) => sku.tipo === "filho"),
    [skus]
  );

  // Ordena para exibir kits seguidos de seus filhos, e depois individuais sem pai
  const skusOrdenados = useMemo(() => {
    const pais = skus.filter((s) => s.tipo === 'pai');
    const filhos = skus.filter((s) => s.tipo === 'filho');
    const filhosPorPai = new Map<string, SKU[]>();
    for (const f of filhos) {
      if (!f.skuPai) continue;
      if (!filhosPorPai.has(f.skuPai)) filhosPorPai.set(f.skuPai, []);
      filhosPorPai.get(f.skuPai)!.push(f);
    }
    const usados = new Set<string>();
    const resultado: SKU[] = [];
    for (const p of pais) {
      resultado.push(p);
      const filhosDoPai = filhosPorPai.get(p.sku) || [];
      for (const f of filhosDoPai) {
        resultado.push(f);
        usados.add(f.id);
      }
    }
    // Filhos sem pai ou não listados ainda
    for (const f of filhos) {
      if (!usados.has(f.id)) resultado.push(f);
    }
    return resultado;
  }, [skus]);

  // Versão que também leva em conta a lista skusFilhos gravada no kit
  const skusOrdenadosHier = useMemo(() => {
    const pais = skus.filter((s) => s.tipo === 'pai');
    const filhos = skus.filter((s) => s.tipo === 'filho');
    const filhosPorPai = new Map<string, SKU[]>();
    
    for (const f of filhos) {
      if (!f.skuPai) continue;
      if (!filhosPorPai.has(f.skuPai)) filhosPorPai.set(f.skuPai, []);
      filhosPorPai.get(f.skuPai)!.push(f);
    }
    
    const usados = new Set<string>();
    const resultado: SKU[] = [];
    for (const p of pais) {
      resultado.push(p);
      const viaFilho = filhosPorPai.get(p.sku) || [];
      let listaKit: string[] = [];
      const rawSkusFilhos = (p as any).skusFilhos as any;
      if (Array.isArray(rawSkusFilhos)) {
        listaKit = rawSkusFilhos as string[];
      } else if (typeof rawSkusFilhos === 'string') {
        try {
          const parsed = JSON.parse(rawSkusFilhos);
          if (Array.isArray(parsed)) listaKit = parsed as string[];
        } catch {}
      }

      const viaKitLista = filhos.filter((f) => listaKit.includes(f.sku));
      const combinados: SKU[] = [];
      const pushUnique = (arr: SKU[]) => {
        for (const item of arr) {
          // Verifica duplicatas tanto em 'combinados' quanto no set 'usados'
          if (!combinados.find((x) => x.id === item.id) && !usados.has(item.id)) {
            combinados.push(item);
          }
        }
      };
      pushUnique(viaFilho);
      pushUnique(viaKitLista);

      for (const f of combinados.sort((a, b) => a.sku.localeCompare(b.sku))) {
        resultado.push(f);
        usados.add(f.id);
      }
    }
    for (const f of filhos) {
      if (!usados.has(f.id)) resultado.push(f);
    }

    return resultado;
  }, [skus]);
  const [novoSku, setNovoSku] = useState<NovoSkuState>({
    sku: "",
    produto: "",
    tipo: "filho",
    skuPai: "",
    custoUnitario: 0,
    quantidade: 1, // Itens individuais sempre começam com quantidade 1
    hierarquia1: "",
    hierarquia2: "",
    ativo: true,
    temEstoque: true, // Sempre true conforme solicitado
    skusFilhos: [],
  });
  const [custoUnitarioInput, setCustoUnitarioInput] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const skuInputRef = useRef<HTMLInputElement>(null);
  const produtoInputRef = useRef<HTMLInputElement>(null);
  const filhosDropdownRef = useRef<HTMLDivElement>(null);
  const [isOpenFilhos, setIsOpenFilhos] = useState(false);
  const [filhosFilter, setFilhosFilter] = useState("");
  const [collapsedKits, setCollapsedKits] = useState<Record<string, boolean>>({});

  // Animações GSAP
  useEffect(() => {
    if (tableRef.current) {
      gsap.fromTo(tableRef.current.querySelectorAll('tbody tr'), 
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }
      );
    }
  }, [skus]);

  useEffect(() => {
    if (!prefillNovoSku) return;
    setShowCreateModal(true);
    setNovoSku((prev) => ({
      ...prev,
      ...prefillNovoSku,
      sku: prefillNovoSku.sku ?? prev.sku,
      produto: prefillNovoSku.produto ?? prev.produto,
      tipo: (prefillNovoSku.tipo as ('pai'|'filho')) ?? prev.tipo,
      custoUnitario: prefillNovoSku.custoUnitario ?? prev.custoUnitario,
      quantidade: prefillNovoSku.quantidade ?? prev.quantidade,
      skuPai: prefillNovoSku.skuPai ?? prev.skuPai,
      hierarquia1: prefillNovoSku.hierarquia1 ?? prev.hierarquia1,
      hierarquia2: prefillNovoSku.hierarquia2 ?? prev.hierarquia2,
      ativo: prefillNovoSku.ativo ?? prev.ativo,
      temEstoque: prefillNovoSku.temEstoque ?? prev.temEstoque,
      skusFilhos: prefillNovoSku.skusFilhos ?? prev.skusFilhos,
    }));
    setCustoUnitarioInput(formatDecimalForInput(prefillNovoSku.custoUnitario));

    // Foco/scroll para facilitar preenchimento
    skuInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if (prefillNovoSku.sku && produtoInputRef.current) {
      produtoInputRef.current.focus();
    } else if (skuInputRef.current) {
      skuInputRef.current.focus();
    }

    onPrefillConsumed?.();
  }, [prefillNovoSku, onPrefillConsumed]);

  // Fecha o dropdown de filhos ao clicar fora
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!filhosDropdownRef.current) return;
      if (!filhosDropdownRef.current.contains(e.target as Node)) {
        setIsOpenFilhos(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const resetForm = () => {
    setNovoSku({
      sku: "",
      produto: "",
      tipo: "filho",
      skuPai: "",
      custoUnitario: 0,
      quantidade: 1, // Itens individuais sempre têm quantidade 1
      hierarquia1: "",
      hierarquia2: "",
      ativo: true,
      temEstoque: true, // Sempre true conforme solicitado
      skusFilhos: [],
    });
    setCustoUnitarioInput("");
    setFormErrors({});
  };

  useEffect(() => {
    // Sempre resetar o formulário quando necessário
    resetForm();
  }, []);

  const handleSelectSKU = (skuId: string) => {
    if (!isMultiSelect) return;
    const isSelected = selectedSKUs.includes(skuId);
    onSelectSKU?.(skuId, !isSelected);
  };

  const handleSelectAll = () => {
    if (!isMultiSelect) return;
    const allSelected = selectedSKUs.length === skus.length;
    onSelectAll?.(!allSelected);
  };

  const handleBulkDelete = () => {
    if (selectedSKUs.length === 0) return;
    setSkusToDelete(selectedSKUs);
    setShowDeleteModal(true);
  };

  const confirmBulkDelete = async () => {
    try {
      await onBulkDelete?.(skusToDelete);
      setShowDeleteModal(false);
      setSkusToDelete([]);
    } catch (error) {
      console.error('Erro ao excluir SKUs em lote:', error);
    }
  };

  const handleBulkToggleStatus = (ativo: boolean) => {
    if (selectedSKUs.length === 0) return;
    onToggleStatus?.(selectedSKUs, ativo);
    toast({
      variant: "success",
      title: "Status atualizado",
      description: `${selectedSKUs.length} SKU(s) foram ${ativo ? 'ativados' : 'inativados'}`,
    });
  };

  const handleBulkToggleEstoque = (temEstoque: boolean) => {
    if (selectedSKUs.length === 0) return;
    onToggleEstoque?.(selectedSKUs, temEstoque);
    toast({
      variant: "success",
      title: "Status de estoque atualizado",
      description: `${selectedSKUs.length} SKU(s) foram marcados como ${temEstoque ? 'com estoque' : 'sem estoque'}`,
    });
  };

  const handleAplicarRetroativo = async (sku: SKU) => {
    if (!window.confirm(`Tem certeza que deseja aplicar o custo atual (${formatCurrency(sku.custoUnitario)}) para todas as vendas passadas sem custo deste SKU?`)) {
      return;
    }
    
    setIsApplyingRetroactive(sku.id);
    try {
      const response = await fetch(`/api/sku/${sku.id}/aplicar-custo-retroativo`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao aplicar custo retroativo');
      }
      const data = await response.json();
      toast({
        variant: "success",
        title: "Custo Aplicado",
        description: data.message || `Custo aplicado com sucesso em ${data.vendasAtualizadas} vendas.`,
      });
    } catch (error) {
      console.error('Erro ao aplicar custo retroativo:', error);
      toast({
        variant: "error",
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível aplicar o custo",
      });
    } finally {
      setIsApplyingRetroactive(null);
    }
  };

  const handleFormChange = (
    campo: keyof NovoSkuState,
    valor: string | number | boolean | string[]
  ) => {
    setNovoSku((prev) => {
      const updated = { ...prev, [campo]: valor };
      
      // Quando mudar para "pai" (kit), zera a quantidade
      if (campo === 'tipo') {
        if (valor === 'pai') {
          updated.quantidade = 0;
          updated.skuPai = ''; // Kits não podem ter pai
        } else if (valor === 'filho') {
          updated.quantidade = 1; // Individuais sempre têm quantidade 1
          updated.skusFilhos = []; // Individuais não podem ter filhos
        }
      }
      
      return updated;
    });
    
    if (formErrors[campo as string]) {
      setFormErrors((prev) => ({ ...prev, [campo as string]: "" }));
    }
  };

  const handleCustoUnitarioChange = (value: string) => {
    setCustoUnitarioInput(value);
    handleFormChange("custoUnitario", parseDecimalInput(value));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!novoSku.sku.trim()) errors.sku = "Informe o SKU";
    if (!novoSku.produto.trim()) errors.produto = "Informe o produto";
    if (Number.isNaN(novoSku.custoUnitario) || novoSku.custoUnitario < 0)
      errors.custoUnitario = "Custo deve ser maior ou igual a 0";
    
    // Validação de quantidade apenas para individuais (filho)
    if (novoSku.tipo === "filho") {
      if (Number.isNaN(novoSku.quantidade) || novoSku.quantidade <= 0)
        errors.quantidade = "Quantidade deve ser maior que 0";
    }

    if (novoSku.tipo === "pai") {
      if (novoSku.skuPai) {
        errors.skuPai = "Um kit não pode ter SKU pai";
      }
      if (novoSku.skusFilhos.length === 0) {
        errors.skusFilhos = "Selecione ao menos um SKU filho";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSku = async () => {
    console.log('handleCreateSku chamado', { novoSku, onCreateSKU: !!onCreateSKU });
    
    if (!onCreateSKU) {
      console.log('onCreateSKU não está definido');
      toast({
        variant: "error",
        title: "Erro de configuração",
        description: "Função de criação não está disponível. Recarregue a página.",
      });
      return;
    }
    
    if (!validateForm()) {
      console.log('Validação falhou', formErrors);
      toast({
        variant: "error",
        title: "Verifique os campos",
        description: "Preencha todos os campos obrigatórios corretamente.",
      });
      return;
    }

    try {
      setIsSaving(true);
      console.log('Enviando dados:', {
        sku: novoSku.sku.trim(),
        produto: novoSku.produto.trim(),
        tipo: novoSku.tipo,
        custoUnitario: novoSku.custoUnitario,
        quantidade: novoSku.tipo === 'pai' ? 0 : novoSku.quantidade,
        skuPai: novoSku.skuPai.trim() || undefined,
        hierarquia1: novoSku.hierarquia1.trim() || undefined,
        hierarquia2: novoSku.hierarquia2.trim() || undefined,
        ativo: novoSku.ativo,
        temEstoque: true,
        skusFilhos: novoSku.tipo === "pai" && novoSku.skusFilhos.length > 0 ? novoSku.skusFilhos : undefined,
      });
      
      await onCreateSKU({
        sku: novoSku.sku.trim(),
        produto: novoSku.produto.trim(),
        tipo: novoSku.tipo,
        custoUnitario: novoSku.custoUnitario,
        quantidade: novoSku.tipo === 'pai' ? 0 : novoSku.quantidade,
        skuPai: novoSku.skuPai.trim() || undefined,
        hierarquia1: novoSku.hierarquia1.trim() || undefined,
        hierarquia2: novoSku.hierarquia2.trim() || undefined,
        ativo: novoSku.ativo,
        temEstoque: true, // Sempre true conforme solicitado
        skusFilhos:
          novoSku.tipo === "pai" && novoSku.skusFilhos.length > 0
            ? novoSku.skusFilhos
            : undefined,
      });

      console.log('SKU criado com sucesso');
      // Mensagem de sucesso com informação sobre vínculos criados
      const numFilhos = novoSku.tipo === 'pai' ? novoSku.skusFilhos.length : 0;
      toast({
        variant: "success",
        title: novoSku.tipo === 'pai' ? "Kit criado" : "SKU criado",
        description: novoSku.tipo === 'pai' && numFilhos > 0
          ? `Kit ${novoSku.sku} criado com ${numFilhos} ${numFilhos === 1 ? 'item atrelado' : 'itens atrelados'}`
          : `SKU ${novoSku.sku} adicionado com sucesso`,
      });

      resetForm();
      setShowCreateModal(false);
    } catch (error) {
      console.error('Erro ao criar SKU:', error);
      toast({
        variant: "error",
        title: "Erro ao salvar",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o SKU.",
      });
    } finally {
      setIsSaving(false);
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

  const getStatusBadge = (sku: SKU) => {
    if (!sku.ativo) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Inativo</span>;
    }
    if (!sku.temEstoque) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Sem Estoque</span>;
    }
    return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Ativo</span>;
  };

  const getTipoBadge = (sku: SKU) => {
    if (sku.tipo === 'pai') {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Kit</span>;
    }
    // Item filho - verificar se tem pai
    if (sku.skuPai) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Item do Kit</span>;
    }
    return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Individual Solto</span>;
  };

  // Ícones para o empty state
  const emptyStateIcons = [
    <svg key="1" className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>,
    <svg key="2" className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>,
    <svg key="3" className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
    </svg>
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Barra de ações em lote */}
      {isMultiSelect && selectedSKUs.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-3 py-2 sm:px-6 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-sm font-medium text-blue-800">
                {selectedSKUs.length} SKU(s) selecionado(s)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleBulkToggleStatus(true)}
                className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
              >
                Ativar
              </button>
              <button
                onClick={() => handleBulkToggleStatus(false)}
                className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
              >
                Inativar
              </button>
              <button
                onClick={() => handleBulkToggleEstoque(true)}
                className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors"
              >
                Com Estoque
              </button>
              <button
                onClick={() => handleBulkToggleEstoque(false)}
                className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Sem Estoque
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar da tabela */}
      <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-6 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span><span className="font-semibold text-gray-700">{skus.length}</span> {skus.length === 1 ? 'item' : 'itens'}</span>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setShowCreateModal(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 transition-all active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Adicionar SKU
        </button>
      </div>

      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full min-w-[720px] divide-y divide-gray-200">
          <thead className="bg-gray-50/80">
            <tr>
              {/* Checkbox para seleção múltipla */}
              {isMultiSelect && (
                <th className="w-10 px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedSKUs.length === skus.length && skus.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                </th>
              )}

              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                SKU
              </th>
              <th className="w-full px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Produto
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Custo
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Qtd
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Vendas
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {skusOrdenadosHier.map((sku) => {
              const isSelected = selectedSKUs.includes(sku.id);
              const isHovered = hoveredRow === sku.id;
              const isHiddenByParent = sku.skuPai ? !!collapsedKits[sku.skuPai] : false;
              if (isHiddenByParent) return null;

              return (
                <tr 
                  key={sku.id} 
                  className={`transition-colors ${
                    isSelected ? 'bg-blue-50' : sku.skuPai ? '' : 'hover:bg-gray-50'
                  } ${sku.skuPai ? 'border-l-4 border-blue-300' : ''}`}
                  onMouseEnter={() => setHoveredRow(sku.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Checkbox de seleção */}
                  {isMultiSelect && (
                    <td className={`px-3 py-2 sm:px-6 sm:py-4 ${sku.skuPai ? 'bg-blue-50/30' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectSKU(sku.id)}
                        className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                      />
                    </td>
                  )}

                  {/* SKU */}
                  <td className={`px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm font-medium ${sku.skuPai ? 'bg-blue-50/30' : ''}`}>
                    <div className="flex items-center gap-3">
                      {/* Miniatura */}
                      {(() => {
                        const img = getImagemUrl(sku);
                        return img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={sku.sku}
                            className="h-10 w-10 shrink-0 rounded-md object-cover border border-gray-200 bg-white"
                            loading="lazy"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleBuscarImagem(sku)}
                            disabled={loadingImagem === sku.id}
                            className="h-10 w-10 shrink-0 rounded-md border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-orange-500 hover:border-orange-300 transition-colors disabled:opacity-60"
                            title="Buscar imagem do anúncio"
                          >
                            {loadingImagem === sku.id ? (
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        );
                      })()}
                      {/* Hierarquia Visual */}
                      {sku.tipo === 'pai' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCollapsedKits(prev => ({ ...prev, [sku.sku]: !prev[sku.sku] }))}
                            className="text-orange-500 hover:text-orange-700 transition-colors"
                            title={collapsedKits[sku.sku] ? 'Expandir filhos' : 'Recolher filhos'}
                          >
                            <svg className={`w-5 h-5 transform transition-transform ${collapsedKits[sku.sku] ? '' : 'rotate-90'}`} viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                            </svg>
                          </button>
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-gray-900">{sku.sku}</span>
                              {(() => {
                                let numFilhos = 0;
                                const rawSkusFilhos = (sku as any).skusFilhos as any;
                                if (Array.isArray(rawSkusFilhos)) {
                                  numFilhos = rawSkusFilhos.length;
                                } else if (typeof rawSkusFilhos === 'string') {
                                  try {
                                    const parsed = JSON.parse(rawSkusFilhos);
                                    if (Array.isArray(parsed)) numFilhos = parsed.length;
                                  } catch {}
                                }
                                if (numFilhos > 0) {
                                  return (
                                    <span 
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                      title={`Este kit contém ${numFilhos} ${numFilhos === 1 ? 'item' : 'itens'}`}
                                    >
                                      {numFilhos} {numFilhos === 1 ? 'item' : 'itens'}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                        </div>
                      ) : sku.skuPai ? (
                        <div className="flex items-center gap-2 pl-7">
                          <div className="flex items-center">
                            <div className="w-6 h-px bg-gray-300"></div>
                            <svg className="w-4 h-4 text-blue-400 -ml-1" fill="currentColor" viewBox="0 0 20 20">
                              <circle cx="10" cy="10" r="3"/>
                            </svg>
                          </div>
                          <span className="font-mono text-gray-700">{sku.sku}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                          <span className="font-mono text-gray-700">{sku.sku}</span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Produto (com tipo, status e hierarquia) */}
                  <td className={`px-4 py-3 text-sm ${sku.skuPai ? 'bg-blue-50/30' : ''}`}>
                    <div className={sku.skuPai ? 'pl-14' : ''}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`truncate max-w-[280px] ${sku.tipo === 'pai' ? 'font-semibold text-gray-900' : 'text-gray-700'}`} title={sku.produto}>
                          {sku.produto}
                        </p>
                        {getTipoBadge(sku)}
                        {getStatusBadge(sku)}
                      </div>
                      {(sku.hierarquia1 || sku.hierarquia2) && (
                        <p className="text-xs text-gray-400 truncate mt-1 flex items-center gap-1" title={sku.hierarquia1 && sku.hierarquia2 ? `${sku.hierarquia1} > ${sku.hierarquia2}` : (sku.hierarquia1 || '')}>
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                          <span className="truncate">{sku.hierarquia1 && sku.hierarquia2 ? `${sku.hierarquia1} > ${sku.hierarquia2}` : sku.hierarquia1}</span>
                        </p>
                      )}
                      {sku.skuPai && (
                        <p className="text-xs text-blue-600 truncate mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                          </svg>
                          <span className="truncate">Pertence ao kit: <span className="font-medium">{sku.skuPai}</span></span>
                        </p>
                      )}
                      {sku.observacoes && (
                        <p className="text-xs text-gray-500 truncate mt-1">{sku.observacoes}</p>
                      )}
                    </div>
                  </td>

                  {/* Custo Unitário */}
                  <td className={`px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm ${sku.skuPai ? 'bg-blue-50/30' : ''}`}>
                    <div 
                      className="cursor-pointer group"
                      onClick={() => {
                        setSelectedSKUForHistorico(sku);
                        setShowHistoricoModal(true);
                      }}
                      title="Clique para ver o histórico de custos"
                    >
                      <span className="font-medium text-gray-900 group-hover:text-orange-600 transition-colors border-b border-dashed border-gray-400">{formatCurrency(sku.custoUnitario)}</span>
                      {sku.custoHistorico && sku.custoHistorico.length > 0 && (
                        <div className="text-xs text-gray-500 group-hover:text-orange-500 transition-colors mt-1">
                          Última alteração: {formatDate(sku.custoHistorico[0].createdAt)}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Quantidade */}
                  <td className={`px-4 py-3 whitespace-nowrap text-sm ${sku.skuPai ? 'bg-blue-50/30' : ''}`}>
                    {sku.tipo === 'pai' ? (
                      <span className="text-gray-400" title="Kits não possuem quantidade própria">-</span>
                    ) : (
                      <span className="text-gray-900 font-medium">{sku.quantidade}</span>
                    )}
                  </td>

                  {/* Vendas */}
                  <td className={`px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm ${sku.skuPai ? 'bg-blue-50/30' : ''}`}>
                    {sku.statusVendas ? (
                      <div className="space-y-1">
                        <div className="text-xs">
                          <span className="font-medium text-gray-900">{sku.statusVendas.totalVendas}</span> vendas
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatCurrency(sku.statusVendas.totalValorVendido)}
                        </div>
                        {sku.statusVendas.ultimaVenda && (
                          <div className="text-xs text-gray-500">
                            Última: {formatDate(sku.statusVendas.ultimaVenda.data)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>

                  {/* Ações */}
                  <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${sku.skuPai ? 'bg-blue-50/30' : ''}`}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setSelectedSKU(sku);
                          setShowEditModal(true);
                        }}
                        className="p-1.5 rounded-lg text-orange-600 hover:text-orange-700 hover:bg-orange-50 transition-colors"
                        title="Editar SKU"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSKU(sku);
                          setShowToggleStatusModal(true);
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${sku.ativo ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                        title={sku.ativo ? 'Inativar SKU' : 'Ativar SKU'}
                      >
                        {sku.ativo ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSKU(sku);
                          setShowDeleteSingleModal(true);
                        }}
                        className="p-1.5 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                        title="Excluir SKU"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleAplicarRetroativo(sku)}
                        disabled={isApplyingRetroactive === sku.id}
                        className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
                        title="Aplicar custo em vendas passadas sem CMV"
                      >
                        {isApplyingRetroactive === sku.id ? (
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleBuscarImagem(sku)}
                        disabled={loadingImagem === sku.id}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
                        title="Buscar/atualizar imagem do anúncio"
                      >
                        {loadingImagem === sku.id ? (
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {skus.length === 0 && (
        <div className="relative z-20">
          <EmptyState
            title="Nenhum SKU encontrado"
            description="Comece adicionando seu primeiro SKU ou ajuste os filtros para encontrar o que procura."
            icons={emptyStateIcons}
            variant="default"
            size="default"
            theme="light"
            isIconAnimated={true}
            className="w-full min-h-[320px]"
          />
        </div>
      )}

      {/* Modal de criação de SKU */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm(); }}
        title={novoSku.tipo === 'pai' ? 'Novo Kit' : 'Novo SKU'}
        size="2xl"
      >
        <div className="space-y-5">
          {/* Seletor de tipo */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleFormChange('tipo', 'filho')}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                novoSku.tipo === 'filho'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              disabled={isSaving}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${novoSku.tipo === 'filho' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Individual</span>
                <span className="block text-xs text-gray-500">Produto único</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleFormChange('tipo', 'pai')}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                novoSku.tipo === 'pai'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              disabled={isSaving}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${novoSku.tipo === 'pai' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Kit</span>
                <span className="block text-xs text-gray-500">Agrupa vários itens</span>
              </span>
            </button>
          </div>

          {/* Campos principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">SKU *</label>
              <input
                type="text"
                value={novoSku.sku}
                onChange={(e) => handleFormChange("sku", e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSku(); }}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 ${formErrors.sku ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                placeholder="Ex: SKU-123"
                disabled={isSaving}
                ref={skuInputRef}
              />
              {formErrors.sku && <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.sku}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Produto *</label>
              <input
                type="text"
                value={novoSku.produto}
                onChange={(e) => handleFormChange("produto", e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSku(); }}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 ${formErrors.produto ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                placeholder="Nome do produto"
                disabled={isSaving}
                ref={produtoInputRef}
              />
              {formErrors.produto && <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.produto}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Custo Unitário *</label>
              <input
                type="text"
                inputMode="decimal"
                value={custoUnitarioInput}
                onChange={(e) => handleCustoUnitarioChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSku(); }}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 ${formErrors.custoUnitario ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                placeholder="0,00"
                disabled={isSaving}
              />
              {formErrors.custoUnitario && <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.custoUnitario}</p>}
            </div>
            {novoSku.tipo === 'filho' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Quantidade *</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={novoSku.quantidade > 0 ? novoSku.quantidade : ""}
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    handleFormChange("quantidade", Number.isFinite(value) ? value : 0);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSku(); }}
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 ${formErrors.quantidade ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                  placeholder="1"
                  disabled={isSaving}
                />
                {formErrors.quantidade && <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.quantidade}</p>}
              </div>
            )}
          </div>

          {/* Hierarquia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Hierarquia 1</label>
              <input
                type="text"
                value={novoSku.hierarquia1}
                onChange={(e) => handleFormChange("hierarquia1", e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSku(); }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Categoria"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Hierarquia 2</label>
              <input
                type="text"
                value={novoSku.hierarquia2}
                onChange={(e) => handleFormChange("hierarquia2", e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSku(); }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Subcategoria"
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Vínculo de kit / pai */}
          {novoSku.tipo === 'filho' ? (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">SKU Pai (opcional)</label>
              <select
                value={novoSku.skuPai}
                onChange={(e) => handleFormChange('skuPai', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 ${formErrors.skuPai ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                disabled={isSaving}
              >
                <option value="">Nenhum (item solto)</option>
                {skus.filter((s) => s.tipo === 'pai').map((s) => (
                  <option key={s.id} value={s.sku}>{s.sku} - {s.produto}</option>
                ))}
              </select>
              {formErrors.skuPai && <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.skuPai}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Itens do Kit *</label>
              <div ref={filhosDropdownRef} className={`relative ${isSaving || filhosDisponiveis.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                <div
                  className={`flex items-center flex-wrap gap-1 px-3 py-2 border rounded-lg text-xs bg-white text-gray-900 min-h-[44px] max-h-[96px] overflow-y-auto cursor-pointer ${formErrors.skusFilhos ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                  onClick={() => setIsOpenFilhos((v) => !v)}
                >
                  {novoSku.skusFilhos.length === 0 ? (
                    <span className="text-gray-400">Selecione os itens que compõem o kit</span>
                  ) : (
                    novoSku.skusFilhos.map((filho) => (
                      <span key={filho} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                        {filho}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleFormChange('skusFilhos', novoSku.skusFilhos.filter((i) => i !== filho)); }}
                          className="text-blue-600 hover:text-blue-800"
                          disabled={isSaving}
                          aria-label={`Remover ${filho}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                  <svg className="ml-auto w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"/></svg>
                </div>
                {isOpenFilhos && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-1 border-b sticky top-0 bg-white">
                      <input
                        type="text"
                        value={filhosFilter}
                        onChange={(e) => setFilhosFilter(e.target.value)}
                        placeholder="Pesquisar..."
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                        onKeyDown={(e) => { if (e.key === 'Escape') setIsOpenFilhos(false); }}
                      />
                    </div>
                    <ul className="max-h-48 overflow-auto py-1">
                      {filhosDisponiveis
                        .filter((f) => !novoSku.skusFilhos.includes(f.sku))
                        .filter((f) => {
                          const q = filhosFilter.trim().toLowerCase();
                          if (!q) return true;
                          return f.sku.toLowerCase().includes(q) || f.produto.toLowerCase().includes(q);
                        })
                        .map((f) => (
                          <li
                            key={f.id}
                            className="px-2 py-1.5 text-sm hover:bg-gray-100 cursor-pointer"
                            onClick={() => { if (!novoSku.skusFilhos.includes(f.sku)) handleFormChange('skusFilhos', [...novoSku.skusFilhos, f.sku]); }}
                          >
                            <span className="font-mono mr-2">{f.sku}</span>
                            <span className="text-gray-600">- {f.produto}</span>
                          </li>
                        ))}
                      {filhosDisponiveis.filter((f) => !novoSku.skusFilhos.includes(f.sku)).length === 0 && (
                        <li className="px-2 py-2 text-xs text-gray-500">Sem opções disponíveis</li>
                      )}
                    </ul>
                    <div className="flex items-center justify-between px-2 py-1 border-t bg-gray-50">
                      <button
                        type="button"
                        onClick={() => handleFormChange('skusFilhos', [])}
                        className="text-xs text-gray-600 hover:text-gray-800"
                        disabled={isSaving || novoSku.skusFilhos.length === 0}
                      >
                        Limpar
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsOpenFilhos(false)}
                        className="text-xs text-orange-600 hover:text-orange-700"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {formErrors.skusFilhos && <p className="text-xs text-red-600 mt-1 font-medium">{formErrors.skusFilhos}</p>}
            </div>
          )}

          {/* Rodapé */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { setShowCreateModal(false); resetForm(); }}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mt-4"
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateSku}
              disabled={isSaving}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-all mt-4"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Salvando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {novoSku.tipo === 'pai' ? 'Criar Kit' : 'Adicionar SKU'}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de confirmação de exclusão em lote */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Confirmar Exclusão
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja excluir {skusToDelete.length} SKU(s)? Esta ação não pode ser desfeita.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmBulkDelete}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {selectedSKU && (
        <EditModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedSKU(null);
          }}
          onSave={async (data) => {
            try {
              const response = await fetch(`/api/sku/${selectedSKU.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Erro ao atualizar SKU');
              }

              toast({
                variant: "success",
                title: "SKU atualizado",
                description: `SKU ${data.sku} foi atualizado com sucesso`,
              });

              // Recarregar lista
              if (onEditSKU) {
                const updatedSKU = await response.json();
                onEditSKU(updatedSKU);
              }
            } catch (error) {
              console.error('Erro ao atualizar SKU:', error);
              toast({
                variant: "error",
                title: "Erro ao atualizar",
                description: error instanceof Error ? error.message : "Não foi possível atualizar o SKU",
              });
              throw error;
            }
          }}
          title="Editar SKU"
          data={{
            sku: selectedSKU.sku,
            produto: selectedSKU.produto,
            tipo: selectedSKU.tipo,
            custoUnitario: selectedSKU.custoUnitario,
            quantidade: selectedSKU.quantidade,
            hierarquia1: selectedSKU.hierarquia1 || '',
            hierarquia2: selectedSKU.hierarquia2 || '',
          }}
          fields={[
            { name: 'sku', label: 'SKU', type: 'text', required: true },
            { name: 'produto', label: 'Produto', type: 'text', required: true },
            { 
              name: 'tipo', 
              label: 'Tipo', 
              type: 'select', 
              required: true,
              options: [
                { value: 'filho', label: 'Individual' },
                { value: 'pai', label: 'Kit' }
              ]
            },
            { name: 'custoUnitario', label: 'Custo Unitário', type: 'number', required: true, step: '0.01', min: '0' },
            { name: 'quantidade', label: 'Quantidade', type: 'number', required: true, min: '0' },
            { name: 'hierarquia1', label: 'Hierarquia 1', type: 'text' },
            { name: 'hierarquia2', label: 'Hierarquia 2', type: 'text' },
          ]}
        />
      )}

      {/* Modal de Exclusão Individual */}
      {selectedSKU && (
        <DeleteModal
          isOpen={showDeleteSingleModal}
          onClose={() => {
            setShowDeleteSingleModal(false);
            setSelectedSKU(null);
          }}
          onConfirm={async () => {
            try {
              if (onDeleteSKU) {
                await onDeleteSKU(selectedSKU);
                return;
              }

              const response = await fetch(`/api/sku/${selectedSKU.id}`, {
                method: 'DELETE',
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Erro ao excluir SKU');
              }

              toast({
                variant: "success",
                title: "SKU excluído",
                description: `SKU ${selectedSKU.sku} foi excluído com sucesso`,
              });
            } catch (error) {
              console.error('Erro ao excluir SKU:', error);
              if (!onDeleteSKU) {
                toast({
                  variant: "error",
                  title: "Erro ao excluir",
                  description: error instanceof Error ? error.message : "Não foi possível excluir o SKU",
                });
              }
              throw error;
            }
          }}
          title="Excluir SKU"
          message="Tem certeza que deseja excluir este SKU?"
          itemName={`${selectedSKU.sku} - ${selectedSKU.produto}`}
        />
      )}

      {/* Modal de Toggle Status */}
      {selectedSKU && (
        <Modal
          isOpen={showToggleStatusModal}
          onClose={() => {
            setShowToggleStatusModal(false);
            setSelectedSKU(null);
          }}
          title={selectedSKU.ativo ? "Inativar SKU" : "Ativar SKU"}
          size="md"
        >
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className={`w-10 h-10 ${selectedSKU.ativo ? 'bg-yellow-100' : 'bg-green-100'} rounded-full flex items-center justify-center`}>
                  <svg
                    className={`w-6 h-6 ${selectedSKU.ativo ? 'text-yellow-600' : 'text-green-600'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {selectedSKU.ativo ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    )}
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  {selectedSKU.ativo
                    ? "Deseja inativar este SKU? Ele não aparecerá mais em algumas listagens."
                    : "Deseja ativar este SKU? Ele voltará a aparecer nas listagens."}
                </p>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  &quot;{selectedSKU.sku} - {selectedSKU.produto}&quot;
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowToggleStatusModal(false);
                  setSelectedSKU(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/sku/${selectedSKU.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ativo: !selectedSKU.ativo }),
                    });

                    if (!response.ok) {
                      const error = await response.json();
                      throw new Error(error.error || 'Erro ao atualizar status');
                    }

                    toast({
                      variant: "success",
                      title: "Status atualizado",
                      description: `SKU ${selectedSKU.sku} foi ${!selectedSKU.ativo ? 'ativado' : 'inativado'} com sucesso`,
                    });

                    // Callback para atualizar status
                    if (onToggleStatus) {
                      onToggleStatus([selectedSKU.id], !selectedSKU.ativo);
                    }

                    setShowToggleStatusModal(false);
                    setSelectedSKU(null);
                  } catch (error) {
                    console.error('Erro ao atualizar status:', error);
                    toast({
                      variant: "error",
                      title: "Erro ao atualizar status",
                      description: error instanceof Error ? error.message : "Não foi possível atualizar o status",
                    });
                  }
                }}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors text-white ${
                  selectedSKU.ativo
                    ? "bg-yellow-600 hover:bg-yellow-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {selectedSKU.ativo ? "Inativar" : "Ativar"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Histórico de Custos */}
      <HistoricoCustosModal
        isOpen={showHistoricoModal}
        onClose={() => {
          setShowHistoricoModal(false);
          setSelectedSKUForHistorico(null);
        }}
        skuId={selectedSKUForHistorico?.id || null}
        skuName={selectedSKUForHistorico?.sku || ''}
      />
    </div>
  );
}

