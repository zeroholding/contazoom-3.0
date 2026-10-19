import { BookCheck, Calculator, FileCheck2, FileCode2, FolderOpen } from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";
import FluxoApuracao from "./FluxoApuracao";

/**
 * 01 · Contabilidade — o serviço principal do ContaZoom: o escritório contábil
 * da casa, para o Simples Nacional e o Lucro Presumido.
 *
 * O cliente NÃO vê o módulo de tarefas (papel USER, ver src/lib/papeis.ts), então
 * a copy fala do que o ESCRITÓRIO faz e do que CHEGA ao cliente (guias e
 * documentos por e-mail e no painel), nunca de "você acompanha cada etapa".
 * Os serviços repetem as etapas reais de src/lib/tarefa-etapas.ts.
 */

const SERVICOS = [
  {
    Icone: Calculator,
    titulo: "Impostos apurados todo mês",
    texto:
      "No Simples Nacional, o faturamento entra no PGDAS-D e a guia do DAS sai conferida. No Lucro Presumido, PIS/COFINS, IRPJ/CSLL e ICMS ou ISS, com as guias DARF, ICMS e ISS.",
  },
  {
    Icone: FileCode2,
    titulo: "Faturamento apurado pelo XML",
    texto:
      "As notas fiscais entram aos milhares, num ZIP. A assinatura digital de cada XML é conferida, e só conta como faturamento o que é venda: remessa para o Full e devolução ficam fora da conta.",
  },
  {
    Icone: FolderOpen,
    titulo: "Guias e documentos no seu painel",
    texto:
      "Impostos, faturamento e documentos da empresa separados por ano e mês, no seu painel. A guia também chega por e-mail. Nada de caçar anexo.",
  },
  {
    Icone: FileCheck2,
    titulo: "Declaração de faturamento de 12 meses",
    texto:
      "O documento que o banco pede, com número de protocolo, pronto para imprimir ou salvar em PDF.",
  },
  {
    Icone: BookCheck,
    titulo: "Obrigações e balancete no Presumido",
    texto:
      "Lançamentos contábeis do período, envio das obrigações acessórias mensais, balancete e, se você quiser, relatórios gerenciais.",
  },
];

export default function Contabilidade() {
  return (
    <section id="contabilidade" className="relative scroll-mt-16 overflow-hidden bg-[#0E1014] py-24 text-white sm:py-32">
      <div aria-hidden="true" className="czl-papel-escuro pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-[radial-gradient(circle,rgba(242,98,18,0.28),transparent_65%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-56 -left-40 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(242,98,18,0.14),transparent_65%)]"
      />

      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="max-w-[48rem]">
          <Rotulo numero="01" texto="Contabilidade" escuro />
          <Titulo escuro>O mês da sua empresa fechado etapa por etapa, com prazo e responsável.</Titulo>
          <Texto escuro>
            Cada regime tem o seu fluxo: 10 etapas no Simples Nacional, 14 no Lucro Presumido. O escritório
            cuida de cada uma, e o que chega para você são as guias e os documentos do mês, no seu e-mail e
            no seu painel.
          </Texto>
        </div>

        <div className="mt-14 grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
          <div data-revelar="">
            <FluxoApuracao />
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {SERVICOS.map(({ Icone, titulo, texto }, i) => (
              <li
                key={titulo}
                data-revelar=""
                style={atraso(80 + i * 80)}
                className="flex flex-col gap-4 rounded-[20px] border border-white/10 bg-white/[0.04] p-5 sm:p-6 lg:flex-row lg:gap-5"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[#F26212]/15 text-[#FF9A5C]">
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[17px] font-bold tracking-[-0.025em] text-white">{titulo}</h3>
                  <p className="mt-1.5 text-[14.5px] leading-[1.65] text-white/65">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div data-revelar="" className="mt-12 flex flex-col items-start gap-4 rounded-[22px] border border-white/10 bg-white/[0.04] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-[18px] font-bold tracking-[-0.025em] text-white">Quer saber como fica o mês da sua empresa?</p>
            <p className="mt-1 text-[14.5px] text-white/65">Conte o regime e as atividades, e a gente explica a rotina.</p>
          </div>
          <BotaoWhatsapp mensagem="contabilidade" className="w-full shrink-0 sm:w-auto">
            Falar no WhatsApp
          </BotaoWhatsapp>
        </div>
      </div>
    </section>
  );
}
