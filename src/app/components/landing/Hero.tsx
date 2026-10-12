import { LayoutDashboard, Lock, LogIn, MousePointer2 } from "lucide-react";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";
import { BotaoContorno, BotaoMarca } from "./comum";
import LupaPainel from "./LupaPainel";

/**
 * Primeira dobra. A frase é a marca dita em voz alta: ContaZoom é dar zoom na
 * conta. Logo abaixo, o painel com a lupa por cima faz a mesma promessa sem
 * texto — passar a lupa sobre um número mostra o que existe por trás dele.
 */
export default function Hero({ logado }: { logado: boolean }) {
  return (
    <section id="topo" className="relative overflow-hidden pb-10 pt-[92px] sm:pb-14 sm:pt-[112px]">
      <div aria-hidden="true" className="czl-brilho pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="czl-papel pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-[1200px] px-5 text-center sm:px-8">
        <p className="inline-flex items-center gap-2.5 rounded-full border border-[#EDEFF3] bg-white/80 py-1.5 pl-2 pr-3.5 text-[13px] font-semibold text-[#14161B] shadow-[0_1px_2px_rgba(16,24,40,0.04)] backdrop-blur">
          <span className="flex items-center -space-x-1" aria-hidden="true">
            <span className="grid size-6 place-items-center rounded-full border border-[#EDEFF3] bg-white">
              <LogoMercadoLivre className="h-3.5 w-auto" />
            </span>
            <span className="grid size-6 place-items-center rounded-full border border-[#EDEFF3] bg-white">
              <LogoShopee className="h-3.5 w-auto" />
            </span>
            <span className="grid size-6 place-items-center rounded-full border border-[#EDEFF3] bg-white">
              <LogoTikTok className="h-3.5 w-auto" />
            </span>
          </span>
          <span>
            Mercado Livre, Shopee e TikTok Shop<span className="max-sm:hidden"> num painel só</span>
          </span>
        </p>

        <h1 className="mx-auto mt-5 max-w-[15ch] text-balance text-[2.55rem] font-extrabold leading-[1.03] tracking-[-0.038em] text-[#14161B] [word-spacing:0.08em] sm:mt-6 sm:text-[4rem] lg:text-[4.5rem]">
          Dê zoom no{" "}
          <span className="relative inline-block text-[#F26212]">
            lucro
            <svg
              aria-hidden="true"
              className="czl-risco absolute -bottom-[0.12em] left-[-2%] h-[0.3em] w-[104%]"
              viewBox="0 0 200 20"
              preserveAspectRatio="none"
              fill="none"
            >
              <path d="M4 15 C 48 5, 118 2, 196 9" stroke="#F26212" strokeOpacity="0.55" strokeWidth="6" strokeLinecap="round" pathLength={1} />
            </svg>
          </span>{" "}
          de cada venda.
        </h1>

        <p className="mx-auto mt-4 max-w-[35rem] text-pretty text-[16px] leading-[1.6] text-[#6B7280] sm:mt-5 sm:text-[18px]">
          O ContaZoom junta as vendas do Mercado Livre, da Shopee e do TikTok Shop e mostra quanto
          sobra de cada pedido, já descontados comissão, frete, imposto e custo do produto.
        </p>

        <div className="mx-auto mt-7 grid max-w-[24rem] grid-cols-2 gap-2.5 sm:flex sm:max-w-none sm:justify-center sm:gap-3">
          {logado ? (
            <BotaoMarca href="/dashboard" Icone={LayoutDashboard} className="col-span-2 sm:col-span-1">
              Ir para o painel
            </BotaoMarca>
          ) : (
            <>
              <BotaoMarca href="/register">
                <span className="sm:hidden">Criar conta</span>
                <span className="max-sm:hidden">Criar minha conta</span>
              </BotaoMarca>
              <BotaoContorno href="/login" Icone={LogIn}>
                <span className="sm:hidden">Entrar</span>
                <span className="max-sm:hidden">Já sou cliente, entrar</span>
              </BotaoContorno>
            </>
          )}
        </div>

        <p className="mx-auto mt-4 flex max-w-[36rem] items-center justify-center gap-2 text-[12.5px] text-[#6B7280] sm:text-[13px]">
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#9AA1AC]" aria-hidden="true" />
          Você autoriza a conexão no próprio marketplace. Sua senha de lá não passa por aqui.
        </p>
      </div>

      <div className="relative mx-auto mt-8 max-w-[1180px] px-3 sm:mt-10 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[8%] -top-6 bottom-8 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(242,98,18,0.22),transparent_70%)] blur-2xl"
        />
        <LupaPainel />
        <p className="relative mt-3 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-[#9AA1AC]">
          <MousePointer2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="max-md:hidden">Passe o mouse sobre o painel: a lupa mostra o que existe por trás de cada número.</span>
          <span className="md:hidden">Toque no painel para levar a lupa até um número.</span>
        </p>
      </div>
    </section>
  );
}
