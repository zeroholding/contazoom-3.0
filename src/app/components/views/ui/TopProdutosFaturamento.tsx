"use client";

import { useEffect, useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import NumberLoader from "../../../../components/NumberLoader";
import { FiltroPeriodo } from "./FiltrosDashboard";
import type { FiltroCanal, FiltroStatus, FiltroTipoAnuncio, FiltroModalidadeEnvio } from "./FiltrosDashboardExtra";
import type { FiltroAgrupamentoSKU } from "./FiltroSKU";

interface TopProdutosFaturamentoProps {
  periodoAtivo?: FiltroPeriodo;
  dataInicioPersonalizada?: Date | null;
  dataFimPersonalizada?: Date | null;
  canalAtivo?: FiltroCanal;
  statusAtivo?: FiltroStatus;
  tipoAnuncioAtivo?: FiltroTipoAnuncio;
  modalidadeEnvioAtiva?: FiltroModalidadeEnvio;
  agrupamentoSKUAtivo?: FiltroAgrupamentoSKU;
  refreshKey?: number;
  selectedAccount?: { platform: 'meli' | 'shopee' | 'todos'; id?: string; label?: string };
}

type ProdutoFaturamento = {
  produto: string;
  sku: string;
  faturamento: number;
  quantidade: number;
  ticketMedio: number;
};

type SortMode = 'faturamento' | 'quantidade' | 'ticketMedio';

export default function TopProdutosFaturamento({
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
}: TopProdutosFaturamentoProps) {
  const [dados, setDados] = useState<ProdutoFaturamento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sortMode, setSortMode] = useState<SortMode>('faturamento');
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  
  const totalFaturamento = dados.reduce((acc, it) => acc + (it.faturamento || 0), 0);
  const totalQuantidade = dados.reduce((acc, it) => acc + (it.quantidade || 0), 0);

  // Dados ordenados dinamicamente
  const dadosOrdenados = useMemo(() => {
    return [...dados].sort((a, b) => {
      switch (sortMode) {
        case 'quantidade': return b.quantidade - a.quantidade;
        case 'ticketMedio': return b.ticketMedio - a.ticketMedio;
        default: return b.faturamento - a.faturamento;
      }
    });
  }, [dados, sortMode]);

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
        if (selectedAccount && selectedAccount.platform !== 'todos' && selectedAccount.id) params.append('accountId', selectedAccount.id);
        if (refreshKey) params.append('refresh', String(refreshKey));
        
        // Chamar API para dados do top produtos faturamento
        const url = `/api/dashboard/top-produtos-faturamento${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url, { credentials: "include" });
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        
        const data = (await res.json()) as ProdutoFaturamento[];
        
        // Debug: Log dos dados recebidos
        console.log('[TopProdutosFaturamento] Dados recebidos da API:', data);
        console.log('[TopProdutosFaturamento] Quantidade de produtos:', data.length);
        if (data.length > 0) {
          console.log('[TopProdutosFaturamento] Primeiro produto:', data[0]);
        }
        
        if (isMounted) {
          setDados(data);
        }
      } catch (err) {
        console.error("Falha ao carregar top produtos faturamento:", err);
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

  const getBarColor = (index: number) => {
    // Gradiente de azul (top) para cinza (bottom)
    const colors = [
      '#1e40af', // azul escuro
      '#2563eb', // azul
      '#3b82f6', // azul médio
      '#60a5fa', // azul claro
      '#93c5fd', // azul muito claro
      '#bfdbfe', // azul pastel
      '#dbeafe', // azul super claro
      '#e0e7ff', // indigo claro
      '#c7d2fe', // indigo pastel
      '#a5b4fc', // indigo
    ];
    return colors[index] || '#e5e7eb';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percFat = totalFaturamento > 0 ? (data.faturamento / totalFaturamento) * 100 : 0;
      const percQtd = totalQuantidade > 0 ? (data.quantidade / totalQuantidade) * 100 : 0;
      return (
        <div className="bg-white/95 backdrop-blur-sm p-4 border border-gray-200 rounded-xl shadow-2xl min-w-[280px] animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <p className="font-bold text-gray-900 text-sm truncate flex-1">{label}</p>
            <button
              onClick={() => setSelectedProduct(selectedProduct === data.sku ? null : data.sku)}
              className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors flex-shrink-0 ml-2"
            >
              {selectedProduct === data.sku && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {selectedProduct === data.sku ? 'Fixado' : 'Fixar'}
            </button>
          </div>
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-lg p-2">
                <div className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">Faturamento</div>
                <div className="text-base font-bold text-blue-700">{formatCurrency(data.faturamento)}</div>
                <div className="text-[10px] text-blue-500 mt-0.5">{percFat.toFixed(1)}% do total</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <div className="text-[10px] text-green-600 font-medium uppercase tracking-wide">Quantidade</div>
                <div className="text-base font-bold text-green-700">{data.quantidade.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] text-green-500 mt-0.5">{percQtd.toFixed(1)}% do total</div>
              </div>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-2">
              <div className="text-[10px] text-purple-600 font-medium uppercase tracking-wide">Ticket Médio</div>
              <div className="text-base font-bold text-purple-700">{formatCurrency(data.ticketMedio)}</div>
              <div className="text-[10px] text-purple-500 mt-0.5">Por unidade vendida</div>
            </div>
            
            {totalFaturamento > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
                <span>SKU: {data.sku}</span>
                <span>•</span>
                <span className="font-semibold text-gray-700">Rank #{dadosOrdenados.findIndex(p => p.sku === data.sku) + 1}</span>
              </div>
            )}
          </div>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-600">Top Produtos Faturamento</h3>
            <p className="text-xs text-gray-500">Carregando produtos...</p>
          </div>
        </div>
        <div className="h-64 flex items-center justify-center">
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-600">Top Produtos Faturamento</h3>
            <p className="text-xs text-gray-500">Nenhum produto encontrado</p>
          </div>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div className="text-xs text-gray-500">Não há produtos no período</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden flex flex-col h-full">
      {/* Header com controles */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 px-5 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Top 10 Produtos</h3>
              <p className="text-xs text-gray-600">Clique para fixar detalhes • Ordene por diferentes métricas</p>
            </div>
          </div>
          
          {/* Seletor de ordenação */}
          <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm border border-gray-200">
            {(['faturamento', 'quantidade', 'ticketMedio'] as SortMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                  sortMode === mode 
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {mode === 'faturamento' && (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {mode === 'quantidade' && (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                )}
                {mode === 'ticketMedio' && (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3v-6m-3 6v-9m12 0v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                )}
                {mode === 'faturamento' && 'Faturamento'}
                {mode === 'quantidade' && 'Quantidade'}
                {mode === 'ticketMedio' && 'Ticket Médio'}
              </button>
            ))}
          </div>
        </div>
        
        {/* KPIs resumidos */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-white/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/50">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Total Faturado</div>
            <div className="text-sm font-bold text-blue-600">{formatCurrency(totalFaturamento)}</div>
          </div>
          <div className="bg-white/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/50">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Unidades</div>
            <div className="text-sm font-bold text-green-600">{totalQuantidade.toLocaleString('pt-BR')}</div>
          </div>
          <div className="bg-white/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/50">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Ticket Médio Geral</div>
            <div className="text-sm font-bold text-purple-600">
              {totalQuantidade > 0 ? formatCurrency(totalFaturamento / totalQuantidade) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="flex-1 p-5">
        <div className="h-full min-h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={dadosOrdenados}
              margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
              barCategoryGap="12%"
              onMouseMove={(e: any) => {
                if (e && e.activeLabel) {
                  setHoveredProduct(e.activeLabel);
                }
              }}
              onMouseLeave={() => setHoveredProduct(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis
                type="number"
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                  if (sortMode === 'quantidade') return value.toLocaleString('pt-BR');
                  return formatCurrency(value);
                }}
                angle={0}
                height={40}
              />
              <YAxis
                type="category"
                dataKey="produto"
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={150}
                interval={0}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />

              <Bar
                dataKey={sortMode}
                radius={[0, 8, 8, 0]}
                onClick={(data: any) => {
                  setSelectedProduct(selectedProduct === data.sku ? null : data.sku);
                }}
                style={{ cursor: 'pointer' }}
              >
                {dadosOrdenados.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getBarColor(index)}
                    opacity={hoveredProduct === entry.produto || selectedProduct === entry.sku ? 1 : 0.85}
                    className="transition-opacity duration-200"
                  />
                ))}
                <LabelList
                  dataKey={sortMode}
                  position="right"
                  fontSize={11}
                  fontWeight="bold"
                  fill="#374151"
                  formatter={(value: number) => {
                    if (sortMode === 'quantidade') return value.toLocaleString('pt-BR');
                    return formatCurrency(value);
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Painel de detalhes do produto selecionado */}
      {selectedProduct && (() => {
        const produto = dadosOrdenados.find(p => p.sku === selectedProduct);
        if (!produto) return null;
        
        const rank = dadosOrdenados.indexOf(produto) + 1;
        const percFat = totalFaturamento > 0 ? (produto.faturamento / totalFaturamento) * 100 : 0;
        const ticketMedioGeral = totalQuantidade > 0 ? totalFaturamento / totalQuantidade : 0;
        const difTicket = ((produto.ticketMedio - ticketMedioGeral) / ticketMedioGeral) * 100;
        
        return (
          <div className="px-5 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-t border-gray-200 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-md">
                  #{rank}
                </span>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">{produto.produto}</h4>
                  <p className="text-xs text-gray-500">SKU: {produto.sku}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Fechar
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">Faturamento</div>
                <div className="text-lg font-bold text-blue-600">{formatCurrency(produto.faturamento)}</div>
                <div className="text-xs text-blue-500 mt-0.5">{percFat.toFixed(1)}% do total</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">Quantidade</div>
                <div className="text-lg font-bold text-green-600">{produto.quantidade.toLocaleString('pt-BR')}</div>
                <div className="text-xs text-green-500 mt-0.5">unidades</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">Ticket Médio</div>
                <div className="text-lg font-bold text-purple-600">{formatCurrency(produto.ticketMedio)}</div>
                <div className={`flex items-center gap-0.5 text-xs mt-0.5 font-semibold ${difTicket >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  <svg className={`w-3 h-3 ${difTicket >= 0 ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l5 5a1 1 0 01-1.414 1.414L11 6.414V16a1 1 0 11-2 0V6.414L5.707 9.707a1 1 0 01-1.414-1.414l5-5A1 1 0 0110 3z" clipRule="evenodd" />
                  </svg>
                  {Math.abs(difTicket).toFixed(1)}% vs geral
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">Participação</div>
                <div className="text-lg font-bold text-orange-600">{percFat.toFixed(1)}%</div>
                <div className="text-xs text-gray-400 mt-0.5">do faturamento</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">Posição</div>
                <div className="text-lg font-bold text-indigo-600">#{rank}</div>
                <div className="text-xs text-gray-400 mt-0.5">no ranking</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
