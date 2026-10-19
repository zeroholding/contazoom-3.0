import { Check, LayoutDashboard, Lock, LogIn, MousePointer2 } from "lucide-react";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";
import { BotaoContorno, BotaoMarca, Rotulo, Texto, Titulo, atraso } from "./comum";
import LupaPainel from "./LupaPainel";

/**
 * 04 · Sistema — o adicional para quem vende em marketplace.
 *
 * Fica DEPOIS dos serviços de contabilidade de propósito: o ContaZoom é o
 * escritório, e o painel de vendas é o que vem junto para quem vende no Mercado
 * Livre, na Shopee e no TikTok Shop. Os itens repetem os módulos do menu
 * lateral do painel; a lupa é a mesma réplica do Dashboard que abria a página.
 */

const MODULOS = [
  "Vendas dos três canais numa tabela só, sincronizadas em um clique",
  "Margem de cada pedido: comissão, frete, imposto e custo do produto",
  "Dashboard, Financeiro e DRE mês a mês",
  "Expedição com fila de separação e etiquetas do Mercado Livre em lote",
  "Custo por SKU com histórico e kits",
  "Estoque no Full e anúncios que pararam de vender",
];

export default function Sistema({ logado }: { logado: boolean }) {
  return (
    <section id="sistema" className="scroll-mt-16 py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div data-revelar="">
            <Rotulo numero="04" texto="Sistema" />
            <Titulo>Além da contabilidade, as suas vendas num painel só.</Titulo>
            <Texto>
              Um adicional para quem vende no Mercado Livre, na Shopee e no TikTok Shop: conecte as contas e
              veja quanto sobra de cada pedido, já descontados comissão, frete, imposto e custo do produto.
            </Texto>
            <div className="mt-6 flex items-center gap-2" role="img" aria-label="Canais integrados: Mercado Livre, Shopee e TikTok Shop">
              {[LogoMercadoLivre, LogoShopee, LogoTikTok].map((Logo, i) => (
                <span key={i} aria-hidden="true" className="grid size-10 place-items-center rounded-[12px] border border-[#EDEFF3] bg-white">
                  <Logo className="max-h-5 w-auto max-w-[26px]" />
                </span>
              ))}
            </div>
          </div>

          <div data-revelar="" style={atraso(100)}>
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
              {MODULOS.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] leading-[1.5] text-[#14161B]">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#FFF2E9] text-[#D9500A]">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-7 grid gap-2.5 sm:flex sm:flex-wrap">
              {logado ? (
                <BotaoMarca href="/dashboard" Icone={LayoutDashboard}>
                  Ir para o painel
                </BotaoMarca>
              ) : (
                <>
                  <BotaoMarca href="/register">Criar conta no sistema</BotaoMarca>
                  <BotaoContorno href="/login" Icone={LogIn}>
                    Entrar
                  </BotaoContorno>
                </>
              )}
            </div>
            <p className="mt-4 flex items-center gap-2 text-[12.5px] text-[#6B7280] sm:text-[13px]">
              <Lock className="h-3.5 w-3.5 shrink-0 text-[#9AA1AC]" aria-hidden="true" />
              Você autoriza a conexão no próprio marketplace. Sua senha de lá não passa por aqui.
            </p>
          </div>
        </div>

        <div className="relative mx-auto mt-12 max-w-[1180px] sm:mt-14">
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
        </div>
      </div>
    </section>
  );
}
