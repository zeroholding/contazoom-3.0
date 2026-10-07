"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import FiltrosSheet, {
  CampoDaFolha,
  GrupoDePilulas,
} from "@/components/ui/FiltrosSheet";

/**
 * Barra de filtros das vendas no CELULAR, compartilhada pelas quatro telas.
 *
 * O desktop tem seis dropdowns `position: fixed` lado a lado (exposição, tipo,
 * envio, conta, período, colunas) mais as abas de status. Em 390px isso vira uma
 * fileira que rola e esconde metade dos controles. Aqui o que se usa toda hora
 * fica À VISTA, fora da folha: as abas de status e o período. O resto (conta,
 * exposição, tipo, envio) vai para a folha "Filtros (n)" como pastilhas, que é um
 * toque por opção em vez de um dropdown dentro de outra camada.
 *
 * O componente é só apresentação: cada tela (v2 e legado) monta as opções a
 * partir do SEU estado e passa os mesmos handlers que o desktop já usa, então o
 * que chega na API é idêntico.
 *
 * "Colunas" não existe aqui de propósito: no celular a venda é um cartão de
 * formato fixo, não uma linha de tabela com colunas ligáveis.
 */

export type OpcaoFiltro = { id: string; rotulo: string };
export type OpcaoStatus = OpcaoFiltro & {
  contagem: number;
  cor: "green" | "red" | "gray";
};
export type GrupoFiltro = {
  id: string;
  rotulo: string;
  opcoes: OpcaoFiltro[];
  atual: string;
  /** Valor de "sem filtro". Decide se o grupo conta como ativo e o que o Limpar restaura. */
  padrao: string;
  onEscolher: (id: string) => void;
};

type Props = {
  status: { opcoes: OpcaoStatus[]; atual: string; onEscolher: (id: string) => void };
  periodo: {
    opcoes: OpcaoFiltro[];
    atual: string;
    /** Como o período atual se chama (o personalizado vira "01/03/2025 - 15/03/2025"). */
    rotuloAtual: string;
    onEscolher: (id: string) => void;
    onAplicarPersonalizado: (inicio: Date, fim: Date) => void;
  };
  grupos: GrupoFiltro[];
};

