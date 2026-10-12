import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Rotulo, Texto, Titulo } from "./comum";
import { linkDoApp } from "./links";

/**
 * 06 · Dúvidas. <details> nativo: abre com teclado, funciona sem JavaScript e o
 * buscador lê a resposta mesmo fechada.
 */

export const PERGUNTAS = [
  {
    pergunta: "Quais marketplaces o ContaZoom integra?",
    resposta:
      "Mercado Livre, Shopee e TikTok Shop. Você pode conectar mais de uma conta em cada um, e o painel mostra os canais juntos ou separados.",
  },
  {
    pergunta: "Preciso passar a senha da minha conta do marketplace?",
    resposta:
      "Não. Você é levado ao site do Mercado Livre, da Shopee ou do TikTok Shop e autoriza o acesso por lá. Depois, dá para reconectar ou remover a conta quando quiser.",
  },
  {
    pergunta: "Como a margem de cada venda é calculada?",
    resposta:
      "Do valor da venda saem a comissão e as taxas do canal, o frete, o imposto (pela alíquota que você cadastra para cada conta, mês a mês) e o custo do produto na data da venda. Venda sem custo cadastrado fica sinalizada, e o SKU entra na lista de pendentes.",
  },
  {
    pergunta: "E se o custo de um produto mudar?",
    resposta:
      "O custo tem histórico: cada venda usa o custo que valia no dia dela. Se você cadastrar o custo só depois, dá para aplicá-lo às vendas passadas que ficaram sem CMV.",
  },
  {
    pergunta: "O frete Flex entra na conta?",
    resposta:
      "Entra. Em Configuração de Frete você informa o custo por pacote e quantas unidades vão em cada cobrança, e o ContaZoom calcula o frete líquido de cada venda Flex.",
  },
  {
    pergunta: "O financeiro do TikTok Shop aparece na hora?",
    resposta:
      "Aparece estimado logo depois da venda e é trocado pelo valor real quando o pedido é liquidado. O painel mostra qual dos dois cada venda está usando.",
  },
  {
    pergunta: "Dá para importar dados por planilha?",
    resposta:
      "Dá. Custos de SKU e lançamentos do financeiro em XLSX, XLS ou CSV, com até 10 MB e 5.000 linhas. Antes de gravar, você vê o valor atual ao lado do valor da planilha e aprova linha por linha. Mandar a mesma planilha de novo não duplica nada.",
  },
  {
    pergunta: "Vocês fazem a contabilidade da minha empresa?",
    resposta:
      "Fazemos, para empresas do Simples Nacional e do Lucro Presumido. A apuração segue um fluxo mensal com prazo e responsável, e as guias e os relatórios ficam no seu painel, em Documentos. Também cuidamos de abertura, alteração, regularização, desenquadramento e encerramento de CNPJ.",
  },
  {
    pergunta: "Funciona no celular?",
    resposta:
      "Funciona. O painel tem um layout próprio para telas pequenas, com menu inferior, e pode ser adicionado à tela inicial do celular.",
  },
];

export default function Duvidas({ logado }: { logado: boolean }) {
  return (
    <section id="duvidas" className="scroll-mt-16 border-t border-[#EDEFF3] bg-[#F8F9FB] py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div data-revelar="">
          <Rotulo numero="06" texto="Dúvidas" />
          <Titulo>Perguntas que todo seller faz.</Titulo>
          <Texto>Se a sua não estiver aqui, crie a conta e explore o painel com as suas próprias vendas.</Texto>
          <Link
            href={linkDoApp(logado ? "/dashboard" : "/register")}
            className="group mt-8 inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#14161B] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#2A2D35]"
          >
            {logado ? "Ir para o painel" : "Criar minha conta"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
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
