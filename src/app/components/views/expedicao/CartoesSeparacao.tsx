"use client";

/**
 * A fileira de cartões de resumo da fila, no formato do CyberDock.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ORDEM É A DO CYBERDOCK, E A ORDEM É A INFORMAÇÃO
 *
 *   Pacotes · Itens · Unidades · Atrasados · Despachar Hoje · Por Modalidade ·
 *   Contas
 *
 * Os três primeiros são o TAMANHO do trabalho, em três unidades diferentes que o
 * galpão usa para coisas diferentes: pacote é etiqueta a imprimir, item é linha a
 * conferir, unidade é peça a tirar da prateleira. Depois vêm os dois que mudam a
 * ORDEM do dia (atrasado, vence hoje). Por último a distribuição.
 *
 * `auto-fit` com mínimo de 180px, igual ao original: os sete cartões se acomodam
 * sozinhos em 7, 4, 3 ou 2 colunas conforme a largura, sem breakpoint escrito à
 * mão. Foi o que evitou o cartão sozinho na última linha.
 *
 * O SÉTIMO CARTÃO É "CONTAS", E NÃO "USUÁRIOS ATIVOS".
 *
 * No CyberDock aquele slot conta quem SEPAROU os pacotes, porque lá a separação é
 * registrada por operador. O CONTAZOOM não registra quem separa — a Expedição é
 * leitura da fila, não apontamento de produção (ver o cabeçalho de
 * `expedicao-data.ts`). Inventar um número ali seria pior que trocar o rótulo:
 * "2 usuários ativos" com o dado inexistente é um número que ninguém pode
 * conferir. O slot ficou com "Contas", que é o mesmo tipo de informação (quantas
 * origens alimentam esta fila) e existe de verdade.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";

import { inteiro } from "../comum/formato";
import {
  IconeAlerta,
  IconeCaixa,
  IconeCalendario,
  IconeCerto,
  IconeLoja,
  IconeMais,
} from "../comum/icones";
import { metaModalidade } from "./modalidade";
import type { LinhaResumo } from "@/lib/expedicao";

type TomCartao = "azul" | "verde" | "laranja" | "vermelho" | "cinza";

const CASCA: Record<TomCartao, string> = {
  azul: "bg-[#eff6ff] text-[#2563eb]",
  verde: "bg-[#f0fdf4] text-[#16a34a]",
  laranja: "bg-[#fff7ed] text-[#ea580c]",
  vermelho: "bg-[#fef2f2] text-[#dc2626]",
  cinza: "bg-[#f1f5f9] text-[#475569]",
};

const CARTAO =
  "rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-4";

function Cartao({
  rotulo,
  valor,
  dica,
  tom,
  icone,
  /** Pinta o número de vermelho. Só para "Atrasados" com valor acima de zero. */
  alerta = false,
}: {
  rotulo: string;
  valor: string;
  dica: string;
  tom: TomCartao;
  icone: ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className={`${CARTAO} flex items-center gap-3.5`}>
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${CASCA[tom]}`}
      >
        {icone}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[var(--cz-texto-suave)]">
          {rotulo}
        </span>
        <span
          className={`text-[26px] font-extrabold leading-tight tabular-nums ${
            alerta ? "text-[#dc2626]" : "text-[var(--cz-texto)]"
          }`}
        >
          {valor}
        </span>
        <span className="text-[11.5px] text-[var(--cz-texto-suave)]">{dica}</span>
      </div>
    </div>
  );
}

export default function CartoesSeparacao({
  pacotes,
  itens,
  unidades,
  atrasados,
  despacharHoje,
  porModalidade,
  contas,
}: {
  pacotes: number;
  itens: number;
  unidades: number;
  atrasados: number;
  despacharHoje: number;
  porModalidade: LinhaResumo[];
  contas: number;
}) {
  return (
    <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      <Cartao
        rotulo="Pacotes"
        valor={inteiro(pacotes)}
        dica="a montar"
        tom="azul"
        icone={<IconeCaixa className="h-[22px] w-[22px]" />}
      />
      <Cartao
        rotulo="Itens"
        valor={inteiro(itens)}
        dica="linhas de SKU"
        tom="verde"
        icone={<IconeCerto className="h-[22px] w-[22px]" />}
      />
      <Cartao
        rotulo="Unidades"
        valor={inteiro(unidades)}
        dica="total físico"
        tom="laranja"
        icone={<IconeMais className="h-[22px] w-[22px]" />}
      />
      <Cartao
        rotulo="Atrasados"
        valor={inteiro(atrasados)}
        dica="prazo já vencido"
        tom="vermelho"
        icone={<IconeAlerta className="h-[22px] w-[22px]" />}
        alerta={atrasados > 0}
      />
      <Cartao
        rotulo="Despachar Hoje"
        valor={inteiro(despacharHoje)}
        dica="com prazo para hoje"
        tom="laranja"
        icone={<IconeCalendario className="h-[22px] w-[22px]" />}
      />

      {/* O cartão da distribuição. Duas colunas internas, como no original: com
          uma coluna, quatro modalidades esticariam o cartão para o dobro da altura
          dos outros seis e a fileira ficaria torta. */}
      <div className={`${CARTAO} flex flex-col gap-2.5`}>
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[var(--cz-texto-suave)]">
          Por Modalidade de Envio
        </span>
        {porModalidade.length === 0 ? (
          <span className="text-[var(--cz-texto-suave)]">—</span>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {/* Teto de quatro: o cartão tem a altura dos vizinhos, e a quinta
                modalidade quebraria a fileira. O resumo completo continua no
                rodapé da tela, com pacotes, unidades e valor de cada uma. */}
            {porModalidade.slice(0, 4).map((linha) => {
              const meta = metaModalidade(linha.rotulo);
              return (
                <div key={linha.rotulo} className="flex items-center gap-1.5">
                  <span
                    className="grid size-[26px] shrink-0 place-items-center rounded-lg"
                    style={{ color: meta.cor, background: meta.fundo }}
                  >
                    {meta.icone}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-[15px] font-bold tabular-nums text-[var(--cz-texto)]">
                      {inteiro(linha.pacotes)}
                    </span>
                    <span
                      className="truncate text-[10.5px] uppercase tracking-[0.02em] text-[var(--cz-texto-suave)]"
                      title={linha.rotulo}
                    >
                      {meta.rotulo}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Cartao
        rotulo="Contas"
        valor={inteiro(contas)}
        dica="com pacote na fila"
        tom="cinza"
        icone={<IconeLoja className="h-[22px] w-[22px]" />}
      />
    </div>
  );
}
