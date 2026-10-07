"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShoppingBag,
} from "lucide-react";
import { PlataformaBadge } from "@/components/ui/PlataformaBadge";
import { isStatusCancelado, isStatusPago } from "@/lib/vendasStatus";
import type { ProcessedVenda, Venda } from "./VendasTable";

/**
 * Vendas como LISTA DE CARTÕES, para o celular.
 *
 * A tabela de vendas tem 7 colunas agrupadas (~990px de largura mínima). Em 390px
 * ela só existe como rolagem horizontal, e numa tela cujo trabalho é varrer
 * vendas isso esconde justamente o valor e a margem, que ficam nas últimas
 * colunas. O cartão escolhe os dados que respondem "o que foi vendido, onde, por
 * quanto e deu lucro?". O detalhamento por clique está temporariamente suspenso,
 * então o cartão é informativo e não abre outra aba.
 */

type SituacaoSku = { cadastrado: boolean; situacao?: string };

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (v: unknown) =>
  moeda.format(typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Selo de status. Vem do texto bruto porque cada canal grava o seu vocabulário. */
function selo(venda: Venda): { texto: string; classe: string } {
  const bruto = String(venda.status ?? "");
  const s = bruto.toLowerCase();
  const plataforma = venda.plataforma || venda.canal;

  if (isStatusCancelado(bruto, plataforma)) {
    return { texto: "Cancelada", classe: "border-red-200 bg-red-50 text-red-700" };
  }
  if (/devol|return|refund|reembols/.test(s)) {
    return { texto: "Devolvida", classe: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  if (/entreg|deliver|complet/.test(s)) {
    return { texto: "Entregue", classe: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  // "A enviar" vem ANTES de "Enviada": `awaiting_shipment` e `ready_to_ship`
  // contêm "ship" e cairiam no selo errado.
  if (/awaiting|ready_to_ship|aguard|pronto|handling|preparo/.test(s)) {
    return { texto: "A enviar", classe: "border-sky-200 bg-sky-50 text-sky-700" };
  }
  if (/envi|ship|transit/.test(s)) {
    return { texto: "Enviada", classe: "border-violet-200 bg-violet-50 text-violet-700" };
  }
  // `isStatusPago` conhece o vocabulário de cada canal, mas um "paid" genérico
  // que chega numa venda da Shopee ficaria sem selo próprio: o regex cobre esse caso.
  if (isStatusPago(bruto, plataforma) || /^(paid|pago|approved|aprovad|confirmed|confirmad)/.test(s)) {
    return { texto: "Paga", classe: "border-green-200 bg-green-50 text-green-700" };
  }
  return {
    texto: bruto ? bruto.charAt(0).toUpperCase() + bruto.slice(1) : "Sem status",
    classe: "border-gray-200 bg-gray-100 text-gray-700",
  };
}

/**
 * Miniatura do produto, quando a venda trouxer uma.
 *
 * Hoje nenhum dos três sincronizadores grava imagem na venda, então quase sempre
 * cai no ícone. Fica preparado para o dia em que `thumbnail` passar a vir, sem
 * mexer no cartão.
 */
function urlMiniatura(venda: Venda): string | null {
  const v = venda as unknown as Record<string, any>;
  const candidato =
    v.thumbnail ?? v.imagem ?? v.imageUrl ?? v.raw?.thumbnail ?? v.raw?.items?.[0]?.thumbnail;
  return typeof candidato === "string" && /^https?:\/\//.test(candidato) ? candidato : null;
}

const TOM: Record<"bom" | "ruim" | "neutro", string> = {
  bom: "text-emerald-600",
  ruim: "text-red-600",
  neutro: "text-[var(--cz-texto-fraco)]",
};

function Celula({
  rotulo,
  valor,
  tom,
  linha = false,
}: {
  rotulo: string;
  valor: string;
  tom: keyof typeof TOM;
  /** Rótulo à esquerda e valor à direita, em vez de um sobre o outro. */
  linha?: boolean;
}) {
  return (
    <div className={linha ? "flex min-w-0 items-baseline justify-between gap-3" : "min-w-0"}>
      <dt className="truncate text-[12px] text-[var(--cz-texto-suave)]">{rotulo}</dt>
      <dd
        className={`text-[13px] font-semibold tabular-nums ${linha ? "" : "truncate"} ${TOM[tom]}`}
        title={valor}
      >
        {valor}
      </dd>
    </div>
  );
}

function CartaoVenda({ venda, sku }: { venda: Venda; sku?: SituacaoSku }) {
  const data = new Date(venda.dataVenda);
  const dataOk = !Number.isNaN(data.getTime());
  const dia = dataOk ? data.toLocaleDateString("pt-BR") : "-";
  const hora = dataOk
    ? data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";

  const { texto, classe } = selo(venda);
  const miniatura = urlMiniatura(venda);

  // Mesma regra da tabela do desktop: no Flex do ML o frete que vale é o líquido.
  const ehShopee = venda.plataforma === "Shopee" || venda.canal === "SP" || venda.canal === "Shopee";
  const ehTiktok = venda.plataforma === "TikTok Shop" || venda.canal === "TT";
  const usaFlex =
    !ehShopee &&
    !ehTiktok &&
    (venda.logisticType?.toLowerCase() === "flex" || venda.logisticType === "self_service") &&
    venda.flexConfigApplied === true &&
    venda.freteLiquidoFlex !== undefined &&
    venda.freteLiquidoFlex !== null;
  const frete = usaFlex ? (venda.freteLiquidoFlex as number) : venda.frete;

  const taxa = venda.taxaPlataforma;
  const margem = venda.margemContribuicao;

  const valorFrete = brl(frete);
  const valorTaxa = taxa ? brl(taxa) : "—";
  const valorMargem = margem === null || margem === undefined ? "—" : brl(margem);

  // Três colunas dão ~90px a cada valor em 360px de tela. "-R$ 192.706,87" (14
  // caracteres) passa disso e viraria reticências, e um número cortado numa tela
  // de dinheiro é pior do que uma linha a mais. Com um valor assim na linha, o
  // cartão troca as colunas por três linhas (rótulo à esquerda, valor à direita).
  const valorLongo = [valorFrete, valorTaxa, valorMargem].some((v) => v.length > 11);

  return (
    <li>
      {/* Detalhes em aba Blob estão temporariamente desativados. Mantemos o
          cartão como artigo informativo, sem semântica de botão nem evento de
          clique, para não dar a entender que abrirá uma tela. */}
      <article
        className="block w-full rounded-[var(--cz-raio-cartao,12px)] border border-[var(--cz-hairline)] bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-[var(--cz-texto-fraco)]">
            {miniatura ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={miniatura} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words text-[14px] font-medium leading-[1.35] text-[var(--cz-texto)]">
              {venda.titulo}
            </p>
            {/* <div> e não <p>: o PlataformaBadge devolve um <div>, e <div> dentro de
                <p> é HTML inválido (o React acusa erro de hidratação). */}
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--cz-texto-suave)]">
              <PlataformaBadge
                plataforma={venda.canal || venda.plataforma}
                size={16}
                className="shrink-0"
              />
              <span className="min-w-0 truncate font-medium">{venda.conta ?? "Sem conta"}</span>
            </div>
            {(venda.sku || sku) && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5">
                {venda.sku && (
                  <span className="rounded border border-[var(--cz-hairline)] bg-gray-50 px-1.5 font-mono text-[12px] leading-5 text-gray-700">
                    {venda.sku}
                  </span>
                )}
                {sku && (
                  <span className="rounded border border-orange-200 bg-orange-50 px-1.5 text-[12px] font-semibold leading-5 text-orange-700">
                    {sku.cadastrado ? "SKU sem custo" : "SKU sem cadastro"}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* `flex-wrap`: em 360px o valor de 7 dígitos ("R$ 1.234.567,89", 20px
            em negrito) não cabe ao lado da data. Em vez de cortar a data, o valor
            desce para a linha de baixo, encostado à direita. */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-4 ${classe}`}
            >
              {texto}
            </span>
            <p className="mt-1 truncate text-[12px] tabular-nums text-[var(--cz-texto-suave)]">
              {dia}
              {hora && ` · ${hora}`} · {venda.quantidade}x
            </p>
          </div>
          <p className="cz-valor ml-auto shrink-0 text-[20px] font-bold leading-6 tabular-nums text-[var(--cz-texto)]">
            {brl(venda.valorTotal)}
          </p>
        </div>

        <dl
          className={
            valorLongo
              ? "mt-3 flex flex-col gap-1.5 border-t border-[var(--cz-hairline)] pt-3"
              : "mt-3 grid grid-cols-3 gap-2 border-t border-[var(--cz-hairline)] pt-3"
          }
        >
          <Celula rotulo="Frete" valor={valorFrete} tom={frete >= 0 ? "bom" : "ruim"} linha={valorLongo} />
          <Celula rotulo="Taxa" valor={valorTaxa} tom={taxa ? "ruim" : "neutro"} linha={valorLongo} />
          <Celula
            rotulo={venda.isMargemReal ? "Margem real" : "Margem"}
            valor={valorMargem}
            tom={margem === null || margem === undefined ? "neutro" : margem < 0 ? "ruim" : "bom"}
            linha={valorLongo}
          />
        </dl>
      </article>
    </li>
  );
}

export default function ListaCartoesVendas({
  vendas,
  statusDoSku,
}: {
  vendas: ProcessedVenda[];
  /** Situação do SKU na Gestão de SKU (sem custo / sem cadastro), se houver. */
  statusDoSku?: (venda: Venda) => SituacaoSku | undefined;
}) {
  return (
    <ul
      aria-label="Lista de vendas"
      className="flex flex-col gap-2.5 bg-[var(--cz-fundo)] p-2.5"
    >
      {vendas.map(({ venda }) => (
        <CartaoVenda key={venda.id} venda={venda} sku={statusDoSku?.(venda)} />
      ))}
    </ul>
  );
}

/**
 * Esqueleto com a forma do cartão. Existe pelo mesmo motivo do esqueleto da
 * tabela: trocar pelo conteúdo real sem o layout saltar.
 */
export function EsqueletoCartoesVendas() {
  return (
    <ul
      aria-busy="true"
      aria-label="Carregando vendas"
      className="flex flex-col gap-2.5 bg-[var(--cz-fundo)] p-2.5"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <li
          key={i}
          className="rounded-[var(--cz-raio-cartao,12px)] border border-[var(--cz-hairline)] bg-white p-3.5"
        >
          <div className="flex gap-3">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-gray-200" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3.5 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
            <div className="h-6 w-28 animate-pulse rounded bg-gray-200" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Paginação do celular: duas linhas, botões de 44px.
 *
 * Em vez da fileira de números do desktop (1 … 4 5 6 … 50 cabe em ~350px e não
 * sobra espaço para os botões de 44px em 360px de tela), fica "primeira,
 * anterior, 3 de 50, próxima, última". O salto direto a uma página do meio é raro
 * aqui; o que se faz é avançar, e isso agora é um botão largo.
 */
export function PaginacaoVendasCelular({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  opcoesPorPagina,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  opcoesPorPagina: number[];
}) {
  const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
  const total = Math.max(totalPages, 1);
  const primeiro = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const ultimo = Math.min(currentPage * itemsPerPage, totalItems);
  const opcoes = opcoesPorPagina.includes(itemsPerPage)
    ? opcoesPorPagina
    : [...opcoesPorPagina, itemsPerPage].sort((a, b) => a - b);

  const botao =
    "grid h-11 w-11 shrink-0 place-items-center rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-white text-[var(--cz-texto-suave)] transition-colors active:bg-[#F4F5F7] disabled:opacity-40";

  return (
    <nav
      aria-label="Paginação das vendas"
      className="flex flex-col gap-3 border-t border-[var(--cz-hairline)] bg-white p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] tabular-nums text-[var(--cz-texto-suave)]">
          <span className="font-semibold text-[var(--cz-texto)]">
            {fmt(primeiro)}–{fmt(ultimo)}
          </span>{" "}
          de <span className="font-semibold text-[var(--cz-texto)]">{fmt(totalItems)}</span>
        </p>

        {onItemsPerPageChange && (
          <label className="inline-flex items-center gap-2 text-[13px] text-[var(--cz-texto-suave)]">
            <span>Por página</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              aria-label="Quantidade de vendas por página"
              className="h-11 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-white px-2 text-[15px] font-semibold text-[var(--cz-texto)]"
            >
              {opcoes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between gap-1.5">
        <button
          type="button"
          className={botao}
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          aria-label="Primeira página"
        >
          <ChevronsLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={botao}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        <p className="min-w-0 flex-1 text-center text-[15px] tabular-nums text-[var(--cz-texto-suave)]">
          <span className="font-bold text-[var(--cz-laranja-forte)]">{currentPage}</span> de{" "}
          <span className="font-semibold text-[var(--cz-texto)]">{total}</span>
        </p>

        <button
          type="button"
          className={botao}
          onClick={() => onPageChange(Math.min(currentPage + 1, total))}
          disabled={currentPage >= total}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={botao}
          onClick={() => onPageChange(total)}
          disabled={currentPage >= total}
          aria-label="Última página"
        >
          <ChevronsRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
