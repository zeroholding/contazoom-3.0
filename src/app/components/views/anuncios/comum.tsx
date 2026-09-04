"use client";

/**
 * Peças visuais comuns às duas telas de anúncios.
 *
 * As telas são separadas porque respondem perguntas diferentes, mas a moldura, a
 * miniatura, os selos, a paginação e os avisos são os mesmos. Duplicar isso
 * faria as duas telas divergirem no acabamento com o tempo — e a divergência
 * apareceria justamente no detalhe que ninguém aponta e todo mundo sente.
 *
 * O que NÃO mora aqui, de propósito: as colunas da tabela, os indicadores e os
 * filtros. Cada tela decide os seus, porque é ali que elas realmente diferem.
 */

import { useState, type ReactNode } from "react";

import Sidebar from "../ui/Sidebar";
import Topbar from "../ui/Topbar";
import { brl, inteiro, type Linha } from "./tipos";

/* -------------------------------------------------------------------------- */
/*                                  Moldura                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sidebar, Topbar e o fundo da área de conteúdo.
 *
 * Copiado do padrão de `GestaoSKU`, que é como todas as telas do projeto se
 * montam. Fica aqui e não em cada tela porque são ~25 linhas de estrutura que
 * não têm nada a ver com anúncios.
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
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-gray-500">
          {descricao}
        </p>
      </div>
      {acao}
    </header>
  );
}

export function BotaoAtualizar({
  onClick,
  atualizando,
  desabilitado,
}: {
  onClick: () => void;
  atualizando: boolean;
  desabilitado: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={atualizando || desabilitado}
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
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
      {atualizando ? "Atualizando…" : "Atualizar estoque"}
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

/** Aviso de que o filtro escolhido obriga a consultar a API em tudo. */
export function NotaFiltroCaro({ visivel }: { visivel: boolean }) {
  if (!visivel) return null;
  return (
    <p className="mt-3 text-[11.5px] leading-relaxed text-amber-700">
      Filtrar por situação ou estoque exige consultar o Mercado Livre em todos os
      anúncios da lista, e não só nos exibidos — pode levar alguns segundos a mais.
    </p>
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
  tom?: "alerta";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tom === "alerta"
          ? "border-amber-200 bg-amber-50"
          : destaque
            ? "border-emerald-200 bg-emerald-50"
            : "border-gray-200 bg-white"
      }`}
    >
      <span className="block text-[10px] font-bold uppercase tracking-[0.07em] text-gray-500">
        {rotulo}
      </span>
      <strong
        className={`mt-1 block text-[19px] font-bold tabular-nums ${
          tom === "alerta" ? "text-amber-800" : destaque ? "text-emerald-800" : "text-gray-900"
        }`}
      >
        {valor}
      </strong>
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

/** A célula do anúncio: miniatura, título, MLB, conta, SKU e modalidade. */
export function CelulaAnuncio({ l, posicao }: { l: Linha; posicao?: number }) {
  return (
    <td className="py-3 pl-5 pr-3">
      <div className="flex items-center gap-3">
        {posicao !== undefined && (
          <span
            className={`w-6 shrink-0 text-center text-[13px] font-bold tabular-nums ${
              posicao <= 3 ? "text-emerald-700" : "text-gray-400"
            }`}
            aria-label={`Posição ${posicao}`}
          >
            {posicao}
          </span>
        )}
        <Miniatura src={l.thumbnailUrl} alt={l.titulo} />
        <div className="min-w-0">
          <span className="block truncate font-semibold text-gray-900" title={l.titulo}>
            {l.titulo}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">
              {l.itemId}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
              {l.conta}
            </span>
            {l.skus.length > 0 && (
              <span className="truncate font-mono text-gray-500" title={l.skus.join(" · ")}>
                {l.skus.length <= 2
                  ? l.skus.join(" · ")
                  : `${l.skus.slice(0, 2).join(" · ")} +${l.skus.length - 2}`}
              </span>
            )}
            {l.logisticType && <SeloEnvio tipo={l.logisticType} />}
          </span>
        </div>
      </div>
    </td>
  );
}

/**
 * A coluna de estoque.
 *
 * Três estados e não dois: número, `0` (esgotado) e vazio (a API não respondeu).
 * Mostrar vazio como zero faria a tela afirmar que o anúncio está sem estoque
 * quando ela apenas não sabe — e alguém compra mercadoria por causa disso.
 */
export function CelulaEstoque({ estoque }: { estoque: number | null }) {
  if (estoque === null) {
    return (
      <td className="px-3 py-3 text-right">
        <span className="text-gray-400" title="A API do Mercado Livre não respondeu">
          —
        </span>
      </td>
    );
  }
  return (
    <td className="px-3 py-3 text-right">
      <span
        className={`font-semibold tabular-nums ${
          estoque === 0 ? "text-rose-700" : "text-gray-900"
        }`}
      >
        {inteiro(estoque)}
        <span className="ml-1 text-[10.5px] font-medium text-gray-400">un.</span>
      </span>
    </td>
  );
}

export function CelulaAbrir({ l }: { l: Linha }) {
  return (
    <td className="py-3 pl-3 pr-5 text-right">
      {l.permalink ? (
        <a
          href={l.permalink}
          target="_blank"
          rel="noreferrer"
          title={`Abrir ${l.titulo} no Mercado Livre`}
          className="inline-grid size-9 place-items-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-emerald-400 hover:text-emerald-700"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
        </a>
      ) : (
        <span className="text-gray-300">—</span>
      )}
    </td>
  );
}

export function CelulaPreco({ preco }: { preco: number | null }) {
  return (
    <td className="px-3 py-3 text-right tabular-nums text-gray-700">
      {preco === null ? "—" : brl(preco)}
    </td>
  );
}

/** Miniatura com fallback: `onError` cobre link expirado do CDN do ML. */
export function Miniatura({ src, alt }: { src: string | null; alt: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!src || falhou) {
    return (
      <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-gray-200 bg-gray-50 text-gray-300">
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
      width={44}
      height={44}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
      className="size-11 shrink-0 rounded-lg border border-gray-200 bg-white object-contain"
    />
  );
}

export function SeloStatus({ status }: { status: string | null }) {
  const mapa: Record<string, { texto: string; casca: string }> = {
    active: { texto: "Ativo", casca: "bg-emerald-50 text-emerald-700" },
    paused: { texto: "Pausado", casca: "bg-amber-50 text-amber-700" },
    closed: { texto: "Finalizado", casca: "bg-rose-50 text-rose-700" },
    under_review: { texto: "Em revisão", casca: "bg-sky-50 text-sky-700" },
  };
  const m = status ? mapa[status] : undefined;
  if (!m) {
    return (
      <span
        className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-semibold text-gray-500"
        title="A API do Mercado Livre não respondeu para este anúncio"
      >
        Não consultado
      </span>
    );
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${m.casca}`}>
      {m.texto}
    </span>
  );
}

