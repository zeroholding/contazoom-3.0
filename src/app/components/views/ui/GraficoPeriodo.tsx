"use client";

import { useEffect, useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, Brush, ReferenceLine } from "recharts";
import NumberLoader from "../../../../components/NumberLoader";
import { FiltroPeriodo } from "./FiltrosDashboard";
import type { FiltroCanal, FiltroStatus, FiltroTipoAnuncio, FiltroModalidadeEnvio } from "./FiltrosDashboardExtra";
import type { FiltroAgrupamentoSKU } from "./FiltroSKU";

interface GraficoPeriodoProps {
  periodoAtivo?: FiltroPeriodo;
  dataInicioPersonalizada?: Date | null;
  dataFimPersonalizada?: Date | null;
  canalAtivo?: FiltroCanal;
  statusAtivo?: FiltroStatus;
  tipoAnuncioAtivo?: FiltroTipoAnuncio;
  modalidadeEnvioAtiva?: FiltroModalidadeEnvio;
  agrupamentoSKUAtivo?: FiltroAgrupamentoSKU;
  refreshKey?: number;
  selectedAccount?: { platform: 'meli' | 'shopee' | 'todos'; id?: string };
}

type DadosGrafico = {
  periodo: string;
  faturamento: number;
  impostos: number;
  taxaPlataforma: number;
  frete: number;
  margemContribuicao: number;
  cmv: number;
  lucroBruto: number;
};

type ViewMode = 'lines' | 'areas' | 'comparison';

type MetricKey = 'faturamento' | 'lucroBruto' | 'margemContribuicao' | 'cmv' | 'taxaPlataforma' | 'frete' | 'impostos';

const METRICS_CONFIG: Record<MetricKey, { name: string; color: string; category: 'revenue' | 'cost' }> = {
  faturamento: { name: 'Faturamento', color: '#3b82f6', category: 'revenue' },
  lucroBruto: { name: 'Lucro Bruto', color: '#10b981', category: 'revenue' },
  margemContribuicao: { name: 'Margem Contrib.', color: '#8b5cf6', category: 'revenue' },
  cmv: { name: 'CMV', color: '#ef4444', category: 'cost' },
  taxaPlataforma: { name: 'Taxa Plataforma', color: '#f59e0b', category: 'cost' },
  frete: { name: 'Frete', color: '#6b7280', category: 'cost' },
  impostos: { name: 'Impostos', color: '#dc2626', category: 'cost' },
};

