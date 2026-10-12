"use client";

/**
 * "Abra uma venda e veja para onde foi o dinheiro."
 *
 * São as MESMAS cinco vendas do painel da primeira dobra (`VENDAS_EXEMPLO`):
 * quem passou a lupa na capinha com margem negativa lá em cima encontra aqui a
 * explicação, desconto por desconto.
 *
 * A escala vai do menor valor (zero, ou a margem quando ela é negativa) até o
 * valor da venda. Com margem negativa a régua ganha um trecho à esquerda do
 * zero, e o prejuízo aparece como barra vermelha ANTES da linha do zero, em vez
 * de sumir. Trocar de venda anima as barras (left/width) e os valores.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ZoomIn } from "lucide-react";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";
import {
  type Canal,
  NOME_CANAL,
  VENDAS_EXEMPLO,
  type VendaExemplo,
  comSinal,
  margemDe,
  moeda,
  percentual,
} from "./dados";

const LOGO: Record<Canal, (p: { className?: string }) => React.ReactElement> = {
  ML: LogoMercadoLivre,
  SP: LogoShopee,
  TT: LogoTikTok,
};

type Linha = {
  chave: string;
  rotulo: string;
  nota: string;
  valor: number;
  de: number;
  ate: number;
  tipo: "venda" | "desconto" | "margem";
};

function linhasDa(v: VendaExemplo): Linha[] {
  const descontos = [
    { chave: "taxa", rotulo: "Comissão e taxas", valor: v.taxa, extra: v.estimado ? " · estimada" : "" },
    { chave: "frete", rotulo: "Frete", valor: v.frete, extra: "" },
    { chave: "imposto", rotulo: "Imposto", valor: v.imposto, extra: "" },
    { chave: "cmv", rotulo: "Custo do produto (CMV)", valor: v.cmv, extra: "" },
  ];
  const linhas: Linha[] = [
    { chave: "venda", rotulo: "Venda", nota: "valor do pedido", valor: v.valor, de: 0, ate: v.valor, tipo: "venda" },
  ];
  let restante = v.valor;
  for (const d of descontos) {
    const ate = restante;
    restante = Math.round((restante - d.valor) * 100) / 100;
    linhas.push({
      chave: d.chave,
      rotulo: d.rotulo,
      nota: `${percentual(d.valor, v.valor)} da venda${d.extra}`,
      valor: -d.valor,
      de: restante,
      ate,
      tipo: "desconto",
    });
  }
  const m = margemDe(v);
  linhas.push({
    chave: "margem",
    rotulo: m < 0 ? "Prejuízo da venda" : "Margem de contribuição",
    nota: `${percentual(m, v.valor)} da venda`,
    valor: m,
    de: Math.min(0, m),
    ate: Math.max(0, m),
    tipo: "margem",
  });
  return linhas;
}

/** Valor que desliza até o alvo em vez de trocar de uma vez. */
function useAnimado(alvo: number, duracao = 560) {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const inicio = atual.current;
    if (inicio === alvo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      atual.current = alvo;
      setValor(alvo);
      return;
    }
    let quadro = 0;
    const t0 = performance.now();
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - t0) / duracao);
      const v = inicio + (alvo - inicio) * (1 - Math.pow(1 - p, 3));
      atual.current = v;
      setValor(v);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, duracao]);
  return valor;
}

