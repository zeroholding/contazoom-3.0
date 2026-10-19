import { CalendarClock, History, Landmark } from "lucide-react";
import { IconeWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";

/**
 * 03 · Como funciona — do primeiro contato à rotina mensal do escritório.
 *
 * O começo é uma conversa (contabilidade não se contrata criando conta sozinho),
 * a entrada de documentos é a etapa 1 de todo fluxo de apuração, e quem vai
 * abrir empresa entra pelo formulário de abertura.
 */

const PASSOS = [
  {
    titulo: "Fale com a gente",
    texto: "Chame no WhatsApp e conte como é a sua empresa: o regime, as atividades e onde você vende.",
  },
  {
    titulo: "Envie os documentos",
    texto: "Quem já tem CNPJ envia os documentos da empresa. Quem vai abrir preenche o formulário online de abertura.",
  },
  {
    titulo: "Receba as guias todo mês",
    texto:
      "Você manda as notas e os documentos do mês, o escritório apura os impostos e a guia chega no seu e-mail e no seu painel.",
  },
];

const GARANTIAS = [
  {
    Icone: Landmark,
    titulo: "Um fluxo por regime",
    texto: "10 etapas no Simples Nacional e 14 no Lucro Presumido, sempre na mesma ordem.",
  },
  {
    Icone: CalendarClock,
    titulo: "Prazo e responsável",
    texto: "Cada competência tem prazo de entrega e alguém do escritório responsável por ela.",
  },
  {
    Icone: History,
    titulo: "Tudo registrado",
    texto: "Toda alteração na apuração fica registrada no escritório, com autor e horário.",
  },
  {
    Icone: null,
    titulo: "Atendimento no WhatsApp",
    texto: `Fale direto com a equipe da ContaZoom pelo ${WHATSAPP_EXIBICAO}.`,
  },
];

export default function ComoFunciona() {
  return (
    <section id="como-funciona" className="scroll-mt-16 border-y border-[#EDEFF3] bg-[#F8F9FB] py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="max-w-[44rem]">
          <Rotulo numero="03" texto="Como funciona" />
          <Titulo>Do primeiro contato à rotina do mês.</Titulo>
          <Texto>Você fala com a gente, envia os documentos e o escritório assume a rotina fiscal da sua empresa.</Texto>
        </div>

        <ol className="relative mt-14 grid gap-4 md:grid-cols-3 md:gap-5">
          {/* Fio que liga os três passos no desktop. */}
          <span
            aria-hidden="true"
            className="absolute left-[16%] right-[16%] top-[51px] hidden border-t-2 border-dashed border-[#FFD9BF] md:block"
          />
          {PASSOS.map((passo, i) => (
            <li
              key={passo.titulo}
              data-revelar=""
              style={atraso(i * 110)}
              className="relative rounded-[22px] border border-[#EDEFF3] bg-white p-6 sm:p-7"
            >
              <span className="czl-num relative grid size-12 place-items-center rounded-full border-2 border-[#F26212] bg-white text-[18px] font-extrabold text-[#F26212]">
                {i + 1}
              </span>
              <h3 className="mt-5 text-[19px] font-extrabold tracking-[-0.03em] text-[#14161B]">{passo.titulo}</h3>
              <p className="mt-2 text-[15px] leading-[1.65] text-[#6B7280]">{passo.texto}</p>
            </li>
          ))}
        </ol>

        <ul className="mt-6 grid gap-px overflow-hidden rounded-[22px] border border-[#EDEFF3] bg-[#EDEFF3] sm:grid-cols-2 lg:grid-cols-4">
          {GARANTIAS.map(({ Icone, titulo, texto }, i) => (
            <li key={titulo} data-revelar="" style={atraso(i * 70)} className="bg-white p-5 sm:p-6">
              {Icone ? (
                <Icone className="h-5 w-5 text-[#F26212]" aria-hidden="true" />
              ) : (
                <IconeWhatsapp className="h-5 w-5 text-[#128C7E]" />
              )}
              <h3 className="mt-3 text-[15px] font-bold tracking-[-0.02em] text-[#14161B]">{titulo}</h3>
              <p className="mt-1 text-[14px] leading-[1.6] text-[#6B7280]">{texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
