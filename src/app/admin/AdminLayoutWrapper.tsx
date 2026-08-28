"use client";

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import AdminSidebar from "./AdminSidebar";
import { useSessao } from "@/hooks/useSessao";
import { papelLabel, papelSelo } from "@/lib/papeis";
import { iniciais } from "@/app/components/views/ui/tarefas/formato";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* -------------------------------------------------------------------------- */
/*                          Rótulos de rota do admin                          */
/* -------------------------------------------------------------------------- */

/**
 * Mapa único: alimenta a trilha E o título do header. Duas listas separadas
 * viram divergência na primeira rota nova que alguém adiciona.
 */
const ROTULO_ROTA: Record<string, string> = {
  "/admin": "Usuários",
  "/admin/documentos": "Enviar documentos",
  "/admin/auditoria-documentos": "Auditoria de documentos",
  "/admin/tarefas": "Tarefas",
  "/admin/tarefas/apuracao": "Apuração fiscal",
  "/admin/tarefas/legalizacao": "Legalização",
  "/admin/tarefas/auditoria": "Auditoria",
  "/admin/empresas": "Empresas",
};

/**
 * Rótulo do segmento dinâmico, decidido pelo PAI.
 *
 * O wrapper não tem o registro em mão e adivinhar o nome seria mentira na tela.
 * Então ele diz o TIPO do registro ("Competência", "Processo", "Empresa") e
 * deixa o nome real para o título da própria página, que já o carrega.
 */
const ROTULO_ID_POR_PAI: Record<string, string> = {
  "/admin/tarefas/apuracao": "Competência",
  "/admin/tarefas/legalizacao": "Processo",
  "/admin/empresas": "Empresa",
};

type TipoMigalha = "mapeada" | "registro" | "desconhecida";
type Migalha = { href: string; texto: string; tipo: TipoMigalha };

function montarMigalhas(pathname: string): Migalha[] {
  const migalhas: Migalha[] = [{ href: "/admin", texto: "Admin", tipo: "mapeada" }];
  if (!pathname?.startsWith("/admin")) return migalhas;

  const segmentos = pathname.slice("/admin".length).split("/").filter(Boolean);
  let href = "/admin";

  for (const segmento of segmentos) {
    const pai = href;
    href = `${href}/${segmento}`;

    if (ROTULO_ROTA[href]) {
      migalhas.push({ href, texto: ROTULO_ROTA[href], tipo: "mapeada" });
      continue;
    }
    if (ROTULO_ID_POR_PAI[pai]) {
      migalhas.push({ href, texto: ROTULO_ID_POR_PAI[pai], tipo: "registro" });
      continue;
    }
    migalhas.push({ href, texto: "Detalhe", tipo: "desconhecida" });
  }

  return migalhas;
}

/**
 * Título do header.
 *
 * Em rota de detalhe o título mostra a ÁREA ("Apuração fiscal"), não o tipo do
 * registro: a trilha já disse "Competência" e a página já mostra o nome real —
 * repetir "Competência" no h2 gastaria a linha mais visível do header com a
 * informação menos útil. Rota fora do mapa cai em "Centro de Controle", então
 * tela nova nunca aparece sem título.
 */
function tituloDaRota(migalhas: Migalha[], pathname: string): string {
  if (ROTULO_ROTA[pathname]) return ROTULO_ROTA[pathname];

  const ultima = migalhas[migalhas.length - 1];
  const pai = migalhas[migalhas.length - 2];
  if (ultima?.tipo === "registro" && pai && ROTULO_ROTA[pai.href]) {
    return ROTULO_ROTA[pai.href];
  }

  return "Centro de Controle";
}

/* -------------------------------------------------------------------------- */
/*                                  Pedaços                                   */
/* -------------------------------------------------------------------------- */

function Separador() {
  return (
    <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-gray-300" />
  );
}

/**
 * Trilha de navegação.
 *
 * Em tela estreita o meio do caminho é colapsado num reticente: com `display:
 * none` os itens do meio saem também da árvore de acessibilidade, então o leitor
 * de tela lê exatamente o que está visível, sem trilha fantasma.
 */
