"use client";

import { useState } from "react";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";
import DatePicker from "react-datepicker";
import { Search, X } from "lucide-react";
import { useCelular } from "@/hooks/useMediaQuery";
import FiltrosSheet, { CampoDaFolha, GrupoDePilulas } from "@/components/ui/FiltrosSheet";

export type FiltroStatus = "todos" | "pendente" | "pago" | "vencido";
export type FiltroPeriodo = "todos" | "mes_passado" | "este_mes" | "hoje" | "ontem" | "personalizado";
export type FiltroOrigem = "todas" | "MANUAL" | "BLING" | "EXCEL";

interface FiltrosFinancasProps {
  tipo: "contas_pagar" | "contas_receber";
  periodoAtivo?: FiltroPeriodo;
  onPeriodoChange?: (periodo: FiltroPeriodo) => void;
  onPeriodoPersonalizadoChange?: (dataInicio: Date, dataFim: Date) => void;
  periodoCompetenciaAtivo?: FiltroPeriodo;
  onPeriodoCompetenciaChange?: (periodo: FiltroPeriodo) => void;
  onPeriodoCompetenciaPersonalizadoChange?: (dataInicio: Date, dataFim: Date) => void;
  categoriasSelecionadas?: Set<string>;
  onCategoriasSelecionadasChange?: (categorias: Set<string>) => void;
  categoriasDisponiveis?: Array<{ id: string; nome: string; descricao?: string }>;
  filtroStatus?: FiltroStatus;
  onStatusChange?: (status: FiltroStatus) => void;
  filtroOrigem?: FiltroOrigem;
  onOrigemChange?: (origem: FiltroOrigem) => void;
  /** Busca por texto. Só o celular mostra o campo; sem estes dois, nada muda. */
  busca?: string;
  onBuscaChange?: (busca: string) => void;
}

