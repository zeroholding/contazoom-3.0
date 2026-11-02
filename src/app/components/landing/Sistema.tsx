import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  DollarSign,
  LayoutDashboard,
  Lock,
  LogIn,
  MousePointer2,
  Receipt,
  ShoppingCart,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";
import { BotaoContorno, BotaoMarca, BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";
import LupaPainel from "./LupaPainel";

/**
 * 04 · Sistema próprio gratuito e incluso
 *
 * Apresentado como diferencial de valor forte, sem custos adicionais.
 * Recursos organizados pelos benefícios do seller:
 * - Entenda suas vendas
 * - Saiba quanto sobra por pedido
 * - Controle os custos
 * - Registre as despesas
 * - Enxergue o resultado do negócio (lucro líquido)
 */

const BENEFICIOS = [
  {
    Icone: ShoppingCart,
    titulo: "Entenda suas vendas",
    texto: "Vendas e faturamento dos três marketplaces centralizados em uma visão única: Mercado Livre, Shopee e TikTok Shop.",
  },
  {
    Icone: Wallet,
    titulo: "Saiba quanto sobra por pedido",
    texto: "Comissões da plataforma, fretes (inclusive repasses Flex), impostos fiscais e custo dos produtos deduzidos pedido a pedido.",
  },
  {
    Icone: Receipt,
    titulo: "Controle os custos",
    texto: "Cadastro detalhado por SKU, kits e histórico de custos, garantindo que a margem use o custo vigente exato na data de cada venda.",
  },
  {
    Icone: BarChart3,
    titulo: "Registre as despesas",
    texto: "Gastos fixos e operacionais da sua empresa (equipe, ferramentas, aluguel, embalagens) para compor a saúde financeira global.",
  },
  {
    Icone: LayoutDashboard,
    titulo: "Enxergue o resultado do negócio",
    texto: "Visão mensal completa de receitas brutas, custos variáveis, despesas operacionais e lucro líquido real.",
  },
];

const ETAPAS_LUCRO = [
  { passo: "1. Vendas", desc: "Faturamento bruto nos 3 canais", cor: "border-blue-500/20 bg-blue-50/50 text-blue-900" },
  { passo: "2. Deduções", desc: "Comissões e fretes (Full/Flex)", cor: "border-amber-500/20 bg-amber-50/50 text-amber-900" },
  { passo: "3. Custos de Produto", desc: "CMV histórico por SKU", cor: "border-orange-500/20 bg-orange-50/50 text-orange-900" },
  { passo: "4. Despesas & Impostos", desc: "DAS/tributos e despesas fixas", cor: "border-purple-500/20 bg-purple-50/50 text-purple-900" },
  { passo: "5. Lucro Líquido Real", desc: "O que realmente sobra no bolso", cor: "border-emerald-500/30 bg-emerald-50 text-emerald-950 font-bold" },
];

export default function Sistema({ logado }: { logado: boolean }) {
  return (
    <section id="sistema" className="scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <div data-revelar="">
            <Rotulo numero="04" texto="Tecnologia inclusa" />
            <Titulo>Sua contabilidade já vem com um sistema próprio para gerir seu e-commerce.</Titulo>
            <Texto>
              Todos os clientes Contazoom têm acesso gratuito ao nosso sistema de gestão, com integração
              por APIs oficiais ao Mercado Livre, à Shopee e ao TikTok Shop. Centralize suas vendas,
              acompanhe os custos dos pedidos, registre as despesas da empresa e analise o resultado do
              negócio em um só lugar.
            </Texto>

            {/* Selo de gratuidade e logos oficiais */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#079455]/30 bg-[#ECFDF3] px-3.5 py-1.5 text-[13px] font-bold text-[#067647]">
                <Check className="h-4 w-4" strokeWidth={3} />
                Sistema 100% gratuito e incluso na contratação
              </span>
              <span className="text-[12.5px] text-[#6B7280]">
                Sem custos de licença ou mensalidade de software
              </span>
            </div>

            <div className="mt-5 flex items-center gap-2" role="img" aria-label="Canais integrados: Mercado Livre, Shopee e TikTok Shop">
              {[LogoMercadoLivre, LogoShopee, LogoTikTok].map((Logo, i) => (
                <span key={i} aria-hidden="true" className="grid size-11 place-items-center rounded-[12px] border border-[#EDEFF3] bg-white shadow-sm">
                  <Logo className="max-h-5 w-auto max-w-[28px]" />
                </span>
              ))}
              <span className="ml-2 text-[12.5px] font-semibold text-[#14161B]">
                Integração direta pelas APIs oficiais
              </span>
            </div>

            {/* Passagem do Lucro Líquido Real */}
            <div className="mt-8 rounded-[20px] border border-[#EDEFF3] bg-[#F8F9FB] p-5">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#D9500A]">
                Transparência total no resultado
              </p>
              <h4 className="mt-1 text-[16px] font-bold text-[#14161B]">
                A passagem do faturamento ao lucro líquido real
              </h4>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#6B7280]">
                Não mostramos apenas faturamento ou lucro bruto ilusório. O sistema conduz você etapa por etapa:
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {ETAPAS_LUCRO.map((e) => (
                  <div key={e.passo} className={`rounded-[12px] border p-2.5 text-[12.5px] ${e.cor}`}>
                    <span className="block font-bold">{e.passo}</span>
                    <span className="text-[11.5px] opacity-85">{e.desc}</span>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[12px] italic text-[#9AA1AC]">
                * O resultado depende dos custos de SKU e despesas devidamente cadastrados. Isso fortalece a credibilidade da ferramenta e a precisão da sua gestão.
              </p>
            </div>
          </div>

          {/* Lista de benefícios organizados por valor */}
          <div data-revelar="" style={atraso(100)}>
            <ul className="grid gap-3">
              {BENEFICIOS.map(({ Icone, titulo, texto }) => (
                <li key={titulo} className="flex gap-3.5 rounded-[18px] border border-[#EDEFF3] bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.03)]">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[11px] bg-[#FFF2E9] text-[#D9500A]">
                    <Icone className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-bold tracking-[-0.02em] text-[#14161B]">{titulo}</p>
                    <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6B7280]">{texto}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 grid gap-2.5 sm:flex sm:flex-wrap">
              <BotaoWhatsapp mensagem="sistema">Quero contabilidade com sistema incluso</BotaoWhatsapp>
              {logado ? (
                <BotaoMarca href="/dashboard" Icone={LayoutDashboard}>
                  Ir para o painel
                </BotaoMarca>
              ) : (
                <BotaoContorno href="/login" Icone={LogIn}>
                  Já sou cliente, entrar
                </BotaoContorno>
              )}
            </div>

            <p className="mt-4 flex items-center gap-2 text-[12.5px] text-[#6B7280]">
              <Lock className="h-3.5 w-3.5 shrink-0 text-[#9AA1AC]" aria-hidden="true" />
              Conexão via OAuth oficial do Mercado Livre, Shopee e TikTok Shop. Suas senhas nunca passam por nós.
            </p>
          </div>
        </div>

        {/* Lupa Interativa sobre o painel mockado */}
        <div className="relative mx-auto mt-14 max-w-[1180px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[8%] -top-6 bottom-8 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(242,98,18,0.16),transparent_70%)] blur-2xl"
          />
          <LupaPainel />
          <p className="relative mt-3 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-[#9AA1AC]">
            <MousePointer2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="max-md:hidden">Passe o mouse sobre o painel: a lupa mostra o que existe por trás de cada número.</span>
            <span className="md:hidden">Toque no painel para levar a lupa até um número.</span>
          </p>
          <p className="relative mt-1 text-center text-[12.5px] font-medium text-[#6B7280]">
            Demonstração com dados ilustrativos. Vendas → deduções e custos → despesas operacionais → resultado líquido.
          </p>
        </div>
      </div>
    </section>
  );
}