function LinhaCascata({ linha, indice, x, zero }: { linha: Linha; indice: number; x: (v: number) => number; zero: number | null }) {
  const valor = useAnimado(linha.valor);
  const negativa = linha.tipo === "margem" && linha.valor < 0;
  const cor =
    linha.tipo === "venda"
      ? "bg-[#14161B]"
      : linha.tipo === "margem"
        ? negativa
          ? "bg-[#F04438] shadow-[0_8px_18px_-8px_rgba(240,68,56,0.9)]"
          : "bg-[linear-gradient(90deg,#F26212,#D9500A)] shadow-[0_8px_18px_-8px_rgba(242,98,18,0.9)]"
        : "border border-[#FDA29B] bg-[repeating-linear-gradient(135deg,#FEE4E2_0_6px,#FECDCA_6px_12px)]";
  const corValor =
    linha.tipo === "desconto" ? "text-[#D92D20]" : linha.tipo === "margem" ? (negativa ? "text-[#D92D20]" : "text-[#D9500A]") : "text-[#14161B]";

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[188px_minmax(0,1fr)_104px]">
      <p className="min-w-0 leading-tight">
        <span className={`text-[14px] tracking-[-0.01em] text-[#14161B] ${linha.tipo === "desconto" ? "font-medium" : "font-bold"}`}>
          {linha.rotulo}
        </span>
        <span className="czl-num block text-[12px] text-[#9AA1AC] max-sm:ml-1.5 max-sm:inline">{linha.nota}</span>
      </p>
      <div className="relative order-3 col-span-2 h-6 rounded-[8px] bg-[#F4F5F7] sm:order-none sm:col-span-1 sm:h-8" aria-hidden="true">
        {zero !== null && <span className="absolute -inset-y-1 z-10 w-px bg-[#6B7280]" style={{ left: `${zero}%` }} />}
        <span
          className="absolute inset-y-0 transition-[left,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ left: `${x(linha.de)}%`, width: `${Math.max(0, x(linha.ate) - x(linha.de))}%`, transitionDelay: `${indice * 40}ms` }}
        >
          <span
            className={`czl-barra block h-full rounded-[7px] ${cor}`}
            style={{ "--i": indice, "--origem": linha.tipo === "desconto" ? "right center" : "left center" } as React.CSSProperties}
          />
        </span>
      </div>
      <p className={`czl-num text-right text-[15px] font-extrabold tracking-[-0.02em] ${corValor}`}>
        {linha.tipo === "desconto" || negativa ? "−" : ""}R$ {moeda(valor)}
      </p>
    </li>
  );
}

