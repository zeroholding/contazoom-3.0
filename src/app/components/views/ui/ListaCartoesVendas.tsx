"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShoppingBag,
} from "lucide-react";
import { PlataformaBadge } from "@/components/ui/PlataformaBadge";
import { isStatusCancelado, isStatusPago } from "@/lib/vendasStatus";
import FinanceiroDetailsDropdown from "./FinanceiroDetailsDropdown";
import FreteDetailsDropdown from "./FreteDetailsDropdown";
import ReceitaLiquidaDetailsDropdown from "./ReceitaLiquidaDetailsDropdown";
import TaxaDetailsDropdown from "./TaxaDetailsDropdown";
import type { ProcessedVenda, Venda } from "./VendasTable";

/**
 * Vendas como LISTA DE CARTÕES, para o celular.
 *
 * A tabela de vendas tem 7 colunas agrupadas (~990px de largura mínima). Em 390px
 * ela só existe como rolagem horizontal, e numa tela cujo trabalho é varrer
 * vendas isso esconde justamente os valores financeiros. O resumo mostra os
 * quatro indicadores principais e o cartão expande no próprio lugar para exibir
 * todos os dados da versão desktop, sem abrir Blob nem uma nova aba.
 */

type SituacaoSku = { cadastrado: boolean; situacao?: string };
type Tom = "bom" | "ruim" | "neutro";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const porcentagem = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function numeroFinito(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string" && valor.trim()) {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : null;
  }
  return null;
}

const brl = (valor: unknown) => moeda.format(numeroFinito(valor) ?? 0);

/** Percentual de um valor em relação ao bruto da venda. */
function pct(valor: unknown, bruto: unknown, absoluto = true): string | null {
  const numero = numeroFinito(valor);
  const base = numeroFinito(bruto);
  if (numero === null || base === null || base <= 0) return null;
  const resultado = ((absoluto ? Math.abs(numero) : numero) / base) * 100;
  return `${porcentagem.format(resultado)}%`;
}

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

const TOM: Record<Tom, string> = {
  bom: "text-emerald-600",
  ruim: "text-red-600",
  neutro: "text-[var(--cz-texto-fraco)]",
};

function Celula({
  rotulo,
  valor,
  percentual,
  tom,
  linha = false,
}: {
  rotulo: string;
  valor: string;
  percentual?: string | null;
  tom: Tom;
  /** Rótulo à esquerda e valor à direita, em vez de um sobre o outro. */
  linha?: boolean;
}) {
  return (
    <div className={linha ? "flex min-w-0 items-baseline justify-between gap-3" : "min-w-0"}>
      <dt className="truncate text-[12px] text-[var(--cz-texto-suave)]">{rotulo}</dt>
      <dd
        className={`${
          linha ? "flex flex-wrap items-baseline justify-end gap-x-1" : "min-w-0"
        } text-[13px] font-semibold tabular-nums ${TOM[tom]}`}
        title={`${valor}${percentual ? ` (${percentual})` : ""}`}
      >
        <span className={linha ? "whitespace-nowrap" : "block truncate"}>{valor}</span>
        {percentual && (
          <span className="block text-[10px] font-normal leading-4 text-[var(--cz-texto-suave)]">
            ({percentual})
          </span>
        )}
      </dd>
    </div>
  );
}

function ValorDetalhe({
  valor,
  percentual,
  tom = "neutro",
  detalhavel = false,
}: {
  valor: string;
  percentual?: string | null;
  tom?: Tom;
  detalhavel?: boolean;
}) {
  return (
    <span
      className={`inline-flex flex-wrap items-baseline justify-end gap-x-1 font-semibold tabular-nums ${
        TOM[tom]
      } ${detalhavel ? "underline decoration-dotted underline-offset-2" : ""}`}
    >
      <span>{valor}</span>
      {percentual && (
        <span className="text-[10px] font-normal text-[var(--cz-texto-suave)]">
          ({percentual})
        </span>
      )}
    </span>
  );
}

