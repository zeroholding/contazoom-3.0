"use client";

import { useRef, useEffect, useLayoutEffect, useState, lazy, Suspense } from "react";
import gsap from "gsap";
import Sidebar from "../views/ui/Sidebar";
import Topbar from "../views/ui/Topbar";
import HeaderDashboard from "../views/ui/HeaderDashboard";
import DashboardStats from "../views/ui/DashboardStats";
import { FiltroPeriodo } from "../views/ui/FiltrosDashboard";

// Lazy load dos componentes de gráfico para melhor performance
const GraficoPeriodo = lazy(() => import("../views/ui/GraficoPeriodo"));
const TopProdutosFaturamento = lazy(() => import("../views/ui/TopProdutosFaturamento"));
const TopProdutosMargem = lazy(() => import("../views/ui/TopProdutosMargem"));
const FaturamentoPorOrigem = lazy(() => import("../views/ui/FaturamentoPorOrigem"));
const FaturamentoPorExposicao = lazy(() => import("../views/ui/FaturamentoPorExposicao"));
const FaturamentoPorTipoAnuncio = lazy(() => import("../views/ui/FaturamentoPorTipoAnuncio"));
const MapaCalorBrasil = lazy(() => import("../views/ui/MapaCalorBrasil"));
const FaturamentoPorConta = lazy(() => import("../views/ui/FaturamentoPorConta"));
const FaturamentoPorModalidade = lazy(() => import("../views/ui/FaturamentoPorModalidade"));
import type { FiltroCanal, FiltroStatus, FiltroTipoAnuncio, FiltroModalidadeEnvio } from "../views/ui/FiltrosDashboardExtra";
import type { FiltroAgrupamentoSKU } from "../views/ui/FiltroSKU";
import { AlertBanner } from "@/components/ui/alert-banner";
import { UserGuidanceNotification } from "@/components/ui/user-guidance-notification";
import { useUserGuidance } from "@/hooks/useUserGuidance";
import { useAuthContext } from "@/contexts/AuthContext";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";
const SKU_ALERT_DISMISS_KEY = "cz_dashboard_sku_alert_dismissed_count";

