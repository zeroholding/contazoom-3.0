"use client";

/**
 * Tela de vendas do TikTok Shop.
 *
 * Irmã de `VendasShopee.tsx` — mesma estrutura de sidebar, filtros e tabela. Três
 * diferenças que vêm da plataforma, e não de gosto:
 *
 * 1. NÃO existe `/api/tiktok/vendas/check`. A tela da Shopee chama uma rota de
 *    checagem que também não existe (o `fetch` falha, o `catch` engole e o contador
 *    fica em zero para sempre). Copiar isso aqui só acrescentaria um erro de rede a
 *    cada 10 minutos, então o contador vem só das notificações — que é a fonte que
 *    de fato funciona nas duas telas.
 *
 * 2. O FILTRO DE MODALIDADE lê a TRANSPORTADORA, como na Shopee, e não um modo
 *    logístico. No TikTok o sync guarda `shipping_provider_name` em
 *    `shippingStatus` — a mesma armadilha documentada em `expedicao-status.ts`.
 *
 * 3. A coluna de MARGEM pode ser projeção. O financeiro do TikTok só fica
 *    definitivo quando o pedido liquida, e até lá `isMargemReal = false`. A faixa
 *    no topo avisa quantas linhas do período ainda estão nesse estado, porque um
 *    número estimado apresentado como fechado é pior do que número nenhum.
 */

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import Sidebar from "../views/ui/Sidebar";
import Topbar from "../views/ui/Topbar";
import TabelaVendas from "../views/ui/TabelaVendas";
import { useVendas } from "@/hooks/useVendas";
import FiltrosVendas, {
  FiltroStatus,
  FiltroPeriodo,
  FiltroModalidadeEnvio,
} from "../views/ui/FiltrosVendas";
import { COLUNAS_PADRAO, type ColunasVisiveis } from "../views/ui/colunasVendas";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";
import { useToast } from "./ui/toaster";
import { isStatusCancelado, isStatusPago } from "@/lib/vendasStatus";
import ModalSyncVendas from "./ui/ModalSyncVendas";
import { LogoTikTok } from "./comum/logos";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";

const PLATAFORMA = "TikTok Shop" as const;

// useLayoutEffect no browser; fallback para useEffect no SSR
const useIsoLayout =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface HeaderVendasTiktokProps {
  vendas?: any[];
  lastSyncedAt?: string | null;
  isSyncing?: boolean;
  onSyncOrders: (accountIds?: string[]) => void;
  contasConectadas?: any[];
  progress?: any;
  reloadVendas?: () => Promise<void>;
}

