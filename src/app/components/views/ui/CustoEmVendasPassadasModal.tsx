"use client";

import { FormEvent, useEffect, useState } from "react";
import Modal from "./Modal";
import { useToast } from "./toaster";
import type { SKU } from "./TabelaGestaoSKU";

/**
 * "Usar custo em vendas passadas" (Gestão SKU).
 *
 * Cada venda usa o custo que valia na data dela, então corrigir um custo errado
 * só vale dali pra frente. Aqui o cliente usa um custo também no passado:
 * - em todas as vendas, desde o início;
 * - nas vendas de um período;
 * - ou só nas vendas que ainda estão sem custo (o preenchimento de antes).
 *
 * Antes de aplicar mostra quantas vendas entram e o CMV antes e depois. Não muda
 * o custo atual do SKU nem as vendas de hoje em diante.
 */

type Escopo = "tudo" | "periodo" | "sem_custo";

type Simulacao = {
  vendas: number;
  mudam: number;
  cmvAtual: number;
  cmvNovo: number;
};

export type AberturaCustoNoPassado = {
  sku: SKU;
  /** Custo que o campo já traz preenchido (o custo atual, se não vier). */
  custoSugerido?: number;
  /** Aberto logo depois de mudar o custo do SKU. */
  depoisDeAlterar?: boolean;
};

interface Props {
  abertura: AberturaCustoNoPassado | null;
  onClose: () => void;
  /** Chamado depois de aplicar, para recarregar a lista. */
  onAplicado?: () => void;
}

const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

const inteiro = (valor: number) => valor.toLocaleString("pt-BR");

/** "15,50" ou "1.234,5" → número; vazio ou inválido → NaN. */
function lerDecimal(texto: string): number {
  const limpo = texto.trim().replace(/[^\d,.]/g, "");
  if (!limpo) return Number.NaN;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  return Number(normalizado);
}

const paraCampo = (valor: number) => (valor > 0 ? valor.toFixed(2).replace(".", ",") : "");

/** "AAAA-MM-DD" de hoje em São Paulo, o formato do `<input type="date">`. */
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const vendasTexto = (n: number) => (n === 1 ? "1 venda" : `${inteiro(n)} vendas`);

const OPCOES: Array<{ valor: Escopo; rotulo: string; detalhe: string }> = [
  {
    valor: "tudo",
    rotulo: "Todas as vendas, desde o início",
    detalhe: "Troca o CMV de todo o histórico deste SKU.",
  },
  {
    valor: "periodo",
    rotulo: "Vendas de um período",
    detalhe: "Só as vendas entre as datas que você escolher.",
  },
  {
    valor: "sem_custo",
    rotulo: "Só as vendas que estão sem custo",
    detalhe: "Usa o custo atual e não mexe nas vendas que já têm custo.",
  },
];

