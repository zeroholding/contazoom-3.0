import {
  BadgeCheck,
  Building,
  CheckCircle2,
  FileCheck,
  Headphones,
  Quote,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users2,
} from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";
import { WHATSAPP_EXIBICAO } from "./contato";

/**
 * 03 · Provas da Especialização
 *
 * Casos reais com contexto e resultados comprováveis (sem promessas mirabolantes),
 * depoimentos de vendedores de marketplaces e apresentação da equipe técnica habilitada (CRC).
 */

const CASOS = [
  {
    titulo: "Moda e Acessórios no Mercado Livre e Shopee",
    local: "São Paulo · SP",
    cenario: "Faturamento de R$ 190 mil/mês. O antigo contador incluía notas de remessa ao Full e devoluções na base de tributação.",
    solucao: "Auditoria completa dos XMLs, segregação técnica das movimentações logísticas e classificação fiscal dos SKUs.",
    resultado: "Fim do pagamento indevido de tributos sobre devoluções e remessas, regularizando a guia DAS em total conformidade legal.",
  },
  {
    titulo: "Eletrônicos e Casa no Flex e Full",
    local: "Curitiba · PR",
    cenario: "Operação com mais de 1.400 pedidos/mês que faturava alto, mas não conseguia enxergar o lucro real após comissões e fretes.",
    solucao: "Conexão via API no sistema próprio da Contazoom, cadastro dos custos por SKU e parametrização de despesas fixas.",
    resultado: "Identificação imediata de 5 SKUs com margem negativa que consumiam o caixa, restabelecendo a rentabilidade da operação.",
  },
  {
    titulo: "Transição planejada de MEI para Simples Nacional",
    local: "Belo Horizonte · MG",
    cenario: "Seller que estourou o faturamento máximo do MEI e precisava migrar com urgência sem travar a emissão de notas no marketplace.",
    solucao: "Desenquadramento estratégico com abertura de ME e orientação passo a passo de configuração fiscal no integrador.",
    resultado: "Contas mantidas 100% ativas nos canais de venda, sem paralisação e com enquadramento tributário planejado.",
  },
];

const DEPOIMENTOS = [
  {
    autor: "Alexandre Ferreira",
    perfil: "Seller Mercado Livre Platinum & Shopee",
    cidade: "São Paulo, SP",
    depoimento:
      "A maior diferença foi o atendimento. Antes eu precisava explicar para o contador o que era remessa pro Full ou taxa de repasse. Na Contazoom eles já entendem o jargão do marketplace antes de eu perguntar.",
  },
  {
    autor: "Mariana Vasconcelos",
    perfil: "Operação Multicanal (ML e TikTok Shop)",
    cidade: "Franca, SP",
    depoimento:
      "O sistema próprio que vem incluso gratuito foi o maior ganho. Abro o painel e vejo minhas vendas unificadas e a margem de cada produto sem precisar pagar outro software de gestão por fora.",
  },
  {
    autor: "Ricardo Mendes",
    perfil: "Distribuidor de Utilidades e Casa",
    cidade: "Joinville, SC",
    depoimento:
      "A equipe fez uma revisão tributária no meu catálogo e encontrou produtos com tributação incorreta no antigo escritório. Foi uma economia legal e segura que fez toda a diferença no nosso fluxo de caixa.",
  },
];

const PILARES_CONFIANCA = [
  {
    Icone: ShieldCheck,
    titulo: "Escritório registrado no CRC",
    texto: "Contabilidade formal com responsáveis técnicos devidamente habilitados no Conselho Regional de Contabilidade.",
  },
  {
    Icone: Building,
    titulo: "Especialistas em e-commerce",
    texto: "Nossa equipe atende diariamente vendedores de Mercado Livre, Shopee, TikTok Shop, Shein e lojas virtuais.",
  },
  {
    Icone: Headphones,
    titulo: "Atendimento direto e humano",
    texto: "Canal no WhatsApp com contadores reais que conhecem sua conta, sem filas intermináveis ou tickets impessoais.",
  },
  {
    Icone: FileCheck,
    titulo: "Conformidade fiscal rigorosa",
    texto: "Auditoria constante em XMLs de notas fiscais para garantir que sua empresa esteja protegida contra autuações.",
  },
];

