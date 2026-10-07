"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Menu } from "lucide-react";
import {
  CaminhaoIcon,
  DashboardIcon,
  MoneyBagIcon,
  SalesIcon,
} from "./Sidebar";

type Aba = {
  href: string;
  rotulo: string;
  /**
   * Prefixo que marca a aba como a tela atual. `/vendas` cobre `/vendas/shopee`
   * e `/vendas/tiktok-shop`: a aba é o MÓDULO, não só a página de destino do
   * toque.
   */
  prefixo: string;
  icone: ReactNode;
};

/**
 * As quatro áreas que se abrem todo dia, a um toque do polegar.
 *
 * O resto do menu (Anúncios, Estoque Full, SKU, Documentos, Contas…) fica na
 * gaveta, atrás da aba "Menu". A escolha das quatro é a mesma lógica da ordem da
 * barra lateral: ver como o dia está (Início), o que vendeu (Vendas), o que
 * precisa sair hoje (Expedição) e quanto sobrou (Financeiro).
 *
 * Cada aba abre a tela "principal" do módulo. Os módulos têm filhos, e o toque
 * precisa cair em algum deles: Vendas abre a Geral (todos os canais juntos),
 * Expedição abre a Geral, Financeiro abre o painel.
 */
const ABAS: Aba[] = [
  { href: "/dashboard", rotulo: "Início", prefixo: "/dashboard", icone: <DashboardIcon /> },
  { href: "/vendas/geral", rotulo: "Vendas", prefixo: "/vendas", icone: <SalesIcon /> },
  { href: "/expedicao", rotulo: "Expedição", prefixo: "/expedicao", icone: <CaminhaoIcon /> },
  { href: "/financeiro/dashboard", rotulo: "Financeiro", prefixo: "/financeiro", icone: <MoneyBagIcon /> },
];

function estaEm(pathname: string, prefixo: string) {
  return pathname === prefixo || pathname.startsWith(prefixo + "/");
}

/**
 * Quantas barras estão montadas agora.
 *
 * Cada página renderiza o próprio quadro (Topbar + Sidebar), então a barra
 * desmonta e remonta a cada navegação. Um liga/desliga simples na classe do
 * `<html>` apagaria o espaço reservado embaixo no instante da troca; contando, a
 * classe só sai quando a ÚLTIMA barra sai.
 */
let instancias = 0;

/**
 * Barra de abas do celular (abaixo de 768px). No desktop não existe: lá a barra
 * lateral cumpre o papel.
 *
 * Enquanto está montada, liga `html.cz-com-tabbar`. É essa classe que faz o
 * `globals.css` reservar o espaço embaixo (`--cz-bottom-offset`), para a barra
 * nunca ficar por cima da última linha de uma tabela nem do botão de um
 * formulário.
 */
export default function BottomNav({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname() || "/";

  useEffect(() => {
    instancias += 1;
    document.documentElement.classList.add("cz-com-tabbar");
    return () => {
      instancias = Math.max(0, instancias - 1);
      if (instancias === 0) {
        document.documentElement.classList.remove("cz-com-tabbar");
      }
    };
  }, []);

  const abaAtual = ABAS.find((a) => estaEm(pathname, a.prefixo));
  // Numa tela que vive só na gaveta (SKU, Contas, Documentos…), o "Menu" acende:
  // sem isso nenhuma aba estaria marcada e a barra pareceria quebrada.
  const menuAceso = !abaAtual;

  return (
    <nav
      aria-label="Navegação rápida"
      // z-40, o mesmo do cabeçalho: abaixo da gaveta (55/60), das folhas e dos
      // modais, acima do conteúdo (z-20). A hairline em cima faz o papel da
      // sombra, que o painel evita de propósito.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--cz-hairline)] bg-[var(--cz-superficie)] pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <ul className="grid h-[var(--cz-tabbar-h)] grid-cols-5">
        {ABAS.map((aba) => {
          const ativa = aba === abaAtual;
          return (
            <li key={aba.href} className="min-w-0">
              <Link
                href={aba.href}
                aria-current={ativa ? "page" : undefined}
                className="group flex h-full flex-col items-center justify-center gap-0.5 outline-none"
              >
                <Pilula ativa={ativa}>{aba.icone}</Pilula>
                <Rotulo ativa={ativa}>{aba.rotulo}</Rotulo>
              </Link>
            </li>
          );
        })}

        <li className="min-w-0">
          <button
            type="button"
            onClick={onMenu}
            aria-label="Abrir o menu completo"
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
 * A pastilha atrás do ícone.
 *
 * É ela que carrega o "você está aqui": laranja clarinho com o ícone laranja,
 * a mesma linguagem do item ativo da barra lateral. Só a cor do ícone mudar seria
 * um sinal fraco demais para um polegar que bate o olho de relance.
 */
function Pilula({ ativa, children }: { ativa: boolean; children: ReactNode }) {
  return (
    <span
      className={[
        "grid h-7 w-14 place-items-center rounded-full transition-colors duration-150",
        // Os ícones do Sidebar nascem em 20px (h-5 w-5); na barra de abas pedem 22.
        "[&>svg]:h-[22px] [&>svg]:w-[22px]",
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
