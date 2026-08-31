"use client";

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import {
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import AdminSidebar from "./AdminSidebar";
import { useSessao } from "@/hooks/useSessao";
import { papelLabel } from "@/lib/papeis";
import { iniciais } from "@/app/components/views/ui/tarefas/formato";

const FULL_W = "15rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Única tela do admin que filtra empresa por texto. Ver `BuscaEmpresa`. */
const ROTA_BUSCA = "/admin/tarefas/apuracao";

/** Tela de usuários e níveis de acesso. Destino do atalho de configuração. */
const ROTA_ACESSOS = "/admin";

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
  "/admin/formulario": "Formulários de abertura",
  "/admin/empresas": "Empresas",
};

/**
 * Subtítulo do header, por rota.
 *
 * Fica ao lado de `ROTULO_ROTA` porque as duas linhas do título são um par: sem
 * isso alguém acrescenta rota num mapa e esquece do outro. Rota fora do mapa
 * fica SEM subtítulo de propósito — frase genérica ("Gerencie seus dados") gasta
 * a segunda linha mais visível da tela para não dizer nada.
 */
const SUBTITULO_ROTA: Record<string, string> = {
  "/admin": "Perfis de acesso e contas da equipe",
  "/admin/documentos": "Envio de documentos para os clientes",
  "/admin/auditoria-documentos": "Quem acessou e baixou cada documento",
  "/admin/tarefas": "Visão geral das apurações e dos processos",
  "/admin/tarefas/apuracao": "Competências por empresa, etapa e prazo",
  "/admin/tarefas/legalizacao": "Aberturas, alterações e encerramentos de CNPJ",
  "/admin/tarefas/auditoria": "Histórico de alterações com autor e horário",
  "/admin/formulario": "Formulários enviados pelos clientes em /formulario",
  "/admin/empresas": "Carteira de empresas e regime tributário",
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
  "/admin/formulario": "Formulário",
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

/** Rota de detalhe herda do pai: o pai é a penúltima migalha. */
function heranca(migalhas: Migalha[], mapa: Record<string, string>): string {
  const ultima = migalhas[migalhas.length - 1];
  const pai = migalhas[migalhas.length - 2];
  if (ultima?.tipo === "registro" && pai && mapa[pai.href]) return mapa[pai.href];
  return "";
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
  return heranca(migalhas, ROTULO_ROTA) || "Centro de Controle";
}

/** Mesma regra de herança do título, sem fallback: sem texto real, sem linha. */
function subtituloDaRota(migalhas: Migalha[], pathname: string): string {
  if (SUBTITULO_ROTA[pathname]) return SUBTITULO_ROTA[pathname];
  return heranca(migalhas, SUBTITULO_ROTA);
}

/* -------------------------------------------------------------------------- */
/*                                  Pedaços                                   */
/* -------------------------------------------------------------------------- */

function Separador() {
  return (
    <ChevronRight
      aria-hidden="true"
      className="h-3 w-3 shrink-0 text-[var(--cz-hairline-forte)]"
    />
  );
}

/**
 * Trilha de navegação.
 *
 * A referência do cliente não tem trilha, mas em `/admin/tarefas/apuracao/<id>`
 * o título diz "Apuração fiscal" e a pessoa está DENTRO de uma competência —
 * sem a trilha não há o que diga isso nem por onde voltar. Ela fica então acima
 * do título, em 11px cinza claro, discreta o suficiente para o título continuar
 * sendo a primeira coisa que o olho pega.
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
      <ol className="flex items-center gap-1.5 text-[11px] font-medium leading-[14px] text-[var(--cz-texto-fraco)]">
        <li className="flex shrink-0 items-center gap-1.5">
          {resto.length === 0 ? (
            <span>{primeira.texto}</span>
          ) : (
            <Link
              href={primeira.href}
              className="transition-colors hover:text-[var(--cz-texto)]"
            >
              {primeira.texto}
            </Link>
          )}
        </li>

        {temMeio && (
          <li aria-hidden="true" className="flex shrink-0 items-center gap-1.5 md:hidden">
            <Separador />
            <span>…</span>
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
                <span className="truncate text-[var(--cz-texto-suave)]">
                  {migalha.texto}
                </span>
              ) : (
                <Link
                  href={migalha.href}
                  className="truncate transition-colors hover:text-[var(--cz-texto)]"
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
 * Busca de empresa.
 *
 * Campo real, não decoração: ao enviar, navega para a lista de apuração com
 * `?busca=`, que é lido por `lerFiltros` daquela tela e filtra por razão social,
 * fantasia e CNPJ. O `placeholder` diz exatamente o que o campo faz, para
 * ninguém digitar "boleto" esperando busca global.
 *
 * Some na própria `/admin/tarefas/apuracao`: aquela tela lê a URL só na
 * montagem, então trocar o parâmetro sem sair da rota mudaria o endereço e não a
 * lista — a tela mostraria um resultado e a URL prometeria outro. E lá o campo
 * de busca próprio, com debounce, já está na tela.
 */
function BuscaEmpresa() {
  const router = useRouter();
  const [termo, setTermo] = useState("");

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const limpo = termo.trim();
    if (!limpo) return;
    router.push(`${ROTA_BUSCA}?busca=${encodeURIComponent(limpo)}`);
  };

  return (
    <form
      role="search"
      onSubmit={enviar}
      className="relative hidden w-80 shrink-0 lg:block"
    >
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cz-texto-fraco)]"
      />
      <input
        type="search"
        className="cz-busca"
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
        placeholder="Buscar empresa por nome ou CNPJ"
        aria-label="Buscar empresa por nome ou CNPJ na apuração fiscal"
      />
    </form>
  );
}

