"use client";

import type { ReactNode } from "react";

import { useCelular } from "@/hooks/useMediaQuery";
import { inteiro } from "../comum/formato";
import { IconeCaixa, IconeCerto } from "../comum/icones";
import { Kpi } from "../comum/shell";

type TomCartao = "azul" | "verde";

const CASCA: Record<TomCartao, string> = {
  azul: "bg-[#eff6ff] text-[#2563eb]",
  verde: "bg-[#f0fdf4] text-[#16a34a]",
};

function Cartao({
  rotulo,
  valor,
  dica,
  tom,
  icone,
}: {
  rotulo: string;
  valor: number;
  dica: string;
  tom: TomCartao;
  icone: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${CASCA[tom]}`}
      >
        {icone}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[var(--cz-texto-suave)]">
          {rotulo}
        </span>
        <span className="text-[26px] font-extrabold leading-tight tabular-nums text-[var(--cz-texto)]">
          {inteiro(valor)}
        </span>
        <span className="text-[11.5px] text-[var(--cz-texto-suave)]">{dica}</span>
      </div>
    </div>
  );
}

/** Os únicos números operacionais pedidos: vendas e quantidade física prevista. */
export default function CartoesSeparacao({
  vendas,
  itens,
}: {
  vendas: number;
  itens: number;
}) {
  const celular = useCelular();

  // Celular: os dois números lado a lado no `Kpi` do kit (o mesmo das outras telas),
  // em vez de dois cartões largos empilhados que gastavam ~190px antes da fila. A
  // dica ("previstas para o período") sai: o rótulo já diz o que é, e a linha de
  // contagens logo acima da fila detalha pacotes, vendas, itens e unidades.
  if (celular) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Kpi rotulo="Vendas" valor={inteiro(vendas)} icone={<IconeCerto className="h-5 w-5" />} />
        <Kpi rotulo="Itens" valor={inteiro(itens)} icone={<IconeCaixa className="h-5 w-5" />} />
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <Cartao
        rotulo="Vendas"
        valor={vendas}
        dica="previstas para o período"
        tom="azul"
        icone={<IconeCerto className="h-[22px] w-[22px]" />}
      />
      <Cartao
        rotulo="Itens"
        valor={itens}
        dica="quantidade física prevista"
        tom="verde"
        icone={<IconeCaixa className="h-[22px] w-[22px]" />}
      />
    </div>
  );
}
