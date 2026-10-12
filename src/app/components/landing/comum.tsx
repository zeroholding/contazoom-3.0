import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
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