const COR_ATIVA: Record<OpcaoStatus["cor"], { aba: string; selo: string }> = {
  green: { aba: "border-green-200 bg-green-100 text-green-900", selo: "bg-green-200 text-green-800" },
  red: { aba: "border-red-200 bg-red-100 text-red-900", selo: "bg-red-200 text-red-800" },
  gray: { aba: "border-gray-200 bg-white text-gray-900 shadow-sm", selo: "bg-gray-200 text-gray-800" },
};

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const paraInput = (d: Date) =>
  `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
// "aaaa-mm-dd" + hora local: `new Date("2025-03-01")` seria meia-noite UTC, ou seja,
// 21h do dia anterior no Brasil, e o filtro começaria um dia antes do escolhido.
const doInput = (valor: string) => new Date(`${valor}T00:00:00`);

export default function FiltrosVendasCelular({ status, periodo, grupos }: Props) {
  const [abrirPersonalizado, setAbrirPersonalizado] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const mostrarPersonalizado = abrirPersonalizado || periodo.atual === "personalizado";
  const valorSeletor = mostrarPersonalizado ? "personalizado" : periodo.atual;
  const rotuloSeletor =
    periodo.atual === "personalizado"
      ? periodo.rotuloAtual
      : (periodo.opcoes.find((o) => o.id === valorSeletor)?.rotulo ?? periodo.rotuloAtual);

  // "Personalizado" (e o intervalo escolhido) perde o prefixo "Período:" e, quando as
  // duas datas são do mesmo ano, o ano da primeira. O seletor divide a linha com o
  // botão Filtros e sobram ~165px de texto: "Período: 01/03/2025 - 15/03/2025" passa
  // disso e cortaria justamente a data final. O texto inteiro segue no `title`.
  const intervalo = rotuloSeletor.match(/^(\d{2}\/\d{2})\/(\d{4})\s*-\s*(\d{2}\/\d{2})\/(\d{4})$/);
  const textoSeletor =
    valorSeletor !== "personalizado"
      ? rotuloSeletor
      : periodo.atual !== "personalizado"
        ? "Personalizado"
        : intervalo && intervalo[2] === intervalo[4]
          ? `${intervalo[1]} – ${intervalo[3]}/${intervalo[4]}`
          : rotuloSeletor;

  const ativos = grupos.filter((g) => g.atual !== g.padrao).length;
  const limpar = () => {
    for (const g of grupos) if (g.atual !== g.padrao) g.onEscolher(g.padrao);
  };

  const aplicar = () => {
    if (!de || !ate) return;
    let inicio = doInput(de);
    let fim = doInput(ate);
    if (inicio > fim) [inicio, fim] = [fim, inicio];
    periodo.onAplicarPersonalizado(inicio, fim);
    setAbrirPersonalizado(false);
  };

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      {/* Abas de status: três colunas iguais, cada uma com 44px de altura. */}
      <div
        role="group"
        aria-label="Status das vendas"
        className="flex gap-1 rounded-xl border border-[var(--cz-hairline)] bg-gray-50 p-1"
      >
        {status.opcoes.map((o) => {
          const ativa = o.id === status.atual;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={ativa}
              onClick={() => status.onEscolher(o.id)}
              className={[
                "inline-flex min-h-11 min-w-0 flex-auto items-center justify-center gap-1.5 rounded-lg border px-2 text-[14px] font-medium transition-colors",
                ativa
                  ? COR_ATIVA[o.cor].aba
                  : "border-transparent text-gray-600 active:bg-white",
              ].join(" ")}
            >
              <span className="truncate">{o.rotulo}</span>
              {o.contagem > 0 && (
                <span
                  className={[
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px] font-semibold leading-none tabular-nums",
                    ativa ? COR_ATIVA[o.cor].selo : "bg-gray-200/70 text-gray-600",
                  ].join(" ")}
                >
                  {o.contagem > 99 ? "99+" : o.contagem}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {/* Período SEMPRE à vista. O <select> nativo fica transparente por cima
            de uma "cara" desenhada: tocar abre o seletor do próprio aparelho
            (rodinha no iOS, lista no Android), que é mais confortável que um
            dropdown nosso, e a cara mostra "Período: Este mês" em vez de só o
            valor solto. */}
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none flex h-11 items-center gap-2 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-white px-3.5 text-[15px]">
            <CalendarDays className="h-4 w-4 shrink-0 text-[var(--cz-texto-suave)]" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {valorSeletor !== "personalizado" && (
                <span className="text-[var(--cz-texto-suave)]">Período: </span>
              )}
              <span className="font-semibold text-[var(--cz-texto)]" title={rotuloSeletor}>
                {textoSeletor}
              </span>
            </span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-[var(--cz-texto-suave)]" aria-hidden="true" />
          </div>
          <select
            aria-label="Período"
            value={valorSeletor}
            onChange={(e) => {
              const id = e.target.value;
              if (id === "personalizado") {
                // Só abre os campos de data; o filtro muda ao tocar em "Aplicar".
                setAbrirPersonalizado(true);
                return;
              }
              setAbrirPersonalizado(false);
              periodo.onEscolher(id);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {periodo.opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>

        {grupos.length > 0 && (
          <FiltrosSheet
            titulo="Filtros"
            ativos={ativos}
            onLimpar={limpar}
            classeBotao="shrink-0"
            rotuloConcluir="Ver vendas"
          >
            {grupos.map((g) => (
              <CampoDaFolha key={g.id} rotulo={g.rotulo}>
                <GrupoDePilulas
                  rotulo={g.rotulo}
                  opcoes={g.opcoes}
                  estaAtiva={(id) => id === g.atual}
                  onEscolher={g.onEscolher}
                />
              </CampoDaFolha>
            ))}
          </FiltrosSheet>
        )}
      </div>

      {mostrarPersonalizado && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--cz-hairline)] bg-white p-3">
          <label className="block min-w-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--cz-texto-suave)]">
            De
            <input
              type="date"
              value={de}
              max={paraInput(new Date())}
              onChange={(e) => setDe(e.target.value)}
              className="mt-1 h-11 w-full min-w-0 rounded-lg border border-[var(--cz-hairline-forte)] bg-white px-3 text-[16px] font-normal normal-case tracking-normal text-[var(--cz-texto)]"
            />
          </label>
          <label className="block min-w-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--cz-texto-suave)]">
            Até
            <input
              type="date"
              value={ate}
              max={paraInput(new Date())}
              onChange={(e) => setAte(e.target.value)}
              className="mt-1 h-11 w-full min-w-0 rounded-lg border border-[var(--cz-hairline-forte)] bg-white px-3 text-[16px] font-normal normal-case tracking-normal text-[var(--cz-texto)]"
            />
          </label>
          <button
            type="button"
            onClick={aplicar}
            disabled={!de || !ate}
            className="col-span-2 h-11 rounded-lg bg-[var(--cz-laranja)] text-[15px] font-semibold text-white transition-colors active:bg-[var(--cz-laranja-forte)] disabled:opacity-50"
          >
            Aplicar período
          </button>
        </div>
      )}
    </div>
  );
}
