"use client";

/**
 * Botão flutuante do WhatsApp.
 *
 * Aparece quando a primeira dobra sai da tela (ela já tem o próprio botão) e
 * fica até o fim da página. No computador é uma pílula com o nome; no celular,
 * só o ícone. Escondido, sai do foco e do leitor de tela (`visibility`).
 *
 * z-30: abaixo do menu do celular (z-40) e do cabeçalho (z-50), que cobrem o
 * botão quando abertos.
 */

import { useEffect, useState } from "react";
import { IconeWhatsapp } from "./comum";
import { WHATSAPP_EXIBICAO, linkWhatsapp } from "./contato";

export default function WhatsappFlutuante() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const topo = document.getElementById("topo")?.getBoundingClientRect();
      setVisivel(Boolean(topo && topo.bottom < 80));
    };
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar);
    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
    };
  }, []);

  return (
    <a
      href={linkWhatsapp("geral")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Falar com a ContaZoom no WhatsApp, ${WHATSAPP_EXIBICAO} (abre em nova aba)`}
      data-visivel={visivel ? "true" : "false"}
      className="czl-whats fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 inline-flex h-14 items-center gap-2.5 rounded-full border border-[#1FBE5B] bg-[#25D366] pl-4 pr-5 text-[15px] font-bold tracking-[-0.01em] text-[#14161B] max-sm:right-4 max-sm:w-14 max-sm:justify-center max-sm:p-0"
    >
      <IconeWhatsapp className="h-6 w-6 shrink-0 max-sm:h-7 max-sm:w-7" />
      <span className="max-sm:hidden">WhatsApp</span>
    </a>
  );
}
