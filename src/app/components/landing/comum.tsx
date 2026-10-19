import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { linkWhatsapp, type MensagemWhatsapp } from "./contato";
import { linkDoApp } from "./links";

/**
 * Peças repetidas em toda seção da landing: ritmo vertical, tipografia e botões.
 *
 * O ritmo mora AQUI de propósito. A primeira versão tinha `py-24 sm:py-32` escrito
 * em cada seção, e somando o respiro de baixo de uma com o de cima da outra davam
 * 224px de branco entre dois blocos — a página tinha quase 10 mil pixels de altura.
 *
 * O rótulo numerado ("01 · Canais") é o caderno contábil do fundo: as seções são
 * lançamentos numerados de um livro, não blocos soltos.
 */

export function Secao({
  id,
  className = "",
  espaco = "py-12 sm:py-16",
  children,
}: {
  id?: string;
  className?: string;
  /** Respiro vertical. Prop em vez de classe extra: `pt-*` e `py-*` juntos
      dependeriam da ordem em que o Tailwind gera as duas utilitárias. */
  espaco?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`relative scroll-mt-16 ${espaco} ${className}`}>
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function Rotulo({ numero, texto, escuro = false }: { numero: string; texto: string; escuro?: boolean }) {
  return (
    <p
      className={`flex items-center gap-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.16em] ${
        escuro ? "text-white/60" : "text-[#6B7280]"
      }`}
    >
      <span className="text-[#F26212]">{numero}</span>
      <span aria-hidden="true" className={`h-px w-5 ${escuro ? "bg-white/20" : "bg-[#DCE0E7]"}`} />
      {texto}
    </p>
  );
}

export function Titulo({
  children,
  escuro = false,
  className = "",
}: {
  children: React.ReactNode;
  escuro?: boolean;
  className?: string;
}) {
  return (
    <h2
      className={`mt-3 text-balance text-[1.85rem] font-extrabold leading-[1.08] tracking-[-0.038em] sm:text-[2.5rem] ${
        escuro ? "text-white" : "text-[#14161B]"
      } ${className}`}
    >
      {children}
    </h2>
  );
}

export function Texto({
  children,
  escuro = false,
  className = "",
}: {
  children: React.ReactNode;
  escuro?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`mt-3.5 text-pretty text-[15.5px] leading-[1.65] sm:text-[17px] ${
        escuro ? "text-white/70" : "text-[#6B7280]"
      } ${className}`}
    >
      {children}
    </p>
  );
}

/** Atraso da revelação em ms, lido pela regra `[data-revelar]` do landing.css. */
export function atraso(ms: number) {
  return { "--atraso": ms } as React.CSSProperties;
}

/* -------------------------------------------------------------------------- */
/* Botões                                                                     */
/*                                                                            */
/* O primário leva a seta numa pastilha própria, à direita: é o que dá ao      */
/* botão cara de botão de produto e não de link pintado. O secundário leva o   */
/* ícone à esquerda, que diz o que acontece antes de ler ("entrar", "painel"). */
/* -------------------------------------------------------------------------- */

const TAMANHOS = {
  md: { botao: "h-12 gap-3 rounded-[12px] pl-5 pr-2 text-[15px]", pastilha: "size-8 rounded-[9px]", icone: "h-4 w-4" },
  sm: { botao: "h-10 gap-2.5 rounded-[11px] pl-4 pr-1.5 text-[14px]", pastilha: "size-7 rounded-[8px]", icone: "h-3.5 w-3.5" },
} as const;

export function BotaoMarca({
  href,
  children,
  tamanho = "md",
  claro = false,
  Icone = ArrowRight,
  className = "",
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  tamanho?: keyof typeof TAMANHOS;
  /** Branco com texto escuro, para usar SOBRE o laranja. */
  claro?: boolean;
  Icone?: LucideIcon;
  className?: string;
  onClick?: () => void;
}) {
  const t = TAMANHOS[tamanho];
  const cores = claro
    ? "bg-white text-[#14161B] shadow-[0_14px_30px_-12px_rgba(80,25,0,0.6)] hover:bg-[#FFF8F3]"
    : "bg-[#F26212] text-white shadow-[0_10px_24px_-12px_rgba(242,98,18,0.9)] hover:bg-[#E2560C] active:bg-[#C34706]";
  const pastilha = claro ? "bg-[#FFF2E9] text-[#D9500A]" : "bg-white/20 text-white";
  return (
    <Link
      href={linkDoApp(href)}
      onClick={onClick}
      className={`group inline-flex items-center justify-between font-bold tracking-[-0.01em] transition-colors ${t.botao} ${cores} ${className}`}
    >
      <span className="truncate">{children}</span>
      <span className={`grid shrink-0 place-items-center transition-transform duration-200 group-hover:translate-x-0.5 ${t.pastilha} ${pastilha}`}>
        <Icone className={t.icone} strokeWidth={2.5} aria-hidden="true" />
      </span>
    </Link>
  );
}