function FiltrosFinancasDesktop({
  tipo,
  periodoAtivo = "todos",
  onPeriodoChange,
  onPeriodoPersonalizadoChange,
  periodoCompetenciaAtivo = "todos",
  onPeriodoCompetenciaChange,
  onPeriodoCompetenciaPersonalizadoChange,
  categoriasSelecionadas = new Set(),
  onCategoriasSelecionadasChange,
  categoriasDisponiveis = [],
  filtroStatus = "todos",
  onStatusChange,
  filtroOrigem = "todas",
  onOrigemChange,
}: FiltrosFinancasProps) {
  const [showPeriodoDropdown, setShowPeriodoDropdown] = useState(false);
  const [showPeriodoCompetenciaDropdown, setShowPeriodoCompetenciaDropdown] = useState(false);
  const [showCategoriaDropdown, setShowCategoriaDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showOrigemDropdown, setShowOrigemDropdown] = useState(false);
  const [showCalendarioPersonalizado, setShowCalendarioPersonalizado] = useState(false);
  const [showCalendarioPersonalizadoComp, setShowCalendarioPersonalizadoComp] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [dataInicio, setDataInicio] = useState<Date | null>(null);
  const [dataFim, setDataFim] = useState<Date | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [dataCompInicio, setDataCompInicio] = useState<Date | null>(null);
  const [dataCompFim, setDataCompFim] = useState<Date | null>(null);
  const [startDateComp, setStartDateComp] = useState<Date | null>(null);
  const [endDateComp, setEndDateComp] = useState<Date | null>(null);

  // Hooks para dropdowns
  const periodoDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showPeriodoDropdown,
    onClose: () => setShowPeriodoDropdown(false),
    preferredPosition: 'bottom-right',
    offset: 8,
    minDistanceFromEdge: 16
  });

  const periodoCompetenciaDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showPeriodoCompetenciaDropdown,
    onClose: () => setShowPeriodoCompetenciaDropdown(false),
    preferredPosition: 'bottom-right',
    offset: 8,
    minDistanceFromEdge: 16
  });

  const categoriaDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showCategoriaDropdown,
    onClose: () => setShowCategoriaDropdown(false),
    preferredPosition: 'bottom-right',
    offset: 8,
    minDistanceFromEdge: 16
  });

  const statusDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showStatusDropdown,
    onClose: () => setShowStatusDropdown(false),
    preferredPosition: 'bottom-right',
    offset: 8,
    minDistanceFromEdge: 16
  });

  const origemDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showOrigemDropdown,
    onClose: () => setShowOrigemDropdown(false),
    preferredPosition: 'bottom-right',
    offset: 8,
    minDistanceFromEdge: 16
  });

  const handlePeriodoClick = (periodo: FiltroPeriodo) => {
    if (periodo === "personalizado") {
      setShowCalendarioPersonalizado(true);
      return;
    }
    
    if (onPeriodoChange) {
      onPeriodoChange(periodo);
    }
    setShowPeriodoDropdown(false);
    setShowCalendarioPersonalizado(false);
  };

  const handleConfirmarPersonalizado = () => {
    if (startDate && endDate && onPeriodoPersonalizadoChange) {
      onPeriodoPersonalizadoChange(startDate, endDate);
      setDataInicio(startDate);
      setDataFim(endDate);
    }
    if (onPeriodoChange) {
      onPeriodoChange("personalizado");
    }
    setShowPeriodoDropdown(false);
    setShowCalendarioPersonalizado(false);
  };

  const handleCancelarPersonalizado = () => {
    setShowCalendarioPersonalizado(false);
    setStartDate(null);
    setEndDate(null);
  };

  // Handlers Competência
  const handlePeriodoCompetenciaClick = (periodo: FiltroPeriodo) => {
    if (periodo === "personalizado") {
      setShowCalendarioPersonalizadoComp(true);
      return;
    }
    if (onPeriodoCompetenciaChange) onPeriodoCompetenciaChange(periodo);
    setShowPeriodoCompetenciaDropdown(false);
    setShowCalendarioPersonalizadoComp(false);
  };

  const handleConfirmarPersonalizadoCompetencia = () => {
    if (startDateComp && endDateComp && onPeriodoCompetenciaPersonalizadoChange) {
      onPeriodoCompetenciaPersonalizadoChange(startDateComp, endDateComp);
      setDataCompInicio(startDateComp);
      setDataCompFim(endDateComp);
    }
    if (onPeriodoCompetenciaChange) onPeriodoCompetenciaChange("personalizado");
    setShowPeriodoCompetenciaDropdown(false);
    setShowCalendarioPersonalizadoComp(false);
  };

  const handleCancelarPersonalizadoCompetencia = () => {
    setShowCalendarioPersonalizadoComp(false);
    setStartDateComp(null);
    setEndDateComp(null);
  };

  const getPeriodoLabel = (periodo: FiltroPeriodo) => {
    switch (periodo) {
      case "todos": return "Todos os Períodos";
      case "hoje": return "Hoje";
      case "ontem": return "Ontem";
      case "este_mes": return "Este mês";
      case "mes_passado": return "Mês passado";
      case "personalizado": {
        if (dataInicio && dataFim) {
          const formatDate = (date: Date) => {
            return date.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            });
          };
          return `${formatDate(dataInicio)} - ${formatDate(dataFim)}`;
        }
        return "Personalizado";
      }
      default: return "Todos os Períodos";
    }
  };

  const getPeriodoCompetenciaLabel = (periodo: FiltroPeriodo) => {
    switch (periodo) {
      case "todos": return "Todos os Períodos";
      case "hoje": return "Hoje";
      case "ontem": return "Ontem";
      case "este_mes": return "Este mês";
      case "mes_passado": return "Mês passado";
      case "personalizado": {
        if (dataCompInicio && dataCompFim) {
          const formatDate = (date: Date) => {
            return date.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            });
          };
          return `${formatDate(dataCompInicio)} - ${formatDate(dataCompFim)}`;
        }
        return "Personalizado";
      }
      default: return "Todos os Períodos";
    }
  };

  const getCategoriaLabel = () => {
    const total = categoriasDisponiveis.length;
    const selecionadas = categoriasSelecionadas.size;
    return `Categorias (${selecionadas}/${total})`;
  };

  const toggleCategoria = (id: string) => {
    const next = new Set(categoriasSelecionadas);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (onCategoriasSelecionadasChange) onCategoriasSelecionadasChange(next);
  };

  const selecionarTodasCategorias = () => {
    if (onCategoriasSelecionadasChange) {
      onCategoriasSelecionadasChange(new Set(categoriasDisponiveis.map((c) => c.id)));
    }
  };

  const limparCategorias = () => {
    if (onCategoriasSelecionadasChange) onCategoriasSelecionadasChange(new Set());
  };

  const getStatusLabel = (status: FiltroStatus) => {
    switch (status) {
      case "todos": return "Todos os Status";
      case "pendente": return "Pendente";
      case "pago": return tipo === "contas_receber" ? "Recebido" : "Pago";
      case "vencido": return "Vencido";
      default: return "Todos os Status";
    }
  };

  const getOrigemLabel = (origem: FiltroOrigem) => {
    switch (origem) {
      case "todas": return "Todas as Origens";
      case "MANUAL": return "Manual";
      case "BLING": return "Bling";
      case "EXCEL": return "Excel";
      default: return "Todas as Origens";
    }
  };

  const limparFiltros = () => {
    if (onPeriodoChange) onPeriodoChange("todos");
    if (onPeriodoCompetenciaChange) onPeriodoCompetenciaChange("todos");
    limparCategorias();
    if (onStatusChange) onStatusChange("todos");
    if (onOrigemChange) onOrigemChange("todas");
    setDataInicio(null);
    setDataFim(null);
    setStartDate(null);
    setEndDate(null);
    setDataCompInicio(null);
    setDataCompFim(null);
    setStartDateComp(null);
    setEndDateComp(null);
  };

  const filtrosAtivosCount = [
    periodoAtivo !== "todos",
    periodoCompetenciaAtivo !== "todos",
    categoriasSelecionadas.size > 0,
    filtroStatus !== "todos",
    filtroOrigem !== "todas",
  ].filter(Boolean).length;
  const temFiltrosAtivos = filtrosAtivosCount > 0;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setIsMobileExpanded((value) => !value)}
          aria-expanded={isMobileExpanded}
          aria-controls="filtros-financas-mobile"
          className="inline-flex min-h-11 flex-1 items-center justify-between gap-3 rounded-cz border border-hairline-forte bg-superficie px-3 text-sm font-semibold text-tinta shadow-cz-1 transition-colors hover:bg-fundo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
        >
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4 text-tinta-suave" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 10h12M10 16h4" />
            </svg>
            Filtros
            {filtrosAtivosCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-marca px-1.5 text-[11px] text-white">
                {filtrosAtivosCount}
              </span>
            )}
          </span>
          <svg className={`h-4 w-4 transition-transform ${isMobileExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      <div
        id="filtros-financas-mobile"
        className={`${isMobileExpanded ? "mt-3 flex" : "hidden"} flex-col gap-3 rounded-cartao border border-hairline bg-superficie p-3 shadow-cz-1 md:mt-0 md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Dropdown de Período */}
          <div className="relative w-full sm:w-auto">
            <button
              ref={periodoDropdown.triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={showPeriodoDropdown}
              onClick={() => setShowPeriodoDropdown(!showPeriodoDropdown)}
              className={`inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-cz border px-3 text-xs font-semibold transition-all duration-200 sm:w-auto ${
                showPeriodoDropdown || periodoAtivo !== "todos"
                  ? "border-marca-borda bg-marca-suave text-marca-forte"
                  : "border-hairline-forte bg-superficie text-tinta-suave hover:border-marca-borda hover:bg-marca-suave hover:text-tinta"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Pagamento: {getPeriodoLabel(periodoAtivo)}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showPeriodoDropdown ? 'rotate-180' : ''}`}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>

            {periodoDropdown.isVisible && (
              <div 
                ref={periodoDropdown.dropdownRef}
                className={`smart-dropdown w-64 ${periodoDropdown.isOpen ? 'dropdown-enter' : 'dropdown-exit'}`}
                style={periodoDropdown.position}
              >
                {!showCalendarioPersonalizado ? (
                  <div className="p-2">
                    <div className="space-y-1">
                      {[
                        { id: "todos" as FiltroPeriodo, label: "Todos os Períodos" },
                        { id: "hoje" as FiltroPeriodo, label: "Hoje" },
                        { id: "ontem" as FiltroPeriodo, label: "Ontem" },
                        { id: "este_mes" as FiltroPeriodo, label: "Este mês" },
                        { id: "mes_passado" as FiltroPeriodo, label: "Mês passado" },
                        { id: "personalizado" as FiltroPeriodo, label: "Personalizado..." },
                      ].map((opcao) => (
                        <button
                          key={opcao.id}
                          onClick={() => handlePeriodoClick(opcao.id)}
                          className={`min-h-10 w-full rounded-cz px-3 py-2 text-left text-sm transition-colors ${
                            periodoAtivo === opcao.id 
                              ? "bg-marca-suave text-marca-forte font-semibold" 
                              : "text-tinta-suave hover:bg-fundo hover:text-tinta"
                          }`}
                        >
                          {opcao.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <h4 className="mb-3 text-sm font-semibold text-tinta">Selecione o Período</h4>
                    <DatePicker
                      selected={startDate}
                      onChange={(dates: [Date | null, Date | null]) => {
                        const [start, end] = dates;
                        setStartDate(start);
                        setEndDate(end);
                      }}
                      startDate={startDate}
                      endDate={endDate}
                      selectsRange
                      inline
                      locale="pt-BR"
                      dateFormat="dd/MM/yyyy"
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleCancelarPersonalizado}
                        className="min-h-11 flex-1 rounded-cz border border-hairline-forte bg-superficie px-3 py-2 text-xs font-semibold text-tinta transition-colors hover:bg-fundo"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleConfirmarPersonalizado}
                        disabled={!startDate || !endDate}
                        className="min-h-11 flex-1 rounded-cz bg-tinta px-3 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Período Competência */}
          <div className="relative w-full sm:w-auto">
            <button
              ref={periodoCompetenciaDropdown.triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={showPeriodoCompetenciaDropdown}
              onClick={() => setShowPeriodoCompetenciaDropdown(!showPeriodoCompetenciaDropdown)}
              className={`inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-cz border px-3 text-xs font-semibold transition-all duration-200 sm:w-auto ${
                showPeriodoCompetenciaDropdown || periodoCompetenciaAtivo !== "todos"
                  ? "border-marca-borda bg-marca-suave text-marca-forte"
                  : "border-hairline-forte bg-superficie text-tinta-suave hover:border-marca-borda hover:bg-marca-suave hover:text-tinta"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Competência: {getPeriodoCompetenciaLabel(periodoCompetenciaAtivo || "todos")}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showPeriodoCompetenciaDropdown ? 'rotate-180' : ''}`}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>

            {periodoCompetenciaDropdown.isVisible && (
              <div 
                ref={periodoCompetenciaDropdown.dropdownRef}
                className={`smart-dropdown w-64 ${periodoCompetenciaDropdown.isOpen ? 'dropdown-enter' : 'dropdown-exit'}`}
                style={periodoCompetenciaDropdown.position}
              >
                {!showCalendarioPersonalizadoComp ? (
                  <div className="p-2">
                    <div className="space-y-1">
                      {[
                        { id: "todos" as FiltroPeriodo, label: "Todos os Períodos" },
                        { id: "hoje" as FiltroPeriodo, label: "Hoje" },
                        { id: "ontem" as FiltroPeriodo, label: "Ontem" },
                        { id: "este_mes" as FiltroPeriodo, label: "Este mês" },
                        { id: "mes_passado" as FiltroPeriodo, label: "Mês passado" },
                        { id: "personalizado" as FiltroPeriodo, label: "Personalizado..." },
                      ].map((opcao) => (
                        <button
                          key={opcao.id}
                          onClick={() => handlePeriodoCompetenciaClick(opcao.id)}
                          className={`min-h-10 w-full rounded-cz px-3 py-2 text-left text-sm transition-colors ${
                            periodoCompetenciaAtivo === opcao.id 
                              ? "bg-marca-suave text-marca-forte font-semibold" 
                              : "text-tinta-suave hover:bg-fundo hover:text-tinta"
                          }`}
                        >
                          {opcao.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <h4 className="mb-3 text-sm font-semibold text-tinta">Período de Competência</h4>
                    <DatePicker
                      selected={startDateComp}
                      onChange={(dates: [Date | null, Date | null]) => {
                        const [start, end] = dates;
                        setStartDateComp(start);
                        setEndDateComp(end);
                      }}
                      startDate={startDateComp}
                      endDate={endDateComp}
                      selectsRange
                      inline
                      locale="pt-BR"
                      dateFormat="dd/MM/yyyy"
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleCancelarPersonalizadoCompetencia}
                        className="min-h-11 flex-1 rounded-cz border border-hairline-forte bg-superficie px-3 py-2 text-xs font-semibold text-tinta transition-colors hover:bg-fundo"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleConfirmarPersonalizadoCompetencia}
                        disabled={!startDateComp || !endDateComp}
                        className="min-h-11 flex-1 rounded-cz bg-tinta px-3 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dropdown de Categoria */}
          <div className="relative w-full sm:w-auto">
            <button
              ref={categoriaDropdown.triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={showCategoriaDropdown}
              onClick={() => setShowCategoriaDropdown(!showCategoriaDropdown)}
              className={`inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-cz border px-3 text-xs font-semibold transition-all duration-200 sm:w-auto ${
                showCategoriaDropdown || categoriasSelecionadas.size > 0
                  ? "border-marca-borda bg-marca-suave text-marca-forte"
                  : "border-hairline-forte bg-superficie text-tinta-suave hover:border-marca-borda hover:bg-marca-suave hover:text-tinta"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20l9-16H3z" />
              </svg>
              <span>{getCategoriaLabel()}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showCategoriaDropdown ? 'rotate-180' : ''}`}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>

            {categoriaDropdown.isVisible && (
              <div 
                ref={categoriaDropdown.dropdownRef}
                className={`smart-dropdown w-80 ${categoriaDropdown.isOpen ? 'dropdown-enter' : 'dropdown-exit'}`}
                style={categoriaDropdown.position}
              >
                <div className="p-2">
                  <div className="flex items-center justify-between px-2 pb-2">
                    <button
                      onClick={() => { selecionarTodasCategorias(); }}
                      className="min-h-10 rounded-cz px-2 text-xs font-semibold text-tinta hover:bg-fundo"
                    >
                      Selecionar todas
                    </button>
                    <button
                      onClick={() => { limparCategorias(); }}
                      className="min-h-10 rounded-cz px-2 text-xs font-semibold text-tinta-suave hover:bg-fundo hover:text-tinta"
                    >
                      Limpar
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto mt-1 space-y-1">
                    {categoriasDisponiveis.length === 0 ? (
                      <div className="text-xs text-gray-600 px-3 py-2">Nenhuma categoria disponível</div>
                    ) : (
                      categoriasDisponiveis.map((categoria) => (
                        <label
                          key={categoria.id}
                          className="flex min-h-10 cursor-pointer items-center gap-2 rounded-cz px-3 py-1.5 text-sm text-tinta hover:bg-fundo"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-hairline-forte accent-marca"
                            checked={categoriasSelecionadas.has(categoria.id)}
                            onChange={() => toggleCategoria(categoria.id)}
                          />
                          <span className="text-tinta">{categoria.descricao || categoria.nome}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dropdown de Status */}
          <div className="relative w-full sm:w-auto">
            <button
              ref={statusDropdown.triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={showStatusDropdown}
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className={`inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-cz border px-3 text-xs font-semibold transition-all duration-200 sm:w-auto ${
                showStatusDropdown || filtroStatus !== "todos"
                  ? "border-marca-borda bg-marca-suave text-marca-forte"
                  : "border-hairline-forte bg-superficie text-tinta-suave hover:border-marca-borda hover:bg-marca-suave hover:text-tinta"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{getStatusLabel(filtroStatus)}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showStatusDropdown ? 'rotate-180' : ''}`}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>

            {statusDropdown.isVisible && (
              <div 
                ref={statusDropdown.dropdownRef}
                className={`smart-dropdown w-48 ${statusDropdown.isOpen ? 'dropdown-enter' : 'dropdown-exit'}`}
                style={statusDropdown.position}
              >
                <div className="p-2">
                  <div className="space-y-1">
                    {[
                      { id: "todos" as FiltroStatus, label: "Todos os Status" },
                      { id: "pendente" as FiltroStatus, label: "Pendente" },
                      { id: "pago" as FiltroStatus, label: tipo === "contas_receber" ? "Recebido" : "Pago" },
                      { id: "vencido" as FiltroStatus, label: "Vencido" },
                    ].map((opcao) => (
                      <button
                        key={opcao.id}
                        onClick={() => {
                          if (onStatusChange) onStatusChange(opcao.id);
                          setShowStatusDropdown(false);
                        }}
                        className={`min-h-10 w-full rounded-cz px-3 py-2 text-left text-sm transition-colors ${
                          filtroStatus === opcao.id 
                            ? "bg-marca-suave text-marca-forte font-semibold" 
                            : "text-tinta-suave hover:bg-fundo hover:text-tinta"
                        }`}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dropdown de Origem */}
          <div className="relative w-full sm:w-auto">
            <button
              ref={origemDropdown.triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={showOrigemDropdown}
              onClick={() => setShowOrigemDropdown(!showOrigemDropdown)}
              className={`inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-cz border px-3 text-xs font-semibold transition-all duration-200 sm:w-auto ${
                showOrigemDropdown || filtroOrigem !== "todas"
                  ? "border-marca-borda bg-marca-suave text-marca-forte"
                  : "border-hairline-forte bg-superficie text-tinta-suave hover:border-marca-borda hover:bg-marca-suave hover:text-tinta"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span>{getOrigemLabel(filtroOrigem)}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showOrigemDropdown ? 'rotate-180' : ''}`}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>

            {origemDropdown.isVisible && (
              <div 
                ref={origemDropdown.dropdownRef}
                className={`smart-dropdown w-48 ${origemDropdown.isOpen ? 'dropdown-enter' : 'dropdown-exit'}`}
                style={origemDropdown.position}
              >
                <div className="p-2">
                  <div className="space-y-1">
                    {[
                      { id: "todas" as FiltroOrigem, label: "Todas as Origens" },
                      { id: "MANUAL" as FiltroOrigem, label: "Manual" },
                      { id: "BLING" as FiltroOrigem, label: "Bling" },
                      { id: "EXCEL" as FiltroOrigem, label: "Excel" },
                    ].map((opcao) => (
                      <button
                        key={opcao.id}
                        onClick={() => {
                          if (onOrigemChange) onOrigemChange(opcao.id);
                          setShowOrigemDropdown(false);
                        }}
                        className={`min-h-10 w-full rounded-cz px-3 py-2 text-left text-sm transition-colors ${
                          filtroOrigem === opcao.id 
                            ? "bg-marca-suave text-marca-forte font-semibold" 
                            : "text-tinta-suave hover:bg-fundo hover:text-tinta"
                        }`}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Botão Limpar Filtros */}
        {temFiltrosAtivos && (
          <button
            type="button"
            onClick={limparFiltros}
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-cz px-3 text-xs font-semibold text-tinta-suave transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
          >
            Limpar {filtrosAtivosCount} {filtrosAtivosCount === 1 ? "filtro" : "filtros"}
          </button>
        )}
      </div>
    </div>
  );
}


/* ===========================================================================
 * Celular (<768px)
 *
 * O desktop (`FiltrosFinancasDesktop`, acima) fica exatamente como era: chips com
 * dropdown numa linha. No celular isso virava um acordeão com cinco botões empilhados,
 * cada um abrindo um dropdown FLUTUANTE por cima do outro. Aqui:
 *   - sempre à vista: a busca, o período de pagamento (pastilhas que rolam) e o botão
 *     "Filtros (n)";
 *   - dentro da folha: pagamento (com calendário em linha), competência, categorias,
 *     status e origem como pastilhas, com "Limpar" e a contagem do que está ligado.
 * ========================================================================= */

type Intervalo = [Date | null, Date | null];

const PERIODOS_PILULAS: Array<{ id: FiltroPeriodo; rotulo: string }> = [
  { id: "todos", rotulo: "Todos" },
  { id: "hoje", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "este_mes", rotulo: "Este mês" },
  { id: "mes_passado", rotulo: "Mês passado" },
];

const formatarDiaCurto = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** "Personalizado…" ou, já confirmado, "01/04/2026 – 15/04/2026". */
function rotuloPersonalizado(ativo: FiltroPeriodo, intervalo: Intervalo) {
  const [inicio, fim] = intervalo;
  return ativo === "personalizado" && inicio && fim
    ? `${formatarDiaCurto(inicio)} – ${formatarDiaCurto(fim)}`
    : "Personalizado…";
}

/**
 * Um filtro de período dentro da folha: pastilhas + calendário EM LINHA para o intervalo
 * personalizado. No desktop o calendário abre num dropdown; dentro de uma folha isso seria
 * uma janela flutuante sobre outra janela.
 */
function PeriodoNaFolha({
  rotulo,
  ativo,
  intervalo,
  onEscolher,
  onConfirmar,
}: {
  rotulo: string;
  ativo: FiltroPeriodo;
  intervalo: Intervalo;
  onEscolher: (periodo: FiltroPeriodo) => void;
  onConfirmar: (inicio: Date, fim: Date) => void;
}) {
  const [calendario, setCalendario] = useState(false);
  const [rascunho, setRascunho] = useState<Intervalo>([null, null]);

  const opcoes = [
    ...PERIODOS_PILULAS,
    { id: "personalizado" as FiltroPeriodo, rotulo: rotuloPersonalizado(ativo, intervalo) },
  ];

  return (
    <CampoDaFolha rotulo={rotulo}>
      <GrupoDePilulas
        rotulo={rotulo}
        opcoes={opcoes}
        estaAtiva={(id) => ativo === id}
        onEscolher={(id) => {
          if (id === "personalizado") {
            setCalendario(true);
            return;
          }
          setCalendario(false);
          onEscolher(id as FiltroPeriodo);
        }}
      />
      {calendario && (
        <div className="mt-3 rounded-cz border border-hairline bg-fundo p-3">
          <div className="flex justify-center">
            <DatePicker
              selected={rascunho[0]}
              onChange={(dates: [Date | null, Date | null]) => setRascunho(dates)}
              startDate={rascunho[0]}
              endDate={rascunho[1]}
              selectsRange
              inline
              locale="pt-BR"
              dateFormat="dd/MM/yyyy"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCalendario(false);
                setRascunho([null, null]);
              }}
              className="h-11 flex-1 rounded-cz border border-hairline-forte bg-superficie text-[14px] font-semibold text-tinta active:bg-fundo"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!rascunho[0] || !rascunho[1]}
              onClick={() => {
                if (rascunho[0] && rascunho[1]) onConfirmar(rascunho[0], rascunho[1]);
                setCalendario(false);
              }}
              className="h-11 flex-1 rounded-cz bg-marca text-[14px] font-semibold text-white active:bg-marca-forte disabled:opacity-40"
            >
              Aplicar período
            </button>
          </div>
        </div>
      )}
    </CampoDaFolha>
  );
}

function FiltrosFinancasCelular({
  tipo,
  periodoAtivo = "todos",
  onPeriodoChange,
  onPeriodoPersonalizadoChange,
  periodoCompetenciaAtivo = "todos",
  onPeriodoCompetenciaChange,
  onPeriodoCompetenciaPersonalizadoChange,
  categoriasSelecionadas = new Set(),
  onCategoriasSelecionadasChange,
  categoriasDisponiveis = [],
  filtroStatus = "todos",
  onStatusChange,
  filtroOrigem = "todas",
  onOrigemChange,
  busca = "",
  onBuscaChange,
}: FiltrosFinancasProps) {
  // O pai recebe o intervalo só por callback, e o rótulo "01/04 – 15/04" precisa dele: guarda aqui.
  const [intervaloPagamento, setIntervaloPagamento] = useState<Intervalo>([null, null]);
  const [intervaloCompetencia, setIntervaloCompetencia] = useState<Intervalo>([null, null]);

  const ativos = [
    periodoAtivo !== "todos",
    periodoCompetenciaAtivo !== "todos",
    categoriasSelecionadas.size > 0,
    filtroStatus !== "todos",
    filtroOrigem !== "todas",
  ].filter(Boolean).length;

  const limpar = () => {
    onPeriodoChange?.("todos");
    onPeriodoCompetenciaChange?.("todos");
    onCategoriasSelecionadasChange?.(new Set());
    onStatusChange?.("todos");
    onOrigemChange?.("todas");
    setIntervaloPagamento([null, null]);
    setIntervaloCompetencia([null, null]);
  };

  const alternarCategoria = (id: string) => {
    const proximas = new Set(categoriasSelecionadas);
    if (proximas.has(id)) proximas.delete(id);
    else proximas.add(id);
    onCategoriasSelecionadasChange?.(proximas);
  };

  const opcoesStatus = [
    { id: "todos", rotulo: "Todos" },
    { id: "pendente", rotulo: "Pendente" },
    { id: "pago", rotulo: tipo === "contas_receber" ? "Recebido" : "Pago" },
    { id: "vencido", rotulo: "Vencido" },
  ];
  const opcoesOrigem = [
    { id: "todas", rotulo: "Todas" },
    { id: "MANUAL", rotulo: "Manual" },
    { id: "BLING", rotulo: "Bling" },
    { id: "EXCEL", rotulo: "Excel" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-suave" aria-hidden="true" />
          {/* Sem o atributo `type` de propósito: o CSS global crava altura, borda e padding em
              input[type=text|search]; um <input> sem type é texto e escapa desses seletores. */}
          <input
            value={busca}
            onChange={(e) => onBuscaChange?.(e.target.value)}
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Buscar nas contas"
            placeholder="Buscar contas"
            className="h-11 w-full rounded-cz border border-hairline-forte bg-superficie pl-9 pr-11 text-[16px] text-tinta placeholder:text-tinta-suave focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/30"
          />
          {busca && (
            <button
              type="button"
              onClick={() => onBuscaChange?.("")}
              aria-label="Limpar busca"
              className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-tinta-suave"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <FiltrosSheet titulo="Filtros" ativos={ativos} onLimpar={limpar} classeBotao="shrink-0">
          <PeriodoNaFolha
            rotulo="Pagamento"
            ativo={periodoAtivo}
            intervalo={intervaloPagamento}
            onEscolher={(p) => onPeriodoChange?.(p)}
            onConfirmar={(a, b) => {
              onPeriodoPersonalizadoChange?.(a, b);
              onPeriodoChange?.("personalizado");
              setIntervaloPagamento([a, b]);
            }}
          />
          <PeriodoNaFolha
            rotulo="Competência"
            ativo={periodoCompetenciaAtivo}
            intervalo={intervaloCompetencia}
            onEscolher={(p) => onPeriodoCompetenciaChange?.(p)}
            onConfirmar={(a, b) => {
              onPeriodoCompetenciaPersonalizadoChange?.(a, b);
              onPeriodoCompetenciaChange?.("personalizado");
              setIntervaloCompetencia([a, b]);
            }}
          />
          <CampoDaFolha rotulo={`Categorias (${categoriasSelecionadas.size}/${categoriasDisponiveis.length})`}>
            {categoriasDisponiveis.length === 0 ? (
              <p className="text-[14px] text-tinta-suave">Nenhuma categoria disponível</p>
            ) : (
              <>
                <div className="-mt-1 mb-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => onCategoriasSelecionadasChange?.(new Set(categoriasDisponiveis.map((c) => c.id)))}
                    className="min-h-11 rounded-cz px-3 text-[14px] font-semibold text-marca-forte active:bg-fundo"
                  >
                    Selecionar todas
                  </button>
                  <button
                    type="button"
                    onClick={() => onCategoriasSelecionadasChange?.(new Set())}
                    disabled={categoriasSelecionadas.size === 0}
                    className="min-h-11 rounded-cz px-3 text-[14px] font-semibold text-tinta-suave active:bg-fundo disabled:opacity-40"
                  >
                    Limpar seleção
                  </button>
                </div>
                <GrupoDePilulas
                  rotulo="Categorias"
                  opcoes={categoriasDisponiveis.map((c) => ({ id: c.id, rotulo: c.descricao || c.nome }))}
                  estaAtiva={(id) => categoriasSelecionadas.has(id)}
                  onEscolher={alternarCategoria}
                />
              </>
            )}
          </CampoDaFolha>
          <CampoDaFolha rotulo="Status">
            <GrupoDePilulas
              rotulo="Status"
              opcoes={opcoesStatus}
              estaAtiva={(id) => filtroStatus === id}
              onEscolher={(id) => onStatusChange?.(id as FiltroStatus)}
            />
          </CampoDaFolha>
          <CampoDaFolha rotulo="Origem">
            <GrupoDePilulas
              rotulo="Origem"
              opcoes={opcoesOrigem}
              estaAtiva={(id) => filtroOrigem === id}
              onEscolher={(id) => onOrigemChange?.(id as FiltroOrigem)}
            />
          </CampoDaFolha>
        </FiltrosSheet>
      </div>

      {/* Período de pagamento sempre à vista (é o filtro que muda toda hora): pastilhas que
          rolam na horizontal. Competência, categorias, status e origem ficam na folha. */}
      <div className="-mx-1.5 flex gap-2 overflow-x-auto px-1.5 pb-0.5 scrollbar-hidden" role="group" aria-label="Período de pagamento">
        <span className="flex shrink-0 items-center text-[13px] font-semibold text-tinta-suave">Pagamento</span>
        {PERIODOS_PILULAS.map((periodo) => {
          const ativo = periodoAtivo === periodo.id;
          return (
            <button
              key={periodo.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => onPeriodoChange?.(periodo.id)}
              className={[
                "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[14px] transition-colors",
                ativo
                  ? "border-marca bg-marca-suave font-semibold text-marca-forte"
                  : "border-hairline-forte bg-superficie font-medium text-tinta active:bg-fundo",
              ].join(" ")}
            >
              {periodo.rotulo}
            </button>
          );
        })}
        {periodoAtivo === "personalizado" && (
          <span className="inline-flex h-11 shrink-0 items-center rounded-full border border-marca bg-marca-suave px-4 text-[14px] font-semibold text-marca-forte">
            {rotuloPersonalizado(periodoAtivo, intervaloPagamento)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function FiltrosFinancas(props: FiltrosFinancasProps) {
  const celular = useCelular();
  return celular ? <FiltrosFinancasCelular {...props} /> : <FiltrosFinancasDesktop {...props} />;
}
