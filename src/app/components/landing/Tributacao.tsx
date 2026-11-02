import { Check, HelpCircle, Layers, Percent, ReceiptText, ShieldAlert, Sparkles, Target } from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";

/**
 * 02 · Planejamento tributário por produto.
 *
 * Análise produto por produto para identificar oportunidades legais de economia,
 * sem promessas irresponsáveis de redução garantida.
 */

const PILARES = [
  {
    Icone: ReceiptText,
    titulo: "Classificação fiscal por SKU",
    texto:
      "Avaliamos o NCM, CEST e as características de cada item do catálogo para identificar regimes especiais, alíquotas reduzidas ou tributação monofásica.",
  },
  {
    Icone: Layers,
    titulo: "Segregação de remessas e devoluções",
    texto:
      "Remessa para o Full (Mercado Livre/Shopee) e devoluções de compradores não são vendas. Garantimos que fiquem fora da base de cálculo do imposto.",
  },
  {
    Icone: Target,
    titulo: "Regime tributário sob medida",
    texto:
      "Simulamos constantemente o Simples Nacional vs. Lucro Presumido para o perfil exato do seu mix de produtos, evitando pagar mais do que a lei exige.",
  },
];

const EXEMPLOS_PRATICOS = [
  {
    titulo: "Produtos com tributação monofásica ou ST",
    cenarioComum: "Contadores genéricos aplicam alíquota cheia sobre todas as vendas indistintamente.",
    comContaZoom: "Segregamos as receitas de produtos com tributação concentrada na origem, reduzindo o imposto legalmente.",
  },
  {
    titulo: "Remessas para o Fulfillment",
    cenarioComum: "Notas de remessa para centros de distribuição (Full) correm risco de entrar no faturamento se o escritório não filtrar.",
    comContaZoom: "Nosso fluxo lê as notas fiscais pelo XML e separa estritamente o que é venda do que é movimentação logística.",
  },
  {
    titulo: "Cancelamentos e devoluções de pedidos",
    cenarioComum: "O marketplace estorna o cliente, mas o imposto sobre a nota emitida muitas vezes continua sendo pago.",
    comContaZoom: "Conferência mensal dos estornos para abater da apuração fiscal do período sem bitributação.",
  },
];

export default function Tributacao() {
  return (
    <section id="tributacao" className="relative scroll-mt-16 overflow-hidden bg-[#0E1014] py-24 text-white sm:py-32">
      <div aria-hidden="true" className="czl-papel-escuro pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 size-[38rem] rounded-full bg-[radial-gradient(circle,rgba(242,98,18,0.26),transparent_65%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 right-[-10%] size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(242,98,18,0.15),transparent_65%)]"
      />

      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="max-w-[48rem]">
          <Rotulo numero="02" texto="Planejamento tributário" escuro />
          <Titulo escuro>
            O produto que você vende faz diferença no imposto que sua empresa paga.
          </Titulo>
          <Texto escuro>
            Seu catálogo merece uma análise tributária cuidadosa. Avaliamos a classificação fiscal dos
            produtos, as características da operação e o regime da empresa para identificar possíveis
            pagamentos indevidos e oportunidades legais de economia.
          </Texto>
          <p className="mt-3 text-pretty text-[16px] leading-[1.65] text-[#FF9A5C] sm:text-[17.5px]">
            O objetivo é claro: uma tributação adequada à sua operação e mais margem para o seu negócio crescer.
          </p>
        </div>

        {/* Pilares da análise */}
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {PILARES.map(({ Icone, titulo, texto }, i) => (
            <li
              key={titulo}
              data-revelar=""
              style={atraso(80 + i * 90)}
              className="flex flex-col rounded-[22px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <span className="grid size-11 place-items-center rounded-[12px] bg-[#F26212]/15 text-[#FF9A5C]">
                <Icone className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[17px] font-bold tracking-[-0.025em] text-white">{titulo}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-white/65">{texto}</p>
            </li>
          ))}
        </ul>

        {/* Comparativo prático de mercado */}
        <div data-revelar="" className="mt-12 rounded-[24px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#FF9A5C]">
            <Sparkles className="h-4 w-4" />
            <span>Na prática: onde moram as oportunidades no e-commerce</span>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {EXEMPLOS_PRATICOS.map((exemplo, i) => (
              <div
                key={exemplo.titulo}
                data-revelar=""
                style={atraso(100 + i * 80)}
                className="flex flex-col rounded-[18px] border border-white/10 bg-black/30 p-5"
              >
                <h4 className="text-[15.5px] font-bold text-white">{exemplo.titulo}</h4>

                <div className="mt-4 space-y-3 text-[13px] leading-[1.6]">
                  <div className="rounded-[12px] border border-red-500/20 bg-red-950/20 p-3">
                    <p className="flex items-center gap-1.5 font-bold text-red-300">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                      Como muitos escritórios fazem:
                    </p>
                    <p className="mt-1 text-white/60">{exemplo.cenarioComum}</p>
                  </div>

                  <div className="rounded-[12px] border border-emerald-500/30 bg-emerald-950/30 p-3">
                    <p className="flex items-center gap-1.5 font-bold text-emerald-400">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      Como a Contazoom analisa:
                    </p>
                    <p className="mt-1 text-white/80">{exemplo.comContaZoom}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bloco de ação da seção */}
        <div
          data-revelar=""
          className="mt-12 flex flex-col items-start gap-4 rounded-[22px] border border-[#F26212]/40 bg-[linear-gradient(135deg,rgba(242,98,18,0.12),rgba(255,255,255,0.03))] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <div>
            <p className="text-[18.5px] font-bold tracking-[-0.025em] text-white">
              Quer saber como fica a tributação do seu catálogo?
            </p>
            <p className="mt-1 text-[14.5px] text-white/70">
              Conte o que você vende e como sua operação funciona. Fazemos uma análise inicial gratuita e indicamos as oportunidades legais.
            </p>
          </div>
          <BotaoWhatsapp mensagem="produtos" className="w-full shrink-0 sm:w-auto">
            Quero revisar a tributação dos meus produtos
          </BotaoWhatsapp>
        </div>
      </div>
    </section>
  );
}
