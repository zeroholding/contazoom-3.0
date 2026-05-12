"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { FiltroPeriodo } from "./FiltrosDashboard";
import type { FiltroCanal, FiltroStatus } from "./FiltrosDashboardExtra";

interface EstadoData {
  uf: string;
  nome: string;
  regiao: string;
  quantidade: number;
  valor: number;
  percentual: number;
  percentualValor: number;
}

interface RegiaData {
  nome: string;
  quantidade: number;
  valor: number;
  percentual: number;
}

interface MapaCalorProps {
  periodoAtivo: FiltroPeriodo;
  dataInicioPersonalizada: Date | null;
  dataFimPersonalizada: Date | null;
  canalAtivo: FiltroCanal;
  statusAtivo: FiltroStatus;
  refreshKey: number;
}

const W = 560, H = 580; // viewBox interno — o SVG vai renderizar em 50% via maxHeight

// Projeção Mercator simples para o Brasil
function project(lon: number, lat: number): [number, number] {
  const lonMin = -74, lonMax = -28.6;
  const latMin = -33.75, latMax = 5.27;
  const x = ((lon - lonMin) / (lonMax - lonMin)) * W;
  const y = H - ((lat - latMin) / (latMax - latMin)) * H;
  return [x, y];
}

function coordsToPath(rings: number[][][]): string {
  return rings.map((ring) =>
    ring.map((pt, i) => {
      const [x, y] = project(pt[0], pt[1]);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ") + " Z"
  ).join(" ");
}

// O br.json usa id = "BRXX" (ex: "BRRS"), extrair as 2 últimas letras
function extractUF(props: Record<string, unknown>): string {
  const id = (props.id as string) || "";
  if (id.startsWith("BR") && id.length === 4) return id.slice(2);
  const name = (props.name as string) || "";
  const nameMap: Record<string, string> = {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM",
    "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF", "Espírito Santo": "ES",
    "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
    "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
    "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ",
    "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", "Rondônia": "RO",
    "Roraima": "RR", "Santa Catarina": "SC", "São Paulo": "SP",
    "Sergipe": "SE", "Tocantins": "TO",
  };
  return nameMap[name] || "";
}

const CENTROIDS: Record<string, [number, number]> = {
  AC: [-70.5, -9.0], AL: [-36.6, -9.6], AP: [-51.8, 1.4], AM: [-64.0, -3.5],
  BA: [-41.7, -12.5], CE: [-39.3, -5.2], DF: [-47.9, -15.8], ES: [-40.7, -19.5],
  GO: [-49.6, -15.9], MA: [-45.3, -5.4], MT: [-56.1, -12.7], MS: [-54.5, -20.5],
  MG: [-44.5, -18.1], PA: [-52.2, -3.8], PB: [-36.8, -7.2], PR: [-51.6, -24.7],
  PE: [-37.8, -8.4], PI: [-43.0, -7.7], RJ: [-43.2, -22.3], RN: [-36.5, -5.8],
  RS: [-53.1, -30.2], RO: [-62.8, -10.9], RR: [-61.4, 2.0], SC: [-50.5, -27.3],
  SP: [-48.7, -22.2], SE: [-37.4, -10.6], TO: [-48.3, -10.2],
};

// Cores de calor no estilo do sistema (tons de laranja/vermelho para destacar, azul/cinza para frio)
function getHeatColor(intensidade: number, isHovered: boolean): string {
  if (intensidade === 0) return isHovered ? "#e5e7eb" : "#f3f4f6";
  if (intensidade >= 0.85) return isHovered ? "#b91c1c" : "#dc2626";
  if (intensidade >= 0.65) return isHovered ? "#c2410c" : "#ea580c";
  if (intensidade >= 0.45) return isHovered ? "#c2410c" : "#f97316";
  if (intensidade >= 0.25) return isHovered ? "#d97706" : "#fb923c";
  if (intensidade >= 0.10) return isHovered ? "#b45309" : "#fdba74";
  return isHovered ? "#92400e" : "#fed7aa";
}

function getTextColor(intensidade: number): string {
  if (intensidade >= 0.45) return "#ffffff";
  if (intensidade >= 0.15) return "#7c2d12";
  return "#6b7280";
}

const REGIOES_ORDER = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte"];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function MapaCalorBrasil({
  periodoAtivo, dataInicioPersonalizada, dataFimPersonalizada,
  canalAtivo, statusAtivo, refreshKey,
}: MapaCalorProps) {
  const [estados, setEstados] = useState<EstadoData[]>([]);
  const [regioes, setRegioes] = useState<RegiaData[]>([]);
  const [totals, setTotals] = useState({ vendas: 0, valor: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredUF, setHoveredUF] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [geoFeatures, setGeoFeatures] = useState<{ uf: string; path: string; cx: number; cy: number }[]>([]);
  const [metricMode, setMetricMode] = useState<"vendas" | "valor">("vendas");

  // Carregar GeoJSON uma vez
  useEffect(() => {
    fetch("/br-states.json")
      .then((r) => r.json())
      .then((geo: { features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] }) => {
        const features = geo.features.map((f) => {
          const uf = extractUF(f.properties);
          if (!uf) return null;
          const geom = f.geometry;
          let path = "";
          if (geom.type === "Polygon") {
            path = coordsToPath(geom.coordinates as number[][][]);
          } else if (geom.type === "MultiPolygon") {
            path = (geom.coordinates as number[][][][])
              .map((poly) => coordsToPath(poly))
              .join(" ");
          }
          const c = CENTROIDS[uf];
          const [cx, cy] = c ? project(c[0], c[1]) : [0, 0];
          return { uf, path, cx, cy };
        }).filter(Boolean) as { uf: string; path: string; cx: number; cy: number }[];
        setGeoFeatures(features);
      })
      .catch((e) => console.error("[MapaCalorBrasil] Erro ao carregar GeoJSON:", e));
  }, []);

  // Buscar dados
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ periodo: periodoAtivo, canal: canalAtivo, status: statusAtivo });
        if (periodoAtivo === "personalizado" && dataInicioPersonalizada && dataFimPersonalizada) {
          params.append("dataInicio", dataInicioPersonalizada.toISOString());
          params.append("dataFim", dataFimPersonalizada.toISOString());
        }
        const res = await fetch(`/api/dashboard/vendas-por-estado?${params}`);
        if (res.ok) {
          const data = await res.json();
          setEstados(data.estados || []);
          setRegioes(data.regioes || []);
          setTotals(data.totals || { vendas: 0, valor: 0 });
        }
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    };
    fetchData();
  }, [periodoAtivo, dataInicioPersonalizada, dataFimPersonalizada, canalAtivo, statusAtivo, refreshKey]);

  const maxVendas = Math.max(...estados.map((e) => e.quantidade), 1);
  const maxValor = Math.max(...estados.map((e) => e.valor), 1);

  const getIntensidade = useCallback((uf: string) => {
    const e = estados.find((s) => s.uf === uf);
    if (!e) return 0;
    return metricMode === "vendas" ? e.quantidade / maxVendas : e.valor / maxValor;
  }, [estados, metricMode, maxVendas, maxValor]);

  const hoveredData = hoveredUF ? estados.find((e) => e.uf === hoveredUF) : null;

  return (
    <div className="bg-[#F3F3F3] rounded-lg border border-gray-200 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-700">Mapa de Calor — Vendas por Estado</h3>
            <p className="text-xs text-gray-500">Concentração geográfica de faturamento no Brasil</p>
          </div>
        </div>
        {/* Toggle métrica */}
        <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setMetricMode("vendas")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              metricMode === "vendas"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >Qtd. Vendas</button>
          <button
            onClick={() => setMetricMode("valor")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              metricMode === "valor"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >Faturamento</button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Total de Vendas", value: totals.vendas.toLocaleString("pt-BR"), icon: "📦" },
          { label: "Faturamento Total", value: fmt(totals.valor), icon: "💰" },
          { label: "Estados com Vendas", value: estados.length.toString(), icon: "📍" },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-xs text-gray-500">{item.icon} {item.label}</div>
            <div className="text-sm font-bold text-gray-800 mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Mapa */}
        <div className="relative bg-white rounded-lg border border-gray-200 overflow-hidden" style={{ width: 280 }}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="w-4 h-4 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Carregando mapa...
              </div>
            </div>
          )}

          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 280, height: 290, display: "block", padding: 4 }}>
            {geoFeatures.map(({ uf, path, cx, cy }) => {
              const intens = getIntensidade(uf);
              const isHov = hoveredUF === uf;
              const fill = getHeatColor(intens, isHov);
              const textColor = getTextColor(intens);

              return (
                <g key={uf}>
                  <path
                    d={path}
                    fill={fill}
                    stroke={isHov ? "#ea580c" : "#d1d5db"}
                    strokeWidth={isHov ? 1.5 : 0.5}
                    style={{ cursor: "pointer", transition: "fill 0.15s, stroke 0.15s" }}
                    onMouseMove={(e) => {
                      setHoveredUF(uf);
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoveredUF(null)}
                  />
                  {cx > 0 && cy > 0 && (
                    <text
                      x={cx} y={cy}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={intens > 0.4 ? 10 : 8}
                      fontWeight={intens > 0.3 ? "700" : "500"}
                      fill={textColor}
                      pointerEvents="none"
                    >
                      {uf}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Tooltip */}
          {hoveredUF && hoveredData && (
            <div
              className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 pointer-events-none text-sm"
              style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 10, minWidth: 160 }}
            >
              <div className="font-semibold text-gray-800 mb-1">{hoveredData.nome} ({hoveredUF})</div>
              <div className="text-xs text-gray-400 mb-2">{hoveredData.regiao}</div>
              <div className="text-gray-700 text-xs">📦 <b>{hoveredData.quantidade.toLocaleString("pt-BR")}</b> vendas</div>
              <div className="text-gray-700 text-xs mt-0.5">💰 <b>{fmt(hoveredData.valor)}</b></div>
              <div className="mt-1 pt-1 border-t border-gray-100 text-gray-400 text-xs">
                {hoveredData.percentual.toFixed(1)}% das vendas
              </div>
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <div className="w-48 flex flex-col gap-3">
          {/* Legenda */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Intensidade</div>
            <div className="flex items-stretch gap-2">
              <div className="w-3 rounded" style={{ background: "linear-gradient(to bottom, #dc2626, #f97316, #fdba74, #f3f4f6)", minHeight: 100 }} />
              <div className="flex flex-col justify-between text-xs text-gray-500">
                <span>Muito Alta</span>
                <span>Alta</span>
                <span>Média</span>
                <span>Baixa</span>
                <span>Sem dados</span>
              </div>
            </div>
          </div>

          {/* Por Região */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Por Região</div>
            <div className="space-y-2">
              {REGIOES_ORDER.map((nomeRegiao) => {
                const r = regioes.find((reg) => reg.nome === nomeRegiao);
                if (!r) return null;
                return (
                  <div key={nomeRegiao}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-xs text-gray-600">{nomeRegiao}</span>
                      <span className="text-xs font-bold text-orange-600">{r.percentual.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(r.percentual, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top 5 */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Top 5 Estados</div>
            <div className="space-y-1.5">
              {estados.slice(0, 5).map((e, i) => (
                <div
                  key={e.uf}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-all ${
                    hoveredUF === e.uf ? "bg-orange-50 border border-orange-200" : "hover:bg-gray-50"
                  }`}
                  onMouseEnter={() => setHoveredUF(e.uf)}
                  onMouseLeave={() => setHoveredUF(null)}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-500" : i === 2 ? "bg-orange-400" : "bg-gray-300"
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-700">{e.uf}</div>
                    <div className="text-xs text-gray-400">{e.quantidade} vendas</div>
                  </div>
                  <span className="text-xs font-bold text-orange-600">{e.percentual.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