export default function Provas() {
  return (
    <section id="provas" className="scroll-mt-16 border-b border-[#EDEFF3] bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="max-w-[46rem]">
          <Rotulo numero="03" texto="Especialização comprovada" />
          <Titulo>Quem vive de marketplace precisa de contabilidade que comprova na prática.</Titulo>
          <Texto>
            Não usamos termos genéricos nem promessas milagrosas. Nossa especialização é demonstrada na
            rotina de operações reais que vendem todos os dias nos maiores marketplaces do país.
          </Texto>
        </div>

        {/* Casos reais */}
        <div className="mt-12">
          <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#D9500A]">
            <Sparkles className="h-4 w-4" />
            <span>Casos reais de clientes da Contazoom</span>
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {CASOS.map((caso, i) => (
              <div
                key={caso.titulo}
                data-revelar=""
                style={atraso(60 + i * 80)}
                className="flex flex-col rounded-[22px] border border-[#EDEFF3] bg-[#F8F9FB] p-6 text-left shadow-[0_1px_3px_rgba(16,24,40,0.03)]"
              >
                <div className="flex items-center justify-between text-[11.5px] font-semibold text-[#6B7280]">
                  <span className="rounded-md bg-white px-2.5 py-1 text-[#14161B] ring-1 ring-[#EDEFF3]">
                    Caso real
                  </span>
                  <span>{caso.local}</span>
                </div>

                <h3 className="mt-4 text-[16.5px] font-bold tracking-[-0.02em] text-[#14161B]">
                  {caso.titulo}
                </h3>

                <div className="mt-4 space-y-2.5 text-[13px] leading-[1.6]">
                  <div>
                    <span className="font-bold text-[#14161B]">Desafio: </span>
                    <span className="text-[#6B7280]">{caso.cenario}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#D9500A]">Atuação Contazoom: </span>
                    <span className="text-[#4B5565]">{caso.solucao}</span>
                  </div>
                  <div className="rounded-[12px] border border-[#EDEFF3] bg-white p-3 font-medium text-[#067647]">
                    <span className="font-bold">Resultado: </span>
                    {caso.resultado}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Depoimentos de sellers */}
        <div className="mt-16">
          <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#D9500A]">
            <Quote className="h-4 w-4" />
            <span>O que dizem os vendedores</span>
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {DEPOIMENTOS.map((dep, i) => (
              <div
                key={dep.autor}
                data-revelar=""
                style={atraso(80 + i * 80)}
                className="flex flex-col justify-between rounded-[22px] border border-[#EDEFF3] bg-white p-6 shadow-[0_2px_8px_-4px_rgba(16,24,40,0.06)]"
              >
                <p className="text-[14.5px] italic leading-[1.65] text-[#4B5565]">
                  &ldquo;{dep.depoimento}&rdquo;
                </p>

                <div className="mt-6 border-t border-[#EDEFF3] pt-4">
                  <p className="text-[14.5px] font-bold text-[#14161B]">{dep.autor}</p>
                  <p className="text-[12px] font-medium text-[#F26212]">{dep.perfil}</p>
                  <p className="text-[11.5px] text-[#9AA1AC]">{dep.cidade}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pilares de responsabilidade técnica & CRC */}
        <div data-revelar="" className="mt-16 rounded-[24px] border border-[#EDEFF3] bg-[#F8F9FB] p-6 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#6B7280]">
                Segurança e responsabilidade técnica
              </p>
              <h3 className="mt-1 text-[20px] font-extrabold tracking-[-0.025em] text-[#14161B]">
                Equipe contábil habilitada e especializada
              </h3>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#079455]/30 bg-[#ECFDF3] px-3.5 py-1.5 text-[12.5px] font-bold text-[#067647]">
              <BadgeCheck className="h-4 w-4" />
              <span>Escritório devidamente registrado no CRC</span>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILARES_CONFIANCA.map(({ Icone, titulo, texto }, i) => (
              <div key={titulo} className="rounded-[18px] border border-[#EDEFF3] bg-white p-5">
                <span className="grid size-10 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#F26212]">
                  <Icone className="h-5 w-5" />
                </span>
                <h4 className="mt-3.5 text-[15.5px] font-bold text-[#14161B]">{titulo}</h4>
                <p className="mt-1 text-[13px] leading-[1.6] text-[#6B7280]">{texto}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-[#EDEFF3] pt-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-[15px] font-bold text-[#14161B]">
                Fale agora com um especialista em contabilidade para e-commerce.
              </p>
              <p className="text-[13px] text-[#6B7280]">
                Atendimento direto pelo WhatsApp: {WHATSAPP_EXIBICAO}
              </p>
            </div>
            <BotaoWhatsapp mensagem="provas" className="w-full sm:w-auto">
              Quero conversar com a equipe
            </BotaoWhatsapp>
          </div>
        </div>
      </div>
    </section>
  );
}
