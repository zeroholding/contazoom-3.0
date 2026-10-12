"use client";

/**
 * Revelação na rolagem e rolagem suave das âncoras.
 *
 * Um único observador para a página inteira, montado uma vez. As seções são
 * componentes de servidor e só marcam `data-revelar`; quem esconde é este
 * script, e só esconde o que está FORA da tela no momento da montagem. O que já
 * está visível nunca pisca, e sem JavaScript nada some.
 *
 * O `scroll-behavior: smooth` vai no <html> só enquanto a landing está montada:
 * o painel não ganha rolagem suave por tabela ao navegar para o login.
 */

import { useEffect } from "react";

export default function Animacoes() {
  useEffect(() => {
    const html = document.documentElement;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anterior = html.style.scrollBehavior;
    if (!reduzir) html.style.scrollBehavior = "smooth";

    const raiz = document.querySelector(".cz-landing");
    if (!raiz || reduzir || !("IntersectionObserver" in window)) {
      return () => {
        html.style.scrollBehavior = anterior;
      };
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          (entrada.target as HTMLElement).dataset.estado = "visivel";
          observador.unobserve(entrada.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    );

    const alturaTela = window.innerHeight;
    raiz.querySelectorAll<HTMLElement>("[data-revelar]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const jaVisivel = r.top < alturaTela * 0.9 && r.bottom > 0;
      if (jaVisivel) return;
      el.dataset.estado = "oculto";
      observador.observe(el);
    });

    return () => {
      observador.disconnect();
      html.style.scrollBehavior = anterior;
    };
  }, []);

  return null;
}
