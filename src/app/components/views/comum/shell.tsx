"use client";

/**
 * Moldura e peças de tela compartilhadas pelas telas novas do CONTAZOOM.
 *
 * Nada aqui é específico de um módulo: é a estrutura (sidebar, topbar, fundo), o
 * cartão de indicador, a célula de cabeçalho, a miniatura, a paginação e os
 * estados de vazio/carregando. Vive numa pasta neutra para que uma tela de
 * estoque não precise importar de uma pasta chamada `anuncios/`.
 */

import { useState, type ReactNode } from "react";

import Sidebar from "../ui/Sidebar";
import Topbar from "../ui/Topbar";
import { inteiro } from "./formato";

/* -------------------------------------------------------------------------- */
/*                                  Moldura                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sidebar, Topbar e o fundo da área de conteúdo.
 *
 * Segue o padrão de `GestaoSKU`, que é como todas as telas do projeto se montam.
 * Fica aqui porque são ~25 linhas de estrutura que nenhuma tela deveria repetir.
 */
export function MolduraTela({ children }: { children: ReactNode }) {
  const [colapsada, setColapsada] = useState(false);
  const [menuMobile, setMenuMobile] = useState(false);

  const mdLeftVar = "md:left-[var(--sidebar-w,16rem)]";
  const mdMlVar = "md:ml-[var(--sidebar-w,16rem)]";

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Sidebar
        collapsed={colapsada}
        mobileOpen={menuMobile}
        onMobileClose={() => setMenuMobile(false)}
      />
      <Topbar
        collapsed={colapsada}
        onToggleCollapse={() => setColapsada((v) => !v)}
        onMobileMenu={() => setMenuMobile(true)}
      />

      <div className={`fixed top-16 bottom-0 left-0 right-0 ${mdLeftVar} z-10 bg-[#F3F3F3]`}>
        <div className="h-full w-full rounded-tl-none md:rounded-tl-2xl border border-gray-200 bg-white" />
      </div>

      <main className={`relative z-20 pt-16 px-3 pb-3 sm:px-6 sm:pb-6 ${mdMlVar}`}>
        <section className="p-3 sm:p-6">{children}</section>
      </main>
    </div>
  );
}

export function Cabecalho({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">{titulo}</h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-gray-500">{descricao}</p>
      </div>
      {acao}
    </header>
  );
}

