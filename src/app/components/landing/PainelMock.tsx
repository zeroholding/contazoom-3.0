import Image from "next/image";
import {
  Boxes,
  FolderOpen,
  LayoutDashboard,
  Megaphone,
  RefreshCw,
  Search,
  ShoppingBag,
  Tag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";
import { type Canal, VENDAS_EXEMPLO, comSinal, margemDe, percentual } from "./dados";

/**
 * Réplica do Dashboard para a primeira dobra da landing.
 *
 * Os rótulos são os do painel de verdade (menu lateral, cartões de indicador,
 * colunas da Central de Vendas). Os números são de EXEMPLO e fecham entre si,
 * e são as mesmas vendas do explorador de margem mais abaixo.
 *
 * O componente é desenhado DUAS vezes pela `LupaPainel` (base e cópia ampliada),
 * então não pode ter `id` nem estado. A linha miúda de cada venda (7px) é
 * proposital: a olho nu ela é textura, e só a lupa a torna legível.
 */

const LOGO: Record<Canal, (p: { className?: string }) => React.ReactElement> = {
  ML: LogoMercadoLivre,
  SP: LogoShopee,
  TT: LogoTikTok,
};

const MENU = [
  { rotulo: "Dashboard", Icone: LayoutDashboard, ativo: true },
  { rotulo: "Central de Vendas", Icone: ShoppingBag },
  { rotulo: "Expedição", Icone: Truck },
  { rotulo: "Gestão de Anúncios", Icone: Megaphone },
  { rotulo: "Estoque Full", Icone: Boxes },
  { rotulo: "Gestão de SKU", Icone: Tag },
  { rotulo: "Documentos", Icone: FolderOpen },
  { rotulo: "Contas de plataforma", Icone: Users },
  { rotulo: "Financeiro", Icone: Wallet },
];

const COLUNAS =
  "grid grid-cols-[22px_minmax(0,1fr)_58px_66px] items-center gap-x-2.5 sm:grid-cols-[22px_minmax(0,1fr)_62px_58px_54px_62px_70px]";

function Kpi({
  rotulo,
  valor,
  nota,
  notaCor = "text-[#6B7280]",
  destaque = false,
  foco,
  className = "",
  children,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  notaCor?: string;
  destaque?: boolean;
  foco?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-foco={foco}
      className={`rounded-[12px] border p-3 ${
        destaque ? "border-[#FFD9BF] bg-[#FFF2E9]" : "border-[#EDEFF3] bg-white"
      } ${className}`}
    >
      <p className="truncate text-[10.5px] font-medium text-[#6B7280]">{rotulo}</p>
      <p className="czl-num mt-1 text-[15px] font-extrabold tracking-[-0.03em] text-[#14161B] sm:text-[17px]">
        {valor}
      </p>
      <p className={`czl-num mt-0.5 truncate text-[10px] font-semibold ${notaCor}`}>{nota}</p>
      {children}
    </div>
  );
}

function BarraLateral() {
  return (
    <aside className="hidden w-[196px] shrink-0 flex-col border-r border-[#EDEFF3] px-3 py-4 lg:flex">
      <div className="px-2">
        <Image src="/contazoom-logo.svg" alt="" width={646} height={230} unoptimized className="h-7 w-auto" />
      </div>
      <ul className="mt-5 space-y-0.5">
        {MENU.map(({ rotulo, Icone, ativo }) => (
          <li
            key={rotulo}
            className={`relative flex items-center gap-2 rounded-[8px] px-2 py-[7px] text-[11.5px] ${
              ativo ? "bg-[#FFF2E9] font-semibold text-[#D9500A]" : "font-medium text-[#6B7280]"
            }`}
          >
            {ativo && <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#F26212]" />}
            <Icone className="h-[14px] w-[14px] shrink-0" strokeWidth={2} />
            <span className="truncate">{rotulo}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto rounded-[12px] border border-[#EDEFF3] bg-[#F8F9FB] p-2.5">
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3 text-[#F26212]" strokeWidth={2.5} />
          <span className="text-[10.5px] font-bold text-[#14161B]">Sincronizar vendas</span>
        </div>
        <p className="mt-0.5 text-[9px] text-[#6B7280]">Um clique para todos os canais</p>
        <div className="mt-2 flex items-center gap-1.5">
          {(["ML", "SP", "TT"] as Canal[]).map((canal) => {
            const Logo = LOGO[canal];
            return (
              <span key={canal} className="grid size-5 place-items-center rounded-md border border-[#EDEFF3] bg-white">
                <Logo className="max-h-3 w-auto max-w-[14px]" />
              </span>
            );
          })}
          <span className="ml-auto text-[9px] font-bold text-[#079455]">em dia</span>
        </div>
      </div>
    </aside>
  );
}

function UltimasVendas() {
  return (
    <div className="rounded-[12px] border border-[#EDEFF3] bg-white">
      <div className="flex items-center justify-between border-b border-[#EDEFF3] px-3 py-2.5">
        <p className="text-[12px] font-bold tracking-[-0.02em] text-[#14161B]">Últimas vendas</p>
        <p className="text-[9.5px] font-semibold text-[#9AA1AC]">Central de Vendas</p>
      </div>
      <div className={`${COLUNAS} border-b border-[#EDEFF3] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#9AA1AC]`}>
        <span />
        <span>Produto</span>
        <span className="text-right">Valor</span>
        <span className="text-right max-sm:hidden">Taxa</span>
        <span className="text-right max-sm:hidden">Frete</span>
        <span className="text-right max-sm:hidden">CMV</span>
        <span className="text-right">Margem</span>
      </div>
      <ul>
        {VENDAS_EXEMPLO.map((v, i) => {
          const Logo = LOGO[v.canal];
          const margem = margemDe(v);
          // Celular: quatro linhas bastam; a quarta (Suporte) sai para a da
          // margem negativa continuar visível.
          const ocultaCelular = i === 3 ? "max-sm:hidden" : "";
          return (
            <li key={v.sku} className={`px-3 py-2 ${i < VENDAS_EXEMPLO.length - 1 ? "border-b border-[#F1F2F5]" : ""} ${ocultaCelular}`}>
              <div className={COLUNAS}>
                <span className="grid size-[22px] place-items-center rounded-md border border-[#EDEFF3] bg-white">
                  <Logo className="max-h-3 w-auto max-w-[15px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-[#14161B]">{v.produto}</span>
                  <span className="czl-num block truncate text-[9px] text-[#9AA1AC]">{v.sku}</span>
                </span>
                <span className="czl-num text-right text-[11px] font-semibold text-[#14161B]">{comSinal(v.valor)}</span>
                <span className="czl-num text-right text-[10.5px] text-[#6B7280] max-sm:hidden">
                  {comSinal(-v.taxa)}
                  {v.estimado && <span className="ml-0.5 inline-block size-1.5 rounded-full bg-[#F79009] align-middle" />}
                </span>
                <span className="czl-num text-right text-[10.5px] text-[#6B7280] max-sm:hidden">{comSinal(-v.frete)}</span>
                <span className="czl-num text-right text-[10.5px] text-[#6B7280] max-sm:hidden">{comSinal(-v.cmv)}</span>
                <span
                  data-foco={margem < 0 ? "margem" : undefined}
                  className={`czl-num justify-self-end rounded-md px-1.5 py-0.5 text-right text-[11px] font-bold ${
                    margem < 0 ? "bg-[#FEF3F2] text-[#D92D20]" : "bg-[#ECFDF3] text-[#067647]"
                  }`}
                >
                  {comSinal(margem)}
                  <span className="block text-[8px] font-semibold opacity-80">{percentual(margem, v.valor)}</span>
                </span>
              </div>
              <p
                data-foco={i === 0 ? "detalhe" : undefined}
                className="czl-num mt-1 truncate pl-[32px] text-[7px] leading-[9px] text-[#9AA1AC]"
              >
                {v.detalhe}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ColunaLateral() {
  return (
    <div className="hidden gap-2.5 xl:grid xl:content-start">
      <div className="rounded-[12px] border border-[#EDEFF3] bg-white p-3">
        <p className="text-[11.5px] font-bold tracking-[-0.02em] text-[#14161B]">Faturamento por canal</p>
        <div className="mt-2.5 flex h-2 overflow-hidden rounded-full">
          <span className="h-full bg-[#2B3375]" style={{ width: "56.8%" }} />
          <span className="h-full bg-[#EE4D2D]" style={{ width: "28.8%" }} />
          <span className="h-full bg-[#14161B]" style={{ width: "14.4%" }} />
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {[
            { canal: "ML" as Canal, nome: "Mercado Livre", valor: "141.180,22", pct: "56,8%" },
            { canal: "SP" as Canal, nome: "Shopee", valor: "71.452,90", pct: "28,8%" },
            { canal: "TT" as Canal, nome: "TikTok Shop", valor: "35.757,28", pct: "14,4%" },
          ].map((c) => {
            const Logo = LOGO[c.canal];
            return (
              <li key={c.canal} className="flex items-center gap-2 text-[10px]">
                <Logo className="max-h-3 w-auto max-w-[15px]" />
                <span className="font-medium text-[#6B7280]">{c.nome}</span>
                <span className="czl-num ml-auto font-semibold text-[#14161B]">{c.valor}</span>
                <span className="czl-num w-9 text-right text-[#9AA1AC]">{c.pct}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-[12px] border border-[#EDEFF3] bg-white p-3">
        <p className="text-[11.5px] font-bold tracking-[-0.02em] text-[#14161B]">Top produtos por margem</p>
        <ul className="mt-2 space-y-2">
          {[
            { nome: "Luminária LED de Mesa", pct: 43, valor: "4.172,30" },
            { nome: "Fone Bluetooth TWS Pro", pct: 34.9, valor: "9.408,10" },
            { nome: "Kit 3 Garrafas Térmicas", pct: 23.8, valor: "3.217,44" },
          ].map((p) => (
            <li key={p.nome}>
              <div className="flex items-center justify-between text-[10px]">
                <span className="truncate font-medium text-[#14161B]">{p.nome}</span>
                <span className="czl-num ml-2 font-bold text-[#067647]">{p.valor}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-[#F1F2F5]">
                <span className="block h-full rounded-full bg-[#F26212]" style={{ width: `${p.pct * 2}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[7px] leading-[9px] text-[#9AA1AC]">Margem de contribuição = faturamento − taxa − frete − CMV</p>
      </div>
    </div>
  );
}

export default function PainelMock() {
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#DCE0E7] bg-white text-left shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35),0_8px_20px_-8px_rgba(16,24,40,0.10)]">
      <div className="flex h-9 items-center gap-3 border-b border-[#EDEFF3] bg-[#F8F9FB] px-3.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#DCE0E7]" />
          <span className="size-2.5 rounded-full bg-[#DCE0E7]" />
          <span className="size-2.5 rounded-full bg-[#DCE0E7]" />
        </span>
        <span className="mx-auto flex h-6 max-w-[260px] flex-1 items-center justify-center rounded-md border border-[#EDEFF3] bg-white px-3 text-[10.5px] font-medium text-[#9AA1AC]">
          app.contazoom.com.br/dashboard
        </span>
        <span className="w-[42px]" aria-hidden="true" />
      </div>

      <div className="flex">
        <BarraLateral />
        <div className="min-w-0 flex-1 bg-[#F8F9FB] p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <p className="text-[15px] font-extrabold tracking-[-0.03em] text-[#14161B] sm:text-[17px]">Dashboard</p>
              <p className="text-[10px] text-[#6B7280]">Setembro de 2026 · todos os canais</p>
            </div>
            <div className="hidden items-center gap-1 rounded-full border border-[#EDEFF3] bg-white p-0.5 md:flex">
              {["Hoje", "Últimos 7d", "Últimos 30d", "Este mês", "Mês passado"].map((p) => (
                <span
                  key={p}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${p === "Este mês" ? "bg-[#14161B] text-white" : "text-[#6B7280]"}`}
                >
                  {p}
                </span>
              ))}
            </div>
            <span className="hidden h-7 items-center gap-1.5 rounded-full border border-[#EDEFF3] bg-white px-3 text-[10px] text-[#9AA1AC] xl:flex">
              <Search className="h-3 w-3" /> Buscar venda, SKU ou conta
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-4">
            <Kpi rotulo="Faturamento Total" valor="R$ 248.390,40" nota="+12,4% vs mês anterior" notaCor="text-[#079455]">
              <p className="czl-num mt-1.5 hidden gap-2 text-[7px] leading-[9px] text-[#9AA1AC] sm:flex">
                <span>ML 141.180,22</span>
                <span>Shopee 71.452,90</span>
                <span>TikTok 35.757,28</span>
              </p>
            </Kpi>
            <Kpi rotulo="Taxas das Plataformas" valor="−R$ 31.793,97" nota="12,8% do faturamento" className="max-md:hidden" />
            <Kpi rotulo="Custo de Frete" valor="−R$ 19.126,06" nota="7,7% do faturamento" className="max-md:hidden" />
            <Kpi rotulo="Lucro Bruto" valor="R$ 69.026,95" nota="27,8% do faturamento" notaCor="text-[#D9500A]" destaque foco="kpi">
              <p className="mt-1.5 text-[7px] leading-[9px] text-[#B4683F]">
                Receita líquida 197.470,37 − impostos 14.903,42 − CMV 113.540,00
              </p>
            </Kpi>
          </div>

          <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_224px]">
            <UltimasVendas />
            <ColunaLateral />
          </div>
        </div>
      </div>
    </div>
  );
}
