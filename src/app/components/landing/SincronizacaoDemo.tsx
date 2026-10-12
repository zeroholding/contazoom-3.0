"use client";

/**
 * O cartão "Sincronizar vendas" funcionando, com dados de exemplo.
 *
 * As linhas do registro seguem as mensagens que a sincronização de verdade manda
 * pelo SSE ("x/y vendas verificadas (n para salvar, m inalteradas)",
 * "sincronização concluída"), e o resumo final é o texto do `sync_complete`. Os
 * três canais correm juntos porque é assim que o `/api/sync-all` faz
 * (`Promise.all` sobre os canais).
 *
 * Tudo é função do tempo decorrido: um único requestAnimationFrame avança o
 * relógio e `canalEm(t)` diz onde cada canal está. Roda sozinho uma vez quando
 * o cartão aparece; o botão roda de novo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";

const CANAIS = [
  { chave: "ML", nome: "Mercado Livre", contas: "2 contas", total: 1240, salvar: 86, inicio: 250, busca: 2900, salva: 500, Logo: LogoMercadoLivre },
  { chave: "SP", nome: "Shopee", contas: "1 loja", total: 412, salvar: 39, inicio: 450, busca: 2000, salva: 450, Logo: LogoShopee },
  { chave: "TT", nome: "TikTok Shop", contas: "1 loja", total: 158, salvar: 21, inicio: 650, busca: 1400, salva: 400, Logo: LogoTikTok },
];

type CanalDemo = (typeof CANAIS)[number];
type Etapa = "fila" | "buscando" | "salvando" | "pronto";

const FIM = Math.max(...CANAIS.map((c) => c.inicio + c.busca + c.salva)) + 300;
const TOTAL = CANAIS.reduce((s, c) => s + c.total, 0);
const SALVAR = CANAIS.reduce((s, c) => s + c.salvar, 0);

const fmt = (n: number) => n.toLocaleString("pt-BR");
const entre01 = (v: number) => Math.min(1, Math.max(0, v));
const suave = (p: number) => 1 - Math.pow(1 - p, 3);

function canalEm(c: CanalDemo, t: number | null) {
  if (t === null) return { etapa: "fila" as Etapa, verificadas: 0, paraSalvar: 0, barra: 0 };
  const pBusca = entre01((t - c.inicio) / c.busca);
  const pSalva = entre01((t - c.inicio - c.busca) / c.salva);
  const etapa: Etapa = t < c.inicio ? "fila" : pBusca < 1 ? "buscando" : pSalva < 1 ? "salvando" : "pronto";
  const e = suave(pBusca);
  return {
    etapa,
    verificadas: Math.round(c.total * e),
    paraSalvar: Math.round(c.salvar * e),
    barra: e * 0.88 + pSalva * 0.12,
  };
}

type Linha = { t: number; canal?: string; texto: string; tom?: "ok" | "final" };

const REGISTRO: Linha[] = [
  { t: 0, texto: "Conectando ao Mercado Livre, à Shopee e ao TikTok Shop…" },
  ...CANAIS.flatMap((c): Linha[] => [
    { t: c.inicio, canal: c.nome, texto: "buscando vendas…" },
    {
      t: c.inicio + c.busca,
      canal: c.nome,
      texto: `${fmt(c.total)}/${fmt(c.total)} vendas verificadas (${c.salvar} para salvar, ${fmt(c.total - c.salvar)} inalteradas)`,
    },
    { t: c.inicio + c.busca + c.salva, canal: c.nome, texto: "sincronização concluída", tom: "ok" },
  ]),
  {
    t: FIM,
    texto: `Sincronização concluída: ${SALVAR} vendas salvas, ${fmt(TOTAL - SALVAR)} inalteradas de ${fmt(TOTAL)} esperadas`,
    tom: "final" as const,
  },
].sort((a, b) => a.t - b.t);

const ROTULO_ETAPA: Record<Etapa, string> = {
  fila: "Aguardando",
  buscando: "Buscando vendas…",
  salvando: "Salvando vendas…",
  pronto: "Concluída",
};

function IconeEtapa({ etapa }: { etapa: Etapa }) {
  if (etapa === "pronto") {
    return (
      <span className="grid size-6 place-items-center rounded-full bg-[#079455] text-white">
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (etapa === "fila") {
    return <span className="size-5 rounded-full border-2 border-dashed border-[#DCE0E7]" aria-hidden="true" />;
  }
  return <Loader2 className="h-5 w-5 animate-spin text-[#F26212]" aria-hidden="true" />;
}

export default function SincronizacaoDemo() {
  const [t, setT] = useState<number | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const quadro = useRef(0);
  const jaRodou = useRef(false);

  const rodar = useCallback(() => {
    cancelAnimationFrame(quadro.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(FIM);
      return;
    }
    const inicio = performance.now();
    const passo = (agora: number) => {
      const decorrido = Math.min(agora - inicio, FIM);
      setT(decorrido);
      if (decorrido < FIM) quadro.current = requestAnimationFrame(passo);
    };
    setT(0);
    quadro.current = requestAnimationFrame(passo);
  }, []);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada?.isIntersecting || jaRodou.current) return;
        jaRodou.current = true;
        observador.disconnect();
        rodar();
      },
      { threshold: 0.45 },
    );
    observador.observe(el);
    return () => {
      observador.disconnect();
      cancelAnimationFrame(quadro.current);
    };
  }, [rodar]);

  const rodando = t !== null && t < FIM;
  const concluido = t !== null && t >= FIM;
  const estados = CANAIS.map((c) => canalEm(c, t));
  const pct = Math.round((100 * CANAIS.reduce((s, c, i) => s + c.total * estados[i].barra, 0)) / TOTAL);
  const linhas = t === null ? [] : REGISTRO.filter((l) => l.t <= t).slice(-4);

  return (
    <div
      ref={raiz}
      className="rounded-[22px] border border-[#EDEFF3] bg-white p-4 shadow-[0_30px_60px_-30px_rgba(16,24,40,0.25),0_6px_16px_-6px_rgba(16,24,40,0.08)] sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#F26212]">
          <RefreshCw className={`h-5 w-5 ${rodando ? "animate-spin" : ""}`} strokeWidth={2.4} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold tracking-[-0.02em] text-[#14161B]">Sincronizar vendas</p>
          <p className="truncate text-[13px] text-[#6B7280]">Um clique para todos os canais</p>
        </div>
        <span className="czl-num text-[28px] font-extrabold leading-none tracking-[-0.04em] text-[#14161B]" aria-hidden="true">
          {pct}%
        </span>
      </div>

      <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-[#F1F2F5]" aria-hidden="true">
        <span
          className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,#F26212,#D9500A)]"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>

      <ul className="mt-4 space-y-2" aria-hidden="true">
        {CANAIS.map((c, i) => {
          const s = estados[i];
          return (
            <li key={c.chave} className="rounded-[14px] border border-[#EDEFF3] bg-[#F8F9FB] px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-[#EDEFF3] bg-white">
                  <c.Logo className="h-5 w-auto max-w-[26px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2 text-[14px] font-bold tracking-[-0.02em] text-[#14161B]">
                    {c.nome}
                    <span className="text-[12px] font-medium text-[#9AA1AC]">{c.contas}</span>
                  </p>
                  <p className="czl-num truncate text-[12px] text-[#6B7280]">
                    {s.etapa === "fila" ? ROTULO_ETAPA.fila : `${fmt(s.verificadas)} verificadas · ${s.paraSalvar} para salvar`}
                  </p>
                </div>
                <span className="grid size-7 shrink-0 place-items-center" title={ROTULO_ETAPA[s.etapa]}>
                  <IconeEtapa etapa={s.etapa} />
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                <span
                  className={`block h-full origin-left rounded-full ${s.etapa === "pronto" ? "bg-[#079455]" : "bg-[#14161B]"}`}
                  style={{ transform: `scaleX(${s.barra})` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Registro: as linhas novas entram por baixo e as antigas saem por cima,
          numa caixa de altura fixa para o cartão não pular. */}
      <div
        aria-hidden="true"
        className="relative mt-3 h-[6.4rem] overflow-hidden rounded-[14px] bg-[#14161B] px-3.5 py-3 font-mono text-[11px] leading-[1.6] text-white/60 sm:text-[11.5px]"
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-7 bg-gradient-to-b from-[#14161B] to-transparent" />
        <div className="flex h-full flex-col justify-end gap-0.5">
          {linhas.length === 0 ? (
            <p className="text-white/45">Pronto para sincronizar.</p>
          ) : (
            linhas.map((l) => (
              <p key={`${l.t}-${l.texto}`} className={`czl-linha ${l.tom === "final" ? "font-semibold text-white" : ""}`}>
                {l.canal && <span className="text-[#FFB98A]">{l.canal}: </span>}
                {l.texto}
                {l.tom === "ok" && <span className="text-[#47CD89]"> ✓</span>}
              </p>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={rodar}
          disabled={rodando}
          className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-[#FFD9BF] bg-[#FFF2E9] px-3.5 text-[13.5px] font-bold text-[#C2410C] transition-colors hover:border-[#FDBA8C] hover:bg-[#FFE8D6] disabled:cursor-default disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${rodando ? "animate-spin" : ""}`} strokeWidth={2.5} aria-hidden="true" />
          {rodando ? "Sincronizando…" : concluido ? "Sincronizar de novo" : "Sincronizar agora"}
        </button>
        <span className="ml-auto text-[12px] text-[#9AA1AC]">Demonstração com dados de exemplo</span>
      </div>

      <p className="sr-only" aria-live="polite">
        {rodando ? "Sincronizando as vendas de exemplo." : concluido ? REGISTRO[REGISTRO.length - 1].texto : ""}
      </p>
    </div>
  );
}