export function SeloEnvio({ tipo }: { tipo: string }) {
  const mapa: Record<string, string> = {
    fulfillment: "FULL",
    self_service: "FLEX",
    cross_docking: "Coleta",
    drop_off: "Agência",
    xd_drop_off: "Agência",
  };
  return (
    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
      {mapa[tipo] ?? tipo}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Estados e avisos                                */
/* -------------------------------------------------------------------------- */

/**
 * Aviso do backfill do `item_id`.
 *
 * Enquanto as vendas antigas não estão associadas ao anúncio, o ranking pode
 * estar incompleto. Mostrar número incompleto sem avisar é pior que demorar:
 * alguém decidiria compra com base num "mais vendido" que não é o verdadeiro.
 */
export function AvisoBackfill({ pendentes }: { pendentes: number }) {
  if (pendentes === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[12px] leading-relaxed text-sky-900">
      <strong>{inteiro(pendentes)} venda(s)</strong> ainda estão sendo associadas ao
      anúncio de origem. O ranking já funciona, mas fica mais completo a cada
      carregamento desta tela — o preenchimento é automático e não consome a API do
      Mercado Livre.
    </div>
  );
}

export function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center">
      <h3 className="text-[14px] font-semibold text-gray-900">{titulo}</h3>
      <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-gray-500">{texto}</p>
    </div>
  );
}

export function Esqueleto() {
  return (
    <div className="animate-pulse divide-y divide-gray-100">
      {Array.from({ length: 6 }).map((_, i) => (
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

export function RodapeFonte() {
  return (
    <p className="mt-4 text-[11.5px] leading-relaxed text-gray-500">
      Estoque, preço e situação são lidos no Mercado Livre a cada carregamento — não
      ficam guardados no banco, porque mudam a cada venda. Estoque em branco significa
      que a API não respondeu para aquele anúncio, e não que ele está zerado. A lista
      só inclui anúncios que já venderam ao menos uma vez.
    </p>
  );
}

export function Paginacao({
  pagina,
  totalPaginas,
  total,
  porPagina,
  onPagina,
  onPorPagina,
  rotulo = "anúncios",
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onPagina: (p: number) => void;
  onPorPagina: (v: number) => void;
  rotulo?: string;
}) {
  const de = (pagina - 1) * porPagina + 1;
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
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
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
