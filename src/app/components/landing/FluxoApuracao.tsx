"use client";

/**
 * O fluxo de apuração mensal, com as etapas EXATAS de `src/lib/tarefa-etapas.ts`
 * (Simples Nacional: 10, Lucro Presumido: 14). Os títulos são copiados de lá:
 * se o fluxo mudar, esta lista precisa mudar junto.
 *
 * Abas acessíveis: setas esquerda/direita trocam de regime, e só a aba ativa
 * fica no Tab, como pede o padrão de tablist.
 */

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";

type Regime = {
  chave: "simples" | "presumido";
  nome: string;
  etapas: string[];
  /** Índice (base 0) da etapa em andamento no exemplo. */
  atual: number;
};

const REGIMES: Regime[] = [
  {
    chave: "simples",
    nome: "Simples Nacional",
    atual: 6,
    etapas: [
      "Recebimento de documentos do cliente",
      "Captura dos XMLs de faturamento e documentos fiscais",
      "Conferência dos documentos recebidos",
      "Apuração do faturamento no sistema (PGDAS-D)",
      "Cálculo e apuração do DAS",
      "Conferência da apuração",
      "Geração da guia DAS",
      "Envio da guia por e-mail ao cliente",
      "Upload dos documentos no sistema",
      "Encerramento da competência",
    ],
  },
  {
    chave: "presumido",
    nome: "Lucro Presumido",
    atual: 7,
    etapas: [
      "Recebimento de documentos do cliente",
      "Captura dos XMLs de faturamento e documentos fiscais",
      "Conferência e classificação contábil",
      "Lançamentos contábeis do período",
      "Apuração de PIS/COFINS, IRPJ/CSLL",
      "Apuração de ICMS/ISS",
      "Conferência da apuração",
      "Geração das guias (DARF, ICMS, ISS)",
      "Envio das guias por e-mail ao cliente",
      "Upload dos documentos e guias no sistema",
      "Envio das Obrigações Acessórias Mensais",
      "Fechamento contábil do período (balancete)",
      "Envio de relatórios gerenciais (opcional)",
      "Encerramento da competência",
    ],
  },
];

export default function FluxoApuracao() {
  const [ativo, setAtivo] = useState(0);
  const abas = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();
  const regime = REGIMES[ativo];
  const concluidas = regime.atual;

  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const proximo = (ativo + (e.key === "ArrowRight" ? 1 : REGIMES.length - 1)) % REGIMES.length;
    setAtivo(proximo);
    abas.current[proximo]?.focus();
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm sm:p-7">
      <div role="tablist" aria-label="Regime tributário" className="grid grid-cols-2 gap-1 rounded-[14px] border border-white/10 bg-black/20 p-1">
        {REGIMES.map((r, i) => {
          const selecionado = i === ativo;
          return (
            <button
              key={r.chave}
              ref={(el) => {
                abas.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-aba-${r.chave}`}
              aria-selected={selecionado}
              aria-controls={`${base}-painel`}
              tabIndex={selecionado ? 0 : -1}
              onClick={() => setAtivo(i)}
              onKeyDown={aoTeclar}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-bold tracking-[-0.01em] transition-colors sm:flex-row sm:gap-1.5 ${
                selecionado ? "bg-white text-[#14161B] shadow-sm" : "text-white/60 hover:text-white"
              }`}
            >
              <span className="whitespace-nowrap">{r.nome}</span>
              <span className={`whitespace-nowrap font-mono text-[11px] font-medium ${selecionado ? "text-[#D9500A]" : "text-white/40"}`}>
                {r.etapas.length} etapas
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${base}-painel`}
        aria-labelledby={`${base}-aba-${regime.chave}`}
        className="mt-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">Competência de exemplo</p>
            <p className="mt-1 text-[15px] font-bold text-white">Agosto de 2026</p>
          </div>
          <p className="czl-num text-[13px] font-semibold text-white/70">
            <span className="text-white">{concluidas}</span> de {regime.etapas.length} etapas concluídas
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full rounded-full bg-[linear-gradient(90deg,#F26212,#FF9A5C)] transition-[width] duration-500"
            style={{ width: `${(concluidas / regime.etapas.length) * 100}%` }}
          />
        </div>

        <ol className="mt-6 space-y-1">
          {regime.etapas.map((etapa, i) => {
            const feita = i < regime.atual;
            const atual = i === regime.atual;
            return (
              <li
                key={etapa}
                className={`flex items-center gap-3 rounded-[12px] px-2.5 py-2 ${atual ? "bg-[#F26212]/12 ring-1 ring-[#F26212]/40" : ""}`}
              >
                <span
                  className={`czl-num grid size-7 shrink-0 place-items-center rounded-full text-[11.5px] font-bold ${
                    feita
                      ? "bg-[#47CD89]/15 text-[#47CD89]"
                      : atual
                        ? "czl-pulso bg-[#F26212] text-white"
                        : "bg-white/[0.06] text-white/40"
                  }`}
                >
                  {feita ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={`min-w-0 flex-1 text-[14px] leading-snug ${
                    atual ? "font-bold text-white" : feita ? "text-white/60" : "text-white/40"
                  }`}
                >
                  {etapa}
                  <span className="sr-only">{feita ? " (concluída)" : atual ? " (em andamento)" : " (pendente)"}</span>
                </span>
                {atual && (
                  <span className="hidden shrink-0 rounded-full bg-[#F26212] px-2.5 py-1 text-[11px] font-bold text-white sm:inline">
                    Em revisão
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
