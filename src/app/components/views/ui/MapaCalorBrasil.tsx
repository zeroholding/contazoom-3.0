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

// Projeção Mercator simples para o Brasil
function project(lon: number, lat: number, W: number, H: number): [number, number] {
  const lonMin = -74, lonMax = -28.6;
  const latMin = -33.75, latMax = 5.27;
  const x = ((lon - lonMin) / (lonMax - lonMin)) * W;
  const y = H - ((lat - latMin) / (latMax - latMin)) * H;
  return [x, y];
}

function coordsToPath(rings: number[][][], W: number, H: number): string {
  return rings
    .map((ring) =>
      ring.map((pt, i) => {
        const [x, y] = project(pt[0], pt[1], W, H);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ") + " Z"
    ).join(" ");
}

// UF por nome de propriedade no GeoJSON
function extractUF(props: Record<string, unknown>): string {
  const raw =
    (props.SIGLA as string) ||
    (props.sigla as string) ||
    (props.UF_05 as string) ||
    (props.CD_GEOCUF as string) ||
    (props.NM_ESTADO as string) ||
    "";
  // Se veio o nome completo, mapear
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
  return nameMap[raw] || raw.toUpperCase().slice(0, 2);
}

// Centróides aproximados dos estados para labels
const CENTROIDS: Record<string, [number, number]> = {
  AC: [-70.5, -9.0], AL: [-36.6, -9.6], AP: [-51.8, 1.4], AM: [-64.0, -3.5],
  BA: [-41.7, -12.5], CE: [-39.3, -5.2], DF: [-47.9, -15.8], ES: [-40.7, -19.5],
  GO: [-49.6, -15.9], MA: [-45.3, -5.4], MT: [-56.1, -12.7], MS: [-54.5, -20.5],
  MG: [-44.5, -18.1], PA: [-52.2, -3.8], PB: [-36.8, -7.2], PR: [-51.6, -24.7],
  PE: [-37.8, -8.4], PI: [-43.0, -7.7], RJ: [-43.2, -22.3], RN: [-36.5, -5.8],
  RS: [-53.1, -30.2], RO: [-62.8, -10.9], RR: [-61.4, 2.0], SC: [-50.5, -27.3],
  SP: [-48.7, -22.2], SE: [-37.4, -10.6], TO: [-48.3, -10.2],
};

function getHeatColor(intensidade: number): string {
  if (intensidade === 0) return "#1e2538";
  if (intensidade >= 0.85) return "#ff4500";
  if (intensidade >= 0.65) return "#ff6a00";
  if (intensidade >= 0.45) return "#ff8c00";
  if (intensidade >= 0.25) return "#ffa940";
  if (intensidade >= 0.10) return "#ffcd7a";
  return "#ffe8b0";
}

function getGlowColor(intensidade: number): string {
  if (intensidade === 0) return "none";
  if (intensidade >= 0.65) return "rgba(255,69,0,0.7)";
  if (intensidade >= 0.35) return "rgba(255,140,0,0.5)";
  return "rgba(255,200,100,0.3)";
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const REGIOES_ORDER = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte"];

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
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 600, H = 620;

  // Carregar GeoJSON uma vez
  useEffect(() => {
    fetch("/br-states.json")
      .then((r) => r.json())
      .then((geo: { features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] }) => {
        const features = geo.features.map((f) => {
          const uf = extractUF(f.properties);
          const geom = f.geometry;
          let path = "";
          if (geom.type === "Polygon") {
            path = coordsToPath(geom.coordinates as number[][][], W, H);
          } else if (geom.type === "MultiPolygon") {
            path = (geom.coordinates as number[][][][])
              .map((poly) => coordsToPath(poly, W, H))
              .join(" ");
          }
          const c = CENTROIDS[uf];
          const [cx, cy] = c ? project(c[0], c[1], W, H) : [0, 0];
          return { uf, path, cx, cy };
        }).filter((f) => f.path && f.uf);
        setGeoFeatures(features);
      });
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

  const getEstadoData = (uf: string) => estados.find((e) => e.uf === uf);
  const hoveredData = hoveredUF ? getEstadoData(hoveredUF) : null;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0d1117 0%, #161b27 50%, #0d1117 100%)",
        borderRadius: "16px",
        padding: "24px",
        boxShadow: "0 4px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Grid background */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, position: "relative" }}>
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.3px" }}>
            🔥 Mapa de Calor — Vendas por Estado
          </h2>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>
            Concentração geográfica de faturamento no Brasil
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setMetricMode("vendas")}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: metricMode === "vendas" ? "rgba(255,100,0,0.2)" : "rgba(255,255,255,0.05)",
              color: metricMode === "vendas" ? "#ff6a00" : "#9ca3af",
              transition: "all 0.2s",
            }}
          >Qtd. Vendas</button>
          <button
            onClick={() => setMetricMode("valor")}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: metricMode === "valor" ? "rgba(255,100,0,0.2)" : "rgba(255,255,255,0.05)",
              color: metricMode === "valor" ? "#ff6a00" : "#9ca3af",
              transition: "all 0.2s",
            }}
          >Faturamento</button>
        </div>
      </div>

      {/* Totais */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        {[
          { label: "Total de Vendas", value: totals.vendas.toLocaleString("pt-BR"), icon: "📦" },
          { label: "Faturamento Total", value: fmt(totals.valor), icon: "💰" },
          { label: "Estados Ativos", value: estados.length.toString(), icon: "📍" },
        ].map((item) => (
          <div key={item.label} style={{
            flex: 1, padding: "10px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{item.icon} {item.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Mapa SVG */}
        <div style={{ flex: 1, position: "relative" }}>
          {isLoading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(13,17,23,0.8)", borderRadius: 12, zIndex: 10,
            }}>
              <div style={{ color: "#ff6a00", fontSize: 14 }}>Carregando mapa...</div>
            </div>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", height: "auto", display: "block" }}
          >
            <defs>
              <filter id="glow-hot">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Estados */}
            {geoFeatures.map(({ uf, path, cx, cy }) => {
              const intens = getIntensidade(uf);
              const fill = getHeatColor(intens);
              const isHovered = hoveredUF === uf;
              const hasData = intens > 0;

              return (
                <g key={uf}>
                  <path
                    d={path}
                    fill={fill}
                    stroke={isHovered ? "#ff6a00" : "rgba(255,255,255,0.12)"}
                    strokeWidth={isHovered ? 1.5 : 0.5}
                    style={{
                      cursor: hasData ? "pointer" : "default",
                      transition: "all 0.15s",
                      filter: isHovered && hasData ? `drop-shadow(0 0 8px ${getGlowColor(intens)})` : undefined,
                      opacity: isHovered ? 0.95 : 1,
                    }}
                    onMouseMove={(e) => {
                      setHoveredUF(uf);
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoveredUF(null)}
                  />
                  {/* Label UF */}
                  {cx > 0 && cy > 0 && (
                    <text
                      x={cx} y={cy}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={intens > 0.5 ? 11 : 9}
                      fontWeight={intens > 0.3 ? "700" : "500"}
                      fill={intens > 0.4 ? "#fff" : "rgba(255,255,255,0.6)"}
                      pointerEvents="none"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
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
            <div style={{
              position: "fixed",
              left: tooltipPos.x + 14,
              top: tooltipPos.y - 10,
              background: "rgba(13,17,23,0.96)",
              border: "1px solid rgba(255,106,0,0.4)",
              borderRadius: 10,
              padding: "10px 14px",
              pointerEvents: "none",
              zIndex: 9999,
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              minWidth: 160,
            }}>
              <div style={{ color: "#ff6a00", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                {hoveredData.nome} ({hoveredUF})
              </div>
              <div style={{ color: "#9ca3af", fontSize: 11, marginBottom: 2 }}>{hoveredData.regiao}</div>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                📦 {hoveredData.quantidade.toLocaleString("pt-BR")} vendas
              </div>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                💰 {fmt(hoveredData.valor)}
              </div>
              <div style={{ color: "#6b7280", fontSize: 11, marginTop: 4 }}>
                {hoveredData.percentual.toFixed(1)}% das vendas • {hoveredData.percentualValor.toFixed(1)}% do fat.
              </div>
            </div>
          )}
        </div>

        {/* Painel direito */}
        <div style={{ width: 200, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Legenda gradiente */}
          <div>
            <div style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              Intensidade
            </div>
            <div style={{ position: "relative", height: 140 }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0, width: 20, borderRadius: 4,
                background: "linear-gradient(to bottom, #ff4500, #ff8c00, #ffcd7a, #ffe8b0, #1e2538)",
              }} />
              {["Muito Alta", "Alta", "Média", "Baixa", "Sem dados"].map((label, i) => (
                <div key={label} style={{
                  position: "absolute", left: 28, fontSize: 11, color: "#9ca3af",
                  top: `${i * 25}%`,
                }}>{label}</div>
              ))}
            </div>
          </div>

          {/* Regiões */}
          <div>
            <div style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              Por Região
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {REGIOES_ORDER.map((nomeRegiao) => {
                const r = regioes.find((reg) => reg.nome === nomeRegiao);
                if (!r) return null;
                return (
                  <div key={nomeRegiao}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ color: "#e5e7eb", fontSize: 12 }}>{nomeRegiao}</span>
                      <span style={{ color: "#ff8c00", fontSize: 12, fontWeight: 700 }}>
                        {r.percentual.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                      <div style={{
                        height: "100%", borderRadius: 2, width: `${r.percentual}%`,
                        background: "linear-gradient(90deg, #ff4500, #ff8c00)",
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top 5 estados */}
          <div>
            <div style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              Top 5 Estados
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {estados.slice(0, 5).map((e, i) => (
                <div
                  key={e.uf}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                    borderRadius: 6, cursor: "pointer",
                    background: hoveredUF === e.uf ? "rgba(255,106,0,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${hoveredUF === e.uf ? "rgba(255,106,0,0.3)" : "transparent"}`,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={() => setHoveredUF(e.uf)}
                  onMouseLeave={() => setHoveredUF(null)}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    background: i === 0 ? "#ff4500" : i === 1 ? "#ff6a00" : i === 2 ? "#ff8c00" : "rgba(255,255,255,0.1)",
                    fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 600 }}>{e.uf}</div>
                    <div style={{ color: "#6b7280", fontSize: 10 }}>{e.quantidade} vendas</div>
                  </div>
                  <span style={{ color: "#ff8c00", fontSize: 11, fontWeight: 700 }}>
                    {e.percentual.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
