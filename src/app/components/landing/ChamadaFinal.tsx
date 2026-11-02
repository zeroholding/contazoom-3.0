import Link from "next/link";
import { BotaoWhatsapp } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";
import { linkDoApp } from "./links";

/**
 * Chamada final
 *
 * Fechamento sobre impostos em ordem, margem visível e controle do lucro real.
 * CTA principal com próximo passo claro.
 */
export default function ChamadaFinal({ logado }: { logado: boolean }) {
  return (
    <section className="px-3 py-4 sm:px-5 sm:py-6">
      <div className="cz-auth-marca cz-auth-malha czl-sobre-laranja relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] px-6 py-20 text-center sm:rounded-[36px] sm:py-28">
        {/* Lupa estilizada no fundo */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-[22rem] rounded-full border-[14px] border-white/15 sm:-right-16 sm:-top-20 sm:size-[26rem]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-4 -top-4 size-[14rem] rounded-full border-[3px] border-dashed border-white/20 sm:right-[3rem] sm:top-[2rem] sm:size-[16rem]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 size-[20rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.18),transparent_65%)]"
        />

        <div data-revelar="" className="relative mx-auto max-w-[46rem]">
          <h2 className="text-balance text-[2.25rem] font-extrabold leading-[1.06] tracking-[-0.04em] text-white sm:text-[3.4rem]">
            Contabilidade que entende o seu e-commerce — e mostra quanto ele realmente ganha.
          </h2>
          <p className="mx-auto mt-5 max-w-[36rem] text-pretty text-[16px] leading-[1.7] text-white/90 sm:text-[18.5px]">
            Impostos em ordem dentro da lei, margem visível por pedido e o resultado do seu negócio sob controle.
            Faça uma análise inicial gratuita com quem respira marketplaces todos os dias.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BotaoWhatsapp mensagem="tributacao" claro className="w-full px-7 sm:w-auto">
              Quero uma contabilidade que entende meu e-commerce
            </BotaoWhatsapp>
            <Link
              href={linkDoApp(logado ? "/dashboard" : "/login")}
              className="inline-flex h-12 w-full items-center justify-center rounded-[12px] border border-white/40 px-7 text-[15px] font-semibold text-white transition-colors hover:border-white hover:bg-white/10 sm:w-auto"
            >
              {logado ? "Ir para o painel" : "Já sou cliente, entrar"}
            </Link>
          </div>

          <p className="mt-5 text-[13px] text-white/80">
            Atendimento direto pelo WhatsApp: <span className="czl-num font-bold text-white">{WHATSAPP_EXIBICAO}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