/**
 * Atalho para usuários e acessos.
 *
 * A referência tem um ícone de engrenagem no header. Aqui ele só existe quando
 * tem para onde ir de verdade: `permissoes.gerenciarUsuarios` é ADMIN, e é
 * exatamente quem passa pelo `RoleGuard` de `/admin`. Para os outros papéis o
 * botão sairia da tela em vez de levar a um aviso de acesso negado. E na própria
 * `/admin` ele desaparece, porque link para a página atual é botão morto.
 */
function AtalhoAcessos() {
  const { permissoes } = useSessao();
  const pathname = usePathname();

  if (!permissoes.gerenciarUsuarios) return null;
  if (pathname === ROTA_ACESSOS) return null;

  return (
    <Link
      href={ROTA_ACESSOS}
      title="Usuários e acessos"
      aria-label="Abrir usuários e acessos"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--cz-hairline)] text-[var(--cz-texto-suave)] transition-colors hover:border-[var(--cz-hairline-forte)] hover:text-[var(--cz-texto)]"
    >
      <Settings aria-hidden="true" className="h-[18px] w-[18px]" />
    </Link>
  );
}

/**
 * Identidade de quem está logado.
 *
 * Três estados, todos honestos: carregando (esqueleto do tamanho final, sem
 * salto), sessão lida (nome e papel REAIS) e sessão que não resolveu (estado
 * neutro — `/admin/documentos` roda sem barreira de papel, então não dá para
 * presumir nada).
 *
 * O papel vira texto cinza, não selo colorido: `papelSelo` pinta contábil de
 * azul e assistente de roxo, e o painel é laranja, branco e cinza. A cor do
 * papel continua onde ela trabalha, na tabela de usuários.
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
          <div className="cz-esqueleto mt-1 h-3.5 w-20" />
        </div>
      </div>
    );
  }

  if (!sessao) {
    return (
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] text-[var(--cz-texto-fraco)]">
          <UserRound aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="hidden sm:block">
          <p className="text-[13px] font-semibold leading-tight text-[var(--cz-texto)]">
            Sessão não identificada
          </p>
          <p className="mt-1 text-[11px] leading-tight text-[var(--cz-texto-fraco)]">
            Papel não informado
          </p>
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cz-laranja-suave)] text-[11px] font-bold text-[var(--cz-laranja-forte)] ring-1 ring-inset ring-[var(--cz-laranja-borda)]">
        {iniciais(nome)}
      </span>
      <div className="hidden min-w-0 max-w-[10rem] sm:block lg:max-w-[12rem]">
        <p className="truncate text-[13px] font-semibold leading-tight text-[var(--cz-texto)]">
          {nome}
        </p>
        <p className="mt-1 truncate text-[11px] leading-tight text-[var(--cz-texto-suave)]">
          {rotulo}
        </p>
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
  const subtitulo = useMemo(
    () => subtituloDaRota(migalhas, pathname ?? ""),
    [migalhas, pathname]
  );

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
    <div
      ref={containerRef}
      className="cz-admin flex h-screen bg-[var(--cz-fundo)] font-sans"
    >
      <AdminSidebar collapsed={isSidebarCollapsed} />

      {/* A sidebar aparece em `md`, então a margem do conteúdo tem de começar em
          `md` também — em `lg` ela cobria o conteúdo entre 768px e 1024px. */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden md:ml-[var(--sidebar-w)] transition-all duration-200">
        <header
          className={`z-20 flex h-[4.5rem] shrink-0 items-center justify-between gap-3 border-b border-[var(--cz-hairline)] bg-[var(--cz-superficie)] px-4 transition-shadow duration-200 sm:px-6 ${
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
              className="-ml-1.5 hidden shrink-0 rounded-lg p-2 text-[var(--cz-texto-suave)] transition-colors hover:bg-[#F4F5F7] hover:text-[var(--cz-texto)] md:block"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>

            <div className="min-w-0">
              <Trilha migalhas={migalhas} />
              <h2 className="cz-titulo truncate text-[22px] leading-7">{titulo}</h2>
              {subtitulo && (
                <p className="truncate text-[13px] leading-4 text-[var(--cz-texto-suave)]">
                  {subtitulo}
                </p>
              )}
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {pathname !== ROTA_BUSCA && <BuscaEmpresa />}
            <AtalhoAcessos />
            <Identidade />
          </div>
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
