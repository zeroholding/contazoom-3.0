import { Check, FileSpreadsheet, Printer } from "lucide-react";
import { Rotulo, Texto, Titulo, atraso } from "./comum";

/**
 * 03 · Produto — os módulos do menu lateral, com o nome EXATO de cada um como
 * etiqueta. As ilustrações são desenhadas em CSS a partir do que cada tela
 * mostra de verdade (limiares de cobertura do Estoque Full, colunas da Central
 * de Vendas, linhas do Dashboard Financeiro).
 */

/* Mapa do Brasil em ladrilhos: um quadrado por estado, na posição aproximada. */
const ESTADOS: Array<[uf: string, linha: number, coluna: number, intensidade: number]> = [
  ["RR", 0, 2, 0.04], ["AP", 0, 4, 0.04],
  ["AM", 1, 1, 0.1], ["PA", 1, 3, 0.15], ["MA", 1, 4, 0.1], ["CE", 1, 5, 0.22], ["RN", 1, 6, 0.1],
  ["AC", 2, 0, 0.05], ["RO", 2, 1, 0.07], ["MT", 2, 2, 0.17], ["TO", 2, 3, 0.07], ["PI", 2, 4, 0.08], ["PE", 2, 5, 0.26], ["PB", 2, 6, 0.11],
  ["MS", 3, 2, 0.16], ["GO", 3, 3, 0.3], ["DF", 3, 4, 0.28], ["BA", 3, 5, 0.36], ["AL", 3, 6, 0.09],
  ["PR", 4, 2, 0.5], ["SP", 4, 3, 1], ["MG", 4, 4, 0.64], ["ES", 4, 5, 0.2], ["SE", 4, 6, 0.08],
  ["SC", 5, 2, 0.42], ["RJ", 5, 4, 0.58],
  ["RS", 6, 2, 0.46],
];

function MapaLadrilhos() {
  return (
    <div aria-hidden="true" className="grid w-fit grid-cols-7 gap-1 sm:gap-1.5">
      {Array.from({ length: 7 * 7 }, (_, i) => {
        const linha = Math.floor(i / 7);
        const coluna = i % 7;
        const estado = ESTADOS.find(([, l, c]) => l === linha && c === coluna);
        if (!estado) return <span key={i} className="size-7 sm:size-9 lg:size-10" />;
        const [uf, , , v] = estado;
        return (
          <span
            key={uf}
            className="czl-num grid size-7 place-items-center rounded-[7px] text-[9px] font-bold sm:size-9 sm:text-[10.5px] lg:size-10 lg:text-[11px]"
            style={{
              backgroundColor: `rgba(242, 98, 18, ${0.08 + 0.92 * v})`,
              color: v > 0.45 ? "#FFFFFF" : "#9A3D0A",
            }}
          >
            {uf}
          </span>
        );
      })}
    </div>
  );
}

function CartaoModulo({
  etiqueta,
  titulo,
  texto,
  className = "",
  indice,
  preencher = false,
  children,
}: {
  etiqueta: string;
  titulo: string;
  texto: string;
  className?: string;
  indice: number;
  /** A ilustração ocupa toda a altura que sobrar (cartão que atravessa duas linhas). */
  preencher?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      data-revelar=""
      style={atraso((indice % 3) * 90)}
      className={`group flex flex-col overflow-hidden rounded-[22px] border border-[#EDEFF3] bg-white transition-[border-color,box-shadow] duration-300 hover:border-[#FFD9BF] hover:shadow-[0_24px_48px_-28px_rgba(242,98,18,0.45)] ${className}`}
    >
      <div className="p-6 sm:p-7">
        <p className="font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-[#D9500A]">{etiqueta}</p>
        <h3 className="mt-3 text-[20px] font-extrabold leading-[1.2] tracking-[-0.03em] text-[#14161B]">{titulo}</h3>
        <p className="mt-2 text-[14.5px] leading-[1.65] text-[#6B7280]">{texto}</p>
      </div>
      <div className={`px-6 pb-6 sm:px-7 sm:pb-7 ${preencher ? "flex flex-1 flex-col" : "mt-auto"}`}>{children}</div>
    </li>
  );
}

