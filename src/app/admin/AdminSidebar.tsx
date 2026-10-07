"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Users,
  ArrowLeft,
  X,
  CalendarClock,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ClipboardList,
  Calculator,
  ClipboardCheck,
  Landmark,
  Building2,
  History,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useSessao } from "@/hooks/useSessao";
import { useCelular } from "@/hooks/useMediaQuery";
import { travarRolagem } from "@/lib/trava-rolagem";
import { papelLabel } from "@/lib/papeis";
import { iniciais } from "@/app/components/views/ui/tarefas/formato";
import BuscaEmpresa, { ROTA_BUSCA } from "./BuscaEmpresa";

type Folha = {
  href: string;
  texto: string;
  icone: LucideIcon;
  /**
   * `true` acende só na rota exata. Necessário em `/admin/tarefas`: por prefixo,
   * ele ficaria aceso junto com "Apuração fiscal" em toda subrota. Em `/admin`
   * é obrigatório — por prefixo ele acenderia em TODA tela do admin.
   */
  exato?: boolean;
};

/**
 * Item com sub-itens.
 *
 * NÃO tem `href` próprio, e isso é deliberado. "Apuração fiscal" é uma ÁREA, não
 * uma tela: o que existe são as competências e o faturamento por XML. Dar um href
 * ao pai igual ao de um filho põe dois itens acesos ao mesmo tempo, porque o item
 * ativo é escolhido por href — foi exatamente o defeito que o menu do NEXUS teve
 * quando o filho "Dashboard" apontava para a rota do pai.
 *
 * `chave` existe para o estado de aberto/fechado ter um identificador estável
 * quando não há href para usar no lugar.
 */
type Grupo = {
  chave: string;
  texto: string;
  icone: LucideIcon;
  filhos: Folha[];
};

type ItemNav = Folha | Grupo;

const ehGrupo = (item: ItemNav): item is Grupo => "filhos" in item;

const OPERACAO: ItemNav[] = [
  { href: "/admin/tarefas", texto: "Tarefas", icone: ClipboardList, exato: true },
  {
    chave: "apuracao-fiscal",
    texto: "Apuração fiscal",
    icone: Calculator,
    filhos: [
      { href: "/admin/tarefas/apuracao", texto: "Competências", icone: CalendarClock },
      { href: "/admin/tarefas/faturamento", texto: "Faturamento (XML)", icone: FileSpreadsheet },
    ],
  },
  { href: "/admin/tarefas/legalizacao", texto: "Legalização", icone: Landmark },
  { href: "/admin/empresas", texto: "Empresas", icone: Building2 },
  { href: "/admin/tarefas/auditoria", texto: "Auditoria", icone: History },
  // Sem `exato`: a tela tem rota de detalhe (`/admin/formulario/<id>`), e com
  // `exato` o item apagaria justamente quando a pessoa está dentro de um
  // formulário.
  { href: "/admin/formulario", texto: "Formulário", icone: ClipboardCheck },
];

const GESTAO: Folha[] = [
  { href: "/admin", texto: "Painel de Usuários", icone: Users, exato: true },
  { href: "/admin/documentos", texto: "Enviar Documentos", icone: FolderOpen },
  { href: "/admin/auditoria-documentos", texto: "Auditoria Docs", icone: FileText },
];

/* -------------------------------------------------------------------------- */
/*                                  Pedaços                                   */
/* -------------------------------------------------------------------------- */

/**
 * Item de navegação.
 *
 * Toda a aparência vem de `.cz-nav-item` na folha global: padding, raio, cor de
 * repouso, hover, a pastilha laranja clara do ativo e o tracinho vertical
 * colado na borda DA BARRA. Aqui só entram a classe e o `aria-current` — o
 * estado visual e o estado anunciado ao leitor de tela passam a ser a mesma
 * coisa, e não dois lugares que podem divergir.
 *
 * O ícone não recebe cor própria de propósito: lucide desenha com
 * `currentColor`, então ele herda o cinza do item em repouso e o laranja escuro
 * quando ativo, sem duplicar a regra em TypeScript.
 */
