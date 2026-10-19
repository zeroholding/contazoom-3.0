import { Plus } from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";

/**
 * 05 · Dúvidas. <details> nativo: abre com teclado, funciona sem JavaScript e o
 * buscador lê a resposta mesmo fechada.
 *
 * Primeiro a contabilidade, que é o serviço; no fim, o sistema. As respostas
 * repetem o que o escritório faz de verdade (etapas em src/lib/tarefa-etapas.ts,
 * apuração pelo XML em docs/APURACAO_FISCAL_XML_COMO_FUNCIONA.md).
 */

export const PERGUNTAS = [
  {
    pergunta: "Vocês fazem a contabilidade da minha empresa?",
    resposta:
      "Fazemos, para empresas do Simples Nacional e do Lucro Presumido. O ContaZoom tem escritório contábil próprio: todo mês a apuração segue um fluxo com prazo e responsável, e as guias chegam no seu e-mail e no seu painel, em Documentos.",
  },
  {
    pergunta: "O que entra na apuração do mês?",
    resposta:
      "No Simples Nacional, o faturamento é apurado no PGDAS-D e a guia do DAS é gerada e conferida. No Lucro Presumido entram também a classificação e os lançamentos contábeis, PIS/COFINS, IRPJ/CSLL, ICMS ou ISS, as obrigações acessórias mensais e o balancete do período.",
  },
  {
    pergunta: "Como vocês chegam no meu faturamento?",
    resposta:
      "Pelos XMLs das suas notas fiscais. A assinatura digital de cada nota é conferida, e só conta como faturamento o que é venda: remessa para o Full, devolução e nota cancelada ficam fora da conta. Notas de serviço (NFS-e) entram à parte.",
  },
  {
    pergunta: "Onde eu recebo as guias?",
    resposta:
      "No seu e-mail e no seu painel, em Documentos, separadas por ano e mês, junto com os impostos e os documentos da empresa.",
  },
  {
    pergunta: "Vocês abrem o meu CNPJ?",
    resposta:
      "Abrimos. Você preenche um formulário online com os dados dos sócios e da empresa, e o envio gera um protocolo. Daí em diante o escritório cuida da viabilidade, do DBE na Receita Federal e do registro na Junta Comercial até os documentos oficiais. Também fazemos alteração cadastral, regularização, desenquadramento e encerramento de CNPJ.",
  },
  {
    pergunta: "O banco pediu uma declaração de faturamento. Vocês emitem?",
    resposta:
      "Emitimos a declaração dos últimos 12 meses, com número de protocolo, pronta para imprimir ou salvar em PDF.",
  },
  {
    pergunta: "Preciso usar o sistema de vendas?",
    resposta:
      "Não. A contabilidade é o serviço. O sistema é um adicional para quem vende no Mercado Livre, na Shopee ou no TikTok Shop e quer ver a margem de cada venda, com comissão, frete, imposto e custo do produto já descontados.",
  },
  {
    pergunta: "Preciso passar a senha da minha conta do marketplace?",
    resposta:
      "Não. No sistema, você é levado ao site do Mercado Livre, da Shopee ou do TikTok Shop e autoriza o acesso por lá. Depois, dá para reconectar ou remover a conta quando quiser.",
  },
  {
    pergunta: "O painel funciona no celular?",
    resposta:
      "Funciona. O painel tem um layout próprio para telas pequenas, com menu inferior, e pode ser adicionado à tela inicial do celular.",
  },
];

export default function Duvidas() {
  return (
    <section id="duvidas" className="scroll-mt-16 border-t border-[#EDEFF3] bg-[#F8F9FB] py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div data-revelar="">
          <Rotulo numero="05" texto="Dúvidas" />
          <Titulo>Perguntas antes de fechar com a gente.</Titulo>
          <Texto>
            Se a sua não estiver aqui, chame no WhatsApp: <span className="czl-num font-semibold text-[#14161B]">{WHATSAPP_EXIBICAO}</span>.
          </Texto>
          <BotaoWhatsapp mensagem="duvida" className="mt-8 w-full sm:w-auto">
            Tirar dúvida no WhatsApp
          </BotaoWhatsapp>
        </div>

        <ul data-revelar="" className="divide-y divide-[#EDEFF3] overflow-hidden rounded-[22px] border border-[#EDEFF3] bg-white">
          {PERGUNTAS.map(({ pergunta, resposta }) => (
            <li key={pergunta}>
              <details className="czl-duvida group">
                <summary className="flex items-center justify-between gap-6 px-5 py-5 text-[16px] font-bold tracking-[-0.02em] text-[#14161B] transition-colors hover:bg-[#FCFCFD] sm:px-7">
                  {pergunta}
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#EDEFF3] bg-white text-[#F26212] group-open:border-[#FFD9BF] group-open:bg-[#FFF2E9]">
                    <Plus className="czl-mais h-4 w-4" aria-hidden="true" />
                  </span>
                </summary>
                <p className="-mt-1 px-5 pb-6 pr-16 text-[15px] leading-[1.7] text-[#6B7280] sm:px-7 sm:pr-20">{resposta}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
