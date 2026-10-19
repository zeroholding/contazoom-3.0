"use client";

/**
 * Cabeçalho da landing pública.
 *
 * Transparente no topo, branco translúcido depois de rolar. Marca no menu a
 * seção que está na tela e desenha uma linha laranja fina com o progresso da
 * leitura — a mesma régua que a pessoa usa para saber quanto falta.
 *
 * O menu do celular é IRMÃO do <header>, não filho: o `backdrop-filter` do
 * cabeçalho rolado cria um bloco de contenção para elementos `fixed`, e o painel
 * do menu ficaria preso dentro dos 64px do cabeçalho.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, LayoutDashboard, LogIn, Menu, X } from "lucide-react";
import { travarRolagem } from "@/lib/trava-rolagem";
import { BotaoContorno, BotaoMarca, BotaoWhatsapp } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";
import { LINKS_SECOES } from "./dados";

export default function Cabecalho({ logado }: { logado: boolean }) {
  const [rolou, setRolou] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [ativa, setAtiva] = useState<string | null>(null);
  const barra = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const y = window.scrollY;
      setRolou(y > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (barra.current) barra.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;

      // A seção ativa é a que cruza a linha logo abaixo do cabeçalho.
      const linha = 96;
      let atual: string | null = null;
      for (const { id } of LINKS_SECOES) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r && r.top <= linha && r.bottom > linha) atual = id;
      }
      setAtiva(atual);
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

  useEffect(() => (aberto ? travarRolagem() : undefined), [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const aoRedimensionar = () => {
      if (window.innerWidth >= 1024) setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, [aberto]);

  const fechar = () => setAberto(false);

  return (
    <>
      <header
        className="czl-topo fixed inset-x-0 top-0 z-50"
        data-rolou={rolou ? "true" : "false"}
        data-menu={aberto ? "true" : "false"}
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="ContaZoom, voltar ao início" className="shrink-0" onClick={fechar}>
            <Image src="/contazoom-logo.svg" alt="ContaZoom" width={646} height={230} unoptimized priority className="h-8 w-auto sm:h-9" />
          </Link>

          <nav aria-label="Seções da página" className="hidden flex-1 justify-center lg:flex">
            <ul className="flex items-center gap-1">
              {LINKS_SECOES.map(({ href, id, rotulo, Icone }) => {
                const atual = ativa === id;
                return (
                  <li key={href}>
                    <a
                      href={href}
                      aria-current={atual ? "true" : undefined}
                      className={`group flex items-center gap-1.5 rounded-full px-3 py-2 text-[14px] font-semibold transition-colors ${
                        atual ? "bg-[#FFF2E9] text-[#C2410C]" : "text-[#6B7280] hover:bg-[#F4F5F7] hover:text-[#14161B]"
                      }`}
                    >
                      {/* Ícone só a partir de 1280 px: com ele, os cinco rótulos e os
                          dois botões não cabem na largura de 1024. */}
                      <Icone
                        className={`hidden h-[15px] w-[15px] transition-colors xl:block ${atual ? "text-[#F26212]" : "text-[#9AA1AC] group-hover:text-[#F26212]"}`}
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                      {rotulo}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {logado ? (
              <BotaoMarca href="/dashboard" tamanho="sm" Icone={LayoutDashboard} className="max-sm:hidden">
                Ir para o painel
              </BotaoMarca>
            ) : (
              <BotaoContorno href="/login" Icone={LogIn} tamanho="sm" className="max-sm:hidden">
                Entrar
              </BotaoContorno>
            )}
            {/* A ação principal da página: contabilidade se contrata conversando.
                Abaixo de 380 px fica só o ícone (o nome continua para o leitor de tela). */}
            <BotaoWhatsapp mensagem="contabilidade" tamanho="sm">
              <span className="max-[380px]:sr-only">WhatsApp</span>
            </BotaoWhatsapp>
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              aria-expanded={aberto}
              aria-controls="czl-menu"
              aria-label={aberto ? "Fechar menu" : "Abrir menu"}
              className="grid size-10 place-items-center rounded-[11px] border border-[#EDEFF3] bg-white text-[#14161B] transition-colors hover:bg-[#F4F5F7] lg:hidden"
            >
              {aberto ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        <span
          ref={barra}
          aria-hidden="true"
          className="absolute inset-x-0 bottom-[-1px] h-[2px] origin-left bg-[linear-gradient(90deg,#F26212,#FF9A5C)]"
          style={{ transform: "scaleX(0)" }}
        />
      </header>

      {aberto && (
        <div
          id="czl-menu"
          className="czl-menu-celular fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto overscroll-contain bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 lg:hidden"
        >
          <nav aria-label="Seções da página">
            <ul className="space-y-1">
              {LINKS_SECOES.map(({ href, id, rotulo, descricao, Icone }) => (
                <li key={href}>
                  <a
                    href={href}
                    onClick={fechar}
                    aria-current={ativa === id ? "true" : undefined}
                    className="flex items-center gap-3.5 rounded-[14px] px-2 py-2.5 transition-colors hover:bg-[#F8F9FB] aria-[current=true]:bg-[#FFF2E9]"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#F26212]">
                      <Icone className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-bold tracking-[-0.02em] text-[#14161B]">{rotulo}</span>
                      <span className="block truncate text-[13px] text-[#6B7280]">{descricao}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9AA1AC]" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-auto grid gap-2.5 pt-6">
            <BotaoWhatsapp mensagem="contabilidade" onClick={fechar}>
              Falar no WhatsApp
            </BotaoWhatsapp>
            {logado ? (
              <BotaoMarca href="/dashboard" Icone={LayoutDashboard} onClick={fechar}>
                Ir para o painel
              </BotaoMarca>
            ) : (
              <BotaoContorno href="/login" Icone={LogIn} onClick={fechar}>
                Já sou cliente, entrar
              </BotaoContorno>
            )}
            <p className="czl-num mt-1 text-center text-[12.5px] text-[#6B7280]">
              Atendimento pelo WhatsApp: <span className="font-semibold text-[#14161B]">{WHATSAPP_EXIBICAO}</span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