// useLayoutEffect no browser; fallback para useEffect no SSR
const useIsoLayout =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function Dashboard() {
  const { user } = useAuthContext();
  const { 
    hasAccounts, 
    isLoading, 
    showConnectAccounts, 
    showSyncVendas, 
    showViewVendas, 
    showViewDashboard,
    updateGuidanceState,
    dismissNotification 
  } = useUserGuidance();
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);

  // Sync with localStorage after hydration
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "1") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  // Estados dos filtros
  const [periodoAtivo, setPeriodoAtivo] = useState<FiltroPeriodo>("hoje");
  const [dataInicioPersonalizada, setDataInicioPersonalizada] = useState<Date | null>(null);
  const [dataFimPersonalizada, setDataFimPersonalizada] = useState<Date | null>(null);
  const [canalAtivo, setCanalAtivo] = useState<FiltroCanal>("todos");
  
  // Alerta de custo de SKU
  const [pendingSkusCount, setPendingSkusCount] = useState<number>(0);
  const [pendingSkuBreakdown, setPendingSkuBreakdown] = useState({
    semCusto: 0,
    naoCadastrados: 0,
  });
  const [isPendingSkuAlertHidden, setIsPendingSkuAlertHidden] = useState(false);

  const [statusAtivo, setStatusAtivo] = useState<FiltroStatus>("pagos");
  const [tipoAnuncioAtivo, setTipoAnuncioAtivo] = useState<FiltroTipoAnuncio>("todos");
  const [modalidadeEnvioAtiva, setModalidadeEnvioAtiva] = useState<FiltroModalidadeEnvio>("todos");
  const [agrupamentoSKUAtivo, setAgrupamentoSKUAtivo] = useState<FiltroAgrupamentoSKU>("mlb");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<{ platform: 'meli' | 'shopee' | 'todos'; id?: string; label?: string }>({ platform: 'todos' });

  useEffect(() => {
    fetch('/api/sku/stats')
      .then(res => res.json())
      .then(data => {
        const count = Number(data.skusSemCusto || 0);
        const semCusto = Number(data.semCusto || 0);
        const naoCadastrados = Number(data.naoCadastrados || 0);
        setPendingSkusCount(count);
        setPendingSkuBreakdown({ semCusto, naoCadastrados });

        try {
          const dismissedCount = Number(localStorage.getItem(SKU_ALERT_DISMISS_KEY) || 0);
          setIsPendingSkuAlertHidden(count > 0 && dismissedCount >= count);
          if (count === 0) localStorage.removeItem(SKU_ALERT_DISMISS_KEY);
        } catch {
          setIsPendingSkuAlertHidden(false);
        }
      })
      .catch(() => {});
  }, [refreshKey]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Define a var CSS logo na 1Âª pintura do cliente (conforme o estado inicial)
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

  // Anima quando o estado muda
  useIsoLayout(() => {
    const el = containerRef.current;
    if (!el) return;
    gsap.to(el, {
      duration: 0.2,
      ease: "power2.out",
      css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W },
    });
  }, [isSidebarCollapsed]);

  // Persiste o estado
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, isSidebarCollapsed ? "1" : "0");
    } catch {}
  }, [isSidebarCollapsed]);

  // Verifica se o usuário tem contas e vendas conectadas
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

    if (user) {
      checkAccountsAndSales();
    }
  }, [user, refreshKey]);
  // Funções de callback para os filtros
  const handlePeriodoChange = (periodo: FiltroPeriodo) => {
    setPeriodoAtivo(periodo);
    // Limpar datas personalizadas se não for período personalizado
    if (periodo !== "personalizado") {
      setDataInicioPersonalizada(null);
      setDataFimPersonalizada(null);
    }
  };

  const handlePeriodoPersonalizadoChange = (dataInicio: Date, dataFim: Date) => {
    setDataInicioPersonalizada(dataInicio);
    setDataFimPersonalizada(dataFim);
  };

  // Fallbacks de var + evita scroll horizontal
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

      {/* Plano de fundo da área de conteúdo */}
      <div
        className={`fixed top-16 bottom-0 left-0 right-0 ${mdLeftVar} z-10 bg-[#F3F3F3]`}
      >
        <div className="h-full w-full rounded-tl-none md:rounded-tl-2xl border border-gray-200 bg-white" />
      </div>

      {/* Conteúdo */}
      <main className={`relative z-20 pt-16 p-6 ${mdMlVar}`}>
        <section className="p-6">
          {/* Sistema de orientação do usuário */}
          {!isLoading && showConnectAccounts && (
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

          {!isLoading && showSyncVendas && (
            <UserGuidanceNotification
              type="info"
              title="✅ Contas conectadas com sucesso!"
              message="Agora você pode sincronizar suas vendas para visualizar os dados no dashboard. Clique no botão abaixo para começar a sincronização."
              actionLabel="Sincronizar Vendas"
              actionHref="/vendas/geral"
              dismissible={true}
              onDismiss={() => dismissNotification('showSyncVendas')}
            />
          )}

          {!isLoading && showViewVendas && (
            <UserGuidanceNotification
              type="success"
              title="📊 Dashboard carregado!"
              message="Aqui você pode visualizar gráficos e estatísticas das suas vendas. Para ver os detalhes completos, acesse a tabela de vendas."
              actionLabel="Ver Tabela de Vendas"
              actionHref="/vendas/geral"
              dismissible={true}
              onDismiss={() => dismissNotification('showViewVendas')}
            />
          )}

          {pendingSkusCount > 0 && !isPendingSkuAlertHidden && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm animate-in fade-in slide-in-from-top-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-800">
                    ⚠️ Alerta Crítico de Lucratividade
                  </h3>
                  <p className="mt-1 text-sm text-red-700">
                    Você possui <strong>{pendingSkusCount} SKU(s) pendente(s)</strong>:{" "}
                    <strong>{pendingSkuBreakdown.semCusto}</strong> sem custo e{" "}
                    <strong>{pendingSkuBreakdown.naoCadastrados}</strong> sem cadastro.
                    <br />CMV, lucro e margem dependem desses custos para fechar corretamente.
                  </p>
                  <div className="mt-3">
                    <a
                      href="/sku?pendentes=1"
                      className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    >
                      Cadastrar Custos Agora
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsPendingSkuAlertHidden(true);
                    try {
                      localStorage.setItem(SKU_ALERT_DISMISS_KEY, String(pendingSkusCount));
                    } catch {}
                  }}
                  className="rounded-md p-1 text-red-400 transition-colors hover:bg-red-100 hover:text-red-700"
                  aria-label="Ocultar alerta de SKUs pendentes"
                  title="Ocultar alerta"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <HeaderDashboard
            periodoAtivo={periodoAtivo}
            onPeriodoChange={handlePeriodoChange}
            onPeriodoPersonalizadoChange={handlePeriodoPersonalizadoChange}
            canalAtivo={canalAtivo}
            onCanalChange={setCanalAtivo}
            statusAtivo={statusAtivo}
            onStatusChange={setStatusAtivo}
            tipoAnuncioAtivo={tipoAnuncioAtivo}
            onTipoAnuncioChange={setTipoAnuncioAtivo}
            modalidadeEnvioAtiva={modalidadeEnvioAtiva}
            onModalidadeEnvioChange={setModalidadeEnvioAtiva}
            agrupamentoSKUAtivo={agrupamentoSKUAtivo}
            onAgrupamentoSKUChange={setAgrupamentoSKUAtivo}
            onForceRefresh={() => setRefreshKey((v) => v + 1)}
            selectedAccount={selectedAccount}
            onAccountChange={(acc) => {
              setSelectedAccount(acc);
              // Ajusta canal automaticamente ao escolher plataforma específica
              if (acc.platform === 'meli') setCanalAtivo('mercado_livre');
              else if (acc.platform === 'shopee') setCanalAtivo('shopee');
              else setCanalAtivo('todos');
              setRefreshKey((v) => v + 1);
            }}
          />
          <DashboardStats
            periodoAtivo={periodoAtivo}
            dataInicioPersonalizada={dataInicioPersonalizada}
            dataFimPersonalizada={dataFimPersonalizada}
            canalAtivo={canalAtivo}
            statusAtivo={statusAtivo}
            tipoAnuncioAtivo={tipoAnuncioAtivo}
            modalidadeEnvioAtiva={modalidadeEnvioAtiva}
            agrupamentoSKUAtivo={agrupamentoSKUAtivo}
            refreshKey={refreshKey}
            selectedAccount={selectedAccount}
          />
          
          {/* Gráfico de Período */}
          <div className="mt-6">
            <Suspense fallback={<div className="h-96 bg-gray-50 rounded-lg animate-pulse" />}>
              <GraficoPeriodo
                periodoAtivo={periodoAtivo}
                dataInicioPersonalizada={dataInicioPersonalizada}
                dataFimPersonalizada={dataFimPersonalizada}
                canalAtivo={canalAtivo}
                statusAtivo={statusAtivo}
                tipoAnuncioAtivo={tipoAnuncioAtivo}
                modalidadeEnvioAtiva={modalidadeEnvioAtiva}
                agrupamentoSKUAtivo={agrupamentoSKUAtivo}
                refreshKey={refreshKey}
                selectedAccount={selectedAccount}
              />
            </Suspense>
          </div>

          {/* Top Produtos - Faturamento e Margem */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Suspense fallback={<div className="h-96 bg-gray-50 rounded-lg animate-pulse" />}>
              <TopProdutosFaturamento
                periodoAtivo={periodoAtivo}
                dataInicioPersonalizada={dataInicioPersonalizada}
                dataFimPersonalizada={dataFimPersonalizada}
                canalAtivo={canalAtivo}
                statusAtivo={statusAtivo}
                tipoAnuncioAtivo={tipoAnuncioAtivo}
                modalidadeEnvioAtiva={modalidadeEnvioAtiva}
                agrupamentoSKUAtivo={agrupamentoSKUAtivo}
                refreshKey={refreshKey}
                selectedAccount={selectedAccount}
              />
            </Suspense>
            <Suspense fallback={<div className="h-96 bg-gray-50 rounded-lg animate-pulse" />}>
              <TopProdutosMargem
                periodoAtivo={periodoAtivo}
                dataInicioPersonalizada={dataInicioPersonalizada}
                dataFimPersonalizada={dataFimPersonalizada}
                canalAtivo={canalAtivo}
                statusAtivo={statusAtivo}
                tipoAnuncioAtivo={tipoAnuncioAtivo}
                modalidadeEnvioAtiva={modalidadeEnvioAtiva}
                agrupamentoSKUAtivo={agrupamentoSKUAtivo}
                refreshKey={refreshKey}
                selectedAccount={selectedAccount}
              />
            </Suspense>
          </div>

          {/* Gráficos Donut - Origem e Exposição (apenas para Mercado Livre e Todos) */}
          {canalAtivo !== 'shopee' && (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Suspense fallback={<div className="h-96 bg-gray-50 rounded-lg animate-pulse" />}>
                <FaturamentoPorTipoAnuncio
                  periodoAtivo={periodoAtivo}
                  dataInicioPersonalizada={dataInicioPersonalizada}
                  dataFimPersonalizada={dataFimPersonalizada}
                  canalAtivo={canalAtivo}
                  statusAtivo={statusAtivo}
                  tipoAnuncioAtivo={tipoAnuncioAtivo}
                  modalidadeEnvioAtiva={modalidadeEnvioAtiva}
                  agrupamentoSKUAtivo={agrupamentoSKUAtivo}
                  refreshKey={refreshKey}
                  selectedAccount={selectedAccount}
                />
              </Suspense>
              <Suspense fallback={<div className="h-96 bg-gray-50 rounded-lg animate-pulse" />}>
                <FaturamentoPorExposicao
                  periodoAtivo={periodoAtivo}
                  dataInicioPersonalizada={dataInicioPersonalizada}
                  dataFimPersonalizada={dataFimPersonalizada}
                  canalAtivo={canalAtivo}
                  statusAtivo={statusAtivo}
                  tipoAnuncioAtivo={tipoAnuncioAtivo}
                  modalidadeEnvioAtiva={modalidadeEnvioAtiva}
                  agrupamentoSKUAtivo={agrupamentoSKUAtivo}
                  refreshKey={refreshKey}
                  selectedAccount={selectedAccount}
                />
              </Suspense>
            </div>
          )}

          {/* Gráfico Faturamento por Conta e Modalidade */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Suspense fallback={<div className="h-96 bg-gray-50 rounded-lg animate-pulse" />}>
              <FaturamentoPorConta
                periodoAtivo={periodoAtivo}
                dataInicioPersonalizada={dataInicioPersonalizada}
                dataFimPersonalizada={dataFimPersonalizada}
                canalAtivo={canalAtivo}
                statusAtivo={statusAtivo}
                tipoAnuncioAtivo={tipoAnuncioAtivo}
                modalidadeEnvioAtiva={modalidadeEnvioAtiva}
                agrupamentoSKUAtivo={agrupamentoSKUAtivo}
                selectedAccount={selectedAccount}
                refreshKey={refreshKey}
              />
            </Suspense>
            <Suspense fallback={<div className="h-96 bg-gray-50 rounded-lg animate-pulse" />}>
              <FaturamentoPorModalidade
                periodoAtivo={periodoAtivo}
                dataInicioPersonalizada={dataInicioPersonalizada}
                dataFimPersonalizada={dataFimPersonalizada}
                canalAtivo={canalAtivo}
                statusAtivo={statusAtivo}
                tipoAnuncioAtivo={tipoAnuncioAtivo}
                modalidadeEnvioAtiva={modalidadeEnvioAtiva}
                agrupamentoSKUAtivo={agrupamentoSKUAtivo}
                selectedAccount={selectedAccount}
                refreshKey={refreshKey}
              />
            </Suspense>
          </div>

          {/* Mapa de Calor por Estado */}
          <div className="mt-6">
            <Suspense fallback={<div className="h-96 bg-gray-50 rounded-lg animate-pulse" />}>
              <MapaCalorBrasil
                periodoAtivo={periodoAtivo}
                dataInicioPersonalizada={dataInicioPersonalizada}
                dataFimPersonalizada={dataFimPersonalizada}
                canalAtivo={canalAtivo}
                statusAtivo={statusAtivo}
                tipoAnuncioAtivo={tipoAnuncioAtivo}
                modalidadeEnvioAtiva={modalidadeEnvioAtiva}
                agrupamentoSKUAtivo={agrupamentoSKUAtivo}
                selectedAccount={selectedAccount}
                refreshKey={refreshKey}
              />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}