function LinhaDetalhe({
  rotulo,
  children,
  mono = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-2">
      <dt className="shrink-0 text-[12px] text-[var(--cz-texto-suave)]">{rotulo}</dt>
      <dd
        className={`min-w-0 max-w-[68%] break-words text-right text-[12px] font-medium text-[var(--cz-texto)] ${
          mono ? "font-mono" : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

function modalidadeEnvio(venda: Venda, ehShopee: boolean, ehTiktok: boolean): string {
  const logistic = String(venda.logisticType || venda.envioMode || "").toLowerCase();

  if (ehShopee || ehTiktok) {
    const runtime = venda as Venda & { shipmentDetails?: Record<string, unknown> };
    const detalhes = runtime.shipmentDetails || venda.raw?.shipmentDetails || {};
    const transportadora =
      detalhes.shipping_carrier || detalhes.shipping_provider || venda.shippingStatus;
    return transportadora ? String(transportadora) : "—";
  }

  if (logistic.includes("fulfillment") || logistic === "full") return "FULL";
  if (logistic.includes("flex") || logistic === "self_service") return "FLEX";
  if (
    logistic.includes("agencia") ||
    logistic.includes("agência") ||
    logistic === "me2" ||
    logistic === "coleta"
  ) {
    return "Agência";
  }
  return venda.logisticType || venda.envioMode || "—";
}

function DetalhesVenda({
  venda,
  sku,
  ehShopee,
  ehTiktok,
  usaFlex,
  freteExibido,
  dia,
  hora,
  status,
}: {
  venda: Venda;
  sku?: SituacaoSku;
  ehShopee: boolean;
  ehTiktok: boolean;
  usaFlex: boolean;
  freteExibido: number;
  dia: string;
  hora: string;
  status: string;
}) {
  const bruto = numeroFinito(venda.valorTotal) ?? 0;
  const quantidade = numeroFinito(venda.quantidade) ?? 0;
  const unitario = numeroFinito(venda.unitario) ?? 0;
  const subtotal = quantidade * unitario;
  const taxa = numeroFinito(venda.taxaPlataforma) ?? 0;
  const frete = numeroFinito(freteExibido) ?? 0;
  const imposto = numeroFinito(venda.imposto) ?? 0;
  const cmv = numeroFinito(venda.cmv);
  const margem = numeroFinito(venda.margemContribuicao);
  const receitaLiquida = bruto + taxa + frete;
  const anuncio = !ehShopee && !ehTiktok
    ? [venda.ads === "ADS" ? "ADS" : null, venda.exposicao, venda.tipoAnuncio]
        .filter(Boolean)
        .join(" · ") || "—"
    : "Não se aplica";

  const valorTaxa = (
    <ValorDetalhe
      valor={brl(taxa)}
      percentual={pct(taxa, bruto)}
      tom={taxa < 0 ? "ruim" : taxa > 0 ? "bom" : "neutro"}
      detalhavel
    />
  );
  const valorFrete = (
    <ValorDetalhe
      valor={brl(frete)}
      percentual={pct(frete, bruto)}
      tom={frete < 0 ? "ruim" : frete > 0 ? "bom" : "neutro"}
      detalhavel={ehShopee || usaFlex}
    />
  );
  const valorReceita = (
    <ValorDetalhe
      valor={brl(receitaLiquida)}
      percentual={pct(receitaLiquida, bruto, false)}
      tom={receitaLiquida < 0 ? "ruim" : "bom"}
      detalhavel={!ehShopee}
    />
  );

  return (
    <div className="space-y-4 px-3.5 pb-4 pt-3.5">
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cz-texto-fraco)]">
          Venda
        </h3>
        <dl className="mt-1 divide-y divide-[var(--cz-hairline)]">
          <LinhaDetalhe rotulo="Pedido" mono>{venda.id}</LinhaDetalhe>
          <LinhaDetalhe rotulo="Canal">{venda.plataforma || venda.canal || "—"}</LinhaDetalhe>
          <LinhaDetalhe rotulo="Conta">{venda.conta || "—"}</LinhaDetalhe>
          <LinhaDetalhe rotulo="Data">{dia}{hora ? ` · ${hora}` : ""}</LinhaDetalhe>
          <LinhaDetalhe rotulo="Status">{status}</LinhaDetalhe>
        </dl>
      </section>

      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cz-texto-fraco)]">
          Produto e envio
        </h3>
        <dl className="mt-1 divide-y divide-[var(--cz-hairline)]">
          <LinhaDetalhe rotulo="Produto">{venda.titulo || "—"}</LinhaDetalhe>
          <LinhaDetalhe rotulo="SKU" mono>
            <span>{venda.sku || "—"}</span>
            {sku && (
              <a
                href="/sku?pendentes=1"
                className={`ml-1.5 inline-flex rounded border px-1.5 py-0.5 font-sans text-[9px] font-bold ${
                  sku.cadastrado
                    ? "border-orange-200 bg-orange-50 text-orange-700"
                    : "border-blue-200 bg-blue-50 text-blue-700"
                }`}
              >
                {sku.cadastrado ? "Sem custo" : "Sem cadastro"}
              </a>
            )}
          </LinhaDetalhe>
          <LinhaDetalhe rotulo="Comprador">{venda.comprador || "—"}</LinhaDetalhe>
          <LinhaDetalhe rotulo="Modalidade">{modalidadeEnvio(venda, ehShopee, ehTiktok)}</LinhaDetalhe>
          <LinhaDetalhe rotulo="Anúncio">{anuncio}</LinhaDetalhe>
        </dl>
      </section>

      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cz-texto-fraco)]">
          Valores da venda
        </h3>
        <dl className="mt-1 divide-y divide-[var(--cz-hairline)]">
          <LinhaDetalhe rotulo="Quantidade">{venda.quantidade}x</LinhaDetalhe>
          <LinhaDetalhe rotulo="Preço unitário">
            <ValorDetalhe valor={brl(unitario)} percentual={pct(unitario, bruto)} />
          </LinhaDetalhe>
          <LinhaDetalhe rotulo="Qtd. × unitário">
            <ValorDetalhe valor={brl(subtotal)} percentual={pct(subtotal, bruto)} />
          </LinhaDetalhe>
          <LinhaDetalhe rotulo="Valor da venda">
            {ehShopee ? (
              <FinanceiroDetailsDropdown venda={venda}>
                <ValorDetalhe valor={brl(bruto)} percentual={pct(bruto, bruto)} detalhavel />
              </FinanceiroDetailsDropdown>
            ) : (
              <ValorDetalhe valor={brl(bruto)} percentual={pct(bruto, bruto)} />
            )}
          </LinhaDetalhe>
          <LinhaDetalhe rotulo="Imposto">
            <ValorDetalhe
              valor={brl(imposto)}
              percentual={pct(imposto, bruto, false)}
              tom={imposto > 0 ? "ruim" : "neutro"}
            />
          </LinhaDetalhe>
          <LinhaDetalhe rotulo="Taxa da plataforma">
            <TaxaDetailsDropdown venda={venda}>{valorTaxa}</TaxaDetailsDropdown>
          </LinhaDetalhe>
          <LinhaDetalhe rotulo={usaFlex ? "Frete líquido Flex" : "Frete"}>
            {ehShopee || usaFlex ? (
              <FreteDetailsDropdown venda={venda}>{valorFrete}</FreteDetailsDropdown>
            ) : (
              valorFrete
            )}
          </LinhaDetalhe>
          <LinhaDetalhe rotulo="Receita líquida">
            {ehShopee ? (
              valorReceita
            ) : (
              <ReceitaLiquidaDetailsDropdown venda={venda} freteExibido={frete}>
                {valorReceita}
              </ReceitaLiquidaDetailsDropdown>
            )}
          </LinhaDetalhe>
          <LinhaDetalhe rotulo="CMV">
            {cmv === null ? (
              <span className="text-[var(--cz-texto-fraco)]">—</span>
            ) : (
              <ValorDetalhe valor={brl(cmv)} percentual={pct(cmv, bruto)} tom="ruim" />
            )}
          </LinhaDetalhe>
          <LinhaDetalhe rotulo={venda.isMargemReal ? "Margem real" : "Margem"}>
            {margem === null ? (
              <span className="text-[var(--cz-texto-fraco)]">—</span>
            ) : (
              <ValorDetalhe
                valor={brl(margem)}
                percentual={pct(margem, bruto, false)}
                tom={margem < 0 ? "ruim" : "bom"}
              />
            )}
          </LinhaDetalhe>
        </dl>
        <p className="mt-2 text-[10px] leading-4 text-[var(--cz-texto-fraco)]">
          Valores sublinhados têm o mesmo detalhamento disponível no computador.
        </p>
      </section>
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
  const frete = numeroFinito(usaFlex ? venda.freteLiquidoFlex : venda.frete) ?? 0;
  const taxa = numeroFinito(venda.taxaPlataforma);
  const cmv = numeroFinito(venda.cmv);
  const margem = numeroFinito(venda.margemContribuicao);

  const valorFrete = brl(frete);
  const valorTaxa = taxa === null ? "—" : brl(taxa);
  const valorCmv = cmv === null ? "—" : brl(cmv);
  const valorMargem = margem === null ? "—" : brl(margem);

  // Em duas colunas há espaço para valores comuns. Se algum número for muito
  // comprido, as quatro células viram linhas para nunca cortar dinheiro.
  const valorLongo = [valorFrete, valorTaxa, valorCmv, valorMargem].some((v) => v.length > 16);

  return (
    <li>
      <article className="overflow-hidden rounded-[var(--cz-raio-cartao,12px)] border border-[var(--cz-hairline)] bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <details className="group">
          {/* O próprio cartão é o summary: tocar em qualquer área vazia expande
              os dados inline, sem recriar a antiga aba Blob. */}
          <summary className="cursor-pointer list-none p-3.5 transition-colors active:bg-gray-50 [&::-webkit-details-marker]:hidden">
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

            {/* `flex-wrap`: em 360px um valor de muitos dígitos não cabe ao lado
                da data; ele desce para outra linha em vez de ser cortado. */}
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
                  : "mt-3 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[var(--cz-hairline)] pt-3"
              }
            >
              <Celula
                rotulo={usaFlex ? "Frete líq. Flex" : "Frete"}
                valor={valorFrete}
                percentual={pct(frete, venda.valorTotal)}
                tom={frete < 0 ? "ruim" : frete > 0 ? "bom" : "neutro"}
                linha={valorLongo}
              />
              <Celula
                rotulo="Taxa"
                valor={valorTaxa}
                percentual={taxa === null ? null : pct(taxa, venda.valorTotal)}
                tom={taxa === null || taxa === 0 ? "neutro" : taxa < 0 ? "ruim" : "bom"}
                linha={valorLongo}
              />
              <Celula
                rotulo="CMV"
                valor={valorCmv}
                percentual={cmv === null ? null : pct(cmv, venda.valorTotal)}
                tom={cmv === null || cmv === 0 ? "neutro" : "ruim"}
                linha={valorLongo}
              />
              <Celula
                rotulo={venda.isMargemReal ? "Margem real" : "Margem"}
                valor={valorMargem}
                percentual={margem === null ? null : pct(margem, venda.valorTotal, false)}
                tom={margem === null ? "neutro" : margem < 0 ? "ruim" : "bom"}
                linha={valorLongo}
              />
            </dl>

            <div className="mt-3 flex items-center justify-center gap-1 border-t border-[var(--cz-hairline)] pt-2.5 text-[11px] font-semibold text-[var(--cz-laranja-forte)]">
              <span className="group-open:hidden">Ver todos os detalhes</span>
              <span className="hidden group-open:inline">Ocultar detalhes</span>
              <ChevronDown
                className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                aria-hidden="true"
              />
            </div>
          </summary>

          <div className="border-t border-[var(--cz-hairline)] bg-gray-50/40">
            <DetalhesVenda
              venda={venda}
              sku={sku}
              ehShopee={ehShopee}
              ehTiktok={ehTiktok}
              usaFlex={usaFlex}
              freteExibido={frete}
              dia={dia}
              hora={hora}
              status={texto}
            />
          </div>
        </details>
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
