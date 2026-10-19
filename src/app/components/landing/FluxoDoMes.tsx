import { ArrowDown, ArrowRight, Check, FileCode2, FileText, FolderOpen, Landmark, Mail } from "lucide-react";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";
import { atraso } from "./comum";

/**
 * A primeira dobra mostra o SERVIÇO, não o sistema: um mês da empresa no
 * escritório. As notas fiscais entram, o escritório apura o imposto e a guia
 * chega no painel do cliente.
 *
 * O cliente NÃO vê a apuração por dentro (as etapas são do escritório; o papel
 * USER não acessa o módulo de tarefas). Por isso o cartão do meio é a
 * ilustração do trabalho do escritório, e só o da direita imita uma tela do
 * cliente: Documentos, com pasta por ano e mês ("2026/08_Agosto", o mesmo
 * formato do `subFolder`).
 *
 * As etapas do meio são as do Simples Nacional em src/lib/tarefa-etapas.ts.
 * Números de EXEMPLO, e a conta fecha: 1.211 vendas + 37 fora = 1.248 notas.
 */

function Cartao({
  passo,
  rotulo,
  Icone,
  indice,
  children,
}: {
  passo: number;
  rotulo: string;
  Icone: typeof FileCode2;
  indice: number;
  children: React.ReactNode;
}) {
  return (
    <li
      data-revelar=""
      style={atraso(120 + indice * 140)}
      className="relative flex flex-col rounded-[22px] border border-[#EDEFF3] bg-white p-5 text-left shadow-[0_24px_50px_-30px_rgba(16,24,40,0.35)] sm:p-6"
    >
      {indice > 0 && (
        <>
          <span
            aria-hidden="true"
            className="absolute -top-[30px] left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-[#FFD9BF] bg-white text-[#F26212] lg:hidden"
          >
            <ArrowDown className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span
            aria-hidden="true"
            className="absolute -left-[30px] top-1/2 z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-[#FFD9BF] bg-white text-[#F26212] lg:grid"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </span>
        </>
      )}
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#F26212]">
          <Icone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#9AA1AC]">Passo {passo}</p>
          <p className="text-[15px] font-bold tracking-[-0.02em] text-[#14161B]">{rotulo}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </li>
  );
}

const ETAPAS_DO_ESCRITORIO = [
  "Apuração do faturamento no PGDAS-D",
  "Cálculo e apuração do DAS",
  "Conferência da apuração",
  "Geração da guia DAS",
];

export default function FluxoDoMes() {
  return (
    <div>
      <ol className="grid gap-6 lg:grid-cols-3">
        <Cartao passo={1} rotulo="Suas notas do mês" Icone={FileCode2} indice={0}>
          <div className="rounded-[14px] border border-[#EDEFF3] bg-[#F8F9FB] p-3">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span className="truncate font-semibold text-[#14161B]">notas-agosto.zip</span>
              <span className="czl-num shrink-0 font-semibold text-[#6B7280]">1.248 XML</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#067647]">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
              Assinatura digital conferida
            </p>
          </div>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-[#14161B]">Vendas no faturamento</span>
              <span className="czl-num font-bold text-[#14161B]">1.211</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-[#6B7280]">Fora da conta: remessa para o Full e devolução</span>
              <span className="czl-num font-semibold text-[#6B7280]">37</span>
            </li>
          </ul>
          <div className="mt-auto border-t border-dashed border-[#EDEFF3] pt-3 max-lg:mt-4">
            <p className="text-[11.5px] text-[#9AA1AC]">Faturamento por canal, pela série da nota</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { Logo: LogoMercadoLivre, nome: "Mercado Livre" },
                { Logo: LogoShopee, nome: "Shopee" },
                { Logo: LogoTikTok, nome: "TikTok Shop" },
              ].map(({ Logo, nome }) => (
                <span
                  key={nome}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#EDEFF3] bg-white py-1 pl-1.5 pr-2.5 text-[11.5px] font-semibold text-[#14161B]"
                >
                  <span aria-hidden="true" className="grid size-5 place-items-center">
                    <Logo className="max-h-3.5 w-auto max-w-[16px]" />
                  </span>
                  {nome}
                </span>
              ))}
            </div>
          </div>
        </Cartao>

        <Cartao passo={2} rotulo="O escritório apura" Icone={Landmark} indice={1}>
          <p className="text-[12.5px] font-semibold text-[#6B7280]">Simples Nacional · agosto de 2026</p>
          <p className="mt-2 text-[11.5px] text-[#9AA1AC]">Faturamento apurado</p>
          <p className="czl-num text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-[#14161B]">R$ 231.874,60</p>
          <ol className="mt-3 space-y-1.5">
            {ETAPAS_DO_ESCRITORIO.map((etapa) => (
              <li key={etapa} className="flex items-center gap-2 text-[12.5px] text-[#14161B]">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
                {etapa}
              </li>
            ))}
          </ol>
          <p className="mt-auto rounded-[10px] bg-[#F8F9FB] px-3 py-2 text-[11.5px] font-semibold text-[#6B7280] max-lg:mt-4">
            Cada etapa tem prazo e responsável no escritório
          </p>
        </Cartao>

        <Cartao passo={3} rotulo="A guia chega para você" Icone={FolderOpen} indice={2}>
          <p className="flex flex-wrap items-center gap-1 text-[12px] text-[#9AA1AC]">
            Documentos <span aria-hidden="true">/</span> 2026 <span aria-hidden="true">/</span>
            <span className="font-semibold text-[#14161B]">08_Agosto</span>
          </p>
          <ul className="mt-3 space-y-2">
            <li className="flex items-center gap-2.5 rounded-[12px] border border-[#FFD9BF] bg-[#FFF8F3] p-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-white text-[#F26212] ring-1 ring-[#FFD9BF]">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-[#14161B]">Guia DAS · 08/2026</span>
                <span className="block text-[11.5px] text-[#6B7280]">Impostos · PDF</span>
              </span>
              <span className="shrink-0 rounded-full bg-[#C2410C] px-2 py-0.5 text-[10.5px] font-bold text-white">Nova</span>
            </li>
            <li className="flex items-center gap-2.5 rounded-[12px] border border-[#EDEFF3] bg-white p-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[#F8F9FB] text-[#6B7280] ring-1 ring-[#EDEFF3]">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-[#14161B]">Faturamento · agosto</span>
                <span className="block text-[11.5px] text-[#6B7280]">Faturamento · PDF</span>
              </span>
            </li>
          </ul>
          <p className="mt-auto flex items-center gap-1.5 pt-3 text-[12px] font-semibold text-[#6B7280] max-lg:mt-1">
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            A guia também vai para o seu e-mail
          </p>
        </Cartao>
      </ol>
      <p className="mt-4 text-center text-[12.5px] text-[#9AA1AC]">
        Exemplo de um mês no Simples Nacional, com números ilustrativos.
      </p>
    </div>
  );
}
