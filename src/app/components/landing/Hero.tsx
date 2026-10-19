import { Landmark, LayoutDashboard, LogIn } from "lucide-react";
import { BotaoContorno, BotaoMarca, BotaoWhatsapp } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";
import FluxoDoMes from "./FluxoDoMes";

/**
 * Primeira dobra. A frase é a marca dita em voz alta (ContaZoom é dar zoom na
 * conta), agora sobre o que a empresa vende primeiro: a contabilidade. O
 * sistema de vendas dos marketplaces é adicional e tem a própria seção.
 *
 * A ação principal é a conversa no WhatsApp: contabilidade se contrata
 * conversando, não criando conta sozinho.
 */
export default function Hero({ logado }: { logado: boolean }) {
  return (
    <section id="topo" className="relative overflow-hidden pb-12 pt-[92px] sm:pb-16 sm:pt-[112px]">
      <div aria-hidden="true" className="czl-brilho pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="czl-papel pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-[1200px] px-5 text-center sm:px-8">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#EDEFF3] bg-white/80 py-1.5 pl-2 pr-3.5 text-[13px] font-semibold text-[#14161B] shadow-[0_1px_2px_rgba(16,24,40,0.04)] backdrop-blur">
          <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-[#FFF2E9] text-[#F26212]">
            <Landmark className="h-3.5 w-3.5" strokeWidth={2.4} />
          </span>
          <span>
            <span className="max-sm:hidden">Escritório contábil · </span>Simples Nacional e Lucro Presumido
          </span>
        </p>

        <h1 className="mx-auto mt-5 max-w-[16ch] text-balance text-[2.45rem] font-extrabold leading-[1.04] tracking-[-0.038em] text-[#14161B] [word-spacing:0.06em] sm:mt-6 sm:text-[3.9rem] lg:text-[4.4rem]">
          Dê zoom na{" "}
          <span className="relative inline-block text-[#F26212]">
            contabilidade
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
          da sua empresa.
        </h1>

        <p className="mx-auto mt-4 max-w-[38rem] text-pretty text-[16px] leading-[1.6] text-[#6B7280] sm:mt-5 sm:text-[18px]">
          O ContaZoom tem escritório contábil próprio, para empresas do Simples Nacional e do Lucro
          Presumido. Todo mês a gente apura os seus impostos a partir das notas fiscais, e a guia chega
          no seu painel e no seu e-mail.
        </p>

        <div className="mx-auto mt-7 grid max-w-[26rem] gap-2.5 sm:flex sm:max-w-none sm:justify-center sm:gap-3">
          <BotaoWhatsapp mensagem="contabilidade">Falar com a ContaZoom</BotaoWhatsapp>
          {logado ? (
            <BotaoMarca href="/dashboard" Icone={LayoutDashboard}>
              Ir para o painel
            </BotaoMarca>
          ) : (
            <BotaoContorno href="/login" Icone={LogIn}>
              Já sou cliente, entrar
            </BotaoContorno>
          )}
        </div>

        <p className="mx-auto mt-4 max-w-[36rem] text-[13px] text-[#6B7280]">
          Atendimento pelo WhatsApp: <span className="czl-num font-semibold text-[#14161B]">{WHATSAPP_EXIBICAO}</span>
        </p>
      </div>

      <div className="relative mx-auto mt-10 max-w-[1180px] px-5 sm:mt-12 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[8%] -top-6 bottom-8 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(242,98,18,0.18),transparent_70%)] blur-2xl"
        />
        <div className="relative">
          <FluxoDoMes />
        </div>
      </div>
    </section>
  );
}
