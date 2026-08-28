"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Users,
  ArrowLeft,
  FileText,
  FolderOpen,
  ClipboardList,
  Calculator,
  Landmark,
  Building2,
  History,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useSessao } from "@/hooks/useSessao";
import { papelLabel } from "@/lib/papeis";
import { iniciais } from "@/app/components/views/ui/tarefas/formato";

type ItemNav = {
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

const OPERACAO: ItemNav[] = [
  { href: "/admin/tarefas", texto: "Tarefas", icone: ClipboardList, exato: true },
  { href: "/admin/tarefas/apuracao", texto: "Apuração fiscal", icone: Calculator },
  { href: "/admin/tarefas/legalizacao", texto: "Legalização", icone: Landmark },
  { href: "/admin/empresas", texto: "Empresas", icone: Building2 },
  { href: "/admin/tarefas/auditoria", texto: "Auditoria", icone: History },
];

const GESTAO: ItemNav[] = [
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
 * O ativo NÃO é mais preenchimento laranja cheio. Laranja é a cor de ação do
 * conteúdo (botão "Concluir etapa", por exemplo); quando a sidebar também usa
 * laranja em bloco, os dois disputam a atenção e o olho não sabe qual é o
 * próximo passo. Aqui o ativo se resolve com fundo sutil + ícone laranja + um
 * traço vertical de 3px na borda esquerda: continua inconfundível e para de
 * competir. O traço é absoluto de propósito — borda real empurraria o texto
 * 3px e o item dançaria ao trocar de rota.
 */
function ItemLink({
  item,
  ativo,
  collapsed,
}: {
  item: ItemNav;
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
        className={`group relative flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors ${
          collapsed ? "justify-center px-0" : "px-3"
        } ${
          ativo
            ? "bg-gray-800 font-semibold text-white"
            : "font-medium text-gray-400 hover:bg-gray-800/60 hover:text-gray-100"
        }`}
      >
        {ativo && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-orange-500"
          />
        )}
        <Icone
          className={`h-5 w-5 shrink-0 transition-colors ${
            ativo ? "text-orange-500" : "text-gray-500 group-hover:text-gray-300"
          }`}
        />
        {!collapsed && <span className="truncate">{item.texto}</span>}
      </Link>
    </li>
  );
}

/**
 * Rótulo de seção.
 *
 * Recolhido ele desaparece, mas a divisória continua (ver `Divisoria`): sem uma
 * das duas coisas os dois grupos viram uma lista corrida de nove ícones iguais.
 */
function RotuloSecao({ texto, collapsed }: { texto: string; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
      {texto}
    </p>
  );
}

function Divisoria() {
  return <div aria-hidden="true" className="my-4 h-px bg-gray-800" />;
}

/** Círculo de iniciais. Tom quente para casar com o escudo do topo. */
function Avatar({ nome, titulo }: { nome: string | null; titulo?: string }) {
  return (
    <span
      title={titulo}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-600/15 text-[11px] font-bold text-orange-300 ring-1 ring-inset ring-orange-500/25"
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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-800 text-gray-500 ring-1 ring-inset ring-gray-700"
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
 * Enquanto carrega, esqueleto com as mesmas alturas do conteúdo final (16 / 18 /
 * 24px). Em fundo escuro o esqueleto claro do kit é agressivo, então entra com
 * `opacity-20` — mantém o brilho animado e para de brigar com o preto.
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
          <div className="cz-esqueleto h-full w-full opacity-20" />
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
          <div className="cz-esqueleto h-full w-full opacity-20" />
        </div>
      ) : sessao ? (
        <Avatar nome={nome} />
      ) : (
        <AvatarNeutro titulo="Sessão não identificada" />
      )}

      <div className="min-w-0 flex-1">
        {carregando ? (
          <>
            <div className="cz-esqueleto h-4 w-28 opacity-20" />
            <div className="cz-esqueleto mt-1 h-3.5 w-32 opacity-20" />
            <div className="cz-esqueleto mt-1.5 h-[18px] w-24 opacity-20" />
          </>
        ) : sessao ? (
          <>
            <p className="truncate text-[13px] font-semibold leading-tight text-white">
              {nome}
            </p>
            <p className="mt-1 truncate text-[11px] leading-tight text-gray-500">
              {sessao.email}
            </p>
            <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[11px] font-medium text-gray-300">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  interno ? "bg-orange-500" : "bg-gray-500"
                }`}
              />
              <span className="truncate">{rotuloPapel}</span>
            </span>
          </>
        ) : (
          <>
            <p className="truncate text-[13px] font-semibold leading-tight text-gray-300">
              Sessão não identificada
            </p>
            <p className="mt-1 text-[11px] leading-tight text-gray-500">
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

export default function AdminSidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  // Subrota mantém o item pai aceso: `/admin/tarefas/apuracao/<id>` continua
  // marcando "Apuração fiscal", senão a pessoa perde a referência ao abrir um
  // registro.
  const estaAtivo = (href: string, exato = false) =>
    exato ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      id="cz-menu-admin"
      className={`fixed inset-y-0 left-0 z-50 transform bg-gray-900 text-white transition-all duration-200 ease-in-out ${
        collapsed ? "w-[4rem]" : "w-64"
      } hidden md:flex flex-col`}
    >
      {/* Marca. Escudo em caixa própria para o ícone ter o mesmo peso ótico do
          texto — Shield solto ao lado de uma palavra fica sempre pequeno ou
          desalinhado. A linha de contexto só existe expandida. */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-gray-800 ${
          collapsed ? "justify-center px-0" : "gap-2.5 px-4"
        }`}
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-600/15 ring-1 ring-inset ring-orange-500/30"
        >
          <Shield className="h-[18px] w-[18px] text-orange-500" />
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight text-white">
              ContaZoom <span className="text-orange-500">Admin</span>
            </span>
            <span className="block truncate text-[11px] leading-tight text-gray-500">
              Painel interno do escritório
            </span>
          </span>
        )}
      </div>

      <nav
        aria-label="Navegação do admin"
        className="cz-rolagem flex-1 overflow-y-auto px-3 py-5"
      >
        <RotuloSecao texto="Operação" collapsed={collapsed} />
        <ul className="space-y-1">
          {OPERACAO.map((item) => (
            <ItemLink
              key={item.href}
              item={item}
              ativo={estaAtivo(item.href, item.exato)}
              collapsed={collapsed}
            />
          ))}
        </ul>

        <Divisoria />

        <RotuloSecao texto="Gestão Global" collapsed={collapsed} />
        <ul className="space-y-1">
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

      <div className="shrink-0 border-t border-gray-800 px-3 py-3">
        <BlocoUsuario collapsed={collapsed} />
      </div>

      <div className="shrink-0 border-t border-gray-800 p-3">
        <Link
          href="/dashboard"
          title={collapsed ? "Sair do Admin" : undefined}
          className={`flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800/60 hover:text-gray-100 ${
            collapsed ? "justify-center px-0" : "px-3"
          }`}
        >
          <ArrowLeft className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">Sair do Admin</span>}
        </Link>
      </div>
    </aside>
  );
}
