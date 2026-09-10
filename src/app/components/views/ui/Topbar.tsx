"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import UserAvatar from "./UserAvatar";

type TopbarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void; // desktop
  onMobileMenu: () => void; // mobile
};

const LABEL_MAP: Record<string, string> = {
  dashboard: "Dashboard",
  vendas: "Central de Vendas",
  geral: "Vendas Geral",
  "mercado-livre": "Vendas Mercado Livre",
  shopee: "Vendas Shopee",
  sku: "Gestão de SKU",
  contas: "Contas de plataforma",
  financeiro: "Financeiro",
  dashboardfinanceiro: "Dashboard Financeiro",
  financas: "Finanças",
  dre: "DRE",
  aliquotas: "Alíquotas de Impostos",
  documentos: "Documentos",
};

function toLabel(slug: string) {
  return (
    LABEL_MAP[slug] ??
    slug.replace(/-/g, " ").replace(/\b\w/g, (s) => s.toUpperCase())
  );
}

export default function Topbar({
  collapsed,
  onToggleCollapse,
  onMobileMenu,
}: TopbarProps) {
  const pathname = usePathname() || "/";
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: toLabel(seg),
  }));

  /**
   * Só o CHEVRON gira, não o ícone inteiro.
   *
   * O ícone é um painel (retângulo + divisa) com uma setinha dentro. Girar tudo
   * 180° viraria o painel de cabeça para baixo e a divisa mudaria de lado, o que
   * lê como "outro ícone" em vez de "mesmo ícone, outro estado".
   */
  const chevronRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    gsap.to(chevronRef.current, {
      rotate: collapsed ? 180 : 0,
      // Centro do próprio chevron, em unidades do viewBox. Com o padrão (50% 50%)
      // ele giraria em torno do centro do ícone e sairia de dentro do painel.
      transformOrigin: "15px 12px",
      duration: 0.25,
      ease: "power2.inOut",
    });
  }, [collapsed]);

  return (
    <>
      {/* Superficie branca com um fio embaixo, na mesma altura do bloco da marca
          na barra lateral — os dois fios formam uma linha continua atravessando a
          tela. Era `bg-[#F3F3F3]` sem borda, do mesmo cinza do fundo, entao o
          cabecalho nao existia visualmente: o breadcrumb parecia flutuar solto
          acima do conteudo. */}
      <header
        className={[
          "fixed top-0 right-0 left-0 z-40 flex h-[var(--cz-topbar-h)] items-center",
          "border-b border-[var(--cz-hairline)] bg-[var(--cz-superficie)]",
          "left-0 md:left-[var(--sidebar-w)]", // acompanha a var no desktop
        ].join(" ")}
      >
        <div className="w-full px-3 sm:px-5">
          <div className="flex items-center gap-2">
            {/* Botão mobile (hambúrguer) */}
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-[var(--cz-texto-suave)] transition-colors hover:bg-[#F4F5F7] hover:text-[var(--cz-texto)]"
              onClick={onMobileMenu}
              aria-label="Abrir menu"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 pointer-events-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Recolher/expandir a barra lateral.
                DENTRO da linha do cabeçalho, como primeiro item. Antes era um
                bloco `fixed` posicionado em `left: calc(var(--sidebar-w) + …)`,
                ou seja, flutuava POR CIMA do breadcrumb com `z-50` — e como o
                cabeçalho também começa em `var(--sidebar-w)`, o botão cobria as
                primeiras letras do caminho ("Dashboard" aparecia como
                "shboard"). Como item de flex ele ocupa espaço de verdade, e o
                texto começa depois dele. */}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expandir o menu lateral" : "Recolher o menu lateral"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expandir o menu lateral" : "Recolher o menu lateral"}
              className="hidden shrink-0 items-center justify-center rounded-lg p-2 text-[var(--cz-texto-suave)] transition-colors hover:bg-[#F4F5F7] hover:text-[var(--cz-texto)] md:inline-flex"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] pointer-events-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <g ref={chevronRef}>
                  <path d="M16.5 9.5L14 12l2.5 2.5" />
                </g>
              </svg>
            </button>

            {/* Breadcrumb */}
            <nav
              aria-label="Breadcrumb"
              className="flex-1 flex items-center gap-2 text-sm overflow-hidden"
            >
              <Link
                href="/dashboard"
                className="truncate text-[var(--cz-texto-suave)] transition-colors hover:text-[var(--cz-texto)]"
              >
                Dashboard
              </Link>
              {crumbs
                .filter((c) => c.href !== "/dashboard")
                .map((c, idx, arr) => {
                  const isLast = idx === arr.length - 1;
                  return (
                    <span
                      key={c.href}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <span aria-hidden className="text-[var(--cz-texto-fraco)]">
                        ›
                      </span>
                      {isLast ? (
                        // O ultimo item e onde a pessoa esta: peso e tinta cheia.
                        // Os anteriores sao caminho de volta, em tinta suave.
                        <span className="cz-titulo truncate text-[14px]">
                          {c.label}
                        </span>
                      ) : (
                        <Link
                          href={c.href}
                          className="truncate text-[var(--cz-texto-suave)] transition-colors hover:text-[var(--cz-texto)]"
                        >
                          {c.label}
                        </Link>
                      )}
                    </span>
                  );
                })}
            </nav>

            {/* Avatar do usuário */}
            <div className="flex items-center">
              <UserAvatar />
            </div>
          </div>
        </div>
      </header>

    </>
  );
}
