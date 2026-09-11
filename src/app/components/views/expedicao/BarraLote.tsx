"use client";

/**
 * A barra de ações em lote da fila de expedição.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ELA RESOLVE
 *
 * Antes só existia o botão de etiqueta por linha. Despachar trinta pacotes eram
 * trinta cliques, trinta abas e trinta impressões separadas — e o operador
 * perdendo a conta de qual já saiu. O endpoint `shipment_labels` do Mercado Livre
 * aceita vários `shipment_ids` numa chamada e devolve UM arquivo com todas as
 * etiquetas, que é exatamente o que a impressora do galpão quer receber.
 *
 * AGRUPA POR CONTA, E ISSO NÃO É DETALHE
 *
 * A etiqueta sai autenticada com o token DA CONTA. Um lote com pacotes de duas
 * contas não é uma requisição, são duas — e quem seleciona não tem como saber
 * disso. Então a barra agrupa sozinha e diz quantos arquivos vão sair, em vez de
 * recusar a seleção ou abrir abas sem explicar.
 *
 * O MERCADO LIVRE RECUSA O LOTE INTEIRO se qualquer envio não estiver pronto
 * (NF-e pendente, envio em preparação). A mensagem de erro da rota já diz quantos
 * falharam justamente para o caminho ser "desmarque os culpados e imprima o
 * resto" em vez de "não funciona".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { inteiro } from "../comum/formato";
import {
  IconeAlerta,
  IconeAtualizar,
  IconeBaixar,
  IconeDocumento,
} from "../comum/icones";

/** Um pacote elegível para lote: o que a barra precisa saber dele. */
export type PacoteLote = {
  chave: string;
  shippingId: string;
  accountId: string;
};

const MS_ERRO = 10_000;
const MS_REVOKE = 60_000;

const BOTAO =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2.5 text-[12px] font-semibold text-[var(--cz-texto)] transition-colors hover:border-[var(--cz-laranja-borda)] hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:opacity-40";

const TEXTO =
  "text-[12px] font-semibold text-[var(--cz-texto-suave)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--cz-laranja-forte)] disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40";

