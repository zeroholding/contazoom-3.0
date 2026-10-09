"use client";

import { useRef, useEffect, useLayoutEffect, useState, useCallback, lazy, Suspense } from "react";
import gsap from "gsap";
import Sidebar from "../views/ui/Sidebar";
import Topbar from "../views/ui/Topbar";
import HeaderDashboard, { FILTROS_PADRAO } from "../views/ui/HeaderDashboard";
import DashboardStats, { type DashboardPendingSkuSummary } from "../views/ui/DashboardStats";
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
import { UserGuidanceNotification } from "@/components/ui/user-guidance-notification";
import { Faixa } from "./comum/shell";
import { IconeAlerta, IconeFechar, IconeSeta } from "./comum/icones";
import { useUserGuidance } from "@/hooks/useUserGuidance";
import { useAoSincronizarVendas } from "@/hooks/useAoSincronizarVendas";
import { useAuthContext } from "@/contexts/AuthContext";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";
const SKU_ALERT_DISMISS_KEY = "cz_dashboard_sku_alert_dismissed_scope_v2";

/**
 * A plataforma da conta escolhida -> o `canal` que as APIs de dashboard esperam.
 *
 * Os valores são os mesmos `id` de `canalOptions` (ver FiltrosDashboardExtra) e de
 * `canalIncluiPlataforma` em `src/lib/dashboard-filters.ts`.
 */