const COLUNAS_VENDAS = [
  { nome: "ADS", ligada: true },
  { nome: "Exposição", ligada: true },
  { nome: "Tipo de anúncio", ligada: false },
  { nome: "Mod. envio", ligada: true },
  { nome: "Cliente", ligada: false },
  { nome: "Taxa", ligada: true },
  { nome: "Frete", ligada: true },
  { nome: "CMV", ligada: true },
  { nome: "Margem", ligada: true },
];

const COBERTURA = [
  { sku: "CAP-SIL-15", dias: 9, situacao: "Repor", cor: "#D92D20", fundo: "#FEF3F2" },
  { sku: "FN-TWS-01", dias: 31, situacao: "Saudável", cor: "#067647", fundo: "#ECFDF3" },
  { sku: "SUP-MON-27", dias: 74, situacao: "Estoque alto", cor: "#B54708", fundo: "#FFFAEB" },
];

/* Agosto, e não setembro como o painel da primeira dobra: o Lucro Bruto do
   Dashboard desconta imposto e o do Dashboard Financeiro não, e o mesmo mês com
   dois "lucros brutos" diferentes pareceria erro de conta. */
const FINANCEIRO = [
  { rotulo: "Faturamento Bruto", valor: "231.874,60", forte: true },
  { rotulo: "Taxas de Marketplaces", valor: "−29.680,95" },
  { rotulo: "Custo com Frete", valor: "−17.854,34" },
  { rotulo: "CMV", valor: "−106.662,32" },
  { rotulo: "Lucro Bruto", valor: "77.676,99", forte: true },
  { rotulo: "Despesas Operacionais", valor: "−38.940,10" },
  { rotulo: "Lucro Líquido", valor: "38.736,89", forte: true, marca: true },
];

/* Faturamento diário de setembro, em fração do maior dia. Fixo para o HTML do
   servidor e o do cliente saírem iguais. */
const DIAS = [
  0.42, 0.55, 0.5, 0.61, 0.58, 0.83, 0.74, 0.46, 0.57, 0.52, 0.66, 0.63, 0.9, 0.79, 0.5,
  0.6, 0.56, 0.7, 0.68, 0.95, 0.86, 0.54, 0.64, 0.6, 0.73, 0.71, 1, 0.88, 0.62, 0.69,
];