export function BotaoContorno({
  href,
  children,
  Icone,
  tamanho = "md",
  claro = false,
  className = "",
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  Icone: LucideIcon;
  tamanho?: keyof typeof TAMANHOS;
  /** Contorno branco, para usar sobre o laranja. */
  claro?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const altura = tamanho === "md" ? "h-12 rounded-[12px] px-5 text-[15px]" : "h-10 rounded-[11px] px-3.5 text-[14px]";
  const cores = claro
    ? "border border-white/40 text-white hover:border-white hover:bg-white/10"
    : "border border-[#DCE0E7] bg-white text-[#14161B] hover:border-[#C9CED8] hover:bg-[#F8F9FB]";
  return (
    <Link
      href={linkDoApp(href)}
      onClick={onClick}
      className={`group inline-flex items-center justify-center gap-2 font-semibold tracking-[-0.01em] transition-colors ${altura} ${cores} ${className}`}
    >
      <Icone
        className={`h-[17px] w-[17px] shrink-0 transition-colors ${claro ? "text-white/80" : "text-[#9AA1AC] group-hover:text-[#F26212]"}`}
        aria-hidden="true"
      />
      <span className="truncate">{children}</span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* WhatsApp                                                                   */
/*                                                                            */
/* Verde da marca com texto ESCURO: branco sobre #25D366 dá só 2:1, o #14161B */
/* dá 9:1. Sobre o laranja da chamada final o botão é branco, e o ícone fica  */
/* no verde-escuro (#128C7E, 4,1:1 sobre branco).                             */
/* -------------------------------------------------------------------------- */

/** Marca do WhatsApp, numa cor só (pega a cor do texto). */
export function IconeWhatsapp({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M26.576 5.363c-2.69-2.69-6.406-4.354-10.511-4.354-8.209 0-14.865 6.655-14.865 14.865 0 2.732 0.737 5.291 2.022 7.491l-0.038-0.070-2.109 7.702 7.879-2.067c2.051 1.139 4.498 1.809 7.102 1.809h0.006c8.209-0.003 14.862-6.659 14.862-14.868 0-4.103-1.662-7.817-4.349-10.507l0 0zM16.062 28.228h-0.005c-0 0-0.001 0-0.001 0-2.319 0-4.489-0.64-6.342-1.753l0.056 0.031-0.451-0.267-4.675 1.227 1.247-4.559-0.294-0.467c-1.185-1.862-1.889-4.131-1.889-6.565 0-6.822 5.531-12.353 12.353-12.353s12.353 5.531 12.353 12.353c0 6.822-5.53 12.353-12.353 12.353h-0zM22.838 18.977c-0.371-0.186-2.197-1.083-2.537-1.208-0.341-0.124-0.589-0.185-0.837 0.187-0.246 0.371-0.958 1.207-1.175 1.455-0.216 0.249-0.434 0.279-0.805 0.094-1.15-0.466-2.138-1.087-2.997-1.852l0.010 0.009c-0.799-0.74-1.484-1.587-2.037-2.521l-0.028-0.052c-0.216-0.371-0.023-0.572 0.162-0.757 0.167-0.166 0.372-0.434 0.557-0.65 0.146-0.179 0.271-0.384 0.366-0.604l0.006-0.017c0.043-0.087 0.068-0.188 0.068-0.296 0-0.131-0.037-0.253-0.101-0.357l0.002 0.003c-0.094-0.186-0.836-2.014-1.145-2.758-0.302-0.724-0.609-0.625-0.836-0.637-0.216-0.010-0.464-0.012-0.712-0.012-0.395 0.010-0.746 0.188-0.988 0.463l-0.001 0.002c-0.802 0.761-1.3 1.834-1.3 3.023 0 0.026 0 0.053 0.001 0.079l-0-0.004c0.131 1.467 0.681 2.784 1.527 3.857l-0.012-0.015c1.604 2.379 3.742 4.282 6.251 5.564l0.094 0.043c0.548 0.248 1.25 0.513 1.968 0.74l0.149 0.041c0.442 0.14 0.951 0.221 1.479 0.221 0.303 0 0.601-0.027 0.889-0.078l-0.031 0.004c1.069-0.223 1.956-0.868 2.497-1.749l0.009-0.017c0.165-0.366 0.261-0.793 0.261-1.242 0-0.185-0.016-0.366-0.047-0.542l0.003 0.019c-0.092-0.155-0.34-0.247-0.712-0.434z" />
    </svg>
  );
}

const TAMANHOS_WHATSAPP = {
  md: { botao: "h-12 gap-2.5 rounded-[12px] px-5 text-[15px]", icone: "h-5 w-5" },
  sm: { botao: "h-10 gap-2 rounded-[11px] px-3.5 text-[14px]", icone: "h-[18px] w-[18px]" },
} as const;

/** Botão que abre a conversa no WhatsApp com a mensagem do lugar onde está. */
export function BotaoWhatsapp({
  mensagem = "geral",
  children,
  tamanho = "md",
  claro = false,
  className = "",
  onClick,
}: {
  mensagem?: MensagemWhatsapp;
  children: React.ReactNode;
  tamanho?: keyof typeof TAMANHOS_WHATSAPP;
  /** Branco com texto escuro, para usar SOBRE o laranja. */
  claro?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const t = TAMANHOS_WHATSAPP[tamanho];
  const cores = claro
    ? "bg-white text-[#14161B] shadow-[0_14px_30px_-12px_rgba(80,25,0,0.6)] hover:bg-[#F3FFF7]"
    : "bg-[#25D366] text-[#14161B] shadow-[0_10px_24px_-12px_rgba(7,94,84,0.85)] hover:bg-[#3DDC7A] active:bg-[#1FBE5B]";
  return (
    <a
      href={linkWhatsapp(mensagem)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={`inline-flex items-center justify-center font-bold tracking-[-0.01em] transition-colors ${t.botao} ${cores} ${className}`}
    >
      <IconeWhatsapp className={`${t.icone} shrink-0 ${claro ? "text-[#128C7E]" : ""}`} />
      <span className="truncate">{children}</span>
      <span className="sr-only"> (abre o WhatsApp em nova aba)</span>
    </a>
  );
}