function ItemLink({
  item,
  ativo,
  collapsed,
}: {
  item: Folha;
  ativo: boolean;
  collapsed: boolean;
}) {
  const Icone = item.icone;
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.texto : undefined}
        aria-current={ativo ? "page" : undefined}
        className="cz-nav-item"
      >
        <Icone aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{item.texto}</span>}
      </Link>
    </li>
  );
}

/**
 * Item com sub-itens.
 *
 * ABERTO/FECHADO É DERIVADO, com o gesto explícito por cima. Guardar só o clique
 * (e não o estado de todos os grupos) é o que faz o menu acompanhar a navegação
 * sozinho: entrar em `/admin/tarefas/faturamento` abre o grupo sem efeito e sem
 * sincronização. Foi assim que o menu do NEXUS parou de fechar na cara de quem
 * navegava.
 *
 * RECOLHIDO NÃO EXPANDE: vira um link direto para o primeiro filho. Sem isso, o
 * grupo seria o único item da barra estreita que não leva a lugar nenhum — e
 * abrir uma lista indentada num trilho de 4rem não caberia de todo modo.
 */
function GrupoLink({
  grupo,
  ativoHref,
  aberto,
  onAlternar,
  collapsed,
}: {
  grupo: Grupo;
  ativoHref: string | null;
  aberto: boolean;
  onAlternar: () => void;
  collapsed: boolean;
}) {
  const Icone = grupo.icone;
  const temFilhoAtivo = grupo.filhos.some((f) => f.href === ativoHref);

  if (collapsed) {
    return (
      <li>
        <Link
          href={grupo.filhos[0].href}
          title={grupo.texto}
          aria-current={temFilhoAtivo ? "page" : undefined}
          className="cz-nav-item"
        >
          <Icone aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        aria-controls={`cz-sub-${grupo.chave}`}
        // `aria-current` no pai fechado com filho ativo: é a única pista de onde
        // a pessoa está quando o grupo está recolhido. Aberto, quem carrega a
        // marca é o filho — dois itens marcados na mesma coluna confundem.
        aria-current={temFilhoAtivo && !aberto ? "page" : undefined}
        className="cz-nav-item w-full cursor-pointer text-left"
      >
        <Icone aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 truncate">{grupo.texto}</span>
        <ChevronRight
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
            aberto ? "rotate-90" : ""
          }`}
        />
      </button>

      {aberto && (
        // Fio vertical na altura dos filhos: uma lista indentada solta no branco
        // não diz a quem pertence. O fio faz o trabalho que um recuo grande
        // faria, ocupando 1px em vez de 24.
        <ul
          id={`cz-sub-${grupo.chave}`}
          className="ml-[1.45rem] mt-0.5 space-y-0.5 border-l border-[var(--cz-hairline)] pl-2.5"
        >
          {grupo.filhos.map((filho) => {
            const FilhoIcone = filho.icone;
            return (
              <li key={filho.href}>
                <Link
                  href={filho.href}
                  aria-current={filho.href === ativoHref ? "page" : undefined}
                  className="cz-nav-item"
                >
                  <FilhoIcone aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="truncate">{filho.texto}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * Rótulo de seção.
 *
 * Minúsculo e cinza claro, sem caixa alta espaçada: numa barra branca o rótulo
 * é referência de leitura, não elemento gráfico. Recolhido ele desaparece, mas
 * a divisória continua (ver `Divisoria`) — sem uma das duas coisas os dois
 * grupos viram uma lista corrida de oito ícones iguais.
 */
function RotuloSecao({ texto, collapsed }: { texto: string; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <p className="px-3 pb-1.5 text-[11px] font-normal leading-4 text-[var(--cz-texto-fraco)]">
      {texto}
    </p>
  );
}

function Divisoria() {
  return <div aria-hidden="true" className="my-3.5 h-px bg-[var(--cz-hairline)]" />;
}

/** Círculo de iniciais em laranja suave, o mesmo par de tons da pastilha ativa. */
function Avatar({ nome, titulo }: { nome: string | null; titulo?: string }) {
  return (
    <span
      title={titulo}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cz-laranja-suave)] text-[11px] font-bold text-[var(--cz-laranja-forte)] ring-1 ring-inset ring-[var(--cz-laranja-borda)]"
    >
      {iniciais(nome)}
    </span>
  );
}

/** Mesmo círculo, sem identidade: sessão que não resolveu. */
function AvatarNeutro({ titulo }: { titulo: string }) {
  return (
    <span
      title={titulo}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cz-fundo)] text-[var(--cz-texto-fraco)] ring-1 ring-inset ring-[var(--cz-hairline-forte)]"
    >
      <UserRound aria-hidden="true" className="h-4 w-4" />
    </span>
  );
}

/**
 * Bloco de identidade no pé.
 *
 * Cuidado deliberado: a sidebar é `hidden md:flex`, então nada aqui pode ser a
 * ÚNICA via de acesso a um dado — no celular este bloco não existe. Nome e
 * papel também estão no header; o e-mail aparece no `title` do bloco do header
 * justamente para não ficar preso aqui.
 *
 * Enquanto carrega, esqueleto com as mesmas alturas do conteúdo final (16 / 14 /
 * 18px). Em barra clara o esqueleto do kit entra direto: o `opacity-20` que
 * existia aqui era compensação do fundo preto e agora só apagaria o brilho.
 */
function BlocoUsuario({ collapsed }: { collapsed: boolean }) {
  const { sessao, carregando, interno } = useSessao();

  const nome = sessao ? sessao.nome?.trim() || sessao.email : null;
  const rotuloPapel = sessao ? papelLabel(sessao.papel) : null;
  const tituloRecolhido =
    sessao && rotuloPapel ? `${nome} — ${rotuloPapel}` : "Sessão não identificada";

  if (collapsed) {
    if (carregando) {
      return (
        <div className="mx-auto h-9 w-9 overflow-hidden rounded-full">
          <div className="cz-esqueleto h-full w-full" />
        </div>
      );
    }
    return (
      <div className="flex justify-center">
        {sessao ? (
          <Avatar nome={nome} titulo={tituloRecolhido} />
        ) : (
          <AvatarNeutro titulo={tituloRecolhido} />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      {carregando ? (
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full">
          <div className="cz-esqueleto h-full w-full" />
        </div>
      ) : sessao ? (
        <Avatar nome={nome} />
      ) : (
        <AvatarNeutro titulo="Sessão não identificada" />
      )}

      <div className="min-w-0 flex-1">
        {carregando ? (
          <>
            <div className="cz-esqueleto h-4 w-28" />
            <div className="cz-esqueleto mt-1 h-3.5 w-32" />
            <div className="cz-esqueleto mt-1.5 h-[18px] w-24" />
          </>
        ) : sessao ? (
          <>
            <p className="truncate text-[13px] font-semibold leading-tight text-[var(--cz-texto)]">
              {nome}
            </p>
            <p className="mt-1 truncate text-[11px] leading-tight text-[var(--cz-texto-fraco)]">
              {sessao.email}
            </p>
            <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--cz-texto-suave)]">
              {/* Laranja = trabalha no escritório; cinza = acesso de cliente. É
                  o único ponto colorido do bloco, então ele significa algo. */}
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  interno ? "bg-[var(--cz-laranja)]" : "bg-[var(--cz-texto-fraco)]"
                }`}
              />
              <span className="truncate">{rotuloPapel}</span>
            </span>
          </>
        ) : (
          <>
            <p className="truncate text-[13px] font-semibold leading-tight text-[var(--cz-texto)]">
              Sessão não identificada
            </p>
            <p className="mt-1 text-[11px] leading-tight text-[var(--cz-texto-fraco)]">
              Recarregue a página para tentar de novo
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Sidebar                                   */
/* -------------------------------------------------------------------------- */

export default function AdminSidebar({
  collapsed: preferenciaRecolhida,
  mobileOpen,
  onMobileClose,
}: {
  /** Preferência de DESKTOP (trilho de 4rem). Ignorada na gaveta do celular. */
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const celular = useCelular();

  // "Recolhida" é um estado de DESKTOP, guardado em localStorage. Na gaveta do
  // celular a barra aparece inteira, com os rótulos, mesmo que a preferência
  // salva seja "recolhida" — centrar só os ícones ali esconderia os nomes sem que
  // ninguém tenha pedido. Daqui para baixo, `collapsed` já é o valor efetivo.
  const collapsed = preferenciaRecolhida && !celular;

  // Ref estável: os efeitos abaixo chamam a versão atual do callback sem
  // declará-la como dependência (ela muda de identidade a cada render do pai).
  const onMobileCloseRef = useRef(onMobileClose);
  useEffect(() => {
    onMobileCloseRef.current = onMobileClose;
  }, [onMobileClose]);

  const asideRef = useRef<HTMLElement | null>(null);
  const botaoFecharRef = useRef<HTMLButtonElement | null>(null);

  // Navegar fecha a gaveta (cada página do admin monta o próprio wrapper, mas a
  // troca de rota dentro do mesmo layout também passa por aqui).
  useEffect(() => {
    onMobileCloseRef.current?.();
  }, [pathname]);

  // Enquanto a gaveta está aberta no celular: a página por baixo não rola, o ESC
  // fecha, e o foco vai para dentro dela (voltando ao botão de origem ao fechar).
  //
  // `mobileOpen` pode continuar `true` se a tela crescer até o layout de desktop
  // (girar um tablet com a gaveta aberta). Lá a barra é uma coluna fixa, então
  // não há o que travar — e a própria mudança de tamanho fecha a gaveta, para o
  // estado não ficar preso em "aberta" sem ninguém ver.
  useEffect(() => {
    if (!mobileOpen) return;

    const consulta = window.matchMedia("(max-width: 767px)");
    if (!consulta.matches) return;

    const soltarRolagem = travarRolagem();
    const origem =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    botaoFecharRef.current?.focus({ preventScroll: true });

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileCloseRef.current?.();
    };
    const aoMudarTamanho = (e: MediaQueryListEvent) => {
      if (!e.matches) onMobileCloseRef.current?.();
    };
    document.addEventListener("keydown", aoTeclar);
    consulta.addEventListener("change", aoMudarTamanho);

    return () => {
      soltarRolagem();
      document.removeEventListener("keydown", aoTeclar);
      consulta.removeEventListener("change", aoMudarTamanho);
      origem?.focus?.({ preventScroll: true });
    };
  }, [mobileOpen]);

  // Arrastar a gaveta para a esquerda fecha. Ela acompanha o dedo (via
  // `transform` inline, que se soma ao `translate` da classe) e, ao soltar,
  // devolve o controle ao CSS: passou de ~30% da largura fecha, senão volta. O
  // gesto só "pega" quando é claramente horizontal e para a esquerda; qualquer
  // outra direção é rolagem da lista e não pode ser sequestrada.
  const arrasto = useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null);

  function aoTocarInicio(e: TouchEvent<HTMLElement>) {
    if (!mobileOpen) return;
    const toque = e.touches[0];
    arrasto.current = { x: toque.clientX, y: toque.clientY, dx: 0, horizontal: null };
  }

  function aoTocarMover(e: TouchEvent<HTMLElement>) {
    const g = arrasto.current;
    const el = asideRef.current;
    if (!g || !el) return;
    const toque = e.touches[0];
    const dx = toque.clientX - g.x;
    const dy = toque.clientY - g.y;
    if (g.horizontal === null) {
      // Zona morta: um toque "parado" sempre treme alguns pixels.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.horizontal = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.2;
      // Sem transição enquanto o dedo arrasta; senão a gaveta "atrasa" o dedo.
      if (g.horizontal) el.style.transition = "none";
    }
    if (!g.horizontal) return;
    g.dx = Math.min(0, dx);
    el.style.transform = `translateX(${g.dx}px)`;
  }

  function aoTocarFim(cancelado = false) {
    const g = arrasto.current;
    arrasto.current = null;
    const el = asideRef.current;
    if (!g || !el || !g.horizontal) return;
    el.style.transition = "";
    el.style.transform = "";
    if (!cancelado && g.dx < -Math.min(96, el.offsetWidth * 0.3)) {
      onMobileCloseRef.current?.();
    }
  }

  // Subrota mantém o item pai aceso: `/admin/tarefas/apuracao/<id>` continua
  // marcando "Competências", senão a pessoa perde a referência ao abrir um
  // registro.
  const estaAtivo = (href: string, exato = false) =>
    exato ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  /**
   * O href do item ATIVO: o mais específico que casa a rota.
   *
   * "Mais específico" é o mais longo. Sem esse desempate, `/admin/tarefas` (que
   * é `exato`) e `/admin/tarefas/apuracao` disputariam a mesma rota, e num grupo
   * o pai e o filho acenderiam juntos.
   */
  const ativoHref =
    OPERACAO.flatMap((item) => (ehGrupo(item) ? item.filhos : [item]))
      .filter((folha) => estaAtivo(folha.href, folha.exato))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  /** Grupo que contém a rota atual — nasce aberto. */
  const grupoDaRota = OPERACAO.find(
    (item) => ehGrupo(item) && item.filhos.some((f) => f.href === ativoHref),
  );
  const chaveDaRota = grupoDaRota && ehGrupo(grupoDaRota) ? grupoDaRota.chave : null;

  // Só o que a pessoa clicou; o resto sai da rota. Ver o docblock de `GrupoLink`.
  const [gesto, setGesto] = useState<Record<string, boolean>>({});
  const estaAberto = (chave: string) => gesto[chave] ?? chave === chaveDaRota;
  const alternar = (chave: string) =>
    setGesto((g) => ({ ...g, [chave]: !(g[chave] ?? chave === chaveDaRota) }));

  // Recolhida, o container perde padding lateral para o tracinho do ativo cair
  // exatamente sobre a borda da barra — a folha global compensa `-0.5rem` aqui
  // e `-1rem` na barra aberta.
  const padLista = collapsed ? "px-2" : "px-4";

  return (
    <>
      {/* Fundo escurecido da gaveta. Sempre montado, com fade: a tela escurecer de
          uma vez e clarear de uma vez é o que faz uma gaveta parecer "de site" e
          não "de app". z-55 fica entre a barra de abas/cabeçalho (40) e a gaveta
          (60). Só existe no celular. */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[55] bg-black/40 transition-opacity duration-200 md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => onMobileCloseRef.current?.()}
      />

    <aside
      ref={asideRef}
      id="cz-menu-admin"
      onTouchStart={aoTocarInicio}
      onTouchMove={aoTocarMover}
      onTouchEnd={() => aoTocarFim()}
      onTouchCancel={() => aoTocarFim(true)}
      // Tocar em qualquer link da gaveta a fecha, inclusive o link da rota em que
      // a pessoa já está (nesse caso o `pathname` não muda e o efeito de rota não
      // dispararia). Delegação aqui em vez de `onClick` em cada item.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) onMobileCloseRef.current?.();
      }}
      // A largura vem da MESMA variável que dá a margem ao conteúdo. Antes eram
      // dois valores (classe aqui, `--sidebar-w` lá) que precisavam combinar na
      // mão e dessincronizavam durante a animação.
      //
      // Celular: gaveta de 82% da tela (no máximo 19rem) que desliza com
      // `translate` e fica `invisible` quando fechada — `visibility` troca só
      // DEPOIS da animação de saída, e fecha a gaveta para o teclado e o leitor de
      // tela. `translate` entra na lista de transição porque no Tailwind 4
      // `-translate-x-full` escreve a propriedade `translate`, não `transform`
      // (o `transform` inline é do gesto de arrastar). No desktop nada disso vale:
      // a barra é a coluna fixa de sempre, sem transição própria (quem anima a
      // largura é o GSAP, na variável).
      className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--cz-hairline)] bg-[var(--cz-superficie)] max-md:z-[60] max-md:w-[82vw] max-md:max-w-[19rem] max-md:touch-pan-y max-md:transition-[transform,translate,visibility] max-md:duration-200 max-md:ease-in-out md:w-[var(--sidebar-w)] ${
        mobileOpen
          ? "max-md:translate-x-0 max-md:shadow-[var(--cz-elev-3)]"
          : "max-md:invisible max-md:-translate-x-full"
      }`}
    >
      {/* Marca. A altura casa com a do cabeçalho (`--cz-topbar-h`: 4.5rem no
          desktop, 3.5rem no celular) para as duas linhas finas virarem uma só
          linha contínua atravessando a tela. No celular o X de fechar ocupa a
          ponta direita, com o mesmo recuo do hambúrguer do cabeçalho. */}
      <div
        className={`flex h-[var(--cz-topbar-h)] shrink-0 items-center border-b border-[var(--cz-hairline)] ${
          collapsed ? "justify-center px-0" : "gap-2.5 pl-4 pr-4 max-md:pr-1"
        }`}
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cz-laranja)]"
        >
          <Shield className="h-[21px] w-[21px] text-white" />
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--cz-texto)]">
              ContaZoom
            </span>
            <span className="block truncate text-[11.5px] leading-tight text-[var(--cz-texto-fraco)]">
              Painel do escritório
            </span>
          </span>
        )}
        <button
          ref={botaoFecharRef}
          type="button"
          onClick={() => onMobileCloseRef.current?.()}
          aria-label="Fechar menu"
          className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--cz-texto-suave)] transition-colors active:bg-[#F4F5F7] md:hidden"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      {/* Busca de empresa: no desktop ela mora no cabeçalho (a partir de `lg`); o
          cabeçalho do celular é enxuto, então a MESMA busca abre a gaveta. Some
          na própria rota de apuração pelo mesmo motivo da versão do cabeçalho. */}
      {pathname !== ROTA_BUSCA && (
        <div className="shrink-0 px-4 pt-3 md:hidden">
          <BuscaEmpresa
            className="relative"
            aoEnviar={() => onMobileCloseRef.current?.()}
          />
        </div>
      )}

      <nav
        aria-label="Navegação do admin"
        // `overscroll-contain`: ao chegar no fim da lista, o arrasto NÃO passa
        // para a página por baixo.
        className={`cz-rolagem flex-1 overflow-y-auto overscroll-contain py-4 ${padLista} ${
          collapsed ? "cz-nav-recolhida" : ""
        }`}
      >
        <RotuloSecao texto="Operação" collapsed={collapsed} />
        <ul className="space-y-0.5">
          {OPERACAO.map((item) =>
            ehGrupo(item) ? (
              <GrupoLink
                key={item.chave}
                grupo={item}
                ativoHref={ativoHref}
                aberto={estaAberto(item.chave)}
                onAlternar={() => alternar(item.chave)}
                collapsed={collapsed}
              />
            ) : (
              <ItemLink
                key={item.href}
                item={item}
                ativo={item.href === ativoHref}
                collapsed={collapsed}
              />
            ),
          )}
        </ul>

        <Divisoria />

        <RotuloSecao texto="Gestão Global" collapsed={collapsed} />
        <ul className="space-y-0.5">
          {GESTAO.map((item) => (
            <ItemLink
              key={item.href}
              item={item}
              ativo={estaAtivo(item.href, item.exato)}
              collapsed={collapsed}
            />
          ))}
        </ul>
      </nav>

      <div className={`shrink-0 border-t border-[var(--cz-hairline)] py-3 ${padLista}`}>
        <BlocoUsuario collapsed={collapsed} />
      </div>

      {/* O último bloco soma a área segura do iPhone: sem isso o "Sair do Admin"
          ficaria colado na barra de gestos do aparelho. */}
      <div
        className={`shrink-0 border-t border-[var(--cz-hairline)] py-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] ${padLista} ${
          collapsed ? "cz-nav-recolhida" : ""
        }`}
      >
        <Link
          href="/dashboard"
          title={collapsed ? "Sair do Admin" : undefined}
          className="cz-nav-item"
        >
          <ArrowLeft aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="truncate">Sair do Admin</span>}
        </Link>
      </div>
    </aside>
    </>
  );
}