export default function CustoEmVendasPassadasModal({ abertura, onClose, onAplicado }: Props) {
  const { toast } = useToast();
  // Guarda a última abertura: o Modal leva 350ms para sair, e sem isto o conteúdo
  // sumiria no instante em que o pai zera `abertura`.
  const [ultima, setUltima] = useState<AberturaCustoNoPassado | null>(null);
  const [escopo, setEscopo] = useState<Escopo>("tudo");
  const [valor, setValor] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const atual = abertura ?? ultima;
  const sku = atual?.sku ?? null;
  const custoAtual = sku ? Number(sku.custoUnitario) || 0 : 0;
  const hoje = hojeSP();

  useEffect(() => {
    if (!abertura) return;
    setUltima(abertura);
    setEscopo("tudo");
    setValor(paraCampo(abertura.custoSugerido ?? (Number(abertura.sku.custoUnitario) || 0)));
    setDe("");
    setAte(hojeSP());
    setSimulacao(null);
    setErroSimulacao(null);
    setErro(null);
  }, [abertura]);

  const custo = lerDecimal(valor);
  const custoValido = Number.isFinite(custo) && custo > 0;
  const periodoCompleto = Boolean(de && ate);
  const periodoInvertido = periodoCompleto && de > ate;
  const periodoNoFuturo = Boolean(ate) && ate > hoje;
  const periodoValido = periodoCompleto && !periodoInvertido && !periodoNoFuturo;
  const podeSimular =
    !!sku && escopo !== "sem_custo" && custoValido && (escopo === "tudo" || periodoValido);

  // Impacto (sem gravar), recalculado quando o custo ou o período mudam.
  useEffect(() => {
    if (!abertura || !podeSimular || !sku) {
      setSimulacao(null);
      setSimulando(false);
      setErroSimulacao(null);
      return;
    }
    const controle = new AbortController();
    setSimulando(true);
    setErroSimulacao(null);
    const espera = window.setTimeout(async () => {
      try {
        const resposta = await fetch(`/api/sku/${sku.id}/custo-no-periodo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ escopo, custo, de, ate, simular: true }),
          signal: controle.signal,
        });
        const corpo = await resposta.json().catch(() => null);
        if (!resposta.ok) throw new Error(corpo?.error || "Não foi possível calcular o impacto.");
        setSimulacao(corpo.simulacao as Simulacao);
      } catch (e) {
        if (controle.signal.aborted) return;
        setSimulacao(null);
        setErroSimulacao(e instanceof Error ? e.message : "Não foi possível calcular o impacto.");
      } finally {
        if (!controle.signal.aborted) setSimulando(false);
      }
    }, 350);
    return () => {
      controle.abort();
      window.clearTimeout(espera);
    };
  }, [abertura, podeSimular, sku, escopo, custo, de, ate]);

  const fechar = () => {
    if (!aplicando) onClose();
  };

  const podeAplicar =
    !!sku &&
    !aplicando &&
    (escopo === "sem_custo" ? custoAtual > 0 : podeSimular && !!simulacao && !simulando);

  async function aplicar(evento: FormEvent) {
    evento.preventDefault();
    if (!sku || !podeAplicar) return;
    setAplicando(true);
    setErro(null);
    try {
      const resposta =
        escopo === "sem_custo"
          ? await fetch(`/api/sku/${sku.id}/aplicar-custo-retroativo`, { method: "POST" })
          : await fetch(`/api/sku/${sku.id}/custo-no-periodo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ escopo, custo, de, ate }),
            });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(corpo?.error || "Não foi possível usar o custo nas vendas.");

      // As duas rotas devolvem quantas vendas foram regravadas em `vendasAtualizadas`.
      const total = Number(corpo?.vendasAtualizadas) || 0;
      toast({
        variant: "success",
        title: "Custo aplicado nas vendas passadas",
        description:
          escopo === "sem_custo"
            ? `${sku.sku}: ${vendasTexto(total)} sem custo agora usam ${moeda(custoAtual)}.`
            : `${sku.sku}: ${moeda(custo)} usado em ${vendasTexto(total)}.`,
      });
      onAplicado?.();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível usar o custo nas vendas.");
    } finally {
      setAplicando(false);
    }
  }

  const rotuloBotao = aplicando
    ? "Aplicando…"
    : escopo === "sem_custo"
      ? "Preencher vendas sem custo"
      : simulacao && simulacao.vendas > 0
        ? `Usar em ${vendasTexto(simulacao.vendas)}`
        : "Usar custo";

  const campoData =
    "mt-1 h-11 w-full min-w-0 rounded-lg border border-[var(--cz-hairline-forte)] bg-white px-3 text-[16px] font-normal text-[var(--cz-texto)] focus:border-[var(--cz-laranja)] focus:outline-none focus:ring-2 focus:ring-[var(--cz-laranja-suave)]";

  return (
    <Modal isOpen={!!abertura} onClose={fechar} title="Usar custo em vendas passadas" size="lg">
      {sku && (
        <form onSubmit={aplicar} noValidate className="space-y-5">
          <div className="rounded-[var(--cz-raio)] bg-[var(--cz-fundo)] p-3">
            <p className="break-all font-mono text-sm font-bold text-[var(--cz-texto)]">{sku.sku}</p>
            <p className="mt-1 text-sm leading-snug text-[var(--cz-texto-suave)]">{sku.produto}</p>
          </div>

          <p className="text-sm leading-relaxed text-[var(--cz-texto-suave)]">
            {atual?.depoisDeAlterar ? (
              <>
                Custo atualizado para <strong className="text-[var(--cz-texto)]">{moeda(custoAtual)}</strong>. As vendas
                já feitas continuam com o custo que valia na data delas. Se o custo antigo estava errado, use o novo
                também nelas.
              </>
            ) : (
              <>
                Cada venda usa o custo que valia na data dela. Aqui você usa um custo também nas vendas que já
                aconteceram, por exemplo quando o primeiro custo foi cadastrado errado.
              </>
            )}
          </p>

          <fieldset>
            <legend className="text-sm font-semibold text-[var(--cz-texto)]">Em quais vendas?</legend>
            <div className="mt-2 space-y-2">
              {OPCOES.map((opcao) => {
                const semCustoIndisponivel = opcao.valor === "sem_custo" && custoAtual <= 0;
                const marcado = escopo === opcao.valor;
                return (
                  <label
                    key={opcao.valor}
                    className={`flex cursor-pointer items-start gap-3 rounded-[var(--cz-raio)] border p-3 transition-colors ${
                      marcado
                        ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)]"
                        : "border-[var(--cz-hairline-forte)] bg-white hover:bg-[var(--cz-fundo)]"
                    } ${semCustoIndisponivel ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="radio"
                      name="cz-escopo-custo"
                      value={opcao.valor}
                      checked={marcado}
                      disabled={aplicando || semCustoIndisponivel}
                      onChange={() => {
                        setEscopo(opcao.valor);
                        setErro(null);
                      }}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--cz-laranja)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--cz-texto)]">{opcao.rotulo}</span>
                      <span className="mt-0.5 block text-sm text-[var(--cz-texto-suave)]">
                        {opcao.valor === "sem_custo"
                          ? custoAtual > 0
                            ? `Usa o custo atual (${moeda(custoAtual)}) e não mexe nas vendas que já têm custo.`
                            : "Cadastre um custo no SKU para usar esta opção."
                          : opcao.detalhe}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {escopo === "periodo" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0 text-sm font-semibold text-[var(--cz-texto)]">
                De
                <input
                  type="date"
                  value={de}
                  max={ate || hoje}
                  onChange={(e) => setDe(e.target.value)}
                  disabled={aplicando}
                  aria-describedby="cz-periodo-ajuda"
                  className={campoData}
                />
              </label>
              <label className="block min-w-0 text-sm font-semibold text-[var(--cz-texto)]">
                Até
                <input
                  type="date"
                  value={ate}
                  min={de || undefined}
                  max={hoje}
                  onChange={(e) => setAte(e.target.value)}
                  disabled={aplicando}
                  aria-describedby="cz-periodo-ajuda"
                  className={campoData}
                />
              </label>
              <p id="cz-periodo-ajuda" className="col-span-2 text-sm text-[var(--cz-texto-suave)]">
                {periodoInvertido
                  ? "A data inicial está depois da final."
                  : periodoNoFuturo
                    ? "O período não pode terminar depois de hoje."
                    : "Datas de venda, no horário de Brasília. Os dois dias entram."}
              </p>
            </div>
          )}

          {escopo !== "sem_custo" && (
            <div>
              <label htmlFor="cz-custo-passado" className="block text-sm font-semibold text-[var(--cz-texto)]">
                Custo a usar nessas vendas
              </label>
              <div className="relative mt-2">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-[var(--cz-texto-suave)]"
                >
                  R$
                </span>
                {/* Tamanho em `style`: o CSS global de `input[type=text]` vence as utilitárias. */}
                <input
                  id="cz-custo-passado"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={valor}
                  onChange={(e) => {
                    setValor(e.target.value);
                    setErro(null);
                  }}
                  placeholder="0,00"
                  disabled={aplicando}
                  aria-invalid={valor.trim() !== "" && !custoValido}
                  aria-describedby="cz-custo-passado-ajuda"
                  className="w-full rounded-xl border border-[var(--cz-hairline-forte)] bg-white font-semibold tabular-nums text-[var(--cz-texto)] outline-none focus:border-[var(--cz-laranja)] focus:ring-2 focus:ring-[var(--cz-laranja-suave)]"
                  style={{ height: "3rem", paddingLeft: "2.75rem", paddingRight: "1rem", fontSize: "1.125rem" }}
                />
              </div>
              <p id="cz-custo-passado-ajuda" className="mt-2 text-sm text-[var(--cz-texto-suave)]">
                {valor.trim() !== "" && !custoValido
                  ? "Informe um custo maior que zero."
                  : `Não muda o custo atual do SKU${custoAtual > 0 ? ` (${moeda(custoAtual)})` : ""} nem as vendas de hoje em diante.`}
              </p>
            </div>
          )}

          {escopo !== "sem_custo" && (
            <div
              aria-live="polite"
              className="rounded-[var(--cz-raio)] border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] p-3 text-sm"
            >
              {!podeSimular ? (
                <p className="text-[var(--cz-texto-suave)]">
                  {escopo === "periodo" && !periodoCompleto
                    ? "Escolha as datas para ver quantas vendas entram."
                    : "Informe o custo para ver quantas vendas entram."}
                </p>
              ) : simulando ? (
                <p className="text-[var(--cz-texto-suave)]">Calculando quantas vendas entram…</p>
              ) : erroSimulacao ? (
                <p className="font-medium text-rose-700">{erroSimulacao}</p>
              ) : simulacao && simulacao.vendas === 0 ? (
                <p className="text-[var(--cz-texto-suave)]">
                  Nenhuma venda deste SKU {escopo === "tudo" ? "até hoje" : "nesse período"} por enquanto. Vendas
                  antigas que chegarem depois (de uma conta conectada agora, por exemplo) já usam este custo.
                </p>
              ) : simulacao ? (
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--cz-texto)]">
                    {vendasTexto(simulacao.vendas)} {escopo === "tudo" ? "deste SKU até hoje" : "deste SKU no período"}
                    {simulacao.mudam < simulacao.vendas && (
                      <span className="font-normal text-[var(--cz-texto-suave)]">
                        {" "}
                        · {simulacao.mudam === 1 ? "1 muda" : `${inteiro(simulacao.mudam)} mudam`} de custo
                      </span>
                    )}
                  </p>
                  <p className="text-[var(--cz-texto-suave)]">
                    CMV dessas vendas: <span className="tabular-nums">{moeda(simulacao.cmvAtual)}</span> hoje, passa a{" "}
                    <strong className="tabular-nums text-[var(--cz-texto)]">{moeda(simulacao.cmvNovo)}</strong>.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {erro && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 max-md:flex-col-reverse">
            <button
              type="button"
              onClick={fechar}
              disabled={aplicando}
              className="min-h-11 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-white px-4 text-sm font-semibold text-[var(--cz-texto)] transition-colors hover:bg-[var(--cz-fundo)] disabled:opacity-60 max-md:h-12 max-md:text-base"
            >
              {atual?.depoisDeAlterar ? "Agora não" : "Cancelar"}
            </button>
            <button
              type="submit"
              disabled={!podeAplicar}
              className="min-h-11 rounded-[var(--cz-raio)] bg-[var(--cz-laranja)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cz-laranja-forte)] disabled:opacity-50 max-md:h-12 max-md:text-base"
            >
              {rotuloBotao}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
