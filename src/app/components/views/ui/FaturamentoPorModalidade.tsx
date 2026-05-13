"use client";

import { useEffect, useState } from "react";
import type { FiltroPeriodo } from "./FiltrosDashboard";
import type { FiltroCanal, FiltroStatus, FiltroTipoAnuncio, FiltroModalidadeEnvio } from "./FiltrosDashboardExtra";
import type { FiltroAgrupamentoSKU } from "./FiltroSKU";

interface ModalidadeData {
  modalidade: string;
  faturamento: number;
  quantidade: number;
  percentual: number;
}

interface Props {
  periodoAtivo: FiltroPeriodo;
  dataInicioPersonalizada: Date | null;
  dataFimPersonalizada: Date | null;
  canalAtivo: FiltroCanal;
  statusAtivo: FiltroStatus;
  tipoAnuncioAtivo: FiltroTipoAnuncio;
  modalidadeEnvioAtiva: FiltroModalidadeEnvio;
  agrupamentoSKUAtivo: FiltroAgrupamentoSKU;
  selectedAccount: { platform: "meli" | "shopee" | "todos"; id?: string; label?: string };
  refreshKey: number;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Paleta de laranjas do mais escuro (maior) para o mais claro (menor)
const ORANGE_PALETTE = [
  "#7c2d12", "#9a3412", "#c2410c", "#ea580c",
  "#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5",
];

function getColor(index: number, total: number): string {
  const palette = ORANGE_PALETTE.slice(0, Math.min(total, ORANGE_PALETTE.length));
  return palette[index] ?? "#fdba74";
}

function shortName(modalidade: string): string {
  if (modalidade.length <= 18) return modalidade;
  return modalidade.slice(0, 16) + "…";
}

export default function FaturamentoPorModalidade({
  periodoAtivo, dataInicioPersonalizada, dataFimPersonalizada,
  canalAtivo, statusAtivo, tipoAnuncioAtivo, modalidadeEnvioAtiva,
  agrupamentoSKUAtivo, selectedAccount, refreshKey,
}: Props) {
  const [modalidades, setModalidades] = useState<ModalidadeData[]>([]);
  const [totalFaturamento, setTotalFaturamento] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ periodo: periodoAtivo, canal: canalAtivo, status: statusAtivo });
        if (periodoAtivo === "personalizado" && dataInicioPersonalizada && dataFimPersonalizada) {
          params.append("dataInicio", dataInicioPersonalizada.toISOString());
          params.append("dataFim", dataFimPersonalizada.toISOString());
        }
        if (tipoAnuncioAtivo && tipoAnuncioAtivo !== "todos") params.append("tipoAnuncio", tipoAnuncioAtivo);
        if (modalidadeEnvioAtiva && modalidadeEnvioAtiva !== "todos") params.append("modalidade", modalidadeEnvioAtiva);
        if (agrupamentoSKUAtivo && agrupamentoSKUAtivo !== "mlb") params.append("agrupamentoSKU", agrupamentoSKUAtivo);
        if (selectedAccount?.platform !== "todos" && selectedAccount?.id) {
          params.append("accountPlatform", selectedAccount.platform);
          params.append("accountId", selectedAccount.id);
        }
        const res = await fetch(`/api/dashboard/faturamento-por-modalidade?${params}`);
        if (res.ok) {
          const data = await res.json();
          setModalidades(data.modalidades || []);
          setTotalFaturamento(data.totalFaturamento || 0);
        }
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    };
    load();
  }, [periodoAtivo, dataInicioPersonalizada, dataFimPersonalizada, canalAtivo, statusAtivo,
      tipoAnuncioAtivo, modalidadeEnvioAtiva, agrupamentoSKUAtivo, selectedAccount, refreshKey]);

  // Skeleton
  if (isLoading) {
    return (
      <div className="bg-[#F3F3F3] rounded-lg border border-gray-200 p-3 shadow-sm animate-pulse h-full">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="flex gap-6">
          <div className="flex-1 h-72 bg-gray-100 rounded" />
          <div className="w-40 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-3 bg-gray-200 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (modalidades.length === 0) {
    return (
      <div className="bg-[#F3F3F3] rounded-lg border border-gray-200 p-3 shadow-sm h-full">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H14a1 1 0 001-1v-5h2.5a1 1 0 00.8-.4l2-3A1 1 0 0020 6H15a1 1 0 00-1 1v5H4V5a1 1 0 00-1-1z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Faturamento por Mod. Envio</h3>
            <p className="text-xs text-gray-500">Participação percentual das modalidades</p>
          </div>
        </div>
        <div className="h-48 flex items-center justify-center text-xs text-gray-400">
          Nenhum dado encontrado no período
        </div>
      </div>
    );
  }

  const BAR_HEIGHT = 420; // px da barra empilhada

  return (
    <div className="bg-[#F3F3F3] rounded-lg border border-gray-200 p-3 shadow-sm h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H14a1 1 0 001-1v-5h2.5a1 1 0 00.8-.4l2-3A1 1 0 0020 6H15a1 1 0 00-1 1v5H4V5a1 1 0 00-1-1z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Faturamento por Mod. Envio</h3>
          <p className="text-xs text-gray-500">Participação percentual das modalidades</p>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* Eixo Y + Barra */}
        <div className="flex gap-2 items-stretch">
          {/* Eixo Y */}
          <div className="flex flex-col justify-between text-xs text-gray-400 font-medium pb-10" style={{ height: BAR_HEIGHT }}>
            {["100%", "80%", "60%", "40%", "20%", "0%"].map(l => (
              <span key={l} className="leading-none">{l}</span>
            ))}
          </div>

          {/* Barra empilhada + label abaixo */}
          <div className="flex flex-col items-center">
            <div
              className="relative rounded-md overflow-hidden"
              style={{ width: 90, height: BAR_HEIGHT }}
            >
              {/* Linhas de grade */}
              {[0, 20, 40, 60, 80].map(pct => (
                <div
                  key={pct}
                  className="absolute w-full border-t border-white/30 z-10 pointer-events-none"
                  style={{ top: `${pct}%` }}
                />
              ))}

              {/* Segmentos empilhados (maior embaixo = mais escuro) */}
              {[...modalidades].reverse().map((mod, revIdx) => {
                const idx = modalidades.length - 1 - revIdx;
                const color = getColor(idx, modalidades.length);
                const isHov = hoveredIdx === idx;
                const heightPx = (mod.percentual / 100) * BAR_HEIGHT;
                const showLabel = heightPx >= 22;

                return (
                  <div
                    key={mod.modalidade}
                    className="relative flex items-center justify-center cursor-pointer transition-all duration-150"
                    style={{
                      backgroundColor: color,
                      height: `${mod.percentual}%`,
                      width: "100%",
                      filter: isHov ? "brightness(1.15)" : "brightness(1)",
                    }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {showLabel && (
                      <span className="text-white font-bold text-xs select-none z-10">
                        {mod.percentual.toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Label abaixo da barra */}
            <div className="mt-2 text-center">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Faturamento Total</div>
              <div className="text-sm font-bold text-gray-800 mt-0.5">{fmt(totalFaturamento)}</div>
            </div>
          </div>
        </div>

        {/* Legenda */}
        <div className="flex-1 flex flex-col gap-1.5 pt-1">
          {modalidades.map((mod, idx) => {
            const color = getColor(idx, modalidades.length);
            const isHov = hoveredIdx === idx;
            return (
              <div
                key={mod.modalidade}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-all ${
                  isHov ? "bg-orange-50 ring-1 ring-orange-200" : "hover:bg-gray-100"
                }`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Cor swatch */}
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                {/* Nome */}
                <span className="flex-1 text-xs text-gray-700 font-medium truncate" title={mod.modalidade}>
                  {shortName(mod.modalidade)}
                </span>
                {/* Percentual */}
                <span className="text-xs font-bold text-gray-800 tabular-nums">
                  {mod.percentual.toFixed(1)}%
                </span>
              </div>
            );
          })}

          {/* Tooltip detalhado ao hover */}
          {hoveredIdx !== null && modalidades[hoveredIdx] && (
            <div className="mt-3 p-3 bg-white rounded-xl border border-orange-200 shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getColor(hoveredIdx, modalidades.length) }} />
                <span className="text-xs font-bold text-gray-800">{modalidades[hoveredIdx].modalidade}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-400">Faturamento</div>
                  <div className="font-bold text-orange-600">{fmt(modalidades[hoveredIdx].faturamento)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Participação</div>
                  <div className="font-bold text-gray-700">{modalidades[hoveredIdx].percentual.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-400">Pedidos</div>
                  <div className="font-bold text-gray-700">{modalidades[hoveredIdx].quantidade.toLocaleString("pt-BR")}</div>
                </div>
                <div>
                  <div className="text-gray-400">Ticket Médio</div>
                  <div className="font-bold text-gray-700">
                    {modalidades[hoveredIdx].quantidade > 0
                      ? fmt(modalidades[hoveredIdx].faturamento / modalidades[hoveredIdx].quantidade)
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
