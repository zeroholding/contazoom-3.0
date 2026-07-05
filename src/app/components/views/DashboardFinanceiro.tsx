"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import gsap from "gsap";
import Sidebar from "../views/ui/Sidebar";
import Topbar from "../views/ui/Topbar";
import HeaderFinanceiro from "../views/ui/HeaderFinanceiro";
import FinanceiroStats from "../views/ui/FinanceiroStats";
import FinanceiroCategoriasArea from "../views/ui/FinanceiroCategoriasArea";
import { FiltroPeriodo } from "../views/ui/FiltrosDashboard";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function DashboardFinanceiro() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);

  // Sync with localStorage after hydration
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "1") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  // Filtros
  const [mesesSelecionados, setMesesSelecionados] = useState<Set<string>>(() => {
    // Inicializar com os ÚLTIMOS 12 MESES (padrão consistente com DRE)
    const hoje = new Date();
    const meses = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ano = data.getFullYear();
      const mes = data.getMonth() + 1; // 1..12
      const key = `${ano}-${String(mes).padStart(2, "0")}`;
      meses.add(key);
    }
    return meses;
  });
  const [periodoAtivo, setPeriodoAtivo] = useState<FiltroPeriodo>("personalizado");
  const [dataInicioPersonalizada, setDataInicioPersonalizada] = useState<Date | null>(null);
  const [dataFimPersonalizada, setDataFimPersonalizada] = useState<Date | null>(null);
  const [portadorId, setPortadorId] = useState<string | null>(null);
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<Set<string>>(new Set());
  const [tipoVisualizacao, setTipoVisualizacao] = useState<'caixa' | 'competencia'>('caixa');
  
  // Novos filtros de período separados
  const [filtroPeriodoPagamento, setFiltroPeriodoPagamento] = useState<FiltroPeriodo>("todos");
  const [filtroDataPagInicio, setFiltroDataPagInicio] = useState<Date | null>(null);
  const [filtroDataPagFim, setFiltroDataPagFim] = useState<Date | null>(null);
  const [filtroPeriodoCompetencia, setFiltroPeriodoCompetencia] = useState<FiltroPeriodo>("todos");
  const [filtroDataCompInicio, setFiltroDataCompInicio] = useState<Date | null>(null);
  const [filtroDataCompFim, setFiltroDataCompFim] = useState<Date | null>(null);
  
  // Alerta de custo de SKU
  const [pendingSkusCount, setPendingSkusCount] = useState<number>(0);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/sku/stats')
      .then(res => res.json())
      .then(data => {
        const count = Number(data.skusSemCusto || 0);
        setPendingSkusCount(count);
      })
      .catch(() => {});
  }, [refreshKey]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasInitialSet = useRef(false);

  useIsoLayout(() => {
    if (hasInitialSet.current) return;
    const el = containerRef.current;
    if (!el) return;
    hasInitialSet.current = true;
    gsap.set(el, { css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W } });
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

  // Calcular datas baseado nos meses selecionados
  useEffect(() => {
    if (mesesSelecionados.size === 0) {
      setDataInicioPersonalizada(null);
      setDataFimPersonalizada(null);
      return;
    }

    const mesesOrdenados = Array.from(mesesSelecionados).sort();
    const primeiroMes = mesesOrdenados[0];
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1];

    const [ano1, mes1] = primeiroMes.split('-').map(Number);
    const [ano2, mes2] = ultimoMes.split('-').map(Number);

    const dataInicio = new Date(ano1, mes1 - 1, 1);
    const dataFim = new Date(ano2, mes2, 0, 0, 0, 0, 0);

    setDataInicioPersonalizada(dataInicio);
    setDataFimPersonalizada(dataFim);
    setPeriodoAtivo("personalizado");
    setRefreshKey((v) => v + 1);
  }, [mesesSelecionados]);

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

      <div className={`fixed top-16 bottom-0 left-0 right-0 ${mdLeftVar} z-10 bg-[#F3F3F3]`}>
        <div className="h-full w-full rounded-tl-none md:rounded-tl-2xl border border-gray-200 bg-white" />
      </div>

      <main className={`relative z-20 pt-16 px-3 pb-3 sm:px-6 sm:pb-6 ${mdMlVar}`}>
        <section className="p-3 sm:p-6">
          {pendingSkusCount > 0 && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm animate-in fade-in slide-in-from-top-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-800">
                    ⚠️ Alerta Crítico na DRE (Lucratividade Mascarada)
                  </h3>
                  <p className="mt-1 text-sm text-red-700">
                    Você possui <strong>{pendingSkusCount} SKU(s)</strong> vinculados a vendas recentes que não possuem o custo unitário cadastrado.
                    <br />O CMV (Custo das Mercadorias Vendidas) e o Lucro Líquido exibidos aqui estão incorretos, pois faltam custos de produtos.
                  </p>
                  <div className="mt-3">
                    <a
                      href="/sku"
                      className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    >
                      Cadastrar Custos Agora
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          <HeaderFinanceiro
            mesesSelecionados={mesesSelecionados}
            onMesesChange={setMesesSelecionados}
            portadorId={portadorId}
            onPortadorChange={(id) => { setPortadorId(id); setRefreshKey((v) => v + 1); }}
            categoriasSelecionadas={categoriasSelecionadas}
            onCategoriasSelecionadasChange={(ids) => { setCategoriasSelecionadas(ids); setRefreshKey((v) => v + 1); }}
            tipoVisualizacao={tipoVisualizacao}
            onTipoVisualizacaoChange={(tipo) => { setTipoVisualizacao(tipo); setRefreshKey((v) => v + 1); }}
            filtroPeriodoPagamento={filtroPeriodoPagamento}
            onFiltroPeriodoPagamentoChange={(periodo) => { setFiltroPeriodoPagamento(periodo); setRefreshKey((v) => v + 1); }}
            onFiltroPagamentoPersonalizadoChange={(inicio, fim) => {
              setFiltroDataPagInicio(inicio);
              setFiltroDataPagFim(fim);
              setRefreshKey((v) => v + 1);
            }}
            filtroPeriodoCompetencia={filtroPeriodoCompetencia}
            onFiltroPeriodoCompetenciaChange={(periodo) => { setFiltroPeriodoCompetencia(periodo); setRefreshKey((v) => v + 1); }}
            onFiltroCompetenciaPersonalizadoChange={(inicio, fim) => {
              setFiltroDataCompInicio(inicio);
              setFiltroDataCompFim(fim);
              setRefreshKey((v) => v + 1);
            }}
          />

          <FinanceiroStats
            periodoAtivo={periodoAtivo}
            dataInicioPersonalizada={dataInicioPersonalizada}
            dataFimPersonalizada={dataFimPersonalizada}
            portadorId={portadorId}
            categoriasSelecionadas={categoriasSelecionadas}
            tipoVisualizacao={tipoVisualizacao}
            filtroPeriodoPagamento={filtroPeriodoPagamento}
            filtroDataPagInicio={filtroDataPagInicio}
            filtroDataPagFim={filtroDataPagFim}
            filtroPeriodoCompetencia={filtroPeriodoCompetencia}
            filtroDataCompInicio={filtroDataCompInicio}
            filtroDataCompFim={filtroDataCompFim}
            refreshKey={refreshKey}
          />

          <div className="mt-8">
            <FinanceiroCategoriasArea
              periodoAtivo={periodoAtivo}
              dataInicioPersonalizada={dataInicioPersonalizada}
              dataFimPersonalizada={dataFimPersonalizada}
              portadorId={portadorId}
              categoriasSelecionadas={categoriasSelecionadas}
              tipoVisualizacao={tipoVisualizacao}
              filtroPeriodoPagamento={filtroPeriodoPagamento}
              filtroDataPagInicio={filtroDataPagInicio}
              filtroDataPagFim={filtroDataPagFim}
              filtroPeriodoCompetencia={filtroPeriodoCompetencia}
              filtroDataCompInicio={filtroDataCompInicio}
              filtroDataCompFim={filtroDataCompFim}
              refreshKey={refreshKey}
              tipo="despesas"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
