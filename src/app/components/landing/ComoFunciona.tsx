import { ArrowRight, CalendarClock, Check, FileCheck, History, Landmark, ShieldCheck, UserCheck } from "lucide-react";
import { BotaoWhatsapp, IconeWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";

/**
 * 06 · Como funciona — Como trocar de contador com facilidade
 *
 * Explicação objetiva e tranquilizadora: a migração não para a operação de vendas
 * e a Contazoom cuida da transição com o contador anterior.
 */

const PASSOS_MIGRACAO = [
  {
    passo: 1,
    titulo: "Diagnóstico inicial sem custos",
    texto:
      "Conversamos pelo WhatsApp para entender o regime tributário da sua empresa, os canais onde vende (Mercado Livre, Shopee, TikTok) e analisamos seu catálogo para identificar oportunidades.",
  },
  {
    passo: 2,
    titulo: "Nós alinhamos com o contador anterior",
    texto:
      "Você não precisa se desgastar. Cuidamos do pedido de transferência de responsabilidade técnica, recolhemos o histórico fiscal, arquivos contábeis e procurações na Receita e Estado.",
  },
  {
    passo: 3,
    titulo: "Conexão e onboarding no sistema",
    texto:
      "Você conecta suas contas de marketplaces no nosso sistema próprio em menos de 5 minutos via API oficial. Parametrizamos seus custos e dados da empresa.",
  },
  {
    passo: 4,
    titulo: "Rotina fiscal e contábil rodando",
    texto:
      "A partir do primeiro mês de competência, nosso time assume 100% da sua apuração fiscal, entrega das guias DAS/DARF e acompanhamento da sua margem.",
  },
];

const GARANTIAS = [
  {
    Icone: ShieldCheck,
    titulo: "Zero interrupção nas vendas",
    texto: "Suas lojas continuam faturando e emitindo NFe normalmente durante toda a migração.",
  },
  {
    Icone: CalendarClock,
    titulo: "Prazos fiscais protegidos",
    texto: "Acompanhamos de perto os vencimentos de obrigações para evitar qualquer pendência.",
  },
  {
    Icone: UserCheck,
    titulo: "Transição assistida",
    texto: "Um analista dedicado acompanha sua empresa em cada etapa do processo de troca.",
  },
  {
    Icone: null,
    titulo: "Atendimento direto no WhatsApp",
    texto: `Fale diretamente com os contadores da Contazoom pelo ${WHATSAPP_EXIBICAO}.`,
  },
];

export default function ComoFunciona() {
  return (
    <section id="como-funciona" className="scroll-mt-16 border-y border-[#EDEFF3] bg-[#F8F9FB] py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
          <div data-revelar="" className="max-w-[46rem]">
            <Rotulo numero="06" texto="Troca de contador" />
            <Titulo>Trazer sua empresa para a Contazoom é simples. A gente cuida da migração.</Titulo>
            <Texto>
              Trocar de contabilidade não precisa ser uma dor de cabeça nem parar sua operação. Nós cuidamos
              de toda a parte burocrática junto ao antigo contador enquanto você continua vendendo.
            </Texto>
          </div>
          <div data-revelar="" style={atraso(100)}>
            <BotaoWhatsapp mensagem="migracao" className="w-full sm:w-auto">
              Quero trazer minha empresa para a Contazoom
            </BotaoWhatsapp>
          </div>
        </div>

        {/* 4 Passos da migração */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS_MIGRACAO.map((item, i) => (
            <div
              key={item.passo}
              data-revelar=""
              style={atraso(i * 90)}
              className="relative flex flex-col rounded-[22px] border border-[#EDEFF3] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.03)]"
            >
              <div className="flex items-center justify-between">
                <span className="czl-num grid size-10 place-items-center rounded-full border-2 border-[#F26212] bg-[#FFF8F3] text-[16px] font-extrabold text-[#F26212]">
                  {item.passo}
                </span>
                {i < PASSOS_MIGRACAO.length - 1 && (
                  <ArrowRight className="hidden h-4 w-4 text-[#DCE0E7] lg:block" />
                )}
              </div>
              <h3 className="mt-5 text-[17px] font-extrabold tracking-[-0.025em] text-[#14161B]">
                {item.titulo}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.6] text-[#6B7280]">
                {item.texto}
              </p>
            </div>
          ))}
        </div>

        {/* Garantias */}
        <div className="mt-6 grid gap-px overflow-hidden rounded-[22px] border border-[#EDEFF3] bg-[#EDEFF3] sm:grid-cols-2 lg:grid-cols-4">
          {GARANTIAS.map(({ Icone, titulo, texto }, i) => (
            <div key={titulo} data-revelar="" style={atraso(i * 70)} className="bg-white p-5 sm:p-6">
              {Icone ? (
                <Icone className="h-5 w-5 text-[#F26212]" aria-hidden="true" />
              ) : (
                <IconeWhatsapp className="h-5 w-5 text-[#128C7E]" />
              )}
              <h3 className="mt-3 text-[15px] font-bold tracking-[-0.02em] text-[#14161B]">{titulo}</h3>
              <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6B7280]">{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