export default function GraficoPeriodo({
  periodoAtivo = "todos",
  dataInicioPersonalizada = null,
  dataFimPersonalizada = null,
  canalAtivo = "todos",
  statusAtivo = "pagos",
  tipoAnuncioAtivo = "todos",
  modalidadeEnvioAtiva = "todos",
  agrupamentoSKUAtivo = "mlb",
  refreshKey = 0,
  selectedAccount,
}: GraficoPeriodoProps) {
  const [dados, setDados] = useState<DadosGrafico[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>('lines');
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    new Set(['faturamento', 'lucroBruto', 'margemContribuicao'])
  );
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        
        // Construir parâmetros da URL
        const params = new URLSearchParams();
        if (periodoAtivo !== "todos") {
          params.append("periodo", periodoAtivo);
        }
        if (dataInicioPersonalizada && dataFimPersonalizada) {
          params.append("dataInicio", dataInicioPersonalizada.toISOString());
          params.append("dataFim", dataFimPersonalizada.toISOString());
        }
        if (canalAtivo && canalAtivo !== 'todos') params.append('canal', canalAtivo);
        if (statusAtivo) params.append('status', statusAtivo);
        if (tipoAnuncioAtivo && tipoAnuncioAtivo !== 'todos') params.append('tipoAnuncio', tipoAnuncioAtivo);
        if (modalidadeEnvioAtiva && modalidadeEnvioAtiva !== 'todos') params.append('modalidade', modalidadeEnvioAtiva);
        if (agrupamentoSKUAtivo && agrupamentoSKUAtivo !== 'mlb') params.append('agrupamentoSKU', agrupamentoSKUAtivo);
        if (refreshKey) params.append('refresh', String(refreshKey));
        if (selectedAccount && selectedAccount.platform !== 'todos' && selectedAccount.id) {
          params.append('accountPlatform', selectedAccount.platform);
          params.append('accountId', selectedAccount.id);
        }
        
        // Chamar API para dados do gráfico
        const url = `/api/dashboard/series${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url, { credentials: "include" });
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        
        const data = (await res.json()) as DadosGrafico[];
        
        // Debug: Log dos dados recebidos
        console.log('Dados do gráfico carregados:', data);
        
        if (isMounted) {
          setDados(data);
        }
      } catch (err) {
        console.error("Falha ao carregar dados do gráfico:", err);
        if (isMounted) {
          setDados([]); // Fallback para array vazio
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [periodoAtivo, dataInicioPersonalizada, dataFimPersonalizada, canalAtivo, statusAtivo, tipoAnuncioAtivo, modalidadeEnvioAtiva, agrupamentoSKUAtivo, refreshKey, selectedAccount]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { 
      style: "currency", 
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);

  const toggleMetric = (metric: MetricKey) => {
    setActiveMetrics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(metric)) {
        newSet.delete(metric);
      } else {
        newSet.add(metric);
      }
      return newSet;
    });
  };

  // Estatísticas do período selecionado
  const selectedPeriodData = useMemo(() => {
    if (!selectedPeriod) return null;
    return dados.find(d => d.periodo === selectedPeriod);
  }, [selectedPeriod, dados]);

  // Comparação: calcular variação entre períodos
  const periodComparison = useMemo(() => {
    if (dados.length < 2) return null;
    const latest = dados[dados.length - 1];
    const previous = dados[dados.length - 2];
    
    return {
      faturamento: ((latest.faturamento - previous.faturamento) / previous.faturamento) * 100,
      lucroBruto: ((latest.lucroBruto - previous.lucroBruto) / previous.lucroBruto) * 100,
      margemContribuicao: ((latest.margemContribuicao - previous.margemContribuicao) / previous.margemContribuicao) * 100,
    };
  }, [dados]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm p-4 border border-gray-200 rounded-xl shadow-2xl min-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <p className="font-bold text-gray-900 text-sm">{label}</p>
            <button
              onClick={() => setSelectedPeriod(selectedPeriod === label ? null : label)}
              className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
            >
              {selectedPeriod === label ? 'Desmarcar' : 'Fixar'}
            </button>
          </div>
          <div className="space-y-2">
            {payload
              .filter((entry: any) => activeMetrics.has(entry.dataKey))
              .sort((a: any, b: any) => Math.abs(b.value) - Math.abs(a.value))
              .map((entry: any, index: number) => {
                const config = METRICS_CONFIG[entry.dataKey as MetricKey];
                const isPositive = entry.value >= 0;
                return (
                  <div key={index} className="flex items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-2 flex-1">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-xs font-medium text-gray-700">{entry.name}</span>
                    </div>
                    <span 
                      className={`text-sm font-bold tabular-nums ${
                        config.category === 'revenue' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(Math.abs(entry.value))}
                    </span>
                  </div>
                );
              })}
          </div>
          {data && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex gap-3">
              <div className="flex-1 bg-green-50 rounded-lg p-2">
                <div className="text-[10px] text-green-600 font-medium uppercase tracking-wide">Margem %</div>
                <div className="text-sm font-bold text-green-700">
                  {data.faturamento > 0 
                    ? ((data.lucroBruto / data.faturamento) * 100).toFixed(1) + '%'
                    : '0%'}
                </div>
              </div>
              <div className="flex-1 bg-blue-50 rounded-lg p-2">
                <div className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">ROI</div>
                <div className="text-sm font-bold text-blue-700">
                  {(Math.abs(data.cmv) + Math.abs(data.taxaPlataforma) + Math.abs(data.frete)) > 0
                    ? ((data.lucroBruto / (Math.abs(data.cmv) + Math.abs(data.taxaPlataforma) + Math.abs(data.frete))) * 100).toFixed(1) + '%'
                    : '—'}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { 
      style: "currency", 
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">{`Período: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${formatCurrency(entry.value)}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="bg-[#F3F3F3] rounded-lg border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center mb-4">
          <div className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center mr-2">
            <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-600">Evolução Financeira por Período</h3>
            <p className="text-xs text-gray-500">Carregando dados do gráfico...</p>
          </div>
        </div>
        <div className="h-96 flex items-center justify-center">
          <NumberLoader width="w-32" height="h-8" variant="currency" />
        </div>
      </div>
    );
  }

  if (dados.length === 0) {
    return (
      <div className="bg-[#F3F3F3] rounded-lg border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center mb-4">
          <div className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center mr-2">
            <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-600">Evolução Financeira por Período</h3>
            <p className="text-xs text-gray-500">Nenhum dado encontrado</p>
          </div>
        </div>
        <div className="h-96 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="text-xs text-gray-500">Não há vendas no período selecionado</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
      {/* Header com controles interativos */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200 px-5 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Evolução Financeira Interativa</h3>
              <p className="text-xs text-gray-600">Clique nas métricas para mostrar/ocultar • Clique nos pontos para fixar detalhes</p>
            </div>
          </div>
          
          {/* Seletor de visualização */}
          <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm border border-gray-200">
            {(['lines', 'areas', 'comparison'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === mode 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {mode === 'lines' && '📈 Linhas'}
                {mode === 'areas' && '📊 Áreas'}
                {mode === 'comparison' && '🔄 Comparar'}
              </button>
            ))}
          </div>
        </div>

        {/* Comparação de períodos */}
        {periodComparison && viewMode === 'comparison' && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {Object.entries(periodComparison).map(([key, value]) => {
              const config = METRICS_CONFIG[key as MetricKey];
              const isPositive = value > 0;
              return (
                <div key={key} className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-medium">{config.name}</span>
                    <span className={`text-lg font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Métricas selecionáveis */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex flex-wrap gap-2">
          {Object.entries(METRICS_CONFIG).map(([key, config]) => {
            const isActive = activeMetrics.has(key as MetricKey);
            return (
              <button
                key={key}
                onClick={() => toggleMetric(key as MetricKey)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-white shadow-md ring-2 scale-105'
                    : 'bg-white/50 hover:bg-white hover:shadow-sm opacity-50 hover:opacity-100'
                }`}
                style={{
                  ringColor: isActive ? config.color : 'transparent',
                }}
              >
                <div 
                  className="w-3 h-3 rounded-full transition-transform group-hover:scale-110" 
                  style={{ backgroundColor: config.color }}
                />
                <span style={{ color: isActive ? config.color : '#6b7280' }}>
                  {config.name}
                </span>
                {isActive && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" style={{ color: config.color }}>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Gráfico */}
      <div className="p-5">
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'areas' ? (
              <AreaChart
                data={dados}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                onMouseMove={(e: any) => {
                  if (e && e.activeLabel) {
                    setHoveredPeriod(e.activeLabel);
                  }
                }}
                onMouseLeave={() => setHoveredPeriod(null)}
              >
                <defs>
                  {Array.from(activeMetrics).map(metric => (
                    <linearGradient key={metric} id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={METRICS_CONFIG[metric].color} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={METRICS_CONFIG[metric].color} stopOpacity={0.1}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="periodo" 
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Brush 
                  dataKey="periodo" 
                  height={30} 
                  stroke="#8b5cf6"
                  fill="#f3f4f6"
                />
                
                {Array.from(activeMetrics).map(metric => (
                  <Area
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    stroke={METRICS_CONFIG[metric].color}
                    fill={`url(#gradient-${metric})`}
                    strokeWidth={2}
                    dot={{ fill: METRICS_CONFIG[metric].color, strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: METRICS_CONFIG[metric].color, strokeWidth: 2, fill: '#fff' }}
                    name={METRICS_CONFIG[metric].name}
                  />
                ))}
                
                {selectedPeriod && (
                  <ReferenceLine 
                    x={selectedPeriod} 
                    stroke="#8b5cf6" 
                    strokeWidth={2} 
                    strokeDasharray="3 3" 
                    label={{ value: 'Fixado', position: 'top', fill: '#8b5cf6', fontSize: 11, fontWeight: 'bold' }}
                  />
                )}
              </AreaChart>
            ) : (
              <LineChart
                data={dados}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                onMouseMove={(e: any) => {
                  if (e && e.activeLabel) {
                    setHoveredPeriod(e.activeLabel);
                  }
                }}
                onMouseLeave={() => setHoveredPeriod(null)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="periodo" 
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Brush 
                  dataKey="periodo" 
                  height={30} 
                  stroke="#8b5cf6"
                  fill="#f3f4f6"
                />
                
                {Array.from(activeMetrics).map(metric => {
                  const config = METRICS_CONFIG[metric];
                  const isRevenue = config.category === 'revenue';
                  return (
                    <Line
                      key={metric}
                      type="monotone"
                      dataKey={metric}
                      stroke={config.color}
                      strokeWidth={isRevenue ? 3 : 2}
                      strokeDasharray={isRevenue ? '0' : '5 5'}
                      name={config.name}
                      dot={{ fill: config.color, strokeWidth: 2, r: isRevenue ? 4 : 3 }}
                      activeDot={{ 
                        r: 7, 
                        stroke: config.color, 
                        strokeWidth: 2, 
                        fill: '#fff',
                        onClick: (e: any, payload: any) => {
                          setSelectedPeriod(selectedPeriod === payload.periodo ? null : payload.periodo);
                        },
                        style: { cursor: 'pointer' }
                      }}
                    />
                  );
                })}
                
                {selectedPeriod && (
                  <ReferenceLine 
                    x={selectedPeriod} 
                    stroke="#8b5cf6" 
                    strokeWidth={2} 
                    strokeDasharray="3 3" 
                    label={{ value: 'Fixado', position: 'top', fill: '#8b5cf6', fontSize: 11, fontWeight: 'bold' }}
                  />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Painel de detalhes do período selecionado */}
      {selectedPeriodData && (
        <div className="px-5 py-4 bg-gradient-to-r from-purple-50 to-blue-50 border-t border-gray-200 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-gray-800">📊 Detalhes: {selectedPeriod}</h4>
            <button
              onClick={() => setSelectedPeriod(null)}
              className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              ✕ Fechar
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(selectedPeriodData)
              .filter(([key]) => key !== 'periodo' && key !== '_dataReferencia' && key !== '_chave')
              .map(([key, value]) => {
                const config = METRICS_CONFIG[key as MetricKey];
                if (!config) return null;
                return (
                  <div key={key} className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                      <span className="text-xs text-gray-500 font-medium">{config.name}</span>
                    </div>
                    <div className="text-lg font-bold" style={{ color: config.color }}>
                      {formatCurrency(value as number)}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
