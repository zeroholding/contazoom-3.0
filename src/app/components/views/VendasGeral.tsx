"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import Sidebar from "../views/ui/Sidebar";
import Topbar from "../views/ui/Topbar";
import TabelaVendasV2 from "./ui/v2/TabelaVendas";
import FiltrosVendasV2 from "./ui/v2/FiltrosVendas";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";
import { useUserGuidance } from "@/hooks/useUserGuidance";
import { UserGuidanceNotification } from "@/components/ui/user-guidance-notification";
import { VendasProvider } from "@/contexts/VendasContext";
import { useVendasContext } from "@/hooks/v2/useVendasContext";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface HeaderVendasGeralProps {
  totalItems?: number;
  contasConectadas?: any[];
}

const HeaderVendasGeral = ({
  totalItems = 0,
  contasConectadas = [],
}: HeaderVendasGeralProps) => {
  const router = useRouter();
  const [showInfoDropdown, setShowInfoDropdown] = useState(false);

  const infoDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showInfoDropdown,
    onClose: () => setShowInfoDropdown(false),
    preferredPosition: "bottom-left",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="text-left">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">
            Vendas Geral
          </h1>
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Dashboard
          </button>
          <div className="relative">
            <button
              ref={infoDropdown.triggerRef}
              onClick={() => setShowInfoDropdown(!showInfoDropdown)}
              className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-all duration-200 group ${
                showInfoDropdown
                  ? "bg-gray-200 ring-2 ring-gray-300 scale-105"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
              title="Informações das vendas"
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
                className="text-gray-600 group-hover:text-gray-800 transition-transform duration-200 group-hover:scale-110"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>

            {infoDropdown.isVisible && (
              <div
                ref={infoDropdown.dropdownRef}
                className={`smart-dropdown w-64 ${
                  infoDropdown.isOpen ? "dropdown-enter" : "dropdown-exit"
                }`}
                style={infoDropdown.position}
              >
                <div className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Vendas encontradas:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {totalItems}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-gray-100/80">
                      <p className="text-xs text-gray-600 mb-1">Fonte dos dados:</p>
                      <p className="text-xs font-medium text-gray-800">
                        Vendas já sincronizadas do Shopee e Mercado Livre
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-gray-600 text-left">
          Visualize todas as suas vendas sincronizadas em uma única tabela.
        </p>
      </div>

      {contasConectadas.length > 0 && (
        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <span className="text-sm text-gray-600">Contas conectadas:</span>
          <div className="flex items-center -space-x-1">
            {contasConectadas.slice(0, 3).map((conta) => {
              const label = conta.nickname || conta.shop_id || conta.merchant_id || conta.ml_user_id || conta.id;
              const title = conta.nickname || `Conta ${label}`;
              const initial = (String(label || "?").charAt(0) || "?").toUpperCase();
              return (
                <div
                  key={conta.id || label}
                  className="relative bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-semibold w-6 h-6"
                  title={title}
                >
                  <span>{initial}</span>
                </div>
              );
            })}
            {contasConectadas.length > 3 && (
              <div className="relative bg-gray-400 text-white rounded-full flex items-center justify-center text-xs font-semibold w-6 h-6 ml-1">
                <span>+{contasConectadas.length - 3}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import { useVendaFilters } from "@/hooks/useVendasFilter";
import { ColunasVisiveis } from "./ui/v2/FiltrosVendas";

const colunasVisiveisDefault: ColunasVisiveis = {
  data: true,
  canal: true,
  conta: true,
  pedido: true,
  comprador: true,
  ads: false,
  exposicao: false,
  tipo: false,
  produto: true,
  sku: true,
  quantidade: true,
  unitario: true,
  valor: true,
  taxa: true,
  frete: true,
  cmv: true,
  margem: true,
  envioMode: true,
};

function VendasGeralContent() {
  const { 
    isLoading: isLoadingGuidance, 
    showConnectAccounts, 
    showSyncVendas, 
    showViewDashboard,
    updateGuidanceState,
    dismissNotification 
  } = useUserGuidance();
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
  const [colunasVisiveis, setColunasVisiveis] = useState<ColunasVisiveis>(colunasVisiveisDefault);
  const [isLoading, setIsLoading] = useState(true);

  const { filters, setPage, updateFilters } = useVendaFilters();

  const { 
    pagination,
    countVendas,
    contasConectadas,
    reloadVendas,
    handleSyncOrders,
    isSyncing,
  } = useVendasContext();

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await reloadVendas(filters);
      setIsLoading(false);
    }

    load();
  }, [filters, reloadVendas]);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "1") {
      setIsSidebarCollapsed(true);
    }
  }, []);

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

  useEffect(() => {
    const checkAccountsAndSales = async () => {
      try {
        const [accountsRes, salesRes] = await Promise.all([
          fetch('/api/accounts/check'),
          fetch('/api/sales/check')
        ]);

        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          const salesData = salesRes.ok ? await salesRes.json() : { hasSales: false };
          
          updateGuidanceState(accountsData.hasAccounts, salesData.hasSales);
        }
      } catch (error) {
        console.error('Erro ao verificar contas e vendas:', error);
      }
    };

    checkAccountsAndSales();
  }, [updateGuidanceState]);

  const handleGuidanceSync = () => {
    if (isSyncing) return;
    handleSyncOrders(undefined, undefined, true);
  };

  const mdLeftVar = "md:left-[var(--sidebar-w,16rem)]";
  const mdMlVar = "md:ml-[var(--sidebar-w,16rem)]";

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
        className={`fixed top-16 bottom-0 left-0 right-0 ${mdLeftVar} z-10 bg-[#F3F3F3]`}
      >
        <div className="h-full w-full rounded-tl-none md:rounded-tl-2xl border border-gray-200 bg-white" />
      </div>

      <main className={`relative z-20 pt-16 px-3 pb-3 sm:px-6 sm:pb-6 ${mdMlVar}`}>
        <section className="p-3 sm:p-6">
          <HeaderVendasGeral
            totalItems={pagination.totalItems}
            contasConectadas={contasConectadas || []}
          />

          {!isLoadingGuidance && showConnectAccounts && (
            <UserGuidanceNotification
              type="warning"
              title="🚀 Bem-vindo ao Contazoom!"
              message="Para começar, você precisa conectar suas contas do Mercado Livre e Shopee. Após conectar, você poderá sincronizar e visualizar todas as suas vendas."
              actionLabel="Conectar Contas"
              actionHref="/contas"
              dismissible={true}
              onDismiss={() => dismissNotification('showConnectAccounts')}
            />
          )}

          {!isLoadingGuidance && showSyncVendas && (
            <UserGuidanceNotification
              type="sync"
              title="🔄 Sincronize suas vendas"
              message="Suas contas estão conectadas! Agora você pode sincronizar suas vendas para visualizar os dados na tabela abaixo."
              actionLabel={isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
              onAction={handleGuidanceSync}
              dismissible={true}
              onDismiss={() => dismissNotification('showSyncVendas')}
            />
          )}

          {!isLoadingGuidance && showViewDashboard && (
            <UserGuidanceNotification
              type="success"
              title="📊 Vendas carregadas!"
              message="Aqui você pode visualizar todas as suas vendas em detalhes. Para ver gráficos e estatísticas, acesse o dashboard."
              actionLabel="Ver Dashboard"
              actionHref="/dashboard"
              dismissible={true}
              onDismiss={() => dismissNotification('showViewDashboard')}
            />
          )}

          <FiltrosVendasV2 
            totalVendas={countVendas.all}
            vendasPagas={countVendas.paid}
            vendasCanceladas={countVendas.cancelled}
            filters={filters}
            updateFilters={updateFilters}
            contasDisponiveis={contasConectadas.map((conta) => ({
              id: conta.id,
              nickname: conta.nickname || "",
            }))}
            platform="Geral"
          />

          <TabelaVendasV2 
            platform="Geral"
            isLoading={isLoading}
            isSyncing={false}
            onPageChange={(page) => {
              setPage(page);
            }}
          />
        </section>
      </main>
    </div>
  );
}

export default function VendasGeral() {
  return (
    <VendasProvider platform="Geral">
      <VendasGeralContent />
    </VendasProvider>
  );
}
