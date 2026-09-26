"use client";

import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import gsap from "gsap";
import Sidebar from "./ui/Sidebar";
import Topbar from "./ui/Topbar";
import { EmptyState } from "./ui/CardsContas";
import Modal from "./ui/Modal";
import EditModal from "./ui/EditModal";
import DeleteModal from "./ui/DeleteModal";
import { useToast } from "./ui/toaster";
import { ImportFinanceModal } from "./ui/ImportFinanceModal";
import VendasPagination from "./ui/VendasPagination";
import { useSyncProgress } from "@/hooks/useSyncProgress";
import FiltrosFinancas, { FiltroPeriodo, FiltroStatus, FiltroOrigem } from "./ui/FiltrosFinancas";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";

// useLayoutEffect no browser; fallback para useEffect no SSR
const useIsoLayout =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type TabOption = "contas_pagar" | "contas_receber" | "categorias" | "formas_pagamento";

interface HeaderFinancasProps {
  activeTab: TabOption;
  onTabChange: (tab: TabOption) => void;
  onAddNew: () => void;
  onImportClick: () => void;
  onIncrementalSync?: () => void;
  hasSyncedBefore?: boolean;
  isIncrementalSyncing?: boolean;
  filtrosComponent?: React.ReactNode;
  onSyncClick?: () => void;
  isSyncing?: boolean;
  syncProgress?: string;
}