function Trilha({ migalhas }: { migalhas: Migalha[] }) {
  const [primeira, ...resto] = migalhas;
  const temMeio = resto.length > 1;

  return (
    <nav aria-label="Trilha de navegação">
      <ol className="flex items-center gap-1.5 text-xs font-medium leading-4 text-gray-500">
        <li className="flex shrink-0 items-center gap-1.5">
          {resto.length === 0 ? (
            <span className="text-gray-700">{primeira.texto}</span>
          ) : (
            <Link href={primeira.href} className="transition-colors hover:text-gray-900">
              {primeira.texto}
            </Link>
          )}
        </li>

        {temMeio && (
          <li aria-hidden="true" className="flex shrink-0 items-center gap-1.5 md:hidden">
            <Separador />
            <span className="text-gray-400">…</span>
          </li>
        )}

        {resto.map((migalha, indice) => {
          const ultima = indice === resto.length - 1;
          return (
            <li
              key={migalha.href}
              className={`items-center gap-1.5 ${
                ultima ? "flex min-w-0" : "hidden shrink-0 md:flex"
              }`}
            >
              <Separador />
              {ultima ? (
                <span className="truncate text-gray-700">{migalha.texto}</span>
              ) : (
                <Link
                  href={migalha.href}
                  className="truncate transition-colors hover:text-gray-900"
                >
                  {migalha.texto}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Identidade de quem está logado.
 *
 * Substitui o selo fixo "Sessão Administrador", que era texto cravado e passou a
 * mentir com cinco papéis no sistema. Três estados, todos honestos:
 * carregando (esqueleto do tamanho final, sem salto), sessão lida (nome e papel
 * REAIS) e sessão que não resolveu (estado neutro — `/admin/documentos` roda sem
 * barreira de papel, então não dá para presumir nada).
 *
 * Em tela estreita só o círculo sobrevive; o `title` carrega nome, e-mail e
 * papel, que é o dado que a sidebar oculta no celular.
 */
function Identidade() {
  const { sessao, carregando } = useSessao();

  if (carregando) {
    return (
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full">
          <div className="cz-esqueleto h-full w-full" />
        </div>
        <div className="hidden sm:block">
          <div className="cz-esqueleto h-4 w-28" />
          <div className="cz-esqueleto mt-1 h-5 w-24" />
        </div>
      </div>
    );
  }

  if (!sessao) {
    return (
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--cz-hairline-forte)] bg-gray-100 text-gray-400">
          <UserRound aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="hidden sm:block">
          <p className="text-[13px] font-semibold leading-tight text-gray-700">
            Sessão não identificada
          </p>
          <span className="mt-1 inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            Papel não informado
          </span>
        </div>
      </div>
    );
  }

  const nome = sessao.nome?.trim() || sessao.email;
  const rotulo = papelLabel(sessao.papel);

  return (
    // Sem `shrink-0` no bloco todo, e com teto de largura no texto: nome
    // comprido trunca aqui em vez de empurrar o título da página.
    <div
      className="flex min-w-0 items-center gap-2.5"
      title={`${nome} · ${sessao.email} · ${rotulo}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700 ring-1 ring-inset ring-orange-200">
        {iniciais(nome)}
      </span>
      <div className="hidden min-w-0 max-w-[10rem] sm:block lg:max-w-[14rem]">
        <p className="truncate text-[13px] font-semibold leading-tight text-gray-900">
          {nome}
        </p>
        <span
          className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${papelSelo(
            sessao.papel
          )}`}
        >
          {rotulo}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Wrapper                                   */
/* -------------------------------------------------------------------------- */

export default function AdminLayoutWrapper({ children }: { children?: ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const conteudoRef = useRef<HTMLElement | null>(null);
  const hasInitialSet = useRef(false);
  const pathname = usePathname();

  // Sombra do header só com a página rolada. Header com sombra permanente flutua
  // sobre nada; a sombra que aparece no primeiro scroll é o que o faz parecer
  // ancorado no conteúdo.
  const [rolado, setRolado] = useState(false);

  const migalhas = useMemo(() => montarMigalhas(pathname ?? ""), [pathname]);
  const titulo = useMemo(() => tituloDaRota(migalhas, pathname ?? ""), [migalhas, pathname]);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "1") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useIsoLayout(() => {
    if (hasInitialSet.current) return;
    const el = containerRef.current;
    if (!el) return;
    hasInitialSet.current = true;
    gsap.set(el, { css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W } });
  }, [isSidebarCollapsed]);

  useIsoLayout(() => {
    const el = containerRef.current;
    if (!el) return;
    gsap.to(el, {
      duration: 0.2,
      ease: "power2.out",
      css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W },
    });
  }, [isSidebarCollapsed]);

  // Quem rola é o `<main>`, não a janela: o Next não zera esse scroll ao trocar
  // de rota, então a sombra é reavaliada pelo valor real do container.
  useEffect(() => {
    const el = conteudoRef.current;
    setRolado(!!el && el.scrollTop > 4);
  }, [pathname]);

  const aoRolarConteudo = useCallback((evento: UIEvent<HTMLElement>) => {
    const passou = evento.currentTarget.scrollTop > 4;
    setRolado((atual) => (atual === passou ? atual : passou));
  }, []);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_KEY, next ? "1" : "0");
      return next;
    });
  };

  const rotuloBotao = isSidebarCollapsed
    ? "Expandir o menu lateral"
    : "Recolher o menu lateral";

  return (
    <div ref={containerRef} className="cz-admin flex h-screen bg-[#F2F4F7] font-sans">
      <AdminSidebar collapsed={isSidebarCollapsed} />

      {/* A sidebar aparece em `md`, então a margem do conteúdo tem de começar em
          `md` também — em `lg` ela cobria o conteúdo entre 768px e 1024px. */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden md:ml-[var(--sidebar-w)] transition-all duration-200">
        <header
          className={`z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--cz-hairline)] bg-white px-4 transition-shadow duration-200 sm:px-6 ${
            rolado ? "shadow-[var(--cz-elev-2)]" : "shadow-none"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleToggleSidebar}
              aria-label={rotuloBotao}
              aria-expanded={!isSidebarCollapsed}
              aria-controls="cz-menu-admin"
              title={rotuloBotao}
              className="-ml-1.5 hidden shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 md:block"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>

            <div className="min-w-0">
              <Trilha migalhas={migalhas} />
              <h2 className="truncate text-[17px] font-semibold leading-6 tracking-tight text-gray-900">
                {titulo}
              </h2>
            </div>
          </div>

          <Identidade />
        </header>

        <main
          ref={conteudoRef}
          onScroll={aoRolarConteudo}
          className="cz-rolagem flex-1 overflow-auto"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
