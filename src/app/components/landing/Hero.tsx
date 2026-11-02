import { ArrowDownRight, CheckCircle2, LayoutDashboard, ShieldCheck, Sparkles, Store, TrendingUp } from "lucide-react";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";
import { BotaoWhatsapp } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";

/**
 * Primeira dobra (Hero)
 *
 * Posicionamento direto: Contabilidade especializada em e-commerce,
 * inteligência tributária por produto e gestão do lucro líquido real.
 * Sistema próprio gratuito e incluso para todos os clientes.
 */
export default function Hero({ logado }: { logado: boolean }) {
  return (
    <section id="topo" className="relative overflow-hidden pb-14 pt-[92px] sm:pb-20 sm:pt-[116px]">
      <div aria-hidden="true" className="czl-brilho pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="czl-papel pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-[1200px] px-5 text-center sm:px-8">
        {/* Badge de posicionamento */}
        <p className="inline-flex items-center gap-2 rounded-full border border-[#EDEFF3] bg-white/80 py-1.5 pl-2 pr-3.5 text-[13px] font-semibold text-[#14161B] shadow-[0_1px_2px_rgba(16,24,40,0.04)] backdrop-blur">
          <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-[#FFF2E9] text-[#F26212]">
            <Store className="h-3.5 w-3.5" strokeWidth={2.4} />
          </span>
          <span>CONTABILIDADE ESPECIALIZADA EM E-COMMERCE</span>
        </p>

        {/* H1 com a dor e oportunidade tributária */}
        <h1 className="mx-auto mt-5 max-w-[19ch] text-balance text-[2.45rem] font-extrabold leading-[1.04] tracking-[-0.038em] text-[#14161B] [word-spacing:0.06em] sm:mt-6 sm:text-[3.9rem] lg:text-[4.4rem]">
          Seu e-commerce pode estar pagando{" "}
          <span className="relative inline-block text-[#F26212]">
            mais imposto
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
          do que precisa.
        </h1>

        {/* Subtítulo vendedor e focado no benefício */}
        <p className="mx-auto mt-5 max-w-[42rem] text-pretty text-[16px] leading-[1.65] text-[#4B5565] sm:text-[18.5px]">
          Na Contazoom, analisamos o que você vende e como sua operação funciona para identificar
          oportunidades de economia tributária dentro da lei. Uma contabilidade que entende marketplaces,
          acompanha seu negócio e ajuda você a tomar decisões com mais clareza.
        </p>

        {/* Benefício forte: sistema próprio gratuito e incluso */}
        <p className="mx-auto mt-4 max-w-[40rem] text-pretty text-[15px] leading-[1.6] text-[#14161B] sm:text-[16.5px]">
          E todos os clientes têm um benefício incluso:{" "}
          <span className="font-semibold text-[#F26212]">sistema de gestão próprio e gratuito</span>,
          conectado por APIs oficiais ao Mercado Livre, à Shopee e ao TikTok Shop.
        </p>

        {/* CTAs com próximos passos claros */}
        <div className="mx-auto mt-8 grid max-w-[28rem] gap-3 sm:flex sm:max-w-none sm:justify-center sm:gap-3.5">
          <BotaoWhatsapp mensagem="tributacao">Quero analisar minha tributação</BotaoWhatsapp>
          <a
            href="#sistema"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-[#DCE0E7] bg-white px-5 text-[15px] font-semibold tracking-[-0.01em] text-[#14161B] transition-colors hover:border-[#C9CED8] hover:bg-[#F8F9FB]"
          >
            <LayoutDashboard
              className="h-[17px] w-[17px] shrink-0 text-[#9AA1AC] transition-colors group-hover:text-[#F26212]"
              aria-hidden="true"
            />
            <span>Conhecer o sistema incluso</span>
          </a>
        </div>

        {/* Linha de confiança e aviso de gratuidade */}
        <div className="mx-auto mt-5 max-w-[42rem] space-y-1 text-center">
          <p className="text-[13.5px] font-medium text-[#14161B]">
            Contabilidade especializada <span aria-hidden="true" className="text-[#DCE0E7]">·</span> Planejamento tributário por produto <span aria-hidden="true" className="text-[#DCE0E7]">·</span> Gestão integrada
          </p>
          <p className="text-[12.5px] text-[#6B7280]">
            Análise inicial da sua operação e do catálogo 100% gratuita e sem compromisso.
            {logado ? " · Você já é cliente: seu painel continua no mesmo lugar." : ""}
          </p>
        </div>
      </div>

      {/* Visual da primeira dobra: O que o cliente ganha */}
      <div className="relative mx-auto mt-12 max-w-[1180px] px-5 sm:mt-14 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[8%] -top-6 bottom-8 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(242,98,18,0.18),transparent_70%)] blur-2xl"
        />

        <div className="relative grid gap-4 rounded-[26px] border border-[#EDEFF3] bg-white p-5 shadow-[0_24px_50px_-30px_rgba(16,24,40,0.35)] sm:p-7 md:grid-cols-3">
          {/* Pilar 1: Inteligência tributária */}
          <div className="flex flex-col rounded-[20px] border border-[#EDEFF3] bg-[#F8F9FB] p-5 text-left">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#F26212]">
                <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <span className="rounded-full bg-[#ECFDF3] px-2.5 py-0.5 text-[11px] font-bold text-[#067647]">
                Dentro da lei
              </span>
            </div>
            <h2 className="mt-4 text-[16.5px] font-bold tracking-[-0.02em] text-[#14161B]">
              Planejamento tributário por produto
            </h2>
            <p className="mt-1.5 flex-1 text-[13.5px] leading-[1.6] text-[#6B7280]">
              Análise SKU a SKU. Identificamos alíquotas especiais e separamos remessas para o Full e devoluções para você não pagar imposto em duplicidade.
            </p>
            <div className="mt-4 border-t border-[#EDEFF3] pt-3 text-[12px] font-semibold text-[#14161B]">
              Simples Nacional & Lucro Presumido
            </div>
          </div>

          {/* Pilar 2: Visão do Lucro Líquido Real */}
          <div className="flex flex-col rounded-[20px] border border-[#FFD9BF] bg-[#FFF8F3] p-5 text-left">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-[12px] bg-white text-[#F26212] ring-1 ring-[#FFD9BF]">
                <TrendingUp className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <span className="rounded-full bg-[#F26212] px-2.5 py-0.5 text-[11px] font-bold text-white">
                Controle do lucro
              </span>
            </div>
            <h2 className="mt-4 text-[16.5px] font-bold tracking-[-0.02em] text-[#14161B]">
              Gestão do lucro líquido real
            </h2>
            <p className="mt-1.5 flex-1 text-[13.5px] leading-[1.6] text-[#6B7280]">
              Saiba exatamente quanto sobra. Deduções automáticas de taxas de comissão, fretes Full e Flex, custo do produto (CMV) e despesas fixas.
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-[#FFD9BF] pt-3 text-[12px] font-semibold text-[#D9500A]">
              <span>Vendas → Custos → Lucro Real</span>
              <ArrowDownRight className="h-4 w-4" />
            </div>
          </div>

          {/* Pilar 3: Sistema próprio gratuito incluso */}
          <div className="flex flex-col rounded-[20px] border border-[#EDEFF3] bg-[#F8F9FB] p-5 text-left">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#F26212]">
                <Sparkles className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <span className="rounded-full bg-[#FFF2E9] px-2.5 py-0.5 text-[11px] font-bold text-[#F26212]">
                100% incluso
              </span>
            </div>
            <h2 className="mt-4 text-[16.5px] font-bold tracking-[-0.02em] text-[#14161B]">
              Sistema próprio integrado via API
            </h2>
            <p className="mt-1.5 flex-1 text-[13.5px] leading-[1.6] text-[#6B7280]">
              Conectado por APIs oficiais aos três maiores marketplaces do Brasil. Sem mensalidade de software adicional, sem limites de pedidos.
            </p>
            <div className="mt-4 flex items-center gap-2 border-t border-[#EDEFF3] pt-3">
              {[
                { Logo: LogoMercadoLivre, nome: "Mercado Livre" },
                { Logo: LogoShopee, nome: "Shopee" },
                { Logo: LogoTikTok, nome: "TikTok Shop" },
              ].map(({ Logo, nome }) => (
                <span
                  key={nome}
                  title={nome}
                  className="grid size-7 place-items-center rounded-lg border border-[#EDEFF3] bg-white p-1"
                >
                  <Logo className="max-h-3.5 w-auto max-w-[18px]" />
                </span>
              ))}
              <span className="text-[11.5px] font-semibold text-[#6B7280]">APIs oficiais</span>
            </div>
          </div>
        </div>

        {/* Atendimento direto */}
        <p className="mt-4 text-center text-[12.5px] text-[#9AA1AC]">
          Fale direto com a equipe de contadores especialistas pelo WhatsApp:{" "}
          <span className="czl-num font-semibold text-[#14161B]">{WHATSAPP_EXIBICAO}</span>
        </p>
      </div>
    </section>
  );
}