const HeaderFinancas = ({ 
  activeTab, 
  onTabChange, 
  onAddNew, 
  onImportClick, 
  onIncrementalSync, 
  hasSyncedBefore = false, 
  isIncrementalSyncing = false,
  filtrosComponent,
  onSyncClick,
  isSyncing,
  syncProgress
}: HeaderFinancasProps) => {
  const tabs = [
    { id: "contas_pagar" as TabOption, label: "Contas a Pagar" },
    { id: "contas_receber" as TabOption, label: "Contas a Receber" },
    { id: "categorias" as TabOption, label: "Categorias" },
    { id: "formas_pagamento" as TabOption, label: "Formas de Pagamento" },
  ];

  const getButtonLabel = () => {
    switch (activeTab) {
      case "contas_pagar":
        return "Adicionar Despesa";
      case "contas_receber":
        return "Adicionar Receita";
      case "categorias":
        return "Adicionar Categoria";
      case "formas_pagamento":
        return "Adicionar Forma de Pagamento";
      default:
        return "Adicionar";
    }
  };

  return (
    <div className="mb-5 sm:mb-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="text-left">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca-borda bg-marca-suave px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-marca-forte">
            Gestão financeira
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-tinta sm:text-3xl">
            Finanças
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-tinta-suave">
            Acompanhe compromissos, recebimentos e cadastros em um só lugar.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          {/* Botão de Atualização Incremental - só aparece após primeira sincronização */}
          {hasSyncedBefore && onIncrementalSync && (
            <button
              type="button"
              onClick={onIncrementalSync}
              aria-label="Atualizar dados financeiros"
              disabled={isIncrementalSyncing}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-cz border border-hairline-forte bg-superficie px-3 text-sm font-semibold text-tinta shadow-cz-1 transition-colors hover:bg-fundo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
            >
              {isIncrementalSyncing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Atualizando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="hidden sm:inline">Atualizar</span>
                </>
              )}
            </button>
          )}

          {/* Botão de Importar Excel */}
          <button
            type="button"
            onClick={onImportClick}
            aria-label="Importar planilha Excel"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-cz border border-hairline-forte bg-superficie px-3 text-sm font-semibold text-tinta shadow-cz-1 transition-colors hover:bg-fundo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca sm:px-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            <span className="hidden sm:inline">Importar Excel</span>
          </button>

          {onSyncClick && (
            <button
              type="button"
              onClick={onSyncClick}
              aria-label="Trazer dados do Bling"
              disabled={!!isSyncing}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-cz border border-hairline-forte bg-superficie px-3 text-sm font-semibold text-tinta shadow-cz-1 transition-colors hover:bg-fundo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
            >
              {isSyncing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-700"></div>
                  <span className="hidden sm:inline">{syncProgress || "Sincronizando..."}</span>
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                  <span className="hidden sm:inline">Trazer dados do Bling</span>
                </>
              )}
            </button>
          )}

          {/* Botão de Adicionar */}
          <button
            type="button"
            onClick={onAddNew}
            aria-label={getButtonLabel()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-cz bg-marca px-3 text-sm font-bold text-white shadow-cz-1 transition-colors hover:bg-marca-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca focus-visible:ring-offset-2 sm:px-4"
          >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden sm:inline">{getButtonLabel()}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-cartao border border-hairline bg-superficie p-1.5 shadow-cz-1">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="overflow-x-auto scrollbar-hidden">
            <nav className="flex min-w-max gap-1" aria-label="Seções financeiras">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={[
                    activeTab === tab.id
                      ? "bg-marca-suave text-marca-forte"
                      : "text-tinta-suave hover:bg-fundo hover:text-tinta",
                    "min-h-10 whitespace-nowrap rounded-cz px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca sm:px-4",
                  ].join(" ")}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
          
          {/* Filtros na mesma linha das tabs no desktop */}
          {filtrosComponent && (
            <div className="w-full border-t border-hairline pt-3 lg:w-auto lg:border-0 lg:pt-0">
              {filtrosComponent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper para formatar data sem problemas de timezone
const formatDateBR = (dateValue: string | Date | null | undefined): string => {
  if (!dateValue) return "-";
  
  // Se vier como string ISO (ex: "2025-10-31T00:00:00.000Z")
  // Extrair apenas a parte da data YYYY-MM-DD
  const dateStr = typeof dateValue === 'string' ? dateValue : dateValue.toISOString();
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }
  
  // Fallback: usar Date normal
  const date = new Date(dateValue);
  return date.toLocaleDateString("pt-BR");
};

// (Removido) Competência agora usa formatDateBR (DD/MM/AAAA)

const emptyStateIcons = [
  <svg
    key="icon1"
    xmlns="http://www.w3.org/2000/svg"
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>,
];

const formatCurrencyBRL = (value: unknown) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const LoadingFinancialState = () => (
  <div className="grid min-h-72 place-items-center px-6 text-center" role="status" aria-live="polite">
    <div>
      <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-hairline-forte border-t-marca" />
      <p className="mt-4 text-sm font-semibold text-tinta">Carregando dados financeiros</p>
      <p className="mt-1 text-xs text-tinta-suave">Organizando seus registros mais recentes…</p>
    </div>
  </div>
);

const FinancialErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="grid min-h-72 place-items-center px-6 text-center" role="alert">
    <div className="max-w-sm">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-hairline-forte bg-fundo text-tinta-suave">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.3 3.7 2.6 17A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
        </svg>
      </span>
      <h2 className="mt-4 text-base font-semibold text-tinta">Não foi possível carregar</h2>
      <p className="mt-1 text-sm text-tinta-suave">{message}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-cz border border-hairline-forte bg-superficie px-4 text-sm font-semibold text-tinta shadow-cz-1 transition-colors hover:bg-fundo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca">
        Tentar novamente
      </button>
    </div>
  </div>
);

interface FinancialAccount {
  id: string;
  descricao: string;
  valor: unknown;
  status?: string | null;
  origem?: string | null;
  dataVencimento?: string | Date | null;
  dataPagamento?: string | Date | null;
  dataRecebimento?: string | Date | null;
  dataCompetencia?: string | Date | null;
  historico?: string | null;
  categoria?: { descricao?: string | null; nome?: string | null } | null;
  formaPagamento?: { nome?: string | null } | null;
}

interface MobileAccountCardProps {
  conta: FinancialAccount;
  type: "pagar" | "receber";
  onEdit: () => void;
  onViewJson: () => void;
  onDelete: () => void;
}

const MobileAccountCard = ({ conta, type, onEdit, onViewJson, onDelete }: MobileAccountCardProps) => {
  const isSettled = ["pago", "recebido"].includes(String(conta.status).toLowerCase());
  const originLabel = conta.origem === "SINCRONIZACAO" ? "Bling" : conta.origem === "EXCEL" ? "Excel" : "Manual";
  const settlementDate = type === "pagar" ? conta.dataPagamento : conta.dataRecebimento;

  return (
    <article className="rounded-cartao border border-hairline bg-superficie p-4 shadow-cz-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-tinta">{conta.descricao}</p>
          <p className="mt-1 text-xs text-tinta-suave">{conta.categoria?.descricao || conta.categoria?.nome || "Sem categoria"}</p>
        </div>
        <p className="shrink-0 text-base font-bold tabular-nums text-tinta">{formatCurrencyBRL(conta.valor)}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-hairline py-3 text-xs">
        <div>
          <span className="block text-tinta-fraca">Vencimento</span>
          <strong className="mt-1 block font-semibold text-tinta">{formatDateBR(conta.dataVencimento)}</strong>
        </div>
        <div>
          <span className="block text-tinta-fraca">Forma</span>
          <strong className="mt-1 block truncate font-semibold text-tinta">{conta.formaPagamento?.nome || "Não informada"}</strong>
        </div>
        {isSettled && settlementDate && (
          <div>
            <span className="block text-tinta-fraca">{type === "pagar" ? "Pago em" : "Recebido em"}</span>
            <strong className="mt-1 block font-semibold text-tinta">{formatDateBR(settlementDate)}</strong>
          </div>
        )}
        {type === "pagar" && (
          <div>
            <span className="block text-tinta-fraca">Competência</span>
            <strong className="mt-1 block font-semibold text-tinta">{formatDateBR(conta.dataCompetencia)}</strong>
          </div>
        )}
        <div className={type === "pagar" ? "" : "col-span-2"}>
          <span className="block text-tinta-fraca">Origem</span>
          <strong className="mt-1 block font-semibold text-tinta">{originLabel}</strong>
        </div>
      </div>
      {type === "pagar" && conta.historico && <p className="mt-3 line-clamp-2 text-xs leading-5 text-tinta-suave">{conta.historico}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isSettled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {conta.status}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onEdit} aria-label={`Editar ${conta.descricao}`} className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" /></svg>
          </button>
          <button type="button" onClick={onViewJson} aria-label={`Ver dados técnicos de ${conta.descricao}`} className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m10 20 4-16m4 4 4 4-4 4M6 16l-4-4 4-4" /></svg>
          </button>
          <button type="button" onClick={onDelete} aria-label={`Excluir ${conta.descricao}`} className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7 18.1 19.1a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    </article>
  );
};

export default function Financas() {
  const { toast } = useToast();
  const { connect, disconnect, isConnected } = useSyncProgress();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);

  // Sync with localStorage after hydration
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "1") {
      setIsSidebarCollapsed(true);
    }
  }, []);
  const [activeTab, setActiveTab] = useState<TabOption>("contas_pagar");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [isIncrementalSyncing, setIsIncrementalSyncing] = useState(false);
  const [hasSyncedBefore, setHasSyncedBefore] = useState(false);
  const [formasPagamento, setFormasPagamento] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [contasPagar, setContasPagar] = useState<any[]>([]);
  const [contasReceber, setContasReceber] = useState<any[]>([]);
  const [pagePagar, setPagePagar] = useState(1);
  const [pageReceber, setPageReceber] = useState(1);
  const [pageCategorias, setPageCategorias] = useState(1);
  const [pageFormasPagamento, setPageFormasPagamento] = useState(1);
  const itemsPerPage = 15;
  const [isLoading, setIsLoading] = useState(false);
  
  // Estados de ordenação
  const [sortFieldPagar, setSortFieldPagar] = useState<string | null>(null);
  const [sortDirectionPagar, setSortDirectionPagar] = useState<'asc' | 'desc'>('desc');
  const [sortFieldReceber, setSortFieldReceber] = useState<string | null>(null);
  const [sortDirectionReceber, setSortDirectionReceber] = useState<'asc' | 'desc'>('desc');
  
  // Estados de filtros
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("todos");
  const [filtroPeriodoCompetencia, setFiltroPeriodoCompetencia] = useState<FiltroPeriodo>("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState<Date | null>(null);
  const [filtroDataFim, setFiltroDataFim] = useState<Date | null>(null);
  const [filtroDataCompInicio, setFiltroDataCompInicio] = useState<Date | null>(null);
  const [filtroDataCompFim, setFiltroDataCompFim] = useState<Date | null>(null);
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<Set<string>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>("todas");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Estados para modais de edição e exclusão
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditOptionsLoading, setIsEditOptionsLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deletingItem, setDeletingItem] = useState<any>(null);
  
  // Estado para modal de JSON
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [jsonItem, setJsonItem] = useState<any>(null);

  // Form states
  const [formData, setFormData] = useState({
    descricao: "",
    valor: "",
    dataPagamento: new Date().toISOString().split('T')[0],
    categoriaId: "",
    formaPagamentoId: "",
    tipo: "",
    categoriaPaiId: "",
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  const hasInitialSet = useRef(false);
  useIsoLayout(() => {
    if (hasInitialSet.current) return;
    const el = containerRef.current;
    if (!el) return;
    hasInitialSet.current = true;
    gsap.set(el, {
      css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W },
    });
  }, [isSidebarCollapsed]);

  useIsoLayout(() => {
    const el = containerRef.current;
    if (!el) return;
    gsap.to(el, {
      duration: 0.35,
      ease: "power2.inOut",
      css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W },
    });
  }, [isSidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, isSidebarCollapsed ? "1" : "0");
    } catch {}
  }, [isSidebarCollapsed]);

  const mdLeftVar = "md:left-[var(--sidebar-w,16rem)]";
  const mdMlVar = "md:ml-[var(--sidebar-w,16rem)]";

  const getTabDescription = () => {
    switch (activeTab) {
      case "contas_pagar":
        return "contas a pagar";
      case "contas_receber":
        return "contas a receber";
      case "categorias":
        return "categorias";
      case "formas_pagamento":
        return "formas de pagamento";
      default:
        return "";
    }
  };

  const loadFormasPagamento = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/financeiro/formas-pagamento", {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Não foi possível carregar as formas de pagamento.");
      const data = await response.json();
      setFormasPagamento(data.data || []);
    } catch (error) {
      console.error("Erro ao carregar formas de pagamento:", error);
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadContasPagar = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/financeiro/contas-pagar", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Não foi possível carregar as contas a pagar.");
      const data = await response.json();
      setContasPagar(data.data || []);
    } catch (error) {
      console.error("Erro ao carregar contas a pagar:", error);
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadContasReceber = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/financeiro/contas-receber", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Não foi possível carregar as contas a receber.");
      const data = await response.json();
      setContasReceber(data.data || []);
    } catch (error) {
      console.error("Erro ao carregar contas a receber:", error);
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncProgress("");

    try {
      // Conectar ao SSE para receber progresso em tempo real
      connect();

      // Definir ordem de sincronização baseada nas dependências
      const syncOrder = [];

      if (activeTab === "contas_pagar" || activeTab === "contas_receber") {
        // Precisa sincronizar as dependências primeiro
        setSyncProgress("Sincronizando formas de pagamento...");
        const formasPagamentoRes = await fetch("/api/financeiro/formas-pagamento/sync", {
          method: "POST",
          credentials: "include",
        });

        if (!formasPagamentoRes.ok) {
          const errorData = await formasPagamentoRes.json().catch(() => ({}));
          if (errorData.requiresReconnection) {
            throw new Error("Tokens do Bling expirados. Reconecte sua conta Bling para continuar.");
          }
          throw new Error("Erro ao sincronizar formas de pagamento");
        }

        setSyncProgress("Sincronizando categorias...");
        const categoriasRes = await fetch("/api/financeiro/categorias/sync", {
          method: "POST",
          credentials: "include",
        });

        if (!categoriasRes.ok) {
          const errorData = await categoriasRes.json().catch(() => ({}));
          if (errorData.requiresReconnection) {
            throw new Error("Tokens do Bling expirados. Reconecte sua conta Bling para continuar.");
          }
          throw new Error("Erro ao sincronizar categorias");
        }

        // Sincroniza Contas a Receber e Contas a Pagar EM PARALELO (otimização de velocidade)
        setSyncProgress("Sincronizando contas a receber e contas a pagar...");
        const [receberRes, pagarRes] = await Promise.all([
          fetch("/api/financeiro/contas-receber/sync", {
            method: "POST",
            credentials: "include",
          }),
          fetch("/api/financeiro/contas-pagar/sync", {
            method: "POST",
            credentials: "include",
          })
        ]);

        // Verificar erros de Contas a Receber
        if (!receberRes.ok) {
          const errorData = await receberRes.json().catch(() => ({}));
          if (errorData.requiresReconnection) {
            throw new Error("Tokens do Bling expirados. Reconecte sua conta Bling para continuar.");
          }
          throw new Error("Erro ao sincronizar contas a receber");
        }

        // Verificar erros de Contas a Pagar
        if (!pagarRes.ok) {
          const errorData = await pagarRes.json().catch(() => ({}));
          if (errorData.requiresReconnection) {
            throw new Error("Tokens do Bling expirados. Reconecte sua conta Bling para continuar.");
          }
          throw new Error("Erro ao sincronizar contas a pagar");
        }
      } else {
        // Sincronização completa em sequência: FP -> Categorias -> Receber -> Pagar
        setSyncProgress("Sincronizando formas de pagamento...");
        let res = await fetch("/api/financeiro/formas-pagamento/sync", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          if (errorData.requiresReconnection) {
            throw new Error("Tokens do Bling expirados. Reconecte sua conta Bling para continuar.");
          }
          throw new Error("Erro ao sincronizar formas de pagamento");
        }

        setSyncProgress("Sincronizando categorias...");
        res = await fetch("/api/financeiro/categorias/sync", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          if (errorData.requiresReconnection) {
            throw new Error("Tokens do Bling expirados. Reconecte sua conta Bling para continuar.");
          }
          throw new Error("Erro ao sincronizar categorias");
        }

        // Sincroniza Contas a Receber e Contas a Pagar EM PARALELO (otimização de velocidade)
        setSyncProgress("Sincronizando contas a receber e contas a pagar...");
        const [receberRes2, pagarRes2] = await Promise.all([
          fetch("/api/financeiro/contas-receber/sync", {
            method: "POST",
            credentials: "include",
          }),
          fetch("/api/financeiro/contas-pagar/sync", {
            method: "POST",
            credentials: "include",
          })
        ]);

        // Verificar erros de Contas a Receber
        if (!receberRes2.ok) {
          const errorData = await receberRes2.json().catch(() => ({}));
          if (errorData.requiresReconnection) {
            throw new Error("Tokens do Bling expirados. Reconecte sua conta Bling para continuar.");
          }
          throw new Error("Erro ao sincronizar contas a receber");
        }

        // Verificar erros de Contas a Pagar
        if (!pagarRes2.ok) {
          const errorData = await pagarRes2.json().catch(() => ({}));
          if (errorData.requiresReconnection) {
            throw new Error("Tokens do Bling expirados. Reconecte sua conta Bling para continuar.");
          }
          throw new Error("Erro ao sincronizar contas a pagar");
        }
      }

      setSyncProgress("Sincronização concluída!");
      
      // Recarregar dados após sincronização
      if (activeTab === "formas_pagamento") {
        await loadFormasPagamento();
      }
      
      // Garantir recarga também para outras abas
      if (activeTab === "categorias") {
        await loadCategorias();
      } else if (activeTab === "contas_pagar") {
        await loadContasPagar();
      } else if (activeTab === "contas_receber") {
        await loadContasReceber();
      }

      // Marcar que já foi sincronizado para habilitar o botão de atualização
      setHasSyncedBefore(true);
      
      setTimeout(() => {
        setSyncProgress("");
      }, 2000);
    } catch (error) {
      console.error("Erro na sincronização:", error);
      setSyncProgress("Erro na sincronização. Tente novamente.");
      setTimeout(() => {
        setSyncProgress("");
      }, 3000);
    } finally {
      setIsSyncing(false);
      // Desconectar do SSE após sincronização
      disconnect();
    }
  };

  const handleIncrementalSync = async () => {
    setIsIncrementalSyncing(true);
    
    try {
      // Conectar ao SSE para receber progresso em tempo real
      connect();

      // Sincronização incremental - apenas busca dados novos/atualizados
      const syncPromises = [];

      // Sincronizar apenas as dependências necessárias
      if (activeTab === "contas_pagar" || activeTab === "contas_receber") {
        syncPromises.push(
          fetch("/api/financeiro/formas-pagamento/sync", {
            method: "POST",
            credentials: "include",
          }).then(res => {
            if (!res.ok) throw new Error("Erro ao sincronizar formas de pagamento");
            return res.json();
          })
        );

        syncPromises.push(
          fetch("/api/financeiro/categorias/sync", {
            method: "POST",
            credentials: "include",
          }).then(res => {
            if (!res.ok) throw new Error("Erro ao sincronizar categorias");
            return res.json();
          })
        );
      }

      // Aguardar dependências
      await Promise.all(syncPromises);

      // Sincronizar dados específicos da aba ativa
      if (activeTab === "contas_receber") {
        const res = await fetch("/api/financeiro/contas-receber/sync", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Erro ao sincronizar contas a receber");
        await res.json();
      } else if (activeTab === "contas_pagar") {
        const res = await fetch("/api/financeiro/contas-pagar/sync", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Erro ao sincronizar contas a pagar");
        await res.json();
      } else if (activeTab === "categorias") {
        const res = await fetch("/api/financeiro/categorias/sync", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Erro ao sincronizar categorias");
        await res.json();
      } else if (activeTab === "formas_pagamento") {
        const res = await fetch("/api/financeiro/formas-pagamento/sync", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Erro ao sincronizar formas de pagamento");
        await res.json();
      }

      // Recarregar dados da aba ativa
      if (activeTab === "formas_pagamento") {
        await loadFormasPagamento();
      } else if (activeTab === "categorias") {
        await loadCategorias();
      } else if (activeTab === "contas_pagar") {
        await loadContasPagar();
      } else if (activeTab === "contas_receber") {
        await loadContasReceber();
      }

      toast({
        variant: "success",
        title: "✅ Atualização Concluída",
        description: "Dados atualizados com sucesso!",
        duration: 3000
      });

    } catch (error) {
      console.error("Erro na sincronização incremental:", error);
      toast({
        variant: "error",
        title: "❌ Erro na Atualização",
        description: `Erro ao atualizar dados: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        duration: 5000
      });
    } finally {
      setIsIncrementalSyncing(false);
      // Desconectar do SSE após sincronização
      disconnect();
    }
  };

  const loadCategorias = async () => {
    // Mostra loader quando a aba de categorias está ativa
    const shouldShowFeedback = activeTab === "categorias";
    if (shouldShowFeedback) {
      setIsLoading(true);
      setLoadError(null);
    }
    try {
      const response = await fetch("/api/financeiro/categorias", {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Não foi possível carregar as categorias.");
      const data = await response.json();
      setCategorias(data.data || []);
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
      if (shouldShowFeedback) {
        setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os dados.");
      }
    } finally {
      if (shouldShowFeedback) setIsLoading(false);
    }
  };

  // Carregar dados quando necessário
  useEffect(() => {
    if (activeTab === "formas_pagamento") {
      loadFormasPagamento();
    } else if (activeTab === "categorias") {
      loadCategorias();
    } else if (activeTab === "contas_pagar") {
      loadContasPagar();
    } else if (activeTab === "contas_receber") {
      loadContasReceber();
    }
  }, [activeTab]);

  // Garantir categorias carregadas para filtros nas abas Pagar/Receber (prod/Vercel)
  useEffect(() => {
    if ((activeTab === "contas_pagar" || activeTab === "contas_receber") && categorias.length === 0) {
      loadCategorias();
    }
  }, [activeTab, categorias.length]);

  // Carregar formas de pagamento e categorias quando abrir modais de despesa/receita
  useEffect(() => {
    if (isModalOpen && (activeTab === "contas_pagar" || activeTab === "contas_receber")) {
      loadFormasPagamento();
      loadCategorias();
    }
  }, [isModalOpen, activeTab]);

  const handleOpenModal = () => {
    setFormData({
      descricao: "",
      valor: "",
      dataPagamento: new Date().toISOString().split('T')[0],
      categoriaId: "",
      formaPagamentoId: "",
      tipo: "",
      categoriaPaiId: "",
    });
    setIsModalOpen(true);
  };

  // Aplicar filtros de período
  const calcularPeriodo = (periodo: FiltroPeriodo) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    switch (periodo) {
      case "hoje":
        return { inicio: hoje, fim: hoje };
      case "ontem": {
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        return { inicio: ontem, fim: ontem };
      }
      case "este_mes": {
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        return { inicio, fim };
      }
      case "mes_passado": {
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        return { inicio, fim };
      }
      case "personalizado":
        if (filtroDataInicio && filtroDataFim) {
          return { inicio: filtroDataInicio, fim: filtroDataFim };
        }
        return null;
      default:
        return null;
    }
  };

  // ===== Filtros com parse local e múltiplos campos de data =====
  const parseLocalDate = (iso?: string | null) => {
    if (!iso) return null;
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(String(iso));
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const d = new Date(iso as string);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const calcularPeriodo2 = (periodo: FiltroPeriodo, inicioCustom?: Date | null, fimCustom?: Date | null) => {
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    switch (periodo) {
      case "hoje":
        return { inicio: hoje, fim: hoje };
      case "ontem": {
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        return { inicio: ontem, fim: ontem };
      }
      case "este_mes": {
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        return { inicio, fim };
      }
      case "mes_passado": {
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        return { inicio, fim };
      }
      case "personalizado":
        if (inicioCustom && fimCustom) return { inicio: inicioCustom, fim: fimCustom };
        return null;
      default:
        return null;
    }
  };

  const aplicarFiltros2 = (contas: any[], tipoLista: "contas_pagar" | "contas_receber") => {
    const resultado = contas.filter((conta) => {
      // Filtro de Competência
      if (filtroPeriodoCompetencia !== "todos" || (filtroDataCompInicio && filtroDataCompFim)) {
        const pComp = calcularPeriodo2(filtroPeriodoCompetencia, filtroDataCompInicio, filtroDataCompFim);
        if (pComp) {
          // Usar dataCompetencia, fallback para dataVencimento
          let d = parseLocalDate(conta.dataCompetencia);
          if (!d) {
            d = parseLocalDate(conta.dataVencimento);
          }
          // Se não tem nenhuma data, excluir
          if (!d) return false;
          
          const i = new Date(pComp.inicio); i.setHours(0,0,0,0);
          const f = new Date(pComp.fim); f.setHours(23,59,59,999);
          // Se a data está fora do período, excluir
          if (d < i || d > f) return false;
        }
      }
      
      // Filtro de Pagamento/Recebimento
      if (filtroPeriodo !== "todos" || (filtroDataInicio && filtroDataFim)) {
        const pPag = calcularPeriodo2(filtroPeriodo, filtroDataInicio, filtroDataFim);
        if (pPag) {
          // Usar dataPagamento/dataRecebimento, fallback para dataVencimento
          const rawPrimary = tipoLista === "contas_pagar" ? conta.dataPagamento : conta.dataRecebimento;
          let d = parseLocalDate(rawPrimary);
          if (!d) {
            d = parseLocalDate(conta.dataVencimento);
          }
          // Se não tem nenhuma data, excluir
          if (!d) return false;
          
          const i = new Date(pPag.inicio); i.setHours(0,0,0,0);
          const f = new Date(pPag.fim); f.setHours(23,59,59,999);
          // Se a data está fora do período, excluir
          if (d < i || d > f) return false;
        }
      }
      
      // Demais filtros
      if (categoriasSelecionadas.size > 0 && !categoriasSelecionadas.has(conta.categoriaId)) return false;
      if (filtroStatus !== "todos" && conta.status !== filtroStatus) return false;
      if (filtroOrigem !== "todas" && conta.origem !== filtroOrigem) return false;
      return true;
    });
    
    console.log(`[Financas] Filtros aplicados em ${tipoLista}:`, {
      total: contas.length,
      filtrados: resultado.length,
      filtroPeriodo,
      filtroPeriodoCompetencia,
      categoriasSelecionadas: categoriasSelecionadas.size,
      filtroStatus,
      filtroOrigem
    });
    
    return resultado;
  };

  // Função de ordenação
  const ordenarContas = (contas: any[], sortField: string | null, sortDirection: 'asc' | 'desc') => {
    if (!sortField) return contas;
    
    return [...contas].sort((a, b) => {
      let valA: any;
      let valB: any;
      
      // Tratar campos específicos
      if (sortField === 'valor') {
        valA = Number(a.valor) || 0;
        valB = Number(b.valor) || 0;
      } else if (sortField === 'dataPagamento' || sortField === 'dataRecebimento' || sortField === 'dataCompetencia' || sortField === 'dataVencimento') {
        valA = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        valB = b[sortField] ? new Date(b[sortField]).getTime() : 0;
      } else if (sortField === 'categoria') {
        valA = (a.categoria?.descricao || a.categoria?.nome || '').toLowerCase();
        valB = (b.categoria?.descricao || b.categoria?.nome || '').toLowerCase();
      } else if (sortField === 'formaPagamento') {
        valA = (a.formaPagamento?.nome || '').toLowerCase();
        valB = (b.formaPagamento?.nome || '').toLowerCase();
      } else {
        valA = (a[sortField] || '').toString().toLowerCase();
        valB = (b[sortField] || '').toString().toLowerCase();
      }
      
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };
  
  // Handler de clique no header para ordenação
  const handleSort = (field: string, tabela: 'pagar' | 'receber') => {
    if (tabela === 'pagar') {
      if (sortFieldPagar === field) {
        // Alternar direção: desc -> asc -> null
        if (sortDirectionPagar === 'desc') {
          setSortDirectionPagar('asc');
        } else {
          setSortFieldPagar(null);
        }
      } else {
        setSortFieldPagar(field);
        setSortDirectionPagar('desc');
      }
    } else {
      if (sortFieldReceber === field) {
        // Alternar direção: desc -> asc -> null
        if (sortDirectionReceber === 'desc') {
          setSortDirectionReceber('asc');
        } else {
          setSortFieldReceber(null);
        }
      } else {
        setSortFieldReceber(field);
        setSortDirectionReceber('desc');
      }
    }
  };
  
  // Componente de ícone de ordenação
  const SortIcon = ({ field, currentField, direction }: { field: string; currentField: string | null; direction: 'asc' | 'desc' }) => {
    if (currentField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    
    return direction === 'desc' ? (
      <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  };

  // Paginação (client-side) para tabelas de contas
  const contasPagarFiltradas = ordenarContas(aplicarFiltros2(contasPagar, "contas_pagar"), sortFieldPagar, sortDirectionPagar);
  const contasReceberFiltradas = ordenarContas(aplicarFiltros2(contasReceber, "contas_receber"), sortFieldReceber, sortDirectionReceber);
  const totalPagar = contasPagarFiltradas.length;
  const totalReceber = contasReceberFiltradas.length;
  const totalPagesPagar = Math.max(1, Math.ceil(totalPagar / itemsPerPage));
  const totalPagesReceber = Math.max(1, Math.ceil(totalReceber / itemsPerPage));
  const paginatedContasPagar = contasPagarFiltradas.slice((pagePagar - 1) * itemsPerPage, pagePagar * itemsPerPage);
  const paginatedContasReceber = contasReceberFiltradas.slice((pageReceber - 1) * itemsPerPage, pageReceber * itemsPerPage);

  const activeFinancialAccounts = activeTab === "contas_pagar" ? contasPagarFiltradas : contasReceberFiltradas;
  const financialSummary = activeFinancialAccounts.reduce(
    (summary, conta) => {
      const valor = Number(conta.valor) || 0;
      const status = String(conta.status || "").toLowerCase();
      const isSettled = status === "pago" || status === "recebido";
      summary.total += valor;
      summary.count += 1;
      if (isSettled) summary.settled += valor;
      else summary.open += valor;
      if (status === "vencido") {
        summary.overdue += valor;
        summary.overdueCount += 1;
      }
      return summary;
    },
    { total: 0, settled: 0, open: 0, overdue: 0, count: 0, overdueCount: 0 },
  );

  const reloadActiveTab = () => {
    if (activeTab === "formas_pagamento") return loadFormasPagamento();
    if (activeTab === "categorias") return loadCategorias();
    if (activeTab === "contas_pagar") return loadContasPagar();
    return loadContasReceber();
  };

  // Paginação para categorias e formas de pagamento
  const totalCategorias = categorias.length;
  const totalFormasPagamento = formasPagamento.length;
  const totalPagesCategorias = Math.max(1, Math.ceil(totalCategorias / itemsPerPage));
  const totalPagesFormasPagamento = Math.max(1, Math.ceil(totalFormasPagamento / itemsPerPage));
  
  // Flatten categorias para paginação (incluindo subcategorias)
  const flattenedCategorias: any[] = [];
  categorias.filter(cat => !cat.categoriaPaiId).forEach(cat => {
    flattenedCategorias.push(cat);
    if (cat.subCategorias && cat.subCategorias.length > 0) {
      cat.subCategorias.forEach((subCat: any) => flattenedCategorias.push(subCat));
    }
  });
  const totalCategoriasFlatted = flattenedCategorias.length;
  const totalPagesCategoriasFlatted = Math.max(1, Math.ceil(totalCategoriasFlatted / itemsPerPage));
  
  const paginatedCategorias = flattenedCategorias.slice((pageCategorias - 1) * itemsPerPage, pageCategorias * itemsPerPage);
  const paginatedFormasPagamento = formasPagamento.slice((pageFormasPagamento - 1) * itemsPerPage, pageFormasPagamento * itemsPerPage);

  // Resetar páginas ao mudar filtros
  useEffect(() => {
    setPagePagar(1);
  }, [filtroPeriodo, filtroPeriodoCompetencia, categoriasSelecionadas, filtroStatus, filtroOrigem]);
  
  useEffect(() => {
    setPageReceber(1);
  }, [filtroPeriodo, filtroPeriodoCompetencia, categoriasSelecionadas, filtroStatus, filtroOrigem]);

  useEffect(() => {
    // Garantir que a página atual exista após alterações de dados
    if (pagePagar > totalPagesPagar) setPagePagar(totalPagesPagar);
  }, [totalPagesPagar]);
  useEffect(() => {
    if (pageReceber > totalPagesReceber) setPageReceber(totalPagesReceber);
  }, [totalPagesReceber]);
  useEffect(() => {
    if (pageCategorias > totalPagesCategoriasFlatted) setPageCategorias(totalPagesCategoriasFlatted);
  }, [totalPagesCategoriasFlatted]);
  useEffect(() => {
    if (pageFormasPagamento > totalPagesFormasPagamento) setPageFormasPagamento(totalPagesFormasPagamento);
  }, [totalPagesFormasPagamento]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};

      switch (activeTab) {
        case "contas_pagar":
          endpoint = "/api/financeiro/contas-pagar";
          body = {
            descricao: formData.descricao,
            valor: formData.valor,
            dataPagamento: formData.dataPagamento,
            categoriaId: formData.categoriaId || null,
            formaPagamentoId: formData.formaPagamentoId || null,
          };
          break;
        case "contas_receber":
          endpoint = "/api/financeiro/contas-receber";
          body = {
            descricao: formData.descricao,
            valor: formData.valor,
            dataPagamento: formData.dataPagamento,
            categoriaId: formData.categoriaId || null,
            formaPagamentoId: formData.formaPagamentoId || null,
          };
          break;
        case "categorias":
          endpoint = "/api/financeiro/categorias";
          body = {
            descricao: formData.descricao,
            tipo: formData.tipo,
            categoriaPaiId: formData.categoriaPaiId || undefined,
          };
          break;
        case "formas_pagamento":
          endpoint = "/api/financeiro/formas-pagamento";
          body = {
            descricao: formData.descricao,
          };
          break;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("Erro ao salvar registro");
      }

      // Recarregar dados
      if (activeTab === "formas_pagamento") {
        await loadFormasPagamento();
      } else if (activeTab === "categorias") {
        await loadCategorias();
      } else if (activeTab === "contas_pagar") {
        await loadContasPagar();
      } else if (activeTab === "contas_receber") {
        await loadContasReceber();
      }

      toast({
        variant: "success",
        title: "Sucesso!",
        description: `Registro ${activeTab === "contas_pagar" ? "de despesa" : activeTab === "contas_receber" ? "de receita" : activeTab === "categorias" ? "de categoria" : "de forma de pagamento"} salvo com sucesso!`,
      });

      handleCloseModal();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast({
        variant: "error",
        title: "Erro ao salvar",
        description: "Erro ao salvar registro. Tente novamente.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Funções para editar e excluir
  const handleEdit = async (item: any) => {
    try {
      setIsEditOptionsLoading(true);

      if (activeTab === "contas_pagar" || activeTab === "contas_receber") {
        await Promise.all([loadFormasPagamento(), loadCategorias()]);
      } else if (activeTab === "categorias") {
        await loadCategorias();
      }

      setEditingItem(item);
      setIsEditModalOpen(true);
    } catch (error) {
      console.error("Erro ao preparar edição:", error);
      toast({
        variant: "error",
        title: "Erro ao abrir edição",
        description: "Não foi possível carregar categorias e formas de pagamento.",
      });
    } finally {
      setIsEditOptionsLoading(false);
    }
  };

  const handleDelete = (item: any) => {
    setDeletingItem(item);
    setIsDeleteModalOpen(true);
  };

  const handleViewJson = (item: any) => {
    setJsonItem(item);
    setIsJsonModalOpen(true);
  };

  const handleCloseJsonModal = () => {
    setIsJsonModalOpen(false);
    setJsonItem(null);
  };

  const handleEditSave = async (data: any) => {
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};

      switch (activeTab) {
        case "contas_pagar":
          endpoint = `/api/financeiro/contas-pagar/${editingItem.id}`;
          body = {
            descricao: data.descricao,
            valor: parseFloat(data.valor),
            dataPagamento: data.dataPagamento,
            categoriaId: data.categoriaId,
            formaPagamentoId: data.formaPagamentoId,
          };
          break;
        case "contas_receber":
          endpoint = `/api/financeiro/contas-receber/${editingItem.id}`;
          body = {
            descricao: data.descricao,
            valor: parseFloat(data.valor),
            dataRecebimento: data.dataPagamento,
            categoriaId: data.categoriaId,
            formaPagamentoId: data.formaPagamentoId,
          };
          break;
        case "categorias":
          endpoint = `/api/financeiro/categorias/${editingItem.id}`;
          body = {
            descricao: data.descricao,
            tipo: data.tipo,
            categoriaPaiId: data.categoriaPaiId || undefined,
          };
          break;
        case "formas_pagamento":
          endpoint = `/api/financeiro/formas-pagamento/${editingItem.id}`;
          body = {
            nome: data.descricao,
          };
          break;
      }

      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorMessage = "Erro ao atualizar registro";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          // Se não conseguir fazer parse do JSON, usar a mensagem padrão
          console.error("Erro ao fazer parse da resposta:", parseError);
          errorMessage = `Erro ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Recarregar dados
      switch (activeTab) {
        case "contas_pagar":
          await loadContasPagar();
          break;
        case "contas_receber":
          await loadContasReceber();
          break;
        case "categorias":
          await loadCategorias();
          break;
        case "formas_pagamento":
          await loadFormasPagamento();
          break;
      }

      toast({
        variant: "success",
        title: "Sucesso!",
        description: `Registro ${activeTab === "contas_pagar" ? "de despesa" : activeTab === "contas_receber" ? "de receita" : activeTab === "categorias" ? "de categoria" : "de forma de pagamento"} atualizado com sucesso!`,
      });
    } catch (error) {
      console.error("Erro ao atualizar:", error);
      toast({
        variant: "error",
        title: "Erro ao atualizar",
        description: "Erro ao atualizar registro. Tente novamente.",
      });
      throw error;
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      let endpoint = "";

      switch (activeTab) {
        case "contas_pagar":
          endpoint = `/api/financeiro/contas-pagar/${deletingItem.id}`;
          break;
        case "contas_receber":
          endpoint = `/api/financeiro/contas-receber/${deletingItem.id}`;
          break;
        case "categorias":
          endpoint = `/api/financeiro/categorias/${deletingItem.id}`;
          break;
        case "formas_pagamento":
          endpoint = `/api/financeiro/formas-pagamento/${deletingItem.id}`;
          break;
      }

      const response = await fetch(endpoint, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        let errorMessage = "Erro ao excluir registro";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          // Se não conseguir fazer parse do JSON, usar a mensagem padrão
          console.error("Erro ao fazer parse da resposta:", parseError);
          errorMessage = `Erro ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Recarregar dados
      switch (activeTab) {
        case "contas_pagar":
          await loadContasPagar();
          break;
        case "contas_receber":
          await loadContasReceber();
          break;
        case "categorias":
          await loadCategorias();
          break;
        case "formas_pagamento":
          await loadFormasPagamento();
          break;
      }

      toast({
        variant: "success",
        title: "Sucesso!",
        description: `Registro ${activeTab === "contas_pagar" ? "de despesa" : activeTab === "contas_receber" ? "de receita" : activeTab === "categorias" ? "de categoria" : "de forma de pagamento"} excluído com sucesso!`,
      });
    } catch (error) {
      console.error("Erro ao excluir:", error);
      
      // Verificar se é um erro específico de validação
      if (error instanceof Error && error.message.includes("não é possível excluir")) {
        toast({
          variant: "warning",
          title: "Não é possível excluir",
          description: error.message,
        });
      } else {
        toast({
          variant: "error",
          title: "Erro ao excluir",
          description: "Erro ao excluir registro. Tente novamente.",
        });
      }
      throw error;
    }
  };

  const getEditFields = () => {
    switch (activeTab) {
      case "contas_pagar":
      case "contas_receber":
        return [
          { name: "descricao", label: "Descrição", type: "text" as const, required: true },
          { name: "valor", label: "Valor (R$)", type: "number" as const, required: true, step: "0.01", min: "0" },
          { name: "dataPagamento", label: "Data", type: "date" as const, required: true },
          { 
            name: "categoriaId", 
            label: "Categoria", 
            type: "select" as const, 
            required: true,
            options: categorias.map(cat => ({ value: cat.id, label: cat.descricao || cat.nome }))
          },
          { 
            name: "formaPagamentoId", 
            label: "Forma de Pagamento", 
            type: "select" as const, 
            required: true,
            options: formasPagamento.map(forma => ({ value: forma.id, label: forma.nome }))
          },
        ];
      case "categorias":
        return [
          { name: "descricao", label: "Descrição", type: "text" as const, required: true },
          { 
            name: "tipo", 
            label: "Tipo", 
            type: "select" as const, 
            required: true,
            options: [
              { value: "RECEITA", label: "Receita" },
              { value: "DESPESA", label: "Despesa" }
            ]
          },
          { 
            name: "categoriaPaiId", 
            label: "Categoria Pai (opcional)", 
            type: "select" as const, 
            required: false,
            options: categorias.filter(cat => !cat.categoriaPaiId).map(cat => ({ value: cat.id, label: cat.descricao || cat.nome }))
          },
        ];
      case "formas_pagamento":
        return [
          { name: "descricao", label: "Nome", type: "text" as const, required: true },
        ];
      default:
        return [];
    }
  };

  const getEditModalData = () => {
    if (!editingItem) return null;

    if (activeTab === "contas_pagar") {
      return {
        ...editingItem,
        dataPagamento: editingItem.dataPagamento || editingItem.dataVencimento,
      };
    }

    if (activeTab === "contas_receber") {
      return {
        ...editingItem,
        dataPagamento: editingItem.dataRecebimento || editingItem.dataVencimento,
      };
    }

    if (activeTab === "categorias") {
      return {
        ...editingItem,
        descricao: editingItem.descricao || editingItem.nome,
      };
    }

    if (activeTab === "formas_pagamento") {
      return {
        ...editingItem,
        descricao: editingItem.descricao || editingItem.nome,
      };
    }

    return editingItem;
  };

  const getDeleteMessage = () => {
    switch (activeTab) {
      case "contas_pagar":
        return "Tem certeza que deseja excluir esta despesa?";
      case "contas_receber":
        return "Tem certeza que deseja excluir esta receita?";
      case "categorias":
        return "Tem certeza que deseja excluir esta categoria?";
      case "formas_pagamento":
        return "Tem certeza que deseja excluir esta forma de pagamento?";
      default:
        return "Tem certeza que deseja excluir este item?";
    }
  };

  const EmptyStateButton = () => (
    <button
      type="button"
      onClick={handleSync}
      aria-label="Trazer dados do Bling"
      disabled={isSyncing}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-cz border border-hairline-forte bg-superficie px-4 text-sm font-semibold text-tinta shadow-cz-1 transition-colors hover:bg-fundo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSyncing ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-700"></div>
          <span className="hidden sm:inline">{syncProgress || "Sincronizando..."}</span>
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          <span className="hidden sm:inline">Trazer dados do Bling</span>
        </>
      )}
    </button>
  );

  const getModalTitle = () => {
    switch (activeTab) {
      case "contas_pagar":
        return "Adicionar Despesa";
      case "contas_receber":
        return "Adicionar Receita";
      case "categorias":
        return "Adicionar Categoria";
      case "formas_pagamento":
        return "Adicionar Forma de Pagamento";
      default:
        return "Adicionar";
    }
  };

  const renderModalContent = () => {
    switch (activeTab) {
      case "contas_pagar":
      case "contas_receber":
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="descricao" className="block text-sm font-medium text-gray-700 mb-1">
                Descrição
              </label>
              <input
                type="text"
                id="descricao"
                name="descricao"
                value={formData.descricao}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              />
            </div>

            <div>
              <label htmlFor="valor" className="block text-sm font-medium text-gray-700 mb-1">
                Valor (R$)
              </label>
              <input
                type="number"
                id="valor"
                name="valor"
                value={formData.valor}
                onChange={handleInputChange}
                required
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              />
            </div>

            <div>
              <label htmlFor="dataPagamento" className="block text-sm font-medium text-gray-700 mb-1">
                Data de Pagamento
              </label>
              <input
                type="date"
                id="dataPagamento"
                name="dataPagamento"
                value={formData.dataPagamento}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              />
            </div>

            <div>
              <label htmlFor="categoriaId" className="block text-sm font-medium text-gray-700 mb-1">
                Categoria
              </label>
              <select
                id="categoriaId"
                name="categoriaId"
                value={formData.categoriaId}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              >
                <option value="">Selecione uma categoria</option>
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.descricao}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="formaPagamentoId" className="block text-sm font-medium text-gray-700 mb-1">
                Forma de Pagamento
              </label>
              <select
                id="formaPagamentoId"
                name="formaPagamentoId"
                value={formData.formaPagamentoId}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              >
                <option value="">Selecione uma forma de pagamento</option>
                {formasPagamento.map((forma) => (
                  <option key={forma.id} value={forma.id}>
                    {forma.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors text-white ${
                  isSaving ? "bg-orange-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {isSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/60 border-t-white"></span>
                    Salvando...
                  </span>
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
          </form>
        );

      case "categorias":
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="descricao" className="block text-sm font-medium text-gray-700 mb-1">
                Descrição
              </label>
              <input
                type="text"
                id="descricao"
                name="descricao"
                value={formData.descricao}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              />
            </div>

            <div>
              <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 mb-1">
                Tipo
              </label>
              <select
                id="tipo"
                name="tipo"
                value={formData.tipo}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              >
                <option value="">Selecione um tipo</option>
                <option value="RECEITA">Receita</option>
                <option value="DESPESA">Despesa</option>
              </select>
            </div>

            <div>
              <label htmlFor="categoriaPaiId" className="block text-sm font-medium text-gray-700 mb-1">
                Categoria Pai (Opcional)
              </label>
              <select
                id="categoriaPaiId"
                name="categoriaPaiId"
                value={formData.categoriaPaiId}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              >
                <option value="">Nenhuma (Categoria Principal)</option>
                {categorias.filter(cat => !cat.categoriaPaiId).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.descricao || cat.nome}
                  </option>
                ))}
              </select>
              <p className="text-xs text-tinta-suave mt-1">Deixe vazio para criar uma categoria principal. Selecione uma categoria para criar uma subcategoria.</p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors text-white ${
                  isSaving ? "bg-orange-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {isSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/60 border-t-white"></span>
                    Salvando...
                  </span>
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
          </form>
        );

      case "formas_pagamento":
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="descricao" className="block text-sm font-medium text-gray-700 mb-1">
                Descrição
              </label>
              <input
                type="text"
                id="descricao"
                name="descricao"
                value={formData.descricao}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-tinta"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors text-white ${
                  isSaving ? "bg-orange-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {isSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/60 border-t-white"></span>
                    Salvando...
                  </span>
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
          </form>
        );

      default:
        return null;
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen overflow-x-hidden">
      <Sidebar
        collapsed={isSidebarCollapsed}
        mobileOpen={isSidebarMobileOpen}
        onMobileClose={() => setIsSidebarMobileOpen(false)}
      />

      <Topbar
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
        onMobileMenu={() => setIsSidebarMobileOpen(true)}
      />

      <div
        className={`fixed top-[var(--cz-topbar-h)] bottom-0 left-0 right-0 ${mdLeftVar} z-10 bg-[var(--cz-fundo)]`}
      >
        {/* O painel BRANCO que ficava aqui foi removido: com ele, cartao branco
            sobre painel branco nao tinha separacao nenhuma, e era por isso que os
            cartoes desta tela eram cinza. Agora o conteudo assenta no fundo claro
            e os cartoes brancos se destacam dele. */}
      </div>

      <main className={`relative z-20 pt-[var(--cz-topbar-h)] ${mdMlVar}`}>
        <section className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <HeaderFinancas
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onAddNew={handleOpenModal}
            onImportClick={() => setIsImportModalOpen(true)}
            onIncrementalSync={handleIncrementalSync}
            hasSyncedBefore={hasSyncedBefore}
            isIncrementalSyncing={isIncrementalSyncing}
            onSyncClick={handleSync}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
            filtrosComponent={(activeTab === "contas_pagar" || activeTab === "contas_receber") ? (
              <FiltrosFinancas
                tipo={activeTab}
                periodoAtivo={filtroPeriodo}
                onPeriodoChange={setFiltroPeriodo}
                onPeriodoPersonalizadoChange={(inicio, fim) => {
                  setFiltroDataInicio(inicio);
                  setFiltroDataFim(fim);
                }}
                periodoCompetenciaAtivo={filtroPeriodoCompetencia}
                onPeriodoCompetenciaChange={setFiltroPeriodoCompetencia}
                onPeriodoCompetenciaPersonalizadoChange={(inicio, fim) => {
                  setFiltroDataCompInicio(inicio);
                  setFiltroDataCompFim(fim);
                }}
                categoriasSelecionadas={categoriasSelecionadas}
                onCategoriasSelecionadasChange={setCategoriasSelecionadas}
                categoriasDisponiveis={(() => {
                  const tipoAlvo = activeTab === "contas_pagar" ? 'DESPESA' : 'RECEITA';
                  const flattened = categorias.flatMap((c: any) => [c, ...(c.subCategorias || [])]);
                  return flattened
                    .filter((c: any) => {
                      if (!c) return false;
                      const t = (c.tipo || '').toString().toUpperCase();
                      return t === tipoAlvo;
                    })
                    .map((c: any) => ({ id: c.id, nome: c.nome, descricao: c.descricao }));
                })()}
                filtroStatus={filtroStatus}
                onStatusChange={setFiltroStatus}
                filtroOrigem={filtroOrigem}
                onOrigemChange={setFiltroOrigem}
              />
            ) : undefined}
          />

          {(activeTab === "contas_pagar" || activeTab === "contas_receber") && !isLoading && !loadError && (
            <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Resumo financeiro dos resultados filtrados">
              {[
                {
                  label: activeTab === "contas_pagar" ? "Despesas no recorte" : "Receitas no recorte",
                  value: financialSummary.total,
                  helper: `${financialSummary.count} ${financialSummary.count === 1 ? "registro" : "registros"}`,
                },
                {
                  label: "Em aberto",
                  value: financialSummary.open,
                  helper: activeTab === "contas_pagar" ? "Ainda não pago" : "Ainda não recebido",
                },
                {
                  label: "Vencido",
                  value: financialSummary.overdue,
                  helper: `${financialSummary.overdueCount} ${financialSummary.overdueCount === 1 ? "pendência" : "pendências"}`,
                  attention: financialSummary.overdue > 0,
                },
                {
                  label: activeTab === "contas_pagar" ? "Pago" : "Recebido",
                  value: financialSummary.settled,
                  helper: "Valor já liquidado",
                },
              ].map((kpi) => (
                <article key={kpi.label} className={`rounded-cartao border bg-superficie p-4 shadow-cz-1 ${kpi.attention ? "border-amber-200" : "border-hairline"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-tinta-suave">{kpi.label}</p>
                    {kpi.attention && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Requer atenção" />}
                  </div>
                  <p className="mt-2 text-lg font-bold tracking-tight text-tinta sm:text-xl">{formatCurrencyBRL(kpi.value)}</p>
                  <p className="mt-1 truncate text-[11px] text-tinta-fraca">{kpi.helper}</p>
                </article>
              ))}
            </section>
          )}

          {/* Conteúdo da Tab */}
          {activeTab === "formas_pagamento" ? (
            <div className="rounded-cartao border border-hairline bg-superficie shadow-cz-1 overflow-hidden">
              {loadError ? (
                <FinancialErrorState message={loadError} onRetry={reloadActiveTab} />
              ) : isLoading ? (
                <LoadingFinancialState />
              ) : formasPagamento.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-hairline">
                    <thead className="bg-fundo">
                      <tr>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">
                          Nome
                        </th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">
                          Tipo
                        </th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">
                          Sincronizado
                        </th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-superficie divide-y divide-hairline">
                      {paginatedFormasPagamento.map((forma) => (
                        <tr key={forma.id}>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-tinta">
                              {forma.nome}
                            </div>
                            {forma.descricao && (
                              <div className="text-sm text-tinta-suave">
                                {forma.descricao}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">
                            {forma.tipo || "-"}
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              forma.ativo 
                                ? "bg-green-100 text-green-800" 
                                : "bg-red-100 text-red-800"
                            }`}>
                              {forma.ativo ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta-suave">
                            {formatDateBR(forma.sincronizadoEm)}
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEdit(forma)}
                                className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                                aria-label="Editar"
                                title="Editar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDelete(forma)}
                                className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                aria-label="Excluir"
                                title="Excluir"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <VendasPagination
                    currentPage={pageFormasPagamento}
                    totalPages={Math.max(1, totalPagesFormasPagamento)}
                    totalItems={totalFormasPagamento}
                    itemsPerPage={itemsPerPage}
                    onPageChange={(p) => setPageFormasPagamento(p)}
                  />
                </div>
              ) : (
                <EmptyState
                  title="Nenhuma forma de pagamento encontrada"
                  description="Sincronize suas formas de pagamento do Bling para começar."
                  icons={emptyStateIcons}
                  footer={<EmptyStateButton />}
                  variant="default"
                  size="default"
                  theme="light"
                  isIconAnimated={true}
                  className="w-full min-h-[320px]"
                />
              )}
            </div>
          ) : activeTab === "categorias" ? (
            <div className="rounded-cartao border border-hairline bg-superficie shadow-cz-1 overflow-hidden">
              {loadError ? (
                <FinancialErrorState message={loadError} onRetry={reloadActiveTab} />
              ) : isLoading ? (
                <LoadingFinancialState />
              ) : categorias.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-hairline">
                    <thead className="bg-fundo">
                      <tr>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">Descrição</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">Tipo</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">Status</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-superficie divide-y divide-hairline">
                      {paginatedCategorias.map((cat) => (
                        <tr key={cat.id} className={cat.categoriaPaiId ? "bg-fundo" : ""}>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">
                            {cat.categoriaPaiId ? (
                              <span className="flex items-center pl-8">
                                <svg className="w-4 h-4 text-tinta-fraca mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                </svg>
                                {cat.descricao || cat.nome}
                              </span>
                            ) : (
                              <span className="font-semibold">{cat.descricao || cat.nome}</span>
                            )}
                          </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{cat.tipo}</td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${cat.ativo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                {cat.ativo ? "Ativo" : "Inativo"}
                              </span>
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleEdit(cat)}
                                  className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                                  aria-label="Editar"
                                title="Editar"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDelete(cat)}
                                  className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                  aria-label="Excluir"
                                title="Excluir"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                  <VendasPagination
                    currentPage={pageCategorias}
                    totalPages={Math.max(1, totalPagesCategoriasFlatted)}
                    totalItems={totalCategoriasFlatted}
                    itemsPerPage={itemsPerPage}
                    onPageChange={(p) => setPageCategorias(p)}
                  />
                </div>
              ) : (
                <EmptyState
                  title="Nenhuma categoria encontrada"
                  description="Sincronize ou adicione categorias para começar."
                  icons={emptyStateIcons}
                  footer={<EmptyStateButton />}
                  variant="default"
                  size="default"
                  theme="light"
                  isIconAnimated={true}
                  className="w-full min-h-[320px]"
                />
              )}
            </div>
          ) : activeTab === "contas_pagar" ? (
            <div className="rounded-cartao border border-hairline bg-superficie shadow-cz-1 overflow-hidden">
              {loadError ? (
                <FinancialErrorState message={loadError} onRetry={reloadActiveTab} />
              ) : isLoading ? (
                <LoadingFinancialState />
              ) : contasPagarFiltradas.length > 0 ? (
                <div>
                  <div className="space-y-3 bg-fundo p-3 md:hidden">
                    {paginatedContasPagar.map((conta) => (
                      <MobileAccountCard
                        key={conta.id}
                        conta={conta}
                        type="pagar"
                        onEdit={() => handleEdit(conta)}
                        onViewJson={() => handleViewJson(conta)}
                        onDelete={() => handleDelete(conta)}
                      />
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full divide-y divide-hairline">
                    <thead className="bg-fundo">
                      <tr>
                        <th onClick={() => handleSort('descricao', 'pagar')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Descrição</span>
                            <SortIcon field="descricao" currentField={sortFieldPagar} direction={sortDirectionPagar} />
                          </div>
                        </th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">Histórico</th>
                        <th onClick={() => handleSort('valor', 'pagar')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Valor</span>
                            <SortIcon field="valor" currentField={sortFieldPagar} direction={sortDirectionPagar} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('dataPagamento', 'pagar')} className="group px-3 py-2 sm:px-6 sm:py-3 w-24 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span className="block leading-tight">DATA<br/>PAGAMENTO</span>
                            <SortIcon field="dataPagamento" currentField={sortFieldPagar} direction={sortDirectionPagar} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('dataCompetencia', 'pagar')} className="group px-3 py-2 sm:px-6 sm:py-3 w-24 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span className="block leading-tight">DATA<br/>COMPETENCIA</span>
                            <SortIcon field="dataCompetencia" currentField={sortFieldPagar} direction={sortDirectionPagar} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('categoria', 'pagar')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Categoria</span>
                            <SortIcon field="categoria" currentField={sortFieldPagar} direction={sortDirectionPagar} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('formaPagamento', 'pagar')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Forma</span>
                            <SortIcon field="formaPagamento" currentField={sortFieldPagar} direction={sortDirectionPagar} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('status', 'pagar')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Status</span>
                            <SortIcon field="status" currentField={sortFieldPagar} direction={sortDirectionPagar} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('origem', 'pagar')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Origem</span>
                            <SortIcon field="origem" currentField={sortFieldPagar} direction={sortDirectionPagar} />
                          </div>
                        </th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-superficie divide-y divide-hairline">
                      {paginatedContasPagar.map((c) => (
                        <tr key={c.id}>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{c.descricao}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 text-sm text-tinta whitespace-pre-line" title={c.historico || ''}>{c.historico || '-'}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{Number(c.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta w-24">
                            <div className="flex flex-col leading-tight">
                              <span>{formatDateBR(c.dataVencimento)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta w-24">{formatDateBR(c.dataCompetencia)}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{c.categoria?.descricao || c.categoria?.nome || "-"}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{c.formaPagamento?.nome || "-"}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              String(c.status).toLowerCase() === "pago"
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap"><span className="inline-flex rounded-full bg-fundo px-2 py-1 text-xs font-semibold text-tinta-suave">{c.origem === 'SINCRONIZACAO' ? 'Bling' : c.origem === 'EXCEL' ? 'Excel' : 'Manual'}</span></td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEdit(c)}
                                className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                                aria-label="Editar"
                                title="Editar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleViewJson(c)}
                                className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                                aria-label="Ver JSON"
                                title="Ver JSON"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDelete(c)}
                                className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                aria-label="Excluir"
                                title="Excluir"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <VendasPagination
                    currentPage={pagePagar}
                    totalPages={Math.max(1, totalPagesPagar)}
                    totalItems={totalPagar}
                    itemsPerPage={itemsPerPage}
                    onPageChange={(p) => setPagePagar(p)}
                  />
                </div>
              ) : (
                <EmptyState
                  title={contasPagar.length > 0 ? "Nenhuma despesa corresponde aos filtros" : "Nenhuma conta a pagar cadastrada"}
                  description={contasPagar.length > 0 ? "Ajuste ou limpe os filtros para voltar a visualizar seus compromissos." : "Adicione uma despesa ou sincronize para começar."}
                  icons={emptyStateIcons}
                  footer={contasPagar.length > 0 ? undefined : <EmptyStateButton />}
                  variant="default"
                  size="default"
                  theme="light"
                  isIconAnimated={true}
                  className="w-full min-h-[320px]"
                />
              )}
            </div>
          ) : activeTab === "contas_receber" ? (
            <div className="rounded-cartao border border-hairline bg-superficie shadow-cz-1 overflow-hidden">
              {loadError ? (
                <FinancialErrorState message={loadError} onRetry={reloadActiveTab} />
              ) : isLoading ? (
                <LoadingFinancialState />
              ) : contasReceberFiltradas.length > 0 ? (
                <div>
                  <div className="space-y-3 bg-fundo p-3 md:hidden">
                    {paginatedContasReceber.map((conta) => (
                      <MobileAccountCard
                        key={conta.id}
                        conta={conta}
                        type="receber"
                        onEdit={() => handleEdit(conta)}
                        onViewJson={() => handleViewJson(conta)}
                        onDelete={() => handleDelete(conta)}
                      />
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full divide-y divide-hairline">
                    <thead className="bg-fundo">
                      <tr>
                        <th onClick={() => handleSort('descricao', 'receber')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Descrição</span>
                            <SortIcon field="descricao" currentField={sortFieldReceber} direction={sortDirectionReceber} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('valor', 'receber')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Valor</span>
                            <SortIcon field="valor" currentField={sortFieldReceber} direction={sortDirectionReceber} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('dataRecebimento', 'receber')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Data de Recebimento</span>
                            <SortIcon field="dataRecebimento" currentField={sortFieldReceber} direction={sortDirectionReceber} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('categoria', 'receber')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Categoria</span>
                            <SortIcon field="categoria" currentField={sortFieldReceber} direction={sortDirectionReceber} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('formaPagamento', 'receber')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Forma</span>
                            <SortIcon field="formaPagamento" currentField={sortFieldReceber} direction={sortDirectionReceber} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('status', 'receber')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Status</span>
                            <SortIcon field="status" currentField={sortFieldReceber} direction={sortDirectionReceber} />
                          </div>
                        </th>
                        <th onClick={() => handleSort('origem', 'receber')} className="group px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider cursor-pointer hover:bg-fundo transition-colors">
                          <div className="flex items-center gap-1">
                            <span>Origem</span>
                            <SortIcon field="origem" currentField={sortFieldReceber} direction={sortDirectionReceber} />
                          </div>
                        </th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-tinta-suave uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-superficie divide-y divide-hairline">
                      {paginatedContasReceber.map((c) => (
                        <tr key={c.id}>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{c.descricao}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{Number(c.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{formatDateBR(c.dataRecebimento || c.dataVencimento)}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{c.categoria?.descricao || c.categoria?.nome || "-"}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-tinta">{c.formaPagamento?.nome || "-"}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              String(c.status).toLowerCase() === "recebido"
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap"><span className="inline-flex rounded-full bg-fundo px-2 py-1 text-xs font-semibold text-tinta-suave">{c.origem === 'SINCRONIZACAO' ? 'Bling' : c.origem === 'EXCEL' ? 'Excel' : 'Manual'}</span></td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEdit(c)}
                                className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                                aria-label="Editar"
                                title="Editar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleViewJson(c)}
                                className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                                aria-label="Ver JSON"
                                title="Ver JSON"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDelete(c)}
                                className="grid h-11 w-11 place-items-center rounded-cz text-tinta-suave transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                aria-label="Excluir"
                                title="Excluir"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <VendasPagination
                    currentPage={pageReceber}
                    totalPages={Math.max(1, totalPagesReceber)}
                    totalItems={totalReceber}
                    itemsPerPage={itemsPerPage}
                    onPageChange={(p) => setPageReceber(p)}
                  />
                </div>
              ) : (
                <EmptyState
                  title={contasReceber.length > 0 ? "Nenhuma receita corresponde aos filtros" : "Nenhuma conta a receber cadastrada"}
                  description={contasReceber.length > 0 ? "Ajuste ou limpe os filtros para voltar a visualizar seus recebimentos." : "Adicione uma receita ou sincronize para começar."}
                  icons={emptyStateIcons}
                  footer={contasReceber.length > 0 ? undefined : <EmptyStateButton />}
                  variant="default"
                  size="default"
                  theme="light"
                  isIconAnimated={true}
                  className="w-full min-h-[320px]"
                />
              )}
            </div>
          ) : (
            <div className="rounded-cartao border border-hairline bg-superficie shadow-cz-1 overflow-hidden">
              <EmptyState
                title="Nenhum registro encontrado"
                description={`Comece adicionando ${getTabDescription()}.`}
                icons={emptyStateIcons}
                footer={<EmptyStateButton />}
                variant="default"
                size="default"
                theme="light"
                isIconAnimated={true}
                className="w-full min-h-[320px]"
              />
            </div>
          )}
        </section>
      </main>

      {/* Modal Universal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={getModalTitle()}
        size="md"
      >
        {renderModalContent()}
      </Modal>

      {/* Modal de Edição */}
      <EditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleEditSave}
        title={`Editar ${activeTab === "contas_pagar" ? "Despesa" : activeTab === "contas_receber" ? "Receita" : activeTab === "categorias" ? "Categoria" : "Forma de Pagamento"}`}
        data={getEditModalData()}
        fields={getEditFields()}
        isLoading={isSaving || isEditOptionsLoading}
      />

      {/* Modal de Exclusão */}
      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={`Excluir ${activeTab === "contas_pagar" ? "Despesa" : activeTab === "contas_receber" ? "Receita" : activeTab === "categorias" ? "Categoria" : "Forma de Pagamento"}`}
        message={getDeleteMessage()}
        itemName={deletingItem?.descricao || deletingItem?.nome}
        isLoading={isSaving}
      />

      {/* Modal de Importação Excel */}
      <ImportFinanceModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        activeTab={activeTab}
        onImportSuccess={() => {
          // Recarregar dados após importação
          if (activeTab === "formas_pagamento") {
            loadFormasPagamento();
          } else if (activeTab === "categorias") {
            loadCategorias();
          } else if (activeTab === "contas_pagar") {
            loadContasPagar();
          } else if (activeTab === "contas_receber") {
            loadContasReceber();
          }
        }}
      />

      {/* Modal de JSON */}
      <Modal
        isOpen={isJsonModalOpen}
        onClose={handleCloseJsonModal}
        title="JSON da Conta"
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Dados completos da conta:
            </h3>
            <pre className="text-xs text-gray-800 overflow-auto max-h-96 bg-white p-4 rounded border">
              {JSON.stringify(jsonItem, null, 2)}
            </pre>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleCloseJsonModal}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
