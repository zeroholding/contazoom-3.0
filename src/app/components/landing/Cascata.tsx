import { CalendarClock, Percent, Truck } from "lucide-react";
import { Rotulo, Secao, Texto, Titulo, atraso } from "./comum";
import ExploradorMargem from "./ExploradorMargem";

/**
 * 02 · Margem. O explorador mostra, venda por venda, a conta que o painel faz em
 * todo pedido. Embaixo, as três peças que tornam essa conta confiável.
 */

const DETALHES = [
  {
    Icone: CalendarClock,
    titulo: "Custo com histórico",
    texto: "Cada venda usa o custo do dia em que aconteceu. Cadastrou depois? Aplique o custo nas vendas passadas que ficaram sem CMV.",
  },
  {
    Icone: Truck,
    titulo: "O frete Flex de verdade",
    texto: "Informe o custo por pacote e quantas unidades vão em cada cobrança. O frete líquido do Flex entra na margem e no DRE.",
  },
  {
    Icone: Percent,
    titulo: "Imposto por conta e por mês",
    texto: "A alíquota de cada conta de marketplace, mês a mês. O imposto sai da margem de cada venda e aparece no Dashboard.",
  },
];

export default function Cascata() {
  return (
    <Secao id="margem" className="border-y border-[#EDEFF3] bg-[#F8F9FB]">
      <div data-revelar="" className="max-w-[44rem]">
        <Rotulo numero="02" texto="Margem" />
        <Titulo>Faturamento não é lucro. Abra uma venda e veja para onde foi o dinheiro.</Titulo>
        <Texto>
          Em todo pedido, o ContaZoom tira do valor da venda a comissão do canal, o frete, o imposto da sua
          alíquota e o custo do produto. São as mesmas vendas do painel lá em cima: toque em cada uma.
        </Texto>
      </div>

      <div data-revelar="" className="mt-7 sm:mt-9">
        <ExploradorMargem />
      </div>

      <ul className="mt-4 grid gap-3 sm:mt-5 md:grid-cols-3 md:gap-4">
        {DETALHES.map(({ Icone, titulo, texto }, i) => (
          <li key={titulo} data-revelar="" style={atraso(i * 80)} className="flex gap-3.5 rounded-[18px] border border-[#EDEFF3] bg-white p-4 sm:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#F26212]">
              <Icone className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15.5px] font-bold tracking-[-0.02em] text-[#14161B]">{titulo}</h3>
              <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6B7280]">{texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </Secao>
  );
}
