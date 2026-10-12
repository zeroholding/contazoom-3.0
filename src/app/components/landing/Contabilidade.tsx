import { Building2, FileCheck2, FileCode2, FolderOpen } from "lucide-react";
import { Rotulo, Texto, Titulo, atraso } from "./comum";
import FluxoApuracao from "./FluxoApuracao";

/**
 * 04 · Contabilidade — a parte do produto que nenhum outro painel de
 * marketplace tem: o escritório contábil da casa.
 *
 * O cliente NÃO vê o módulo de tarefas (papel USER, ver src/lib/papeis.ts), então
 * a copy fala do que o ESCRITÓRIO faz e do que CHEGA ao cliente (guias e
 * documentos no painel), nunca de "você acompanha cada etapa".
 */

const SERVICOS = [
  {
    Icone: FileCode2,
    titulo: "Faturamento apurado pelo XML",
    texto:
      "As notas fiscais entram aos milhares, num ZIP. A assinatura digital de cada XML é conferida, e só conta como faturamento o que é venda: remessa para o Full fica fora da conta.",
  },
  {
    Icone: FileCheck2,
    titulo: "Declaração de faturamento de 12 meses",
    texto:
      "O documento que o banco pede, com número de protocolo, pronto para imprimir ou salvar em PDF.",
  },
  {
    Icone: FolderOpen,
    titulo: "Documentos por competência",
    texto:
      "Guias, impostos e relatórios no seu painel, separados por ano e mês. Nada de caçar anexo no e-mail.",
  },
  {
    Icone: Building2,
    titulo: "Abertura e regularização de CNPJ",
    texto:
      "Abertura, alteração cadastral, regularização, desenquadramento e encerramento, cada um com o seu passo a passo. A abertura começa por um formulário online, com protocolo.",
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
        <div data-revelar="" className="max-w-[46rem]">
          <Rotulo numero="04" texto="Contabilidade" escuro />
          <Titulo escuro>E a contabilidade do seu CNPJ mora no mesmo lugar.</Titulo>
          <Texto escuro>
            O ContaZoom tem escritório contábil próprio, para empresas do Simples Nacional e do Lucro
            Presumido. Todo mês segue o mesmo fluxo, etapa por etapa, com prazo e responsável. E as
            guias chegam no seu painel, na pasta do mês.
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
                className="flex flex-col gap-4 rounded-[20px] border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-[#F26212]/40 hover:bg-white/[0.06] sm:p-6 lg:flex-row lg:gap-5"
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
      </div>
    </section>
  );
}
