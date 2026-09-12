"use client";

/**
 * A tabela de separação, no formato do CyberDock.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ESTRUTURA: UMA LINHA POR ITEM, AGRUPADA POR PACOTE
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ PACOTE 1   Envio 47968763053   1 item   1 unidade      (linha azul)  │
 *   ├──────┬──────────────────────┬──────────┬───────────┬───────┬────────┤
 *   │ Qtd. │ Produto              │ Conta /  │ Comprador │ Envio │Despach.│
 *   │  1   │ Protetor Para …      │ Cliente  │           │       │        │
 *   ├──────┼──────────────────────┤ (rowspan)│ (rowspan) │(rowsp)│(rowsp) │
 *   │  2   │ Outro item do mesmo  │          │           │       │        │
 *   └──────┴──────────────────────┴──────────┴───────────┴───────┴────────┘
 *
 * O `rowspan` nas quatro colunas da direita é o ponto do desenho: conta,
 * comprador, modalidade e prazo são do PACOTE, não do item. Repetir o mesmo
 * comprador em três linhas seguidas faz o olho ler três pedidos onde há um, e é
 * exatamente o erro que faz alguém imprimir três etiquetas.
 *
 * A linha azul de cabeçalho existe porque o `rowspan` sozinho não separa um pacote
 * do seguinte quando os dois têm um item só — a tabela viraria uma lista plana em
 * que nada diz onde termina uma caixa e começa a outra.
 *
 * `table-fixed` com larguras declaradas: sem isso um título longo empurra as
 * outras colunas e a tabela "dança" a cada página.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { inteiro } from "../comum/formato";
import { LogoCanal } from "../comum/logos";
import { IconeAbrirFora, IconeCamadas, IconeCaixa } from "../comum/icones";
import { PastilhaModalidade } from "./modalidade";
import BotaoEtiqueta from "./BotaoEtiqueta";
import {
  CANAL_ROTULO,
  URGENCIA_BARRA,
  type ItemPacote,
  type PacoteExpedicao,
} from "@/lib/expedicao";
import { statusEnvio } from "@/lib/expedicao-status";

/* -------------------------------------------------------------------------- */
/*                          Datas, como no CyberDock                          */
/* -------------------------------------------------------------------------- */

/** "12/09/2026". Fuso de São Paulo, porque o prazo é um instante UTC no banco. */
function dataLonga(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * "Hoje", "Amanhã", "Ontem" ou o dia da semana.
 *
 * Data absoluta obriga a fazer a conta de cabeça para saber se ainda dá tempo, e
 * é essa conta que decide o que sai primeiro. Portado do `relativeDay` do
 * CyberDock, com o fuso de São Paulo em vez do fuso do navegador — senão um
 * notebook configurado em outro fuso mostraria "Amanhã" no que vence hoje.
 */
function diaRelativo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";

  const emSP = (data: Date) =>
    data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const alvo = emSP(d);
  const hoje = emSP(new Date());
  const diff = Math.round(
    (new Date(`${alvo}T00:00:00`).getTime() - new Date(`${hoje}T00:00:00`).getTime()) /
      86_400_000,
  );

  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";

  const semana = d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  });
  return semana.charAt(0).toLocaleUpperCase("pt-BR") + semana.slice(1);
}

/* -------------------------------------------------------------------------- */
/*                          Copiar o ID da venda                              */
/* -------------------------------------------------------------------------- */

/**
 * Botão que copia o número do pedido.
 *
 * Existe porque o ID da venda é o que se cola no painel do marketplace para
 * conferir um caso, e ninguém digita 13 dígitos sem errar. O "copiado" aparece por
 * 1,5s: sem confirmação nenhuma, a pessoa clica de novo achando que não pegou.
 */
