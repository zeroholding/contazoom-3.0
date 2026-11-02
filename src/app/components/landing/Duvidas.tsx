import { Plus } from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";

/**
 * 09 · Dúvidas Frequentes
 *
 * Respostas diretas e transparentes sobre:
 * - Gratuidade e inclusão do sistema em todos os planos
 * - Análise tributária de produtos
 * - Não obrigatoriedade de trocar de ERP
 * - Gratuidade do diagnóstico inicial
 * - Troca de contador sem atrito
 * - Cálculo do lucro líquido
 * - Abertura de CNPJ
 */

export const PERGUNTAS = [
  {
    pergunta: "O sistema de gestão está incluso em todos os planos?",
    resposta:
      "Sim. Todos os clientes da contabilidade Contazoom têm acesso gratuito e ilimitado ao nosso sistema de gestão próprio, sem taxas de adesão, sem cobrança extra por módulos e sem limite artificial de pedidos ou usuários. A integração é direta pelas APIs oficiais do Mercado Livre, da Shopee e do TikTok Shop.",
  },
  {
    pergunta: "Como funciona a análise dos produtos?",
    resposta:
      "Avaliamos a classificação fiscal (NCM/CEST) do seu catálogo, as características da sua operação e o regime da empresa. Nosso foco é identificar produtos com benefícios fiscais (como alíquotas reduzidas ou tributação monofásica) e garantir que movimentações logísticas como remessas ao Full e devoluções fiquem fora da base de cálculo. O compromisso é com uma análise técnica e cuidadosa, dentro da lei.",
  },
  {
    pergunta: "A análise inicial é gratuita?",
    resposta:
      "Sim, 100% gratuita e sem compromisso. Analisamos sua tributação atual, o perfil do que você vende e como sua operação funciona antes de qualquer contratação, mostrando com clareza quais oportunidades existem no seu negócio.",
  },
  {
    pergunta: "Preciso trocar o ERP que já uso (Bling, Tiny, etc.) para contratar a Contazoom?",
    resposta:
      "Não. Você não precisa trocar nem abandonar o ERP que já utiliza para emitir notas ou controlar estoque. O sistema da Contazoom funciona integrado aos marketplaces via API para auditar seus pedidos, calcular a margem de contribuição real e alimentar a contabilidade fiscal com precisão.",
  },
  {
    pergunta: "Como funciona a troca de contador? Preciso me indispor com o atual?",
    resposta:
      "Não precisa se preocupar. A Contazoom cuida de todo o processo de transição com o contador anterior: solicitamos o termo de transferência, o histórico fiscal, arquivos contábeis e procurações. Suas vendas e emissão de notas fiscais continuam funcionando normalmente sem nenhuma interrupção.",
  },
  {
    pergunta: "Como vocês chegam no meu faturamento apurado?",
    resposta:
      "Pela leitura direta dos XMLs das suas notas fiscais autorizadas na SEFAZ e pelas APIs dos marketplaces. Conferimos a assinatura digital de cada documento e separamos estritamente o que é venda do que é simples remessa para o Full ou devolução de mercadoria, evitando bitributação.",
  },
  {
    pergunta: "Como o sistema calcula o lucro líquido real?",
    resposta:
      "O sistema parte do faturamento bruto e deduz automaticamente as comissões do marketplace, os fretes (inclusive custos e repasses do Flex/Full), os impostos da nota e o custo da mercadoria vendida (CMV) cadastrado por SKU. Com o registro das despesas operacionais da empresa, o painel consolida o lucro líquido real do mês.",
  },
  {
    pergunta: "Vocês atendem Simples Nacional e Lucro Presumido?",
    resposta:
      "Sim, atendemos ambos os regimes. Avaliamos continuamente qual é o melhor enquadramento para a sua empresa conforme o crescimento do seu faturamento e o mix de produtos.",
  },
  {
    pergunta: "Vocês fazem a abertura de CNPJ para quem vai começar?",
    resposta:
      "Sim! Realizamos a abertura completa do seu CNPJ com os CNAEs exatos para comércio eletrônico, registro na Junta Comercial, obtenção de Inscrição Estadual para emissão de NF-e e enquadramento tributário planejado.",
  },
  {
    pergunta: "Onde eu recebo as guias de impostos?",
    resposta:
      "Suas guias (DAS no Simples, DARF/ICMS no Presumido) chegam com antecedência por e-mail e ficam sempre arquivadas e disponíveis para download no seu painel da Contazoom, organizadas por ano e mês.",
  },
];

export default function Duvidas() {
  return (
    <section id="duvidas" className="scroll-mt-16 bg-[#F8F9FB] py-20 sm:py-28">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div data-revelar="">
          <Rotulo numero="09" texto="Dúvidas frequentes" />
          <Titulo>Perguntas antes de fechar com a gente.</Titulo>
          <Texto>
            Transparência desde o primeiro contato. Se você tiver qualquer outra pergunta, fale direto com
            nossa equipe no WhatsApp: <span className="czl-num font-semibold text-[#14161B]">{WHATSAPP_EXIBICAO}</span>.
          </Texto>
          <div className="mt-8">
            <BotaoWhatsapp mensagem="duvida" className="w-full sm:w-auto">
              Tirar dúvida no WhatsApp
            </BotaoWhatsapp>
          </div>
        </div>

        <ul data-revelar="" className="divide-y divide-[#EDEFF3] overflow-hidden rounded-[24px] border border-[#EDEFF3] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.03)]">
          {PERGUNTAS.map(({ pergunta, resposta }) => (
            <li key={pergunta}>
              <details className="czl-duvida group">
                <summary className="flex items-center justify-between gap-6 px-6 py-5 text-[16px] font-bold tracking-[-0.02em] text-[#14161B] transition-colors hover:bg-[#FCFCFD] sm:px-7">
                  {pergunta}
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#EDEFF3] bg-white text-[#F26212] group-open:border-[#FFD9BF] group-open:bg-[#FFF2E9]">
                    <Plus className="czl-mais h-4 w-4" aria-hidden="true" />
                  </span>
                </summary>
                <p className="-mt-1 px-6 pb-6 pr-16 text-[14.5px] leading-[1.7] text-[#6B7280] sm:px-7 sm:pr-20">
                  {resposta}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
