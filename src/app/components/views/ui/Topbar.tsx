"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import UserAvatar from "./UserAvatar";
import BottomNav from "./BottomNav";

type TopbarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void; // desktop
  onMobileMenu: () => void; // mobile
};

/**
 * Rótulo por CAMINHO COMPLETO, para os slugs que aparecem em mais de um módulo.
 *
 * `shopee` e `tiktok-shop` existem sob `/vendas` e sob `/expedicao`. Com o mapa
 * por segmento sozinho, `/expedicao/shopee` virava "Expedição › Vendas Shopee" —
 * o breadcrumb anunciava a tela errada. Consultado ANTES do mapa por segmento.
 */
const LABEL_POR_CAMINHO: Record<string, string> = {
  // `dashboard` sozinho vale "Dashboard", e sob `/financeiro` isso lia
  // "Dashboard › Financeiro › Dashboard". No celular só o último item aparece
  // como título, e "Dashboard" ali seria idêntico ao da aba Início.
  "/financeiro/dashboard": "Dashboard Financeiro",
  // Os nomes do menu lateral. Sem estas linhas o título do celular (só o último
  // item do caminho) lia "Mortos" e "Mais Vendidos", sem dizer de quê, e o
  // fallback por segmento escrevia "Configuracoes Frete" sem acento.
  "/anuncios": "Gestão de Anúncios",
  "/anuncios/mais-vendidos": "Anúncios Mais Vendidos",
  "/anuncios/mortos": "Anúncios Mortos",
  "/financeiro/configuracoes-frete": "Configuração de Frete",
  "/estoque-full": "Estoque Full",
  "/expedicao": "Expedição Geral",
  "/expedicao/mercado-livre": "Mercado Livre",
  "/expedicao/shopee": "Shopee",
  "/expedicao/tiktok-shop": "TikTok Shop",
};

const LABEL_MAP: Record<string, string> = {
  dashboard: "Dashboard",
  vendas: "Central de Vendas",
  geral: "Vendas Geral",
  "mercado-livre": "Vendas Mercado Livre",
  shopee: "Vendas Shopee",
  // Sem esta linha o fallback traduziria o slug para "Tiktok Shop", com o K
  // minúsculo. É a grafia da marca que está em jogo, não a capitalização.
  "tiktok-shop": "Vendas TikTok Shop",
  expedicao: "Expedição",
  sku: "Gestão de SKU",
  contas: "Contas de plataforma",
  financeiro: "Financeiro",
  dashboardfinanceiro: "Dashboard Financeiro",
  financas: "Finanças",
  dre: "DRE",
  aliquotas: "Alíquotas de Impostos",
  documentos: "Documentos",
};

function toLabel(slug: string, href: string) {
  return (
    LABEL_POR_CAMINHO[href] ??
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
  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    return { href, label: toLabel(seg, href) };
  });
  // No celular o caminho inteiro não cabe (nem faria sentido ler "Dashboard ›
  // Central de Vendas › Vendas Shopee" em 390px): fica só onde a pessoa está.
  const tituloAtual = crumbs.length > 0 ? crumbs[crumbs.length - 1].label : "Dashboard";

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
        {/* Celular: 4px à esquerda porque o botão de 44px já traz 12px de folga
            ao redor do ícone, o que põe o desenho a 16px da borda — o mesmo
            recuo do conteúdo da página. À direita, 16px cheios para o avatar. */}
        <div className="w-full pl-1 pr-4 sm:px-5">
          <div className="flex items-center gap-2">
            {/* Botão mobile (hambúrguer).
                44px é o alvo mínimo de toque; os 36px de antes (p-2 + ícone de
                20px) ficavam abaixo disso. */}
            <button
              type="button"
              className="md:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--cz-texto-suave)] transition-colors hover:bg-[#F4F5F7] hover:text-[var(--cz-texto)] active:bg-[#F4F5F7]"
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

            {/* Título da tela, só no celular. `h1` NÃO: cada tela já tem o seu
                título de página, e dois `h1` por documento confundem leitor de
                tela. */}
            <p className="cz-titulo min-w-0 flex-1 truncate text-[17px] leading-6 md:hidden">
              {tituloAtual}
            </p>

            {/* Breadcrumb (desktop) */}
            <nav
              aria-label="Breadcrumb"
              className="hidden md:flex flex-1 items-center gap-2 text-sm overflow-hidden"
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

      {/* Barra de abas do celular. Mora aqui porque TODO quadro de tela inclui o
          Topbar (são as telas antigas e a `MolduraTela`), então uma montagem
          cobre o painel inteiro sem tocar nas quinze telas. */}
      <BottomNav onMenu={onMobileMenu} />
    </>
  );
}
