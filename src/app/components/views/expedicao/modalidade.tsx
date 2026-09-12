"use client";

/**
 * Modalidade de envio: rótulo, cor e ícone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTADO DO `MODE_META` DO CYBERDOCK, COM AS MESMAS CORES
 *
 * Aqui as cores NÃO viraram laranja da marca, e é deliberado: elas não indicam
 * ação nem estado, elas IDENTIFICAM a transportadora. O operador varre a coluna
 * de envio procurando "tudo que sai por coleta hoje", e é a cor que faz FULL,
 * FLEX, Coleta e Agência se separarem num relance. Neutralizar tudo para "ficar
 * na paleta" seria trocar informação por coerência.
 *
 * O ícone é o segundo canal da mesma informação, para quem não distingue azul de
 * ciano — e são justamente FULL (azul) e Envio Padrão (ciano) os dois mais
 * parecidos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";

export type MetaModalidade = {
  /** Como aparece na pastilha. MAIÚSCULA, igual ao CyberDock. */
  rotulo: string;
  /** Cor do texto e do ícone. */
  cor: string;
  /** Cor de fundo da pastilha. */
  fundo: string;
  /** Cor da borda. O CyberDock não tem fio; aqui tem, para a pastilha clara não
   *  se dissolver na linha branca da tabela. */
  borda: string;
  icone: ReactNode;
};

const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-3.5 w-3.5 shrink-0"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const META: Record<string, MetaModalidade> = {
  FULL: {
    rotulo: "FULL",
    cor: "#2563eb",
    fundo: "#eff6ff",
    borda: "#bfdbfe",
    icone: svg(
      <>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </>,
    ),
  },
  FLEX: {
    rotulo: "FLEX",
    cor: "#ea580c",
    fundo: "#fff7ed",
    borda: "#fed7aa",
    icone: svg(
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </>,
    ),
  },
  Correios: {
    rotulo: "CORREIOS",
    cor: "#16a34a",
    fundo: "#f0fdf4",
    borda: "#bbf7d0",
    icone: svg(
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </>,
    ),
  },
  Agência: {
    rotulo: "AGÊNCIA",
    cor: "#0369a1",
    fundo: "#f0f9ff",
    borda: "#bae6fd",
    icone: svg(
      <>
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="9" y1="12" x2="9.01" y2="12" />
      </>,
    ),
  },
  Coleta: {
    rotulo: "COLETA",
    cor: "#2563eb",
    fundo: "#eff6ff",
    borda: "#bfdbfe",
    icone: svg(
      <>
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </>,
    ),
  },
  "Envio Padrão": {
    rotulo: "ENVIO PADRÃO",
    cor: "#0891b2",
    fundo: "#ecfeff",
    borda: "#a5f3fc",
    icone: svg(
      <>
        <path d="M16.5 9.4 7.55 4.24" />
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </>,
    ),
  },
  Outros: {
    rotulo: "OUTROS",
    cor: "#64748b",
    fundo: "#f1f5f9",
    borda: "#e2e8f0",
    icone: svg(
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </>,
    ),
  },
};

/**
 * A meta de uma modalidade, com "Outros" como reserva.
 *
 * A busca é TOLERANTE porque a modalidade chega normalizada de duas fontes
 * diferentes: no Mercado Livre é o modo de envio, na Shopee é a transportadora
 * ("Coleta Shopee", "Jadlog", "Correios"). Casar só por igualdade exata jogaria
 * quase tudo da Shopee em "Outros", que é justamente onde a cor deixa de
 * informar. Então: igualdade primeiro, e depois "contém".
 */
export function metaModalidade(modalidade: string | null | undefined): MetaModalidade {
  const bruto = (modalidade ?? "").trim();
  if (bruto === "") return META.Outros;

  const exato = META[bruto];
  if (exato) return exato;

  const alvo = bruto.toLocaleUpperCase("pt-BR");
  for (const [chave, meta] of Object.entries(META)) {
    if (chave === "Outros") continue;
    if (alvo.includes(chave.toLocaleUpperCase("pt-BR"))) return meta;
  }

  // Nome desconhecido continua aparecendo POR EXTENSO, com a casca neutra: a
  // transportadora nova da Shopee é informação, e trocá-la por "OUTROS"
  // esconderia de onde o pacote sai.
  return { ...META.Outros, rotulo: bruto.toLocaleUpperCase("pt-BR") };
}

/** A pastilha da modalidade, como no CyberDock: cápsula com ícone e rótulo. */
export function PastilhaModalidade({ modalidade }: { modalidade: string | null }) {
  const meta = metaModalidade(modalidade);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11.5px] font-bold leading-none"
      style={{ color: meta.cor, background: meta.fundo, borderColor: meta.borda }}
      title={modalidade ?? "Modalidade não informada"}
    >
      {meta.icone}
      {meta.rotulo}
    </span>
  );
}
