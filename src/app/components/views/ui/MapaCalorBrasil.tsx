"use client";

import { useEffect, useState, useCallback } from "react";
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

const VB_W = 560, VB_H = 580;

function project(lon: number, lat: number): [number, number] {
  const lonMin = -74, lonMax = -28.6;
  const latMin = -33.75, latMax = 5.27;
  const x = ((lon - lonMin) / (lonMax - lonMin)) * VB_W;
  const y = VB_H - ((lat - latMin) / (latMax - latMin)) * VB_H;
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

function extractUF(props: Record<string, unknown>): string {
  const id = (props.id as string) || "";
  if (id.startsWith("BR") && id.length === 4) return id.slice(2);
  const nameMap: Record<string, string> = {
    "Acre":"AC","Alagoas":"AL","Amapá":"AP","Amazonas":"AM","Bahia":"BA",
    "Ceará":"CE","Distrito Federal":"DF","Espírito Santo":"ES","Goiás":"GO",
    "Maranhão":"MA","Mato Grosso":"MT","Mato Grosso do Sul":"MS","Minas Gerais":"MG",
    "Pará":"PA","Paraíba":"PB","Paraná":"PR","Pernambuco":"PE","Piauí":"PI",
    "Rio de Janeiro":"RJ","Rio Grande do Norte":"RN","Rio Grande do Sul":"RS",
    "Rondônia":"RO","Roraima":"RR","Santa Catarina":"SC","São Paulo":"SP",
    "Sergipe":"SE","Tocantins":"TO",
  };
  return nameMap[(props.name as string) || ""] || "";
}

const CENTROIDS: Record<string, [number, number]> = {
  AC:[-70.5,-9.0],AL:[-36.6,-9.6],AP:[-51.8,1.4],AM:[-64.0,-3.5],
  BA:[-41.7,-12.5],CE:[-39.3,-5.2],DF:[-47.9,-15.8],ES:[-40.7,-19.5],
  GO:[-49.6,-15.9],MA:[-45.3,-5.4],MT:[-56.1,-12.7],MS:[-54.5,-20.5],
  MG:[-44.5,-18.1],PA:[-52.2,-3.8],PB:[-36.8,-7.2],PR:[-51.6,-24.7],
  PE:[-37.8,-8.4],PI:[-43.0,-7.7],RJ:[-43.2,-22.3],RN:[-36.5,-5.8],
  RS:[-53.1,-30.2],RO:[-62.8,-10.9],RR:[-61.4,2.0],SC:[-50.5,-27.3],
  SP:[-48.7,-22.2],SE:[-37.4,-10.6],TO:[-48.3,-10.2],
};

// Interpola entre cores para um gradiente de calor real
function heatColor(t: number): string {
  if (t <= 0) return "#e8eaf0";
  // Azul frio → verde → amarelo → laranja → vermelho quente
  const stops = [
    [0.0,  [232, 240, 254]], // azul muito claro
    [0.15, [196, 220, 255]], // azul claro
    [0.30, [254, 220, 100]], // amarelo
    [0.55, [253, 155,  50]], // laranja
    [0.75, [239,  68,  68]], // vermelho
    [1.0,  [153,  27,  27]], // vermelho escuro
  ] as [number, number[]][];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      const r = Math.round(c0[0] + f * (c1[0] - c0[0]));
      const g = Math.round(c0[1] + f * (c1[1] - c0[1]));
      const b = Math.round(c0[2] + f * (c1[2] - c0[2]));
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(153,27,27)`;
}

function textColor(t: number): string {
  if (t <= 0) return "#9ca3af";
  if (t < 0.30) return "#1e3a5f";
  if (t < 0.55) return "#7c2d12";
  return "#ffffff";
}

const REGIOES_ORDER = ["Sudeste","Sul","Nordeste","Centro-Oeste","Norte"];

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

  useEffect(() => {
    fetch("/br-states.json")
      .then(r => r.json())
      .then((geo: any) => {
        const features = geo.features.map((f: any) => {
          const uf = extractUF(f.properties);
          if (!uf) return null;
          let path = "";
          if (f.geometry.type === "Polygon") {
            path = coordsToPath(f.geometry.coordinates);
          } else if (f.geometry.type === "MultiPolygon") {
            path = f.geometry.coordinates.map((p: number[][][]) => coordsToPath(p)).join(" ");
          }
          const c = CENTROIDS[uf];
          const [cx, cy] = c ? project(c[0], c[1]) : [0, 0];
          return { uf, path, cx, cy };
        }).filter(Boolean);
        setGeoFeatures(features);
      });
  }, []);

  useEffect(() => {
    const load = async () => {
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
    load();
  }, [periodoAtivo, dataInicioPersonalizada, dataFimPersonalizada, canalAtivo, statusAtivo, refreshKey]);

  const maxVendas = Math.max(...estados.map(e => e.quantidade), 1);
  const maxValor = Math.max(...estados.map(e => e.valor), 1);

  const getT = useCallback((uf: string) => {
    const e = estados.find(s => s.uf === uf);
    if (!e) return 0;
    const raw = metricMode === "vendas" ? e.quantidade / maxVendas : e.valor / maxValor;
    // Aplicar escala logarítmica para melhor distinção visual
    return raw > 0 ? 0.15 + raw * 0.85 : 0;
  }, [estados, metricMode, maxVendas, maxValor]);

  const hoveredData = hoveredUF ? estados.find(e => e.uf === hoveredUF) : null;

  return (
    <div className="bg-[#F3F3F3] rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Mapa de Calor — Vendas por Estado</h3>
            <p className="text-xs text-gray-500">Concentração geográfica de faturamento no Brasil</p>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(["vendas","valor"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMetricMode(m)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                metricMode === m ? "bg-orange-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >{m === "vendas" ? "Qtd. Vendas" : "Faturamento"}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-white border-b border-gray-100">
        {[
          { label: "Total de Vendas", value: totals.vendas.toLocaleString("pt-BR"), color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Faturamento Total", value: fmt(totals.valor), color: "text-green-600", bg: "bg-green-50" },
          { label: "Estados com Vendas", value: `${estados.length} / 27`, color: "text-blue-600", bg: "bg-blue-50" },
        ].map(item => (
          <div key={item.label} className={`${item.bg} rounded-xl px-4 py-2.5 flex items-center gap-3`}>
            <div>
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Corpo: mapa + sidebar */}
      <div className="flex gap-0">
        {/* Mapa */}
        <div className="relative flex-1 bg-white p-4" style={{ minHeight: 500 }}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span className="text-sm text-gray-500 font-medium">Carregando dados...</span>
              </div>
            </div>
          )}
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            style={{ width: "100%", maxWidth: 700, height: "auto", display: "block", margin: "0 auto" }}
          >
            <defs>
              <filter id="state-shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#00000020"/>
              </filter>
            </defs>

            {geoFeatures.map(({ uf, path, cx, cy }) => {
              const t = getT(uf);
              const fill = heatColor(t);
              const isHov = hoveredUF === uf;
              const tc = textColor(t);

              return (
                <g key={uf} filter={isHov ? "url(#state-shadow)" : undefined}>
                  <path
                    d={path}
                    fill={fill}
                    stroke={isHov ? "#ea580c" : "white"}
                    strokeWidth={isHov ? 1.5 : 0.7}
                    style={{ cursor: "pointer", transition: "all 0.12s ease" }}
                    onMouseMove={e => {
                      setHoveredUF(uf);
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoveredUF(null)}
                  />
                  {cx > 0 && cy > 0 && (
                    <text
                      x={cx} y={cy}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={t > 0.5 ? 11 : 9}
                      fontWeight={t > 0.3 ? "700" : "500"}
                      fill={tc}
                      pointerEvents="none"
                      style={{ userSelect: "none" }}
                    >{uf}</text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Tooltip */}
          {hoveredUF && hoveredData && (
            <div
              className="fixed z-50 pointer-events-none"
              style={{ left: tooltipPos.x + 16, top: tooltipPos.y - 20 }}
            >
              <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3" style={{ minWidth: 200 }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-500"/>
                  <span className="font-bold text-gray-800 text-sm">{hoveredData.nome}</span>
                  <span className="text-xs text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded">{hoveredUF}</span>
                </div>
                <div className="text-xs text-gray-400 mb-2">{hoveredData.regiao}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-orange-50 rounded-lg p-2">
                    <div className="text-xs text-orange-600 font-medium">Vendas</div>
                    <div className="text-sm font-bold text-orange-700">{hoveredData.quantidade.toLocaleString("pt-BR")}</div>
                    <div className="text-xs text-orange-500">{hoveredData.percentual.toFixed(1)}% do total</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2">
                    <div className="text-xs text-green-600 font-medium">Faturamento</div>
                    <div className="text-sm font-bold text-green-700">{fmt(hoveredData.valor)}</div>
                    <div className="text-xs text-green-500">{hoveredData.percentualValor.toFixed(1)}% do fat.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Legenda gradiente no canto */}
          <div className="absolute bottom-5 left-5 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {metricMode === "vendas" ? "Intensidade de Vendas" : "Intensidade de Faturamento"}
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md overflow-hidden" style={{
                width: 16, height: 100,
                background: "linear-gradient(to bottom, rgb(153,27,27), rgb(239,68,68), rgb(253,155,50), rgb(254,220,100), rgb(196,220,255), #e8eaf0)"
              }}/>
              <div className="flex flex-col justify-between h-[100px] text-xs text-gray-500">
                <span className="font-semibold text-red-700">Muito alto</span>
                <span>Alto</span>
                <span>Médio</span>
                <span>Baixo</span>
                <span className="text-gray-400">Sem dados</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-56 border-l border-gray-200 bg-white flex flex-col">
          {/* Por Região */}
          <div className="p-4 border-b border-gray-100">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Por Região</h4>
            <div className="space-y-3">
              {REGIOES_ORDER.map(nome => {
                const r = regioes.find(x => x.nome === nome);
                const pct = r?.percentual ?? 0;
                const colors: Record<string, string> = {
                  Sudeste: "bg-red-500", Sul: "bg-orange-500",
                  Nordeste: "bg-amber-500", "Centro-Oeste": "bg-yellow-500", Norte: "bg-blue-400"
                };
                return (
                  <div key={nome}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-600 font-medium">{nome}</span>
                      <span className="text-xs font-bold text-gray-800">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors[nome] || "bg-orange-400"} rounded-full transition-all duration-700`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    {r && (
                      <div className="text-xs text-gray-400 mt-0.5">{r.quantidade} vendas · {fmt(r.valor)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Estados */}
          <div className="p-4 flex-1">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Top Estados</h4>
            <div className="space-y-1.5">
              {estados.slice(0, 10).map((e, i) => {
                const t = getT(e.uf);
                const bg = heatColor(t);
                return (
                  <div
                    key={e.uf}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-all ${
                      hoveredUF === e.uf ? "ring-1 ring-orange-400 bg-orange-50" : "hover:bg-gray-50"
                    }`}
                    onMouseEnter={() => setHoveredUF(e.uf)}
                    onMouseLeave={() => setHoveredUF(null)}
                  >
                    {/* Rank badge */}
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: i < 3 ? heatColor(1 - i * 0.15) : "#d1d5db", color: i < 3 ? "#fff" : "#6b7280" }}>
                      {i + 1}
                    </span>
                    {/* Color swatch */}
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: bg, border: "1px solid rgba(0,0,0,0.1)" }}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-700 truncate">{e.uf} · {e.nome.split(" ")[0]}</div>
                      <div className="text-xs text-gray-400">{e.quantidade} vendas</div>
                    </div>
                    <span className="text-xs font-bold text-orange-600 flex-shrink-0">{e.percentual.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