export default function BarraLote({
  /** Todos os pacotes da página que podem ir para lote. */
  elegiveis,
  selecionados,
  onSelecionar,
  /** Total de pacotes na página, inclusive os não elegíveis. */
  totalNaPagina,
  /** Total do recorte inteiro, para o "mostrando X de Y". */
  totalGeral,
  rotuloTotal = "pacotes",
  atualizando = false,
}: {
  elegiveis: PacoteLote[];
  selecionados: Set<string>;
  onSelecionar: (chaves: Set<string>) => void;
  totalNaPagina: number;
  totalGeral: number;
  rotuloTotal?: string;
  atualizando?: boolean;
}) {
  const [imprimindo, setImprimindo] = useState<"pdf" | "zpl" | null>(null);
  const [erro, setErro] = useState<string>("");

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const atuais = timers.current;
    return () => {
      for (const t of atuais) clearTimeout(t);
    };
  }, []);
  const agendar = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const escolhidos = elegiveis.filter((p) => selecionados.has(p.chave));
  const quantos = escolhidos.length;

  const imprimir = useCallback(
    async (tipo: "pdf" | "zpl") => {
      if (quantos === 0 || imprimindo) return;

      setImprimindo(tipo);
      setErro("");

      // Agrupa por conta: o token da etiqueta é da conta, então um lote com duas
      // contas é obrigatoriamente uma requisição por conta.
      const porConta = new Map<string, string[]>();
      for (const p of escolhidos) {
        const lista = porConta.get(p.accountId);
        if (lista) lista.push(p.shippingId);
        else porConta.set(p.accountId, [p.shippingId]);
      }

      const falhas: string[] = [];

      for (const [contaId, ids] of porConta) {
        try {
          const p = new URLSearchParams({
            shippingIds: ids.join(","),
            contaId,
            tipo,
          });
          const res = await fetch(`/api/expedicao/etiqueta?${p.toString()}`, {
            credentials: "include",
          });

          if (!res.ok) {
            let texto = "Não foi possível gerar as etiquetas.";
            try {
              const body = (await res.json()) as { error?: string };
              if (body.error) texto = body.error;
            } catch {
              // Resposta sem JSON: fica a mensagem genérica.
            }
            falhas.push(texto);
            continue;
          }

          const url = URL.createObjectURL(await res.blob());
          window.open(url, "_blank", "noopener,noreferrer");
          // Revoke ATRASADO: a aba nova ainda está abrindo quando esta linha
          // executa, e revogar na hora deixaria o operador com uma aba em branco.
          agendar(() => URL.revokeObjectURL(url), MS_REVOKE);
        } catch {
          falhas.push("Falha de conexão ao pedir as etiquetas. Tente de novo.");
        }
      }

      setImprimindo(null);

      if (falhas.length > 0) {
        setErro(falhas.join(" "));
        agendar(() => setErro(""), MS_ERRO);
      }
    },
    [agendar, escolhidos, imprimindo, quantos],
  );

  const todosMarcados = elegiveis.length > 0 && quantos === elegiveis.length;

  return (
    <div className="border-b border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12.5px] text-[var(--cz-texto-suave)]">
          Mostrando{" "}
          <strong className="text-[var(--cz-texto)]">{inteiro(totalNaPagina)}</strong> de{" "}
          <strong className="text-[var(--cz-texto)]">{inteiro(totalGeral)}</strong>{" "}
          {rotuloTotal}
        </span>

        {atualizando && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--cz-laranja-forte)]">
            <IconeAtualizar className="h-3.5 w-3.5 animate-spin" />
            atualizando…
          </span>
        )}

        {elegiveis.length > 0 && (
          <>
            <span className="text-[var(--cz-hairline-forte)]">|</span>

            <button
              type="button"
              onClick={() => onSelecionar(new Set(elegiveis.map((p) => p.chave)))}
              disabled={todosMarcados || imprimindo !== null}
              className={TEXTO}
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={() => onSelecionar(new Set())}
              disabled={quantos === 0 || imprimindo !== null}
              className={TEXTO}
            >
              Desmarcar
            </button>
          </>
        )}

        {quantos > 0 && (
          <>
            <span className="text-[var(--cz-hairline-forte)]">|</span>
            <span className="text-[12.5px] font-bold tabular-nums text-[var(--cz-laranja-forte)]">
              {inteiro(quantos)} selecionado(s)
            </span>

            <button
              type="button"
              onClick={() => imprimir("pdf")}
              disabled={imprimindo !== null}
              title="Abrir um PDF único com as etiquetas selecionadas"
              className={BOTAO}
            >
              {imprimindo === "pdf" ? (
                <IconeAtualizar className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <IconeDocumento className="h-3.5 w-3.5" />
              )}
              {imprimindo === "pdf" ? "Gerando…" : "Imprimir PDF"}
            </button>

            <button
              type="button"
              onClick={() => imprimir("zpl")}
              disabled={imprimindo !== null}
              title="Baixar o ZPL das etiquetas selecionadas, para impressora térmica"
              className={BOTAO}
            >
              {imprimindo === "zpl" ? (
                <IconeAtualizar className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <IconeBaixar className="h-3.5 w-3.5" />
              )}
              {imprimindo === "zpl" ? "Gerando…" : "Imprimir ZPL"}
            </button>

            {/* A contagem de ARQUIVOS aparece quando a seleção cruza contas. Sem
                isso, o operador que selecionou pacotes de duas contas veria duas
                abas abrindo e pensaria que clicou duas vezes. */}
            {new Set(escolhidos.map((p) => p.accountId)).size > 1 && (
              <span className="text-[11.5px] text-[var(--cz-texto-suave)]">
                {new Set(escolhidos.map((p) => p.accountId)).size} arquivos, um por
                conta — a etiqueta sai autenticada na conta que vendeu.
              </span>
            )}
          </>
        )}
      </div>

      {/*
        O erro aparece por extenso, e não como borda vermelha.
        O motivo quase nunca é do sistema: é "emita a NF-e", "o envio ainda está em
        preparação". É instrução, e o Mercado Livre recusa o lote INTEIRO quando um
        envio falha — então a frase precisa dizer quantos falharam para o caminho
        ser desmarcar os culpados, e não concluir que a impressão em lote não serve.
      */}
      {erro && (
        <p
          role="status"
          className="mt-2 flex items-start gap-2 rounded-[var(--cz-raio)] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] leading-relaxed text-rose-800"
        >
          <IconeAlerta className="mt-0.5 h-4 w-4 shrink-0" />
          {erro}
        </p>
      )}
    </div>
  );
}
