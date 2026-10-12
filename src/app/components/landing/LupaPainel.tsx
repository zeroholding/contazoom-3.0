"use client";

/**
 * A lupa sobre o painel, na primeira dobra.
 *
 * Duas cópias do mesmo `PainelMock`: a de baixo em tamanho normal, a de cima
 * ampliada em torno do centro da lupa e recortada num círculo (ver
 * `.czl-lupa-*` em landing.css). As coordenadas são px a partir do canto da
 * caixa, e as duas cópias moram em caixas do mesmo tamanho, então o mesmo
 * número serve ao recorte e à origem da ampliação.
 *
 * Sem ninguém com o mouse em cima, a lupa passeia sozinha pelos três pontos que
 * contam a história (a venda que dá prejuízo, o detalhe miúdo de uma venda, o
 * lucro bruto). Com o mouse, ela segue o cursor. No toque, vai até onde o dedo
 * tocou. Quem pediu menos movimento recebe a lupa parada no primeiro ponto.
 */

import { useEffect, useRef } from "react";
import PainelMock from "./PainelMock";

const PASSEIO = ["margem", "detalhe", "kpi"] as const;
const INTERVALO_PASSEIO = 3400;

type Ponto = { x: number; y: number };

export default function LupaPainel() {
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;

    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let atual: Ponto = { x: 0, y: 0 };
    let alvo: Ponto = { x: 0, y: 0 };
    let fator = 0.2;
    let quadro = 0;
    let indicePasseio = 0;
    let comMouse = false;
    let pausadoAte = 0;
    let naTela = true;

    const aplicar = () => {
      el.style.setProperty("--lx", `${atual.x.toFixed(1)}px`);
      el.style.setProperty("--ly", `${atual.y.toFixed(1)}px`);
    };

    const passo = () => {
      const dx = alvo.x - atual.x;
      const dy = alvo.y - atual.y;
      if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) {
        atual = { ...alvo };
        aplicar();
        quadro = 0;
        return;
      }
      atual = { x: atual.x + dx * fator, y: atual.y + dy * fator };
      aplicar();
      quadro = requestAnimationFrame(passo);
    };

    const mover = (ponto: Ponto, novoFator: number) => {
      alvo = ponto;
      fator = novoFator;
      if (novoFator >= 1) {
        atual = { ...ponto };
        aplicar();
        return;
      }
      if (!quadro) quadro = requestAnimationFrame(passo);
    };

    /** Centro de um ponto de foco na cópia de BAIXO, relativo à caixa. */
    const centroDoFoco = (nome: string): Ponto | null => {
      const alvoEl = el.querySelector<HTMLElement>(`[data-camada="base"] [data-foco="${nome}"]`);
      if (!alvoEl) return null;
      const caixa = el.getBoundingClientRect();
      const r = alvoEl.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      // O detalhe é uma linha longa: a lupa mira o começo dela, onde há texto.
      const x = nome === "detalhe" ? r.left + Math.min(r.width * 0.32, 150) : r.left + r.width / 2;
      return { x: x - caixa.left, y: r.top + r.height / 2 - caixa.top };
    };

    /**
     * A lupa inteira cabe na tela a partir deste ponto? No celular a coluna de
     * margem encosta na borda direita, e a lupa sobre ela sairia cortada pela
     * metade — esse ponto é pulado no passeio (o toque ainda leva a lupa lá).
     */
    const cabeNaTela = (ponto: Ponto) => {
      const raio = parseFloat(getComputedStyle(el).getPropertyValue("--lr")) || 90;
      const xNaTela = el.getBoundingClientRect().left + ponto.x;
      return xNaTela - raio >= 0 && xNaTela + raio <= document.documentElement.clientWidth;
    };

    const irParaFoco = (indice: number, novoFator: number) => {
      for (let tentativa = 0; tentativa < PASSEIO.length; tentativa++) {
        const nome = PASSEIO[(indice + tentativa) % PASSEIO.length];
        const ponto = centroDoFoco(nome);
        if (ponto && cabeNaTela(ponto)) {
          indicePasseio = (indice + tentativa) % PASSEIO.length;
          mover(ponto, novoFator);
          return;
        }
      }
    };

    // Posição inicial, sem animação, e só então a lupa aparece.
    irParaFoco(0, 1);
    el.dataset.pronta = "true";

    const relogio = window.setInterval(() => {
      if (reduzir || comMouse || !naTela || document.hidden) return;
      if (Date.now() < pausadoAte) return;
      irParaFoco(indicePasseio + 1, 0.055);
    }, INTERVALO_PASSEIO);

    const pontoDoEvento = (e: PointerEvent): Ponto => {
      const caixa = el.getBoundingClientRect();
      return {
        x: Math.min(Math.max(e.clientX - caixa.left, 0), caixa.width),
        y: Math.min(Math.max(e.clientY - caixa.top, 0), caixa.height),
      };
    };

    const aoMover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      comMouse = true;
      mover(pontoDoEvento(e), reduzir ? 1 : 0.24);
    };

    const aoSair = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      comMouse = false;
      pausadoAte = Date.now() + 1400;
    };

    const aoTocar = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      pausadoAte = Date.now() + 7000;
      mover(pontoDoEvento(e), reduzir ? 1 : 0.2);
    };

    const aoRedimensionar = () => {
      if (comMouse) return;
      irParaFoco(indicePasseio, 1);
    };

    const observador = new IntersectionObserver(([entrada]) => {
      naTela = entrada?.isIntersecting ?? true;
    });
    observador.observe(el);

    const redimensionamento = new ResizeObserver(aoRedimensionar);
    redimensionamento.observe(el);

    el.addEventListener("pointermove", aoMover);
    el.addEventListener("pointerleave", aoSair);
    el.addEventListener("pointerdown", aoTocar);

    return () => {
      window.clearInterval(relogio);
      if (quadro) cancelAnimationFrame(quadro);
      observador.disconnect();
      redimensionamento.disconnect();
      el.removeEventListener("pointermove", aoMover);
      el.removeEventListener("pointerleave", aoSair);
      el.removeEventListener("pointerdown", aoTocar);
    };
  }, []);

  return (
    <div
      ref={raiz}
      className="czl-lupa"
      role="img"
      aria-label="Prévia do painel do ContaZoom: indicadores do mês e as últimas vendas, cada uma com a sua margem. Uma lupa amplia os detalhes de cada número."
    >
      <div data-camada="base" aria-hidden="true">
        <PainelMock />
      </div>
      <div className="czl-lupa-zoom" data-camada="zoom" aria-hidden="true" inert>
        <div>
          <PainelMock />
        </div>
      </div>
      <div className="czl-lupa-aro" aria-hidden="true" />
    </div>
  );
}
