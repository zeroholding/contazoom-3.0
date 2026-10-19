import { FilePen, FileX2, RefreshCw, Scale } from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";

/**
 * 02 · Abertura de CNPJ.
 *
 * As cinco fases resumem as 20 etapas REAIS do escritório (ABERTURA_CNPJ em
 * src/lib/tarefa-etapas.ts), na ordem: formulário (1), atividades e viabilidade
 * (2–4), DBE (5–6), registro digital na JUCESP com o contrato social assinado
 * pelo Autentique (7–16) e documentos oficiais (17–19). O formulário é o de
 * /formulario: sócios, empresa, sociedade, documentos e revisão, com protocolo.
 *
 * Os outros processos são os tipos de legalização do mesmo arquivo.
 */

const FASES = [
  {
    titulo: "Formulário online",
    texto: "Dados dos sócios e da empresa, três opções de nome e os documentos. O envio gera um protocolo.",
  },
  {
    titulo: "Atividades e viabilidade",
    texto: "O escritório confere as atividades do CNPJ e faz o processo de viabilidade.",
  },
  {
    titulo: "Receita Federal",
    texto: "Preenchimento e conferência do DBE de abertura do CNPJ.",
  },
  {
    titulo: "Junta Comercial",
    texto: "Registro digital na JUCESP, com o contrato social assinado de forma eletrônica.",
  },
  {
    titulo: "Documentos oficiais",
    texto: "Com o registro deferido, os documentos oficiais da empresa são emitidos e enviados para você.",
  },
];

const OUTROS = [
  {
    Icone: FilePen,
    titulo: "Alteração cadastral",
    texto: "Endereço, sócios, atividade, capital ou razão social.",
  },
  {
    Icone: RefreshCw,
    titulo: "Regularização de CNPJ",
    texto: "Diagnóstico das pendências, declarações em atraso, guias e parcelamentos, até a certidão negativa.",
  },
  {
    Icone: Scale,
    titulo: "Desenquadramento",
    texto: "Estudo do impacto tributário antes de trocar de regime.",
  },
  {
    Icone: FileX2,
    titulo: "Encerramento de CNPJ",
    texto: "Baixa da empresa, com o levantamento prévio das pendências.",
  },
];

export default function AberturaCnpj() {
  return (
    <section id="abertura" className="scroll-mt-16 py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
          <div data-revelar="" className="max-w-[46rem]">
            <Rotulo numero="02" texto="Abertura de CNPJ" />
            <Titulo>Vai abrir empresa? O seu CNPJ sai com a gente.</Titulo>
            <Texto>
              A abertura começa por um formulário online e termina com os documentos oficiais na sua mão. No
              caminho, o escritório cuida da viabilidade, da Receita Federal e da Junta Comercial.
            </Texto>
          </div>
          <div data-revelar="" style={atraso(100)}>
            <BotaoWhatsapp mensagem="abertura" className="w-full sm:w-auto">
              Quero abrir meu CNPJ
            </BotaoWhatsapp>
          </div>
        </div>

        <ol className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Fio que liga as fases no desktop. */}
          <span
            aria-hidden="true"
            className="absolute left-[10%] right-[10%] top-[42px] hidden border-t-2 border-dashed border-[#FFD9BF] lg:block"
          />
          {FASES.map((fase, i) => (
            <li
              key={fase.titulo}
              data-revelar=""
              style={atraso(i * 90)}
              className="relative rounded-[20px] border border-[#EDEFF3] bg-white p-5"
            >
              <span className="czl-num relative grid size-11 place-items-center rounded-full border-2 border-[#F26212] bg-white text-[16px] font-extrabold text-[#F26212]">
                {i + 1}
              </span>
              <h3 className="mt-4 text-[16.5px] font-extrabold tracking-[-0.03em] text-[#14161B]">{fase.titulo}</h3>
              <p className="mt-1.5 text-[14px] leading-[1.6] text-[#6B7280]">{fase.texto}</p>
            </li>
          ))}
        </ol>

        <div data-revelar="" className="mt-10">
          <p className="font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-[#9AA1AC]">
            E também
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {OUTROS.map(({ Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-3.5 rounded-[18px] border border-[#EDEFF3] bg-[#F8F9FB] p-4 sm:p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white text-[#F26212] ring-1 ring-[#EDEFF3]">
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15.5px] font-bold tracking-[-0.02em] text-[#14161B]">{titulo}</h3>
                  <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6B7280]">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