function BotaoCopiarId({ id }: { id: string }) {
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiado(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Área de transferência bloqueada pelo navegador (contexto sem HTTPS, por
      // exemplo). Silencioso de propósito: não há nada que a pessoa possa fazer, e
      // um alerta a cada clique seria pior que o silêncio.
    }
  }, [id]);

  return (
    <button
      type="button"
      onClick={copiar}
      title={`Copiar ID da venda: ${id}`}
      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 font-mono text-[11.5px] text-[var(--cz-texto-suave)] transition-colors hover:border-[var(--cz-hairline)] hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-texto)]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3 shrink-0 opacity-70"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      <span className="truncate">{id}</span>
      {copiado && (
        <span className="shrink-0 font-sans text-[10px] font-bold uppercase tracking-[0.03em] text-[#16a34a]">
          copiado
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Chips                                     */
/* -------------------------------------------------------------------------- */

const CHIP =
  "inline-block max-w-[220px] truncate rounded-[5px] border px-1.5 py-[1px] text-[11.5px] font-semibold leading-[1.5]";

/* -------------------------------------------------------------------------- */
/*                              Linha de item                                 */
/* -------------------------------------------------------------------------- */

function LinhaItem({
  pacote,
  item,
  primeiro,
  quantosItens,
}: {
  pacote: PacoteExpedicao;
  item: ItemPacote;
  primeiro: boolean;
  quantosItens: number;
}) {
  const estado = statusEnvio(pacote.canal, pacote.shippingStatus, pacote.status);
  const prazo = pacote.prazoDespacho;
  const atrasado = pacote.urgencia === "atrasado";

  // Casca do chip de situação, com as mesmas três cores do CyberDock
  // (`chip--status-pending / done / cancelled`).
  const cascaEstado =
    estado.tom === "bom"
      ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
      : estado.tom === "critico"
        ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
        : "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]";

  return (
    <tr className="border-b border-[#f3f4f6] hover:bg-[#fff7ed]">
      {/* Qtd. */}
      <td className="px-3.5 py-2.5 text-center align-middle">
        <span
          className={`inline-flex h-[26px] min-w-[30px] items-center justify-center rounded-lg border px-1.5 text-[13px] font-bold tabular-nums ${
            item.quantidade > 1
              ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
              : "border-[#e2e8f0] bg-[#f1f5f9] text-[#334155]"
          }`}
        >
          {item.quantidade}
        </span>
      </td>

      {/* Produto */}
      <td className="px-3.5 py-2.5 align-middle">
        <div className="flex min-w-0 items-start gap-2">
          {/* O quadradinho de ORIGEM da descrição. No CyberDock ele diz se o texto
              vem do cadastro interno ou do título do anúncio. Aqui a descrição vem
              sempre do anúncio (o cadastro de SKU do CONTAZOOM guarda categoria, não
              descrição), então o selo mostra o canal — e continua respondendo a
              mesma pergunta: "de onde saiu este texto". */}
          <span
            className="mt-[1px] grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-[#fef3c7] bg-[#fffbeb]"
            title={`${item.titulo} (título do anúncio na ${CANAL_ROTULO[pacote.canal]})`}
          >
            <LogoCanal canal={pacote.canal} />
          </span>

          <div className="min-w-0 flex-1">
            {item.permalink ? (
              <a
                href={item.permalink}
                target="_blank"
                rel="noreferrer"
                title={`Abrir "${item.titulo}" na ${CANAL_ROTULO[pacote.canal]}`}
                className="flex min-w-0 items-center gap-1 font-semibold leading-[1.25] text-[var(--cz-texto)] transition-colors hover:text-[var(--cz-laranja-forte)]"
              >
                <span className="truncate">{item.titulo}</span>
                <IconeAbrirFora className="h-3 w-3 shrink-0 opacity-60" />
              </a>
            ) : (
              <div
                className="truncate font-semibold leading-[1.25] text-[var(--cz-texto)]"
                title={item.titulo}
              >
                {item.titulo}
              </div>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`${CHIP} border-[#e2e8f0] bg-[#f8fafc] font-mono text-[#475569]`}
                title={`SKU: ${item.sku ?? "—"}`}
              >
                {item.sku ?? "—"}
              </span>

              {/* A "variação" do CyberDock traz o atributo escolhido ("Cor: Preto").
                  O CONTAZOOM guarda o ID da variação, não os atributos, então este
                  slot leva a CATEGORIA do cadastro de SKU — que é a informação que
                  ele tem e que serve à separação. */}
              {item.hierarquia1 && (
                <span
                  className={`${CHIP} border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]`}
                  title="Categoria do cadastro de SKU"
                >
                  <IconeCamadas className="mr-1 inline h-3 w-3 align-[-2px]" />
                  {item.hierarquia1}
                </span>
              )}

              <span className={`${CHIP} ${cascaEstado}`} title={estado.explicacao ?? undefined}>
                {estado.rotulo}
              </span>
            </div>
          </div>
        </div>
      </td>

      {/* As quatro colunas do PACOTE. Só na primeira linha, com `rowSpan`. */}
      {primeiro && (
        <>
          <td
            rowSpan={quantosItens}
            className="border-l border-[#e2e8f0] bg-[#fcfcfd] px-3.5 py-2.5 align-top"
          >
            <div className="truncate font-semibold text-[var(--cz-texto)]" title={pacote.conta}>
              {pacote.conta}
            </div>
            <div className="truncate text-[11.5px] text-[var(--cz-texto-suave)]">
              {CANAL_ROTULO[pacote.canal]}
            </div>
          </td>

          <td
            rowSpan={quantosItens}
            className="border-l border-[#e2e8f0] bg-[#fcfcfd] px-3.5 py-2.5 align-top"
          >
            <div
              className="truncate font-semibold text-[var(--cz-texto)]"
              title={pacote.comprador}
            >
              {pacote.comprador || "—"}
            </div>
            {/* Só aparece quando o pacote junta mais de uma venda. É o que explica
                por que a contagem de pacotes é menor que a de pedidos — sem isso, a
                diferença parece defeito. */}
            {pacote.pedidos > 1 && (
              <div className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--cz-laranja-forte)]">
                <IconeCaixa className="h-3 w-3" />
                {pacote.pedidos} pedidos juntos
              </div>
            )}
          </td>

          <td
            rowSpan={quantosItens}
            className="border-l border-[#e2e8f0] bg-[#fcfcfd] px-3.5 py-2.5 align-top"
          >
            <PastilhaModalidade modalidade={pacote.modalidade} />
          </td>

          <td
            rowSpan={quantosItens}
            className="border-l border-[#e2e8f0] bg-[#fcfcfd] px-3.5 py-2.5 align-top"
          >
            <div
              className={`whitespace-nowrap font-bold ${
                atrasado ? "text-[#dc2626]" : "text-[#b45309]"
              }`}
            >
              {dataLonga(prazo)}
              <span className="ml-1.5 text-[11.5px] font-medium text-[var(--cz-texto-suave)]">
                {diaRelativo(prazo)}
              </span>
            </div>

            {pacote.itens.map((i) => (
              <BotaoCopiarId key={i.orderId} id={i.orderId} />
            ))}

            {/* A etiqueta. Não existe na tela de separação do CyberDock (lá ela vive
                na tabela de vendas), mas existe aqui e é o passo seguinte imediato
                da fila — tirar seria fazer a pessoa trocar de tela para imprimir o
                que acabou de separar. Só Mercado Livre: a Shopee não expõe a
                etiqueta pelos endpoints que este projeto usa. */}
            {pacote.canal === "ML" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <BotaoEtiqueta
                  shippingId={pacote.shippingId}
                  contaId={pacote.accountId}
                  tipo="pdf"
                />
                <BotaoEtiqueta
                  shippingId={pacote.shippingId}
                  contaId={pacote.accountId}
                  tipo="zpl"
                />
              </div>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Tabela                                    */
/* -------------------------------------------------------------------------- */

export default function TabelaSeparacao({
  pacotes,
  /** Índice do primeiro pacote da página, para a numeração continuar entre páginas. */
  offset,
  selecionados,
  onAlternarSelecao,
  elegiveis,
}: {
  pacotes: PacoteExpedicao[];
  offset: number;
  selecionados: Set<string>;
  onAlternarSelecao: (chave: string) => void;
  /** Chaves que podem ir para a impressão em lote. */
  elegiveis: Set<string>;
}) {
  return (
    // `overflow-x-auto` só. Sem altura máxima: quem rola na vertical é a página,
    // e não uma caixa dentro dela.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-[13.5px]">
        <colgroup>
          <col className="w-[64px]" />
          <col />
          <col className="w-[168px]" />
          <col className="w-[188px]" />
          <col className="w-[150px]" />
          <col className="w-[212px]" />
        </colgroup>

        <thead>
          <tr className="border-b border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
            <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-center">
              Qtd.
            </th>
            <th scope="col" className="whitespace-nowrap px-3.5 py-2.5">
              Produto
            </th>
            <th scope="col" className="whitespace-nowrap px-3.5 py-2.5">
              Conta / Cliente
            </th>
            <th scope="col" className="whitespace-nowrap px-3.5 py-2.5">
              Comprador
            </th>
            <th scope="col" className="whitespace-nowrap px-3.5 py-2.5">
              Envio
            </th>
            <th scope="col" className="whitespace-nowrap px-3.5 py-2.5">
              Despachar
            </th>
          </tr>
        </thead>

        <tbody>
          {pacotes.map((pacote, indice) => {
            const podeLote = elegiveis.has(pacote.chave);
            const marcado = selecionados.has(pacote.chave);

            return (
              // `Fragment` com `key` explícito, e não `<>`: a forma curta não
              // aceita `key`, e sem ela o React remontaria as linhas do pacote a
              // cada repaginação — perdendo o "copiado" e o foco.
              <Fragment key={pacote.chave}>
                {/* Cabeçalho do pacote. A barra de URGÊNCIA é uma borda esquerda de
                    4px nesta linha: é o que dá à fila a leitura de um metro de
                    distância, e some no CyberDock porque lá a urgência não é um
                    conceito da tela. */}
                <tr
                  className={`border-l-4 border-y border-[var(--cz-laranja-borda)] ${
                    URGENCIA_BARRA[pacote.urgencia]
                  } ${marcado ? "bg-[var(--cz-laranja-suave)]" : "bg-[#fff8f3]"}`}
                >
                  <td colSpan={6} className="px-3.5 py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-[var(--cz-texto-suave)]">
                      {podeLote ? (
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => onAlternarSelecao(pacote.chave)}
                          aria-label={`Selecionar o pacote ${offset + indice + 1}`}
                          className="size-4 shrink-0 accent-[var(--cz-laranja)]"
                        />
                      ) : (
                        <span
                          className="size-4 shrink-0"
                          title="Este pacote não entra na impressão em lote: a etiqueta não sai por aqui."
                        />
                      )}

                      <span className="text-[12.5px] font-extrabold uppercase tracking-[0.03em] text-[var(--cz-laranja-forte)]">
                        Pacote {offset + indice + 1}
                      </span>

                      <span className="rounded-full border border-[var(--cz-laranja-borda)] bg-[var(--cz-superficie)] px-2 py-[1px] font-mono font-bold text-[var(--cz-laranja-forte)]">
                        {pacote.shippingId
                          ? `Envio ${pacote.shippingId}`
                          : `Pedido ${pacote.itens[0]?.orderId ?? "—"}`}
                      </span>

                      <span>
                        {inteiro(pacote.itens.length)}{" "}
                        {pacote.itens.length === 1 ? "item" : "itens"}
                      </span>
                      <span>
                        {inteiro(pacote.unidades)}{" "}
                        {pacote.unidades === 1 ? "unidade" : "unidades"}
                      </span>
                    </div>
                  </td>
                </tr>

                {pacote.itens.map((item, i) => (
                  <LinhaItem
                    key={`${pacote.chave}-${item.orderId}-${item.sku ?? i}`}
                    pacote={pacote}
                    item={item}
                    primeiro={i === 0}
                    quantosItens={pacote.itens.length}
                  />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