export default function ExploradorMargem() {
  const [ativa, setAtiva] = useState(0);
  const abas = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();
  const venda = VENDAS_EXEMPLO[ativa];
  const linhas = linhasDa(venda);
  const margem = margemDe(venda);
  const minimo = Math.min(0, margem);
  const x = (v: number) => ((v - minimo) / (venda.valor - minimo)) * 100;
  const Logo = LOGO[venda.canal];

  const escolher = (i: number, focar = false) => {
    setAtiva(i);
    if (focar) abas.current[i]?.focus();
    const aba = abas.current[i];
    const faixa = aba?.parentElement;
    // Só a faixa rola, na horizontal: `scrollIntoView` arrastaria a página.
    if (aba && faixa && faixa.scrollWidth > faixa.clientWidth) {
      const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      faixa.scrollTo({ left: aba.offsetLeft - 20, behavior: reduzir ? "auto" : "smooth" });
    }
  };

  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>) => {
    const n = VENDAS_EXEMPLO.length;
    const mapa: Record<string, number> = {
      ArrowRight: (ativa + 1) % n,
      ArrowDown: (ativa + 1) % n,
      ArrowLeft: (ativa - 1 + n) % n,
      ArrowUp: (ativa - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    if (!(e.key in mapa)) return;
    e.preventDefault();
    escolher(mapa[e.key], true);
  };

  const resumo = `${venda.produto}, venda de R$ ${moeda(venda.valor)}: comissão e taxas R$ ${moeda(venda.taxa)}, frete R$ ${moeda(venda.frete)}, imposto R$ ${moeda(venda.imposto)}, custo do produto R$ ${moeda(venda.cmv)}. ${margem < 0 ? "Prejuízo" : "Margem"} de R$ ${moeda(margem)}, ${percentual(margem, venda.valor)} da venda.`;

  return (
    <div className="grid gap-3 lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-5">
      {/* Celular: faixa de cartões que o dedo arrasta. Desktop: lista vertical,
          como as linhas da Central de Vendas. */}
      {/* Utilitárias em vez do `.cz-hscroll` global: aquela classe é CSS sem
          camada e o `overflow-x: auto` dela venceria o `lg:overflow-visible`. */}
      <div
        role="tablist"
        aria-label="Vendas de exemplo"
        className="relative -mx-5 flex snap-x snap-proximity scroll-px-5 gap-2 overflow-x-auto px-5 py-1.5 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:py-0 [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&>*]:snap-start"
      >
        {VENDAS_EXEMPLO.map((v, i) => {
          const L = LOGO[v.canal];
          const m = margemDe(v);
          const selecionada = i === ativa;
          return (
            <button
              key={v.sku}
              ref={(el) => {
                abas.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-aba-${i}`}
              aria-selected={selecionada}
              aria-controls={`${base}-painel`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => escolher(i)}
              onKeyDown={aoTeclar}
              className={`flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors lg:w-full lg:gap-3 ${
                selecionada
                  ? "border-[#F26212] bg-[#FFF2E9] shadow-[0_8px_20px_-14px_rgba(242,98,18,0.9)]"
                  : "border-[#EDEFF3] bg-white hover:border-[#DCE0E7] hover:bg-[#FCFCFD]"
              }`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-[#EDEFF3] bg-white lg:size-9">
                <L className="max-h-4 w-auto max-w-[22px] lg:max-h-5" />
              </span>
              <span className="min-w-0 lg:flex-1">
                <span className="block whitespace-nowrap text-[13px] font-bold tracking-[-0.01em] text-[#14161B] lg:hidden">{v.curto}</span>
                <span className="block truncate text-[14px] font-bold tracking-[-0.01em] text-[#14161B] max-lg:hidden">{v.produto}</span>
                <span className="czl-num block whitespace-nowrap text-[11.5px] text-[#9AA1AC]">R$ {moeda(v.valor)}</span>
              </span>
              <span
                className={`czl-num shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold ${
                  m < 0 ? "bg-[#FEF3F2] text-[#D92D20]" : "bg-[#ECFDF3] text-[#067647]"
                }`}
              >
                {percentual(m, v.valor)}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${base}-painel`}
        aria-labelledby={`${base}-aba-${ativa}`}
        tabIndex={0}
        className="rounded-[22px] border border-[#EDEFF3] bg-white p-4 shadow-[0_24px_50px_-30px_rgba(16,24,40,0.25)] sm:p-6"
      >
        <p className="sr-only">{resumo}</p>
        <div className="flex items-center gap-3 border-b border-[#EDEFF3] pb-4" aria-hidden="true">
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#EDEFF3] bg-white">
            <Logo className="h-6 w-auto max-w-[28px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15.5px] font-bold tracking-[-0.02em] text-[#14161B]">{venda.produto}</p>
            <p className="truncate text-[12.5px] text-[#6B7280]">
              {NOME_CANAL[venda.canal]} · {venda.meta}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[#EDEFF3] bg-[#F8F9FB] px-2.5 py-1 font-mono text-[10.5px] font-medium text-[#6B7280] max-sm:hidden">
            Exemplo ilustrativo
          </span>
        </div>

        <ul className="mt-4 space-y-3 sm:space-y-3.5" aria-hidden="true">
          {linhas.map((linha, i) => (
            <LinhaCascata key={linha.chave} linha={linha} indice={i} x={x} zero={minimo < 0 ? x(0) : null} />
          ))}
        </ul>

        <div className="mt-4 grid gap-2.5 sm:mt-5" aria-hidden="true">
          <p className="czl-num overflow-x-auto whitespace-nowrap rounded-[12px] bg-[#F8F9FB] px-4 py-2.5 text-center font-mono text-[11.5px] text-[#6B7280] sm:text-[12.5px]">
            {moeda(venda.valor)} − {moeda(venda.taxa)} − {moeda(venda.frete)} − {moeda(venda.imposto)} − {moeda(venda.cmv)} ={" "}
            <span className={`font-semibold ${margem < 0 ? "text-[#D92D20]" : "text-[#D9500A]"}`}>{comSinal(margem)}</span>
          </p>
          <p key={venda.sku} className="czl-linha flex gap-2.5 rounded-[12px] border border-[#FFD9BF] bg-[#FFF8F3] px-3.5 py-3 text-[13.5px] leading-[1.55] text-[#7C2D12]">
            <ZoomIn className="mt-0.5 h-4 w-4 shrink-0 text-[#F26212]" aria-hidden="true" />
            {venda.leitura}
          </p>
        </div>
      </div>
    </div>
  );
}
