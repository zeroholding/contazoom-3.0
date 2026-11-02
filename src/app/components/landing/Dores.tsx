import {
  AlertTriangle,
  FileSpreadsheet,
  HelpCircle,
  MessageSquareWarning,
  PackageSearch,
  Percent,
  Puzzle,
  TrendingUp,
} from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";

/**
 * 01 · A realidade de quem vende em marketplaces.
 *
 * Conexão imediata com as dores reais do seller:
 * - Lucro invisível
 * - Margem consumida por taxas, fretes e tributos
 * - Catálogo desatualizado fiscalmente
 * - Ter que ensinar o contador sobre marketplace
 * - Dados fragmentados em planilhas
 */

const DORES = [
  {
    Icone: TrendingUp,
    texto: "Você vende mais, mas não consegue enxergar quanto sobra no final do mês.",
  },
  {
    Icone: Percent,
    texto: "Comissões, fretes, anúncios e impostos consomem a sua margem sem você perceber.",
  },
  {
    Icone: PackageSearch,
    texto: "Seu catálogo cresce e você não sabe se a tributação acompanha essa mudança.",
  },
  {
    Icone: MessageSquareWarning,
    texto: "Você precisa explicar ao contador como funcionam suas vendas nos marketplaces.",
  },
  {
    Icone: Puzzle,
    texto: "As informações ficam divididas entre plataformas, ERPs e planilhas manuais.",
  },
  {
    Icone: FileSpreadsheet,
    texto: "Dúvida constante se está pagando imposto a mais sobre devoluções e remessas.",
  },
];

export default function Dores() {
  return (
    <section id="dores" className="scroll-mt-16 border-y border-[#EDEFF3] bg-[#F8F9FB] py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="max-w-[46rem]">
          <Rotulo numero="01" texto="A realidade do seller" />
          <Titulo>A gente entende e vive e-commerce.</Titulo>
          <Texto>
            Se alguma destas situações faz parte da sua rotina, o problema não é a sua dedicação: é a falta de
            uma contabilidade que conheça as particularidades de quem vende online.
          </Texto>
        </div>

        <ul className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {DORES.map(({ Icone, texto }, i) => (
            <li
              key={texto}
              data-revelar=""
              style={atraso(60 + i * 60)}
              className="flex items-start gap-3.5 rounded-[18px] border border-[#EDEFF3] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.03)] transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(16,24,40,0.08)]"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#D9500A]">
                <Icone className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="pt-1 text-[15px] leading-[1.6] text-[#14161B]">{texto}</p>
            </li>
          ))}
        </ul>

        {/* Resposta forte: contabilidade que fala a sua língua */}
        <div
          data-revelar=""
          className="mt-10 rounded-[22px] border border-[#FFD9BF] bg-[#FFF8F3] p-6 sm:p-8"
        >
          <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#D9500A]">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            A resposta da Contazoom
          </p>
          <h3 className="mt-3 text-balance text-[1.6rem] font-extrabold leading-[1.15] tracking-[-0.03em] text-[#14161B] sm:text-[2.1rem]">
            Sua operação precisa de uma contabilidade que fale a sua língua.
          </h3>
          <p className="mt-3.5 max-w-[54rem] text-pretty text-[15.5px] leading-[1.65] text-[#4B5565] sm:text-[17px]">
            Mercado Livre, Shopee, TikTok Shop, Full, Flex, devoluções, taxas e custos por SKU fazem
            parte da sua rotina. E precisam fazer parte da análise de quem cuida da sua contabilidade.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-[#FFD9BF] pt-5">
            <BotaoWhatsapp mensagem="tributacao" className="w-full sm:w-auto">
              Quero analisar minha tributação
            </BotaoWhatsapp>
            <p className="text-[13px] text-[#6B7280]">
              Diagnóstico inicial sem custos para vendedores de marketplaces.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