export function BotaoAtualizar({
  onClick,
  atualizando,
  desabilitado,
  rotulo = "Atualizar estoque",
  rotuloAtivo = "Atualizando…",
  /** 0 a 100. Quando informado, o botão vira a própria barra de progresso. */
  percentual,
}: {
  onClick: () => void;
  atualizando: boolean;
  desabilitado: boolean;
  rotulo?: string;
  rotuloAtivo?: string;
  percentual?: number | null;
}) {
  const pct = percentual ?? null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={atualizando || desabilitado}
      aria-live="polite"
      className="relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-xl bg-emerald-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-100"
    >
      {/* A barra é o próprio botão, e não uma barra separada: durante um sync de
          minutos, um botão desabilitado sem sinal de vida parece travado. Por isso
          `disabled:opacity-100` — apagar o botão apagaria a barra junto. */}
      {atualizando && pct !== null && (
        <span
          className="absolute inset-y-0 left-0 bg-emerald-800/70 transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(pct, 3)}%` }}
          aria-hidden
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        <svg
          className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
        {atualizando
          ? pct !== null
            ? `${rotuloAtivo} ${Math.round(pct)}%`
            : rotuloAtivo
          : rotulo}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Filtros                                   */
/* -------------------------------------------------------------------------- */

export function PainelFiltros({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-12">{children}</div>
      {nota}
    </div>
  );
}

export function Campo({
  rotulo,
  className = "",
  children,
}: {
  rotulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">
        {rotulo}
      </span>
      {children}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Indicadores                                 */
/* -------------------------------------------------------------------------- */

export function Kpi({
  rotulo,
  valor,
  nota,
  destaque = false,
  tom,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  destaque?: boolean;
  tom?: "alerta" | "critico";
}) {
  const casca =
    tom === "critico"
      ? "border-rose-200 bg-rose-50"
      : tom === "alerta"
        ? "border-amber-200 bg-amber-50"
        : destaque
          ? "border-emerald-200 bg-emerald-50"
          : "border-gray-200 bg-white";
  const cor =
    tom === "critico"
      ? "text-rose-800"
      : tom === "alerta"
        ? "text-amber-800"
        : destaque
          ? "text-emerald-800"
          : "text-gray-900";

  return (
    <div className={`rounded-2xl border p-4 ${casca}`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.07em] text-gray-500">
        {rotulo}
      </span>
      <strong className={`mt-1 block text-[19px] font-bold tabular-nums ${cor}`}>{valor}</strong>
      {nota && <span className="mt-0.5 block text-[10.5px] text-gray-500">{nota}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Tabela                                    */
/* -------------------------------------------------------------------------- */

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 font-bold ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </th>
  );
}

export function CabecalhoTabela({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-gray-200 bg-gray-50/80 text-[10px] font-bold uppercase tracking-[0.06em] text-gray-500">
        {children}
      </tr>
    </thead>
  );
}

/**
 * Cabeçalho ORDENÁVEL: renderiza o próprio `<th>` com botão e indicador.
 *
 * Clique em coluna nova ordena decrescente (é o que se quer 90% das vezes:
 * "mostre-me os maiores"); clicar de novo na coluna ativa inverte.
 */
export function ThOrdenavel<C extends string>({
  campo,
  rotulo,
  ordemAtual,
  direcaoAtual,
  onOrdenar,
  align = "right",
  className = "",
}: {
  campo: C;
  rotulo: string;
  ordemAtual: C;
  direcaoAtual: "asc" | "desc";
  onOrdenar: (campo: C, direcao: "asc" | "desc") => void;
  align?: "left" | "right";
  className?: string;
}) {
  const ativo = ordemAtual === campo;
  const proxima: "asc" | "desc" = ativo && direcaoAtual === "desc" ? "asc" : "desc";

  return (
    <th
      scope="col"
      aria-sort={ativo ? (direcaoAtual === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2.5 font-bold ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo, proxima)}
        title={`Ordenar por ${rotulo}`}
        className={`inline-flex items-center gap-1 transition-colors hover:text-emerald-700 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${ativo ? "text-emerald-700" : ""}`}
      >
        <span aria-hidden className="text-[11px] leading-none">
          {ativo ? (direcaoAtual === "desc" ? "▼" : "▲") : "⇅"}
        </span>
        <span>{rotulo}</span>
      </button>
    </th>
  );
}

/** Miniatura com fallback: `onError` cobre link expirado do CDN do ML. */
export function Miniatura({
  src,
  alt,
  tamanho = 44,
}: {
  src: string | null;
  alt: string;
  tamanho?: number;
}) {
  const [falhou, setFalhou] = useState(false);
  const lado = { width: tamanho, height: tamanho };

  if (!src || falhou) {
    return (
      <span
        style={lado}
        className="grid shrink-0 place-items-center rounded-lg border border-gray-200 bg-gray-50 text-gray-300"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="m3 16 5-5 4 4 3-3 6 6" />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={tamanho}
      height={tamanho}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
      style={lado}
      className="shrink-0 rounded-lg border border-gray-200 bg-white object-contain"
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                            Estados e avisos                                */
/* -------------------------------------------------------------------------- */

export function Aviso({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center">
      <h3 className="text-[14px] font-semibold text-gray-900">{titulo}</h3>
      <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-gray-500">{texto}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function Esqueleto({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="animate-pulse divide-y divide-gray-100">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <div className="size-11 shrink-0 rounded-lg bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-gray-100" />
            <div className="h-2.5 w-1/4 rounded bg-gray-100" />
          </div>
          <div className="h-3 w-16 rounded bg-gray-100" />
          <div className="h-3 w-20 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

export function Paginacao({
  pagina,
  totalPaginas,
  total,
  porPagina,
  onPagina,
  onPorPagina,
  rotulo = "registros",
  opcoesPorPagina = [20, 50, 100],
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onPagina: (p: number) => void;
  onPorPagina: (v: number) => void;
  rotulo?: string;
  opcoesPorPagina?: number[];
}) {
  const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ate = Math.min(pagina * porPagina, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 text-[12px] text-gray-600">
      <span>
        Mostrando <strong>{inteiro(de)}</strong> a <strong>{inteiro(ate)}</strong> de{" "}
        <strong>{inteiro(total)}</strong> {rotulo}
      </span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          Por página
          <select
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-[12px]"
          >
            {opcoesPorPagina.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPagina(pagina - 1)}
            disabled={pagina <= 1}
            className="h-8 rounded-lg border border-gray-300 px-2.5 font-semibold transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-2 tabular-nums">
            {pagina} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => onPagina(pagina + 1)}
            disabled={pagina >= totalPaginas}
            className="h-8 rounded-lg border border-gray-300 px-2.5 font-semibold transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
