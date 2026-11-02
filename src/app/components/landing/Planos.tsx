import { Check, HelpCircle, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";

/**
 * 07 · Planos e Proposta Comercial Transparente
 *
 * Escopo claro e condições transparentes para Simples Nacional e Lucro Presumido,
 * com ênfase no diagnóstico inicial 100% gratuito e no sistema próprio incluso.
 */

const ITENS_DIAGNOSTICO = [
  "Análise da classificação fiscal (NCMs) do seu catálogo",
  "Identificação de possíveis pagamentos indevidos em remessas e devoluções",
  "Simulação do regime tributário mais vantajoso (Simples vs. Presumido)",
  "Demonstração ao vivo do sistema próprio incluso",
  "100% gratuito e sem nenhum compromisso",
];

const ITENS_SIMPLES = [
  "Apuração mensal no PGDAS-D com conferência rigorosa",
  "Faturamento apurado diretamente pelos XMLs das notas fiscais",
  "Segregação técnica de remessas ao Full e devoluções",
  "Entrega da guia DAS com antecedência no painel e por e-mail",
  "Sistema próprio de gestão 100% incluso (ML, Shopee, TikTok Shop)",
  "Gestão de custos por SKU, taxas, fretes e margem líquida",
  "Declaração de faturamento de 12 meses assinada para bancos",
  "Atendimento humanizado direto via WhatsApp com especialistas",
];

const ITENS_PRESUMIDO = [
  "Tudo o que está incluso no Simples Nacional",
  "Apuração de PIS/COFINS, IRPJ/CSLL, ICMS e ISS",
  "Geração e conferência das guias DARF, ICMS e ISS",
  "Escrituração contábil completa e conciliação",
  "Envio de obrigações acessórias (SPED Fiscal, EFD, DCTF)",
  "Fechamento contábil e balancetes periódicos",
  "Sistema próprio de gestão 100% incluso sem licença adicional",
  "Consultoria e planejamento tributário contínuo para o mix de produtos",
];

export default function Planos() {
  return (
    <section id="planos" className="scroll-mt-16 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="max-w-[46rem]">
          <Rotulo numero="07" texto="Proposta comercial" />
          <Titulo>Condições claras, escopo completo e sem surpresas no contrato.</Titulo>
          <Texto>
            Não cobramos taxa de adesão nem mensalidade extra pelo sistema próprio. Nossos honorários são
            definidos pelo seu volume de notas e regime tributário, com transparência desde o primeiro dia.
          </Texto>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {/* Card 1: Diagnóstico Inicial Gratuito */}
          <div
            data-revelar=""
            style={atraso(60)}
            className="flex flex-col rounded-[24px] border border-[#EDEFF3] bg-[#F8F9FB] p-6 sm:p-7 shadow-[0_1px_3px_rgba(16,24,40,0.03)]"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#14161B] ring-1 ring-[#EDEFF3]">
                Ponto de partida
              </span>
              <span className="text-[12px] font-semibold text-[#067647]">100% Gratuito</span>
            </div>

            <h3 className="mt-4 text-[20px] font-extrabold tracking-[-0.03em] text-[#14161B]">
              Diagnóstico Tributário
            </h3>
            <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6B7280]">
              Para quem quer conhecer a Contazoom e auditar seu catálogo antes de fechar qualquer contrato.
            </p>

            <div className="my-5 border-t border-[#EDEFF3] pt-4">
              <p className="czl-num text-[28px] font-extrabold tracking-[-0.03em] text-[#14161B]">
                R$ 0
              </p>
              <p className="text-[12px] text-[#6B7280]">Sem custo e sem compromisso</p>
            </div>

            <ul className="space-y-2.5 text-[13.5px] text-[#4B5565]">
              {ITENS_DIAGNOSTICO.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <BotaoWhatsapp mensagem="tributacao" className="w-full">
                Quero analisar minha tributação
              </BotaoWhatsapp>
            </div>
          </div>

          {/* Card 2: Simples Nacional (Destaque) */}
          <div
            data-revelar=""
            style={atraso(120)}
            className="relative flex flex-col rounded-[26px] border-2 border-[#F26212] bg-white p-6 sm:p-7 shadow-[0_12px_32px_-12px_rgba(242,98,18,0.25)]"
          >
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F26212] px-3.5 py-1 text-[11.5px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                <Sparkles className="h-3 w-3" />
                Mais procurado por sellers
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="rounded-full bg-[#FFF2E9] px-3 py-1 text-[12px] font-bold text-[#D9500A]">
                E-commerce
              </span>
              <span className="text-[12px] font-semibold text-[#6B7280]">Sob medida</span>
            </div>

            <h3 className="mt-4 text-[20px] font-extrabold tracking-[-0.03em] text-[#14161B]">
              Simples Nacional
            </h3>
            <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6B7280]">
              Contabilidade completa com inteligência tributária e sistema de gestão incluso.
            </p>

            <div className="my-5 border-t border-[#EDEFF3] pt-4">
              <p className="text-[14px] font-bold text-[#14161B]">Proposta personalizada</p>
              <p className="text-[12px] text-[#6B7280]">De acordo com sua faixa de faturamento e volume</p>
            </div>

            <ul className="space-y-2.5 text-[13.5px] text-[#4B5565]">
              {ITENS_SIMPLES.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#FFF2E9] text-[#F26212]">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span className={item.includes("100% incluso") ? "font-bold text-[#14161B]" : ""}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <BotaoWhatsapp mensagem="planos" className="w-full">
                Quero proposta para o Simples
              </BotaoWhatsapp>
            </div>
          </div>

          {/* Card 3: Lucro Presumido */}
          <div
            data-revelar=""
            style={atraso(180)}
            className="flex flex-col rounded-[24px] border border-[#EDEFF3] bg-[#F8F9FB] p-6 sm:p-7 shadow-[0_1px_3px_rgba(16,24,40,0.03)]"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#14161B] ring-1 ring-[#EDEFF3]">
                Alto volume / Atacado
              </span>
              <span className="text-[12px] font-semibold text-[#6B7280]">Escrituração completa</span>
            </div>

            <h3 className="mt-4 text-[20px] font-extrabold tracking-[-0.03em] text-[#14161B]">
              Lucro Presumido
            </h3>
            <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6B7280]">
              Para operações que demandam conciliação profunda, SPED e relatórios gerenciais avançados.
            </p>

            <div className="my-5 border-t border-[#EDEFF3] pt-4">
              <p className="text-[14px] font-bold text-[#14161B]">Proposta corporativa</p>
              <p className="text-[12px] text-[#6B7280]">Conforme a complexidade fiscal e filiais</p>
            </div>

            <ul className="space-y-2.5 text-[13.5px] text-[#4B5565]">
              {ITENS_PRESUMIDO.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span className={item.includes("100% incluso") ? "font-bold text-[#14161B]" : ""}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <BotaoWhatsapp mensagem="planos" className="w-full">
                Quero proposta para o Presumido
              </BotaoWhatsapp>
            </div>
          </div>
        </div>

        {/* Faixa de garantia e transparência */}
        <div data-revelar="" className="mt-12 rounded-[20px] border border-[#EDEFF3] bg-[#F8F9FB] p-5 sm:p-6">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[15px] font-bold text-[#14161B]">
                  Contratação transparente e sem pegadinhas
                </p>
                <p className="text-[13px] text-[#6B7280]">
                  Sem taxa de adesão, sem multas contratuais abusivas e migração assistida de ponta a ponta.
                </p>
              </div>
            </div>
            <p className="czl-num text-[13px] font-semibold text-[#14161B]">
              Fale pelo WhatsApp: {WHATSAPP_EXIBICAO}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
