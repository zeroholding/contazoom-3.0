"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useCelular } from "@/hooks/useMediaQuery";
import {
  Building2,
  Calculator,
  ClipboardList,
  Landmark,
  Menu,
  type LucideIcon,
} from "lucide-react";

type Aba = {
  href: string;
  rotulo: string;
  icone: LucideIcon;
  /** Decide se esta aba é a tela atual. Função, porque "Tarefas" é rota EXATA. */
  casa: (pathname: string) => boolean;
};

const estaEm = (pathname: string, prefixo: string) =>
  pathname === prefixo || pathname.startsWith(`${prefixo}/`);

/**
 * As quatro áreas de trabalho do dia a dia do escritório, a um toque do polegar.
 *
 * Mesma lógica do `ui/BottomNav` do produto (as áreas que se abrem todo dia na
 * barra, o resto na gaveta atrás de "Menu"), aplicada ao vocabulário do admin:
 * Tarefas (o painel), Apuração, Legalização e Empresas. Usuários, Auditoria,
 * Formulários e Documentos são configuração/consulta e ficam na gaveta — o
 * próprio `AdminSidebar` já trata "Painel de Usuários" como gestão, não como o
 * trabalho do dia.
 *
 * `/admin/tarefas` casa só na rota exata: por prefixo ele acenderia junto com
 * Apuração e Legalização, que também moram sob `/admin/tarefas/…`. Faturamento
 * (XML) acende "Apuração" porque, no menu, ele é filho do grupo Apuração fiscal.
 */
const ABAS: Aba[] = [
  {
    href: "/admin/tarefas",
    rotulo: "Tarefas",
    icone: ClipboardList,
    casa: (p) => p === "/admin/tarefas",
  },
  {
    href: "/admin/tarefas/apuracao",
    rotulo: "Apuração",
    icone: Calculator,
    casa: (p) =>
      estaEm(p, "/admin/tarefas/apuracao") || estaEm(p, "/admin/tarefas/faturamento"),
  },
  {
    href: "/admin/tarefas/legalizacao",
    rotulo: "Legalização",
    icone: Landmark,
    casa: (p) => estaEm(p, "/admin/tarefas/legalizacao"),
  },
  {
    href: "/admin/empresas",
    rotulo: "Empresas",
    icone: Building2,
    casa: (p) => estaEm(p, "/admin/empresas"),
  },
];

/**
 * Quantas barras estão montadas agora. Cada página do admin monta o próprio
 * `AdminLayoutWrapper`, então a barra desmonta e remonta a cada navegação; contar
 * evita apagar `--cz-bottom-offset` (e com ele o espaço reservado embaixo) no
 * instante da troca. Mesmo expediente do `ui/BottomNav`.
 */
let instancias = 0;

/**
 * Barra de abas do admin no celular (abaixo de 768px). No desktop não existe: lá
 * a barra lateral cumpre o papel.
 *
 * Enquanto montada publica `--cz-bottom-offset` no `<html>`, que o toaster, as
 * folhas de filtro e qualquer elemento fixo de rodapé leem para não ficarem
 * embaixo da barra. NÃO liga `html.cz-com-tabbar`, diferente do `ui/BottomNav`:
 * essa classe dá `padding-bottom` ao `<body>`, e a casca do admin é `fixed
 * inset-0` justamente para o documento ter altura zero — com o padding o body
 * passava a medir mais que a janela, abria uma rolagem de página de 56px e
 * deixava a faixa escura do fundo do navegador aparecer embaixo do app. Aqui o
 * espaço da barra já é reservado pela própria casca.
 */
export default function AdminBottomNav({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname() || "/";
  const celular = useCelular();

  useEffect(() => {
    if (!celular) return;
    instancias += 1;
    document.documentElement.style.setProperty(
      "--cz-bottom-offset",
      "calc(var(--cz-tabbar-h) + env(safe-area-inset-bottom, 0px))",
    );
    return () => {
      instancias = Math.max(0, instancias - 1);
      if (instancias === 0) {
        document.documentElement.style.removeProperty("--cz-bottom-offset");
      }
    };
  }, [celular]);

  // No desktop a barra nem entra no DOM (a sidebar fixa cumpre o papel).
  if (!celular) return null;

  const abaAtual = ABAS.find((aba) => aba.casa(pathname));
  // Em Auditoria, Formulário, Usuários ou Documentos — telas que só existem na
  // gaveta — o "Menu" acende: sem isso nenhuma aba estaria marcada e a barra
  // pareceria quebrada.
  const menuAceso = !abaAtual;

  return (
    <nav
      aria-label="Navegação rápida do admin"
      // z-40: abaixo da gaveta (55/60), das folhas e dos modais, acima do
      // conteúdo. A hairline em cima faz o papel da sombra, que o painel evita.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--cz-hairline)] bg-[var(--cz-superficie)] pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <ul className="grid h-[var(--cz-tabbar-h)] grid-cols-5">
        {ABAS.map((aba) => {
          const ativa = aba === abaAtual;
          const Icone = aba.icone;
          return (
            <li key={aba.href} className="min-w-0">
              <Link
                href={aba.href}
                aria-current={ativa ? "page" : undefined}
                className="group flex h-full flex-col items-center justify-center gap-0.5 outline-none"
              >
                <Pilula ativa={ativa}>
                  <Icone className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
                </Pilula>
                <Rotulo ativa={ativa}>{aba.rotulo}</Rotulo>
              </Link>
            </li>
          );
        })}

        <li className="min-w-0">
          <button
            type="button"
            onClick={onMenu}
            aria-label="Abrir o menu completo do admin"
            className="group flex h-full w-full flex-col items-center justify-center gap-0.5 outline-none"
          >
            <Pilula ativa={menuAceso}>
              <Menu className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
            </Pilula>
            <Rotulo ativa={menuAceso}>Menu</Rotulo>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/**
 * A pastilha atrás do ícone: laranja clarinho com ícone laranja, a mesma
 * linguagem do item ativo da barra lateral. Só a cor do ícone mudar seria um
 * sinal fraco demais para um polegar que bate o olho de relance.
 */
function Pilula({ ativa, children }: { ativa: boolean; children: ReactNode }) {
  return (
    <span
      className={[
        "grid h-7 w-14 place-items-center rounded-full transition-colors duration-150",
        ativa
          ? "bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
          : "text-[var(--cz-texto-suave)] group-active:bg-[#F4F5F7]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function Rotulo({ ativa, children }: { ativa: boolean; children: ReactNode }) {
  return (
    <span
      className={[
        "max-w-full truncate text-[11px] font-semibold leading-[14px]",
        ativa ? "text-[var(--cz-laranja-forte)]" : "text-[var(--cz-texto-suave)]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}