const HeaderVendasTiktok = ({
  vendas = [],
  lastSyncedAt = null,
  isSyncing = false,
  onSyncOrders,
  contasConectadas = [],
  progress,
  reloadVendas,
}: HeaderVendasTiktokProps) => {
  const router = useRouter();
  const { toast } = useToast();
  const [showInfoDropdown, setShowInfoDropdown] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);

  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);
  const [newOrdersCount, setNewOrdersCount] = useState<number>(0);

  const infoDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showInfoDropdown,
    onClose: () => setShowInfoDropdown(false),
    preferredPosition: "bottom-left",
    offset: 8,
    minDistanceFromEdge: 16,
  });

  // Configuração de auto-sync (compartilhada entre os canais)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings/auto-sync", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAutoSyncEnabled(data.autoSyncEnabled);
        }
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
      }
    };
    loadSettings();
  }, []);

  // Contador de pedidos novos. Vem das notificações, não de uma rota de
  // checagem — ver o item 1 do docblock do arquivo.
  const carregarNotificacoes = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const nova = data.notifications?.find(
        (n: any) => n.type === "new_orders" && !n.isRead,
      );
      if (nova) setNewOrdersCount(nova.newOrdersCount);
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
    }
  }, []);

  useEffect(() => {
    carregarNotificacoes();
  }, [carregarNotificacoes]);

  useEffect(() => {
    if (!autoSyncEnabled) return;
    const id = setInterval(carregarNotificacoes, 600_000);
    return () => clearInterval(id);
  }, [autoSyncEnabled, carregarNotificacoes]);

  const handleOpenSyncModal = () => {
    setShowSyncModal(true);
    fetch("/api/notifications", {
      method: "DELETE",
      credentials: "include",
    }).catch((err) => console.error("Erro ao marcar notificações:", err));
    setNewOrdersCount(0);
  };

  const handleSyncComplete = async () => {
    if (reloadVendas) {
      await reloadVendas();
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  };

  // Quantas linhas ainda estão com financeiro estimado. `financeiroLiquidado` é o
  // campo que `/api/vendas` devolve a partir de `is_margem_real`; a reserva no
  // próprio `isMargemReal` cobre as rotas que ainda mandam o nome cru.
  const estimadas = vendas.filter(
    (v) => (v?.financeiroLiquidado ?? v?.isMargemReal) === false,
  ).length;

  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-left">
          <div className="flex items-center gap-3">
            <LogoTikTok className="h-7 w-auto" />
            <h1 className="text-2xl font-semibold text-gray-900">
              Vendas TikTok Shop
            </h1>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
                title="Informações da sincronização"
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
                  aria-hidden="true"
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
                          {vendas?.length || 0}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Financeiro estimado:</span>
                        <span className="text-sm font-semibold text-gray-900">{estimadas}</span>
                      </div>

                      {lastSyncedAt && (
                        <div className="pt-2 border-t border-gray-100/80">
                          <p className="text-xs text-gray-600 mb-1">Última sincronização:</p>
                          <p className="text-xs font-medium text-gray-800">
                            {formatDate(lastSyncedAt)} às{" "}
                            {new Date(lastSyncedAt).toLocaleTimeString("pt-BR")}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-600 text-left">
            Gerencie e acompanhe suas vendas na plataforma do TikTok Shop.
          </p>
        </div>

        <button
          onClick={handleOpenSyncModal}
          className="inline-flex items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium transition-all duration-200 shadow-sm hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 w-full sm:w-auto"
          disabled={isSyncing}
        >
          <div className="flex items-center relative">
            {isSyncing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-700" />
            ) : (
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
                aria-hidden="true"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z" />
                <path d="M9 11v-5a3 3 0 0 1 6 0v5" />
              </svg>
            )}
            {newOrdersCount > 0 && !isSyncing && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                {newOrdersCount > 99 ? "99+" : newOrdersCount}
              </span>
            )}
          </div>
          <span>{isSyncing ? "Sincronizando..." : "Sincronizar vendas"}</span>
          {contasConectadas.length > 0 && (
            <div className="flex items-center -space-x-1">
              {contasConectadas.slice(0, 3).map((conta) => {
                const label =
                  conta.nickname || conta.shop_name || conta.shop_id || conta.id;
                const title = conta.nickname || `Loja ${label}`;
                const initial = (String(label || "?").charAt(0) || "?").toUpperCase();
                return (
                  <div
                    key={conta.id || label}
                    className="relative bg-zinc-900 text-white rounded-full flex items-center justify-center text-xs font-semibold w-6 h-6"
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
          )}
        </button>
      </div>

      {/* Aviso de financeiro estimado. Ver o item 3 do docblock do arquivo. */}
      {estimadas > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <svg
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <span>
            <strong>{estimadas}</strong> venda(s) com financeiro{" "}
            <strong>estimado</strong>: a taxa e a margem viram definitivas quando o
            pedido liquidar (entrega + alguns dias). Até lá são projeção.
          </span>
        </div>
      )}

      <ModalSyncVendas
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        platform={PLATAFORMA}
        contas={contasConectadas}
        onStartSync={onSyncOrders}
        isSyncing={isSyncing}
        progress={progress}
        onSyncComplete={handleSyncComplete}
      />
    </div>
  );
};

export default function VendasTiktokShop() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "1") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  const [filtroAtivo, setFiltroAtivo] = useState<FiltroStatus>("pagos");
  const [periodoAtivo, setPeriodoAtivo] = useState<FiltroPeriodo>("todos");
  const [dataInicioPersonalizada, setDataInicioPersonalizada] =
    useState<Date | null>(null);
  const [dataFimPersonalizada, setDataFimPersonalizada] = useState<Date | null>(null);
  const [filtroConta, setFiltroConta] = useState<string>("todas");
  const [filtroModalidadeEnvio, setFiltroModalidadeEnvio] =
    useState<FiltroModalidadeEnvio>("todos");
  // Padrão único, de `colunasVendas.ts`. ADS, exposição e tipo continuam no objeto
  // (o tipo exige todas as chaves) mas não são oferecidos nem desenhados para o
  // TikTok Shop — ver `colunasDaPlataforma`.
  const [colunasVisiveis, setColunasVisiveis] =
    useState<ColunasVisiveis>(COLUNAS_PADRAO);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    vendas,
    lastSyncedAt,
    isSyncing,
    handleSyncOrders,
    contasConectadas,
    progress,
    reloadVendas,
  } = useVendas(PLATAFORMA);

  const handlePeriodoPersonalizadoChange = (dataInicio: Date, dataFim: Date) => {
    setDataInicioPersonalizada(dataInicio);
    setDataFimPersonalizada(dataFim);
  };

  const filtrarPorPeriodo = (venda: any, periodo: FiltroPeriodo) => {
    if (periodo === "todos") return true;

    const dataVenda = new Date(venda.dataVenda);
    const agora = new Date();

    switch (periodo) {
      case "mes_passado": {
        const primeiroDiaMesPassado = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
        const ultimoDiaMesPassado = new Date(agora.getFullYear(), agora.getMonth(), 0);
        return dataVenda >= primeiroDiaMesPassado && dataVenda <= ultimoDiaMesPassado;
      }
      case "este_mes": {
        const primeiroDiaMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const ultimoDiaMesAtual = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
        return dataVenda >= primeiroDiaMesAtual && dataVenda <= ultimoDiaMesAtual;
      }
      case "hoje": {
        const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);
        return dataVenda >= hoje && dataVenda < amanha;
      }
      case "ontem": {
        const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
        const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        return dataVenda >= ontem && dataVenda < hoje;
      }
      case "personalizado": {
        if (dataInicioPersonalizada && dataFimPersonalizada) {
          const inicio = new Date(dataInicioPersonalizada);
          inicio.setHours(0, 0, 0, 0);
          const fim = new Date(dataFimPersonalizada);
          fim.setHours(23, 59, 59, 999);
          return dataVenda >= inicio && dataVenda <= fim;
        }
        return true;
      }
      default:
        return true;
    }
  };

  const vendasFiltradasPorPeriodo = vendas.filter((venda) =>
    filtrarPorPeriodo(venda, periodoAtivo),
  );

  const contagensVendas = {
    total: vendasFiltradasPorPeriodo.length,
    pagas: vendasFiltradasPorPeriodo.filter((v) => isStatusPago(v.status, PLATAFORMA))
      .length,
    canceladas: vendasFiltradasPorPeriodo.filter((v) =>
      isStatusCancelado(v.status, PLATAFORMA),
    ).length,
  };

  const vendasFiltradas = vendasFiltradasPorPeriodo.filter((venda) => {
    const matchStatus =
      filtroAtivo === "todos" ||
      (filtroAtivo === "pagos" && isStatusPago(venda.status, PLATAFORMA)) ||
      (filtroAtivo === "cancelados" && isStatusCancelado(venda.status, PLATAFORMA));

    const matchConta = filtroConta === "todas" || venda.conta === filtroConta;

    let matchModalidade = true;
    if (filtroModalidadeEnvio !== "todos") {
      // A TRANSPORTADORA, como na Shopee. `shippingStatus` guarda
      // `shipping_provider_name` no TikTok — ver o item 2 do docblock.
      const shipmentDetails =
        (venda as any).shipmentDetails || (venda.raw as any)?.shipmentDetails || {};
      const carrier = String(
        shipmentDetails.shipping_provider ||
          shipmentDetails.shipping_carrier ||
          venda.shippingStatus ||
          "",
      ).toLowerCase();

      if (filtroModalidadeEnvio === "me") {
        matchModalidade = carrier.includes("tiktok");
      } else if (filtroModalidadeEnvio === "full") {
        matchModalidade = carrier.includes("correio");
      } else if (filtroModalidadeEnvio === "flex") {
        matchModalidade = !carrier.includes("tiktok") && !carrier.includes("correio");
      }
    }

    return matchStatus && matchConta && matchModalidade;
  });

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
      css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W },
      ease: "power2.inOut",
    });
  }, [isSidebarCollapsed]);

  const handleMobileClose = useCallback(() => {
    setIsSidebarMobileOpen(false);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setIsSidebarCollapsed((v) => !v);
  }, []);

  const handleMobileMenu = useCallback(() => {
    setIsSidebarMobileOpen(true);
  }, []);

  const mdMlVar = "md:ml-[var(--sidebar-w,16rem)]";

  return (
    <div ref={containerRef} className="min-h-screen overflow-x-hidden bg-gray-50">
      <Sidebar
        collapsed={isSidebarCollapsed}
        mobileOpen={isSidebarMobileOpen}
        onMobileClose={handleMobileClose}
      />

      <Topbar
        collapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
        onMobileMenu={handleMobileMenu}
      />

      <main
        className={`relative z-20 pt-[var(--cz-topbar-h)] px-4 pb-4 sm:px-6 sm:pb-6 ${mdMlVar}`}
      >
        <section className="p-3 sm:p-6">
          <HeaderVendasTiktok
            vendas={vendas || []}
            lastSyncedAt={lastSyncedAt || null}
            isSyncing={isSyncing || false}
            onSyncOrders={handleSyncOrders}
            contasConectadas={contasConectadas || []}
            progress={progress}
            reloadVendas={reloadVendas}
          />

          <FiltrosVendas
            filtroAtivo={filtroAtivo}
            onFiltroChange={setFiltroAtivo}
            totalVendas={contagensVendas.total}
            vendasPagas={contagensVendas.pagas}
            vendasCanceladas={contagensVendas.canceladas}
            periodoAtivo={periodoAtivo}
            onPeriodoChange={setPeriodoAtivo}
            onPeriodoPersonalizadoChange={handlePeriodoPersonalizadoChange}
            filtroConta={filtroConta}
            onContaChange={setFiltroConta}
            contasDisponiveis={contasConectadas.map((conta: any) => ({
              id: conta.id,
              nickname: conta.nickname || conta.shop_name || conta.shop_id || conta.id,
            }))}
            platform={PLATAFORMA}
            filtroModalidadeEnvio={filtroModalidadeEnvio}
            onModalidadeEnvioChange={setFiltroModalidadeEnvio}
            colunasVisiveis={colunasVisiveis}
            onColunasChange={setColunasVisiveis}
          />

          <TabelaVendas
            vendas={vendasFiltradas}
            platform={PLATAFORMA}
            colunasVisiveis={colunasVisiveis}
          />
        </section>
      </main>
    </div>
  );
}