function GraficoDias() {
  return (
    <div className="rounded-[14px] border border-[#EDEFF3] bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-[12px] font-bold text-[#14161B]">Faturamento por dia</p>
        <p className="czl-num text-[11px] font-semibold text-[#079455]">+12,4% vs mês anterior</p>
      </div>
      <div className="mt-3 flex h-24 items-end gap-[3px] sm:h-28">
        {DIAS.map((v, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t-[3px] ${i === DIAS.length - 4 ? "bg-[#F26212]" : "bg-[#FFD9BF]"}`}
            style={{ height: `${v * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[#9AA1AC]">
        <span>01/09</span>
        <span>15/09</span>
        <span>30/09</span>
      </div>
    </div>
  );
}

function IlustracaoDashboard() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col gap-4 rounded-[16px] border border-[#EDEFF3] bg-[#F8F9FB] p-4 sm:p-5">
      <GraficoDias />
      <div className="flex flex-1 flex-col gap-6 sm:flex-row sm:items-center">
      <div>
        <p className="text-[12px] font-bold text-[#14161B]">Vendas por estado</p>
        <p className="mb-3 text-[11px] text-[#9AA1AC]">mapa de calor · quantidade ou valor</p>
        <MapaLadrilhos />
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-1 lg:grid-cols-2">
        {[
          { rotulo: "Ticket Médio (Venda)", valor: "R$ 142,26" },
          { rotulo: "Unidades Vendidas", valor: "1.981" },
          { rotulo: "Receita Líquida", valor: "R$ 197.470,37" },
          { rotulo: "Impostos s/ Faturamento", valor: "−R$ 14.903,42" },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-[12px] border border-[#EDEFF3] bg-white px-3 py-2.5">
            <p className="truncate text-[11px] text-[#6B7280]">{k.rotulo}</p>
            <p className="czl-num text-[15px] font-extrabold tracking-[-0.03em] text-[#14161B]">{k.valor}</p>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function IlustracaoColunas() {
  return (
    <ul aria-hidden="true" className="flex flex-wrap gap-1.5">
      {COLUNAS_VENDAS.map((c) => (
        <li
          key={c.nome}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
            c.ligada
              ? "border-[#FFD9BF] bg-[#FFF2E9] text-[#C2410C]"
              : "border-[#EDEFF3] bg-white text-[#9AA1AC]"
          }`}
        >
          <span
            className={`grid size-3.5 place-items-center rounded-[4px] ${
              c.ligada ? "bg-[#F26212] text-white" : "border border-[#DCE0E7]"
            }`}
          >
            {c.ligada && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
          </span>
          {c.nome}
        </li>
      ))}
    </ul>
  );
}

function IlustracaoExpedicao() {
  return (
    <div aria-hidden="true" className="flex gap-3">
      <div className="w-[46%] shrink-0 self-start rounded-[12px] border border-[#DCE0E7] bg-white p-3 shadow-[0_8px_16px_-10px_rgba(16,24,40,0.25)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold text-[#14161B]">ETIQUETA</span>
          <span className="rounded-[4px] bg-[#14161B] px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">ZPL · PDF</span>
        </div>
        <div className="mt-2.5 h-10 bg-[repeating-linear-gradient(90deg,#14161B_0_2px,transparent_2px_4px,#14161B_4px_5px,transparent_5px_8px,#14161B_8px_11px,transparent_11px_13px)]" />
        <p className="mt-1.5 font-mono text-[9px] text-[#6B7280]">Mercado Livre · em lote</p>
        <div className="mt-3 space-y-1 border-t border-dashed border-[#DCE0E7] pt-2.5">
          <span className="block h-1.5 w-[80%] rounded-full bg-[#EDEFF3]" />
          <span className="block h-1.5 w-[64%] rounded-full bg-[#EDEFF3]" />
          <span className="block h-1.5 w-[72%] rounded-full bg-[#EDEFF3]" />
        </div>
        <p className="mt-2.5 text-[10px] font-semibold text-[#6B7280]">Reimpressão permitida</p>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {[
          { prazo: "Hoje, 11:00", cor: "#D92D20", fundo: "#FEF3F2", item: "3× FN-TWS-01" },
          { prazo: "Hoje, 14:00", cor: "#B54708", fundo: "#FFFAEB", item: "1× SUP-MON-27" },
          { prazo: "Amanhã", cor: "#6B7280", fundo: "#F4F5F7", item: "2× KIT-GT-3" },
        ].map((p) => (
          <li key={p.item} className="rounded-[10px] border border-[#EDEFF3] bg-white px-2.5 py-2">
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ color: p.cor, backgroundColor: p.fundo }}>
              {p.prazo}
            </span>
            <p className="czl-num mt-1 truncate text-[11.5px] font-semibold text-[#14161B]">{p.item}</p>
          </li>
        ))}
        <li className="flex items-center gap-1.5 pt-0.5 text-[11px] font-semibold text-[#6B7280]">
          <Printer className="h-3.5 w-3.5" /> Folha de separação
        </li>
      </ul>
    </div>
  );
}

function IlustracaoAnuncioMorto() {
  return (
    <div aria-hidden="true" className="rounded-[14px] border border-[#EDEFF3] bg-[#F8F9FB] p-3.5">
      <svg viewBox="0 0 240 64" className="h-16 w-full" fill="none">
        <path
          d="M2 40 L22 30 L42 34 L62 18 L82 24 L102 12 L122 20 L138 16 L150 52 L238 52"
          stroke="#F26212"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d="M150 52 L238 52" stroke="#D92D20" strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
        <circle cx="150" cy="52" r="4" fill="#D92D20" />
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[11px] font-bold text-[#D92D20]">Parado há 23 dias</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#6B7280] ring-1 ring-[#EDEFF3]">
          pausado por falta de estoque
        </span>
      </div>
    </div>
  );
}

function IlustracaoCobertura() {
  return (
    <ul aria-hidden="true" className="space-y-2.5">
      {COBERTURA.map((c) => (
        <li key={c.sku}>
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="czl-num font-semibold text-[#14161B]">{c.sku}</span>
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ color: c.cor, backgroundColor: c.fundo }}>
              {c.situacao} · {c.dias} dias
            </span>
          </div>
          <div className="relative mt-1.5 h-2 rounded-full bg-[#F1F2F5]">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, (c.dias / 80) * 100)}%`, backgroundColor: c.cor }}
            />
            {/* Os dois limiares reais da tela: repor até 14 dias, alto a partir de 56. */}
            <span className="absolute -inset-y-0.5 w-px bg-[#9AA1AC]" style={{ left: `${(14 / 80) * 100}%` }} />
            <span className="absolute -inset-y-0.5 w-px bg-[#9AA1AC]" style={{ left: `${(56 / 80) * 100}%` }} />
          </div>
        </li>
      ))}
      <li className="flex justify-between pt-0.5 font-mono text-[10px] text-[#9AA1AC]">
        <span>cobertura = estoque ÷ ritmo de 30 dias</span>
        <span>14d · 56d</span>
      </li>
    </ul>
  );
}

function IlustracaoSku() {
  return (
    <div aria-hidden="true" className="space-y-2">
      <div className="rounded-[12px] border border-[#EDEFF3] bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="czl-num text-[12px] font-bold text-[#14161B]">GT-500</span>
          <span className="text-[11px] text-[#9AA1AC]">Garrafa Térmica 500 ml</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-[11px]">
          <span className="czl-num rounded-md bg-[#F4F5F7] px-2 py-1 text-[#6B7280] line-through decoration-[#9AA1AC]">R$ 17,40 até 31/07</span>
          <span className="text-[#9AA1AC]">→</span>
          <span className="czl-num rounded-md bg-[#FFF2E9] px-2 py-1 font-semibold text-[#C2410C]">R$ 18,20 desde 01/08</span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-[12px] border border-dashed border-[#DCE0E7] bg-[#F8F9FB] px-3 py-2.5 text-[11.5px]">
        <span className="czl-num font-bold text-[#14161B]">KIT-GT-3</span>
        <span className="text-[#6B7280]">= 3 × GT-500</span>
        <span className="czl-num ml-auto font-semibold text-[#14161B]">R$ 54,60</span>
      </div>
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#B54708]">
        <span className="size-1.5 rounded-full bg-[#F79009]" /> 2 SKUs pendentes: sem custo cadastrado
      </p>
    </div>
  );
}

function IlustracaoFinanceiro() {
  return (
    <div aria-hidden="true" className="rounded-[14px] border border-[#EDEFF3] bg-[#F8F9FB] p-3.5">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#9AA1AC]">Dashboard Financeiro · agosto</p>
      <ul className="space-y-1">
        {FINANCEIRO.map((l) => (
          <li
            key={l.rotulo}
            className={`flex items-center justify-between rounded-[8px] px-2.5 py-1.5 text-[12px] ${
              l.marca ? "bg-[#14161B] text-white" : l.forte ? "bg-white font-bold text-[#14161B]" : "text-[#6B7280]"
            }`}
          >
            <span>{l.rotulo}</span>
            <span className={`czl-num font-semibold ${l.marca ? "text-[#FFB98A]" : ""}`}>{l.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IlustracaoPlanilha() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="flex items-center gap-3 rounded-[14px] border-2 border-dashed border-[#DCE0E7] bg-[#F8F9FB] px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white text-[#079455] ring-1 ring-[#EDEFF3]">
          <FileSpreadsheet className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold text-[#14161B]">Arraste a planilha ou escolha o arquivo</p>
          <p className="czl-num text-[11px] text-[#6B7280]">XLSX, XLS ou CSV · até 10 MB e 5.000 linhas · modelo pronto</p>
        </div>
      </div>
      <IlustracaoPrevia />
    </div>
  );
}

function IlustracaoPrevia() {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#EDEFF3] bg-white">
      <div className="flex items-center gap-2 border-b border-[#EDEFF3] bg-[#F8F9FB] px-3 py-2">
        <FileSpreadsheet className="h-4 w-4 text-[#079455]" />
        <span className="text-[12px] font-bold text-[#14161B]">custos-setembro.xlsx</span>
        <span className="ml-auto text-[11px] font-semibold text-[#6B7280]">Prévia antes de gravar</span>
      </div>
      <ul className="divide-y divide-[#F1F2F5] text-[11.5px]">
        {[
          { sku: "GT-500", de: "17,40", para: "18,20", estado: "Alterar" },
          { sku: "FN-TWS-01", de: "71,00", para: "71,00", estado: "Igual" },
          { sku: "LUM-LED-02", de: "—", para: "32,40", estado: "Novo" },
        ].map((l) => (
          <li key={l.sku} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2">
            <span className="czl-num font-semibold text-[#14161B]">{l.sku}</span>
            <span className="czl-num text-[#6B7280]">
              {l.de} <span className="text-[#9AA1AC]">→</span> <span className="font-semibold text-[#14161B]">{l.para}</span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                l.estado === "Igual" ? "bg-[#F4F5F7] text-[#6B7280]" : l.estado === "Novo" ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#FFF2E9] text-[#C2410C]"
              }`}
            >
              {l.estado}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Modulos() {
  return (
    <section id="produto" className="scroll-mt-16 py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="mx-auto max-w-[46rem] text-center">
          <div className="flex justify-center">
            <Rotulo numero="03" texto="Produto" />
          </div>
          <Titulo>Tudo o que acontece depois da venda, no mesmo painel.</Titulo>
          <Texto>
            Do pedido que chegou agora ao lucro líquido do mês: vendas, expedição, anúncios, estoque
            no Full, custos e financeiro, com os números de todos os canais juntos.
          </Texto>
        </div>

        <ul className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          <CartaoModulo
            indice={0}
            etiqueta="Dashboard"
            titulo="O mês inteiro numa tela."
            texto="Faturamento, impostos, taxas, frete, receita líquida e lucro bruto do período, com a comparação com o mês anterior. Mais os produtos que mais dão margem e um mapa de calor das vendas por estado."
            className="md:col-span-2 lg:col-span-4 lg:row-span-2"
            preencher
          >
            <IlustracaoDashboard />
          </CartaoModulo>

          <CartaoModulo
            indice={1}
            etiqueta="Central de Vendas"
            titulo="Todas as vendas numa tabela só."
            texto="Os três canais juntos ou um de cada vez, com as colunas que você escolher."
            className="lg:col-span-2"
          >
            <IlustracaoColunas />
          </CartaoModulo>

          <CartaoModulo
            indice={2}
            etiqueta="Expedição"
            titulo="Separe na ordem do prazo de despacho."
            texto="Fila de separação por canal, folha para imprimir e etiquetas do Mercado Livre em PDF ou ZPL, em lote."
            className="lg:col-span-2"
          >
            <IlustracaoExpedicao />
          </CartaoModulo>

          <CartaoModulo
            indice={3}
            etiqueta="Gestão de Anúncios"
            titulo="Veja o que parou de vender."
            texto="Ranking dos mais vendidos em todos os canais. E os anúncios mortos do Mercado Livre: há quanto tempo pararam, quanto faturavam e o motivo."
            className="lg:col-span-2"
          >
            <IlustracaoAnuncioMorto />
          </CartaoModulo>

          <CartaoModulo
            indice={4}
            etiqueta="Estoque Full"
            titulo="Saiba quando repor o Full."
            texto="O estoque de cada conta no Full do Mercado Livre, com a cobertura em dias pelo ritmo dos últimos 30 dias de vendas."
            className="lg:col-span-2"
          >
            <IlustracaoCobertura />
          </CartaoModulo>

          <CartaoModulo
            indice={5}
            etiqueta="Gestão de SKU"
            titulo="Custo certo, até nas vendas antigas."
            texto="Custo por SKU com histórico, kits montados a partir dos itens e aviso dos SKUs que ainda estão sem custo."
            className="lg:col-span-2"
          >
            <IlustracaoSku />
          </CartaoModulo>

          <CartaoModulo
            indice={6}
            etiqueta="Financeiro"
            titulo="Do faturamento ao lucro líquido."
            texto="Contas a pagar e a receber, categorias e formas de pagamento, Dashboard Financeiro e DRE mês a mês."
            className="lg:col-span-3"
          >
            <IlustracaoFinanceiro />
          </CartaoModulo>

          <CartaoModulo
            indice={7}
            etiqueta="Importação por planilha"
            titulo="Suba a planilha e confira antes de gravar."
            texto="Custos de SKU e lançamentos do financeiro em XLSX, XLS ou CSV. Você vê o valor atual ao lado do valor da planilha e aprova linha por linha. Mandou de novo, não duplica."
            className="lg:col-span-3"
          >
            <IlustracaoPlanilha />
          </CartaoModulo>
        </ul>
      </div>
    </section>
  );
}