const CANAL_DA_PLATAFORMA: Record<'meli' | 'shopee' | 'tiktok' | 'todos', FiltroCanal> = {
  meli: "mercado_livre",
  shopee: "shopee",
  tiktok: "tiktok",
  todos: "todos",
};

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
  const [canalAtivo, setCanalAtivo] = useState<FiltroCanal>(FILTROS_PADRAO.canal);
  
  // Alerta de custo de SKU. O valor vem da MESMA resposta filtrada dos cards;
  // a Gestão de SKU mantém, separadamente, a visão histórica completa.
  const [pendingSkuDashboard, setPendingSkuDashboard] = useState<
    DashboardPendingSkuSummary & { requestSignature: string }
  >({
    total: 0,
    semCusto: 0,
    naoCadastrados: 0,
    signature: "",
    requestSignature: "",
  });
  const [isPendingSkuAlertHidden, setIsPendingSkuAlertHidden] = useState(false);

  const [statusAtivo, setStatusAtivo] = useState<FiltroStatus>(FILTROS_PADRAO.status);
  const [tipoAnuncioAtivo, setTipoAnuncioAtivo] = useState<FiltroTipoAnuncio>(FILTROS_PADRAO.tipoAnuncio);
  const [modalidadeEnvioAtiva, setModalidadeEnvioAtiva] = useState<FiltroModalidadeEnvio>(FILTROS_PADRAO.modalidadeEnvio);
  const [agrupamentoSKUAtivo, setAgrupamentoSKUAtivo] = useState<FiltroAgrupamentoSKU>(FILTROS_PADRAO.agrupamento);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<{ platform: 'meli' | 'shopee' | 'tiktok' | 'todos'; id?: string; label?: string }>({ platform: 'todos' });

  // Identifica exatamente o conjunto mostrado no Dashboard. Enquanto uma nova
  // combinação carrega, a assinatura anterior deixa de ser considerada atual,
  // evitando exibir por alguns instantes o alerta do período anterior.
  const pendingSkuFilterSignature = JSON.stringify({
    periodo: periodoAtivo,
    dataInicio: dataInicioPersonalizada?.getTime() ?? null,
    dataFim: dataFimPersonalizada?.getTime() ?? null,
    canal: canalAtivo,
    status: statusAtivo,
    tipoAnuncio: tipoAnuncioAtivo,
    modalidade: modalidadeEnvioAtiva,
    contaPlataforma: selectedAccount.platform,
    contaId: selectedAccount.id ?? null,
  });
  const pendingSkuRequestSignature = `${pendingSkuFilterSignature}|refresh:${refreshKey}`;
  const pendingSkuIsCurrent =
    pendingSkuDashboard.requestSignature === pendingSkuRequestSignature;
  const pendingSkusCount = pendingSkuIsCurrent ? pendingSkuDashboard.total : 0;
  const pendingSkuBreakdown = pendingSkuIsCurrent
    ? pendingSkuDashboard
    : { semCusto: 0, naoCadastrados: 0 };

  const handlePendingSkuSummaryChange = useCallback(
    (summary: DashboardPendingSkuSummary) => {
      const next = {
        total: Math.max(0, Number(summary.total) || 0),
        semCusto: Math.max(0, Number(summary.semCusto) || 0),
        naoCadastrados: Math.max(0, Number(summary.naoCadastrados) || 0),
        signature: String(summary.signature || ""),
        requestSignature: pendingSkuRequestSignature,
      };
      setPendingSkuDashboard(next);

      try {
        const dismissal = JSON.stringify({
          filters: pendingSkuFilterSignature,
          signature: next.signature,
        });
        setIsPendingSkuAlertHidden(
          next.total > 0 && localStorage.getItem(SKU_ALERT_DISMISS_KEY) === dismissal,
        );
        if (next.total === 0) {
          // Se a pendência foi resolvida, uma reincidência idêntica no futuro
          // precisa voltar a alertar.
          localStorage.removeItem(SKU_ALERT_DISMISS_KEY);
        }
      } catch {
        setIsPendingSkuAlertHidden(false);
      }
    },
    [pendingSkuFilterSignature, pendingSkuRequestSignature],
  );

  useAoSincronizarVendas(() => {
    setRefreshKey((value) => value + 1);
  });

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
        className={`fixed top-[var(--cz-topbar-h)] bottom-0 left-0 right-0 ${mdLeftVar} z-10 bg-[var(--cz-fundo)]`}
      >
        {/* O painel BRANCO que ficava aqui foi removido: com ele, cartao branco
            sobre painel branco nao tinha separacao nenhuma, e era por isso que os
            cartoes desta tela eram cinza. Agora o conteudo assenta no fundo claro
            e os cartoes brancos se destacam dele. */}
      </div>

      {/* Conteúdo */}
      {/* No celular o conteúdo ganha 16px de respiro sob o cabeçalho fixo; sem isso
          o título "Dashboard" encostava na borda inferior da barra. */}
      <main className={`relative z-20 pt-[calc(var(--cz-topbar-h)+1rem)] md:pt-[var(--cz-topbar-h)] px-4 pb-4 sm:px-6 sm:pb-6 ${mdMlVar}`}>
        {/* Cada gráfico é um componente à parte, então os ajustes de celular dos cartões abaixo
            entram por seletores de descendente neste container (todos com `max-md:`):
            - gráfico de linhas: 240px de altura, legenda em 2 colunas;
            - texto "Mostrando top 10…" dos cabeçalhos some (apertava o título);
            - barras empilhadas (por conta/modalidade): 240px em vez de 420px (o height é inline,
              por isso o `!`), com menos espaço entre a barra e a legenda;
            - mapa: siglas dos estados maiores (o SVG é reduzido a ~64%, as de 9px ficavam ilegíveis). */}
        <section className="w-full max-md:[&_.h-96]:h-60 max-md:[&_.flex-wrap.justify-center.gap-4]:grid max-md:[&_.flex-wrap.justify-center.gap-4]:grid-cols-2 max-md:[&_.flex-wrap.justify-center.gap-4]:justify-items-start max-md:[&_.flex-wrap.justify-center.gap-4]:gap-x-3 max-md:[&_.flex-wrap.justify-center.gap-4]:gap-y-2 max-md:[&_.text-sm.text-gray-600]:hidden max-md:[&_.gap-6.items-start]:gap-3 max-md:[&_[style*='420px']]:h-[240px]! max-md:[&_svg.h-auto_text]:text-[14px] max-md:[&_.rounded-xl.py-3]:py-2 max-md:[&_.bg-gray-100.rounded-lg_button]:min-h-10 max-md:[&_[class*='text-[10px]']]:text-xs">
          {/* Sistema de orientação do usuário.
              O wrapper existe só para compactar os avisos no celular:
              `UserGuidanceNotification` é compartilhado (p-4, botão de ação do
              tamanho do texto, "X" de 20px) e não é desta tela, então os ajustes
              entram aqui por seletores de descendente, sem mexer nele. No desktop
              o wrapper não aplica nada. */}
          <div className="max-md:[&>div]:mb-3 max-md:[&>div]:p-3 max-md:[&_p]:mb-2 max-md:[&_p]:text-[13px] max-md:[&_p]:leading-snug max-md:[&_h3]:mb-0.5 max-md:[&_.min-w-0_button]:min-h-11 max-md:[&_.min-w-0_button]:w-full max-md:[&_.min-w-0_button]:justify-center max-md:[&_.items-start>button]:-m-3 max-md:[&_.items-start>button]:p-3">
          {!isLoading && showConnectAccounts && (
            <UserGuidanceNotification
              type="warning"
              title="Bem-vindo ao ContaZoom"
              message="Para começar, você precisa conectar suas contas do Mercado Livre, Shopee ou TikTok Shop. Após conectar, você poderá sincronizar e visualizar todas as suas vendas."
              actionLabel="Conectar Contas"
              actionHref="/contas"
              dismissible={true}
              onDismiss={() => dismissNotification('showConnectAccounts')}
            />
          )}

          {!isLoading && showSyncVendas && (
            <UserGuidanceNotification
              type="info"
              title="Contas conectadas"
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
              title="Dashboard pronto"
              message="Aqui você pode visualizar gráficos e estatísticas das suas vendas. Para ver os detalhes completos, acesse a tabela de vendas."
              actionLabel="Ver Tabela de Vendas"
              actionHref="/vendas/geral"
              dismissible={true}
              onDismiss={() => dismissNotification('showViewVendas')}
            />
          )}

          </div>

          {/* Alerta de SKU sem custo.
              Era um bloco de 45 linhas escrito à mão, com três SVG colados
              (triângulo, seta, X), paleta `red-*` crua e raio `rounded-lg` que
              não é o do resto do painel. Agora usa a `Faixa` do kit e os ícones
              do conjunto: o desenho passa a acompanhar as outras telas de graça,
              e o "⚠️" do título saiu porque o ícone já está ali — emoji ao lado
              de ícone vetorial é o mesmo símbolo duas vezes, em dois estilos. */}
          {pendingSkusCount > 0 && !isPendingSkuAlertHidden && (
            <Faixa
              tom="critico"
              className="mb-6 mt-0 max-md:mb-4"
              icone={<IconeAlerta className="h-5 w-5" />}
              acao={
                <button
                  type="button"
                  onClick={() => {
                    setIsPendingSkuAlertHidden(true);
                    try {
                      localStorage.setItem(
                        SKU_ALERT_DISMISS_KEY,
                        JSON.stringify({
                          filters: pendingSkuFilterSignature,
                          signature: pendingSkuDashboard.signature,
                        }),
                      );
                    } catch {}
                  }}
                  className="rounded-lg p-1 text-rose-500 transition-colors hover:bg-rose-100 hover:text-rose-800"
                  aria-label="Ocultar alerta de SKUs pendentes"
                  title="Ocultar alerta"
                >
                  <IconeFechar className="h-4 w-4" />
                </button>
              }
            >
              <strong className="block text-[13px]">Custos de SKU pendentes nos filtros atuais</strong>
              <p className="mt-1">
                <strong>{pendingSkusCount} SKU(s)</strong> com vendas neste recorte estão pendentes:{" "}
                <strong>{pendingSkuBreakdown.semCusto}</strong> cadastrados sem custo e{" "}
                <strong>{pendingSkuBreakdown.naoCadastrados}</strong> ainda sem cadastro.
                Enquanto isso, CMV, lucro e margem desta tela podem ficar incompletos.
              </p>
              <a
                href="/sku?pendentes=1"
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-[var(--cz-raio)] bg-rose-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-rose-700 max-md:flex max-md:h-11 max-md:w-full max-md:justify-center max-md:text-[14px]"
                title="Abre todos os SKUs pendentes, de todos os períodos"
              >
                Ver histórico completo
                <IconeSeta className="h-4 w-4" />
              </a>
            </Faixa>
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
              // Ajusta canal automaticamente ao escolher plataforma específica.
              // Mapa e não cadeia de if/else: são os mesmos `id` de
              // `canalOptions`/`dashboard-filters`, e com três canais um ramo
              // faltando deixaria o filtro em 'todos' sem dar erro.
              setCanalAtivo(CANAL_DA_PLATAFORMA[acc.platform]);
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
            onPendingSkuSummaryChange={handlePendingSkuSummaryChange}
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
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-md:mt-4 max-md:gap-4">
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
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-md:mt-4 max-md:gap-4">
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
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-md:mt-4 max-md:gap-4">
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






