/**
 * /promocoes — painel das promoções do Mercado Livre (SOMENTE LEITURA).
 *
 * O módulo não cria, altera nem cancela promoção: ele lê a API do ML e mostra.
 * A única escrita é no espelho local (`ml_promotion*`), para a tela abrir rápido
 * em vez de fazer ~130 chamadas de API a cada visita.
 *
 * Decisões que vêm do dossiê (docs/PROMOCOES_ML.md) e estão visíveis na tela:
 * - "De" e "Por" são o par da MESMA resposta da campanha. O preço de tabela do
 *   anúncio é outro número e aparece como comparação, nunca como base do %.
 * - Convite (`candidate`) não é promoção. A visão padrão é "Em promoção", e o
 *   convite tem sua própria aba.
 * - Oferta relâmpago não tem data de término na API: a tela escreve "não
 *   informado" em vez de inventar.
 */
import Link from "next/link";
import {
  ArrowDownRight,
  CalendarClock,
  ExternalLink,
  Handshake,
  Percent,
  Store,
  Tag,
  Tags,
  Timer,
  TriangleAlert,
} from "lucide-react";

import { KpiCard } from "./kpi-card";
import { Thumbnail } from "./thumbnail.client";
import { Cabecalho } from "@/app/components/views/comum/shell";
import { requirePromotionUser } from "@/lib/ml-promotions-session";
import { formatCurrency, formatDate, formatInt } from "./format";
import { finishSource, parsePromotionFilters, promoTypeLabel } from "@/lib/ml-promotions-query";
import {
  fetchPromotionAccounts,
  fetchPromotionCount,
  fetchPromotionPage,
  fetchPromotionSummary,
  fetchPromotionTypes,
  type PromotionRow,
} from "@/lib/ml-promotions-sql";

import { PromotionFilterBar } from "./filters.client";
import { PromotionPagination } from "./pagination.client";
import { PromotionSyncButton } from "./sync-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PromocoesPage({ searchParams }: PageProps) {
  const userId = await requirePromotionUser();
  const sp = await searchParams;
  const filters = parsePromotionFilters(sp);

  const [accounts, types, summary, total, rows] = await Promise.all([
    fetchPromotionAccounts(userId),
    fetchPromotionTypes(userId),
    fetchPromotionSummary(userId, filters),
    fetchPromotionCount(userId, filters),
    fetchPromotionPage(userId, filters),
  ]);

  const lastSyncLabel = summary.lastSync ? relativeTime(summary.lastSync) : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <Cabecalho
        titulo="Promoções do Mercado Livre"
        descricao={
          summary.itemsInPromotion === 0
            ? "Nenhum anúncio em promoção agora"
            : `${formatInt(summary.itemsInPromotion)} anúncio(s) em promoção · ${formatInt(
                summary.activePromotions,
              )} promoção(ões)` + (lastSyncLabel ? ` · atualizado ${lastSyncLabel}` : "")
        }
        acao={<PromotionSyncButton />}
      />

      <div>
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
          {/* ---------- Indicadores ---------- */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              title="Em promoção"
              value={formatInt(summary.itemsInPromotion)}
              icon={<Tag className="size-[18px]" />}
              tone="primary"
              featured
              hint="anúncios participando"
            />
            <KpiCard
              title="Desconto médio"
              value={summary.avgDiscountPct === null ? "—" : `${summary.avgDiscountPct.toFixed(1)}%`}
              icon={<Percent className="size-[18px]" />}
              tone="positive"
              hint="sobre o preço 'de'"
            />
            <KpiCard
              title="Desconto somado"
              value={formatCurrency(summary.totalDiscountAmount)}
              icon={<ArrowDownRight className="size-[18px]" />}
              tone="neutral"
              hint="por unidade, não por pedido"
            />
            <KpiCard
              title="Termina em 3 dias"
              value={formatInt(summary.endingIn3)}
              icon={<Timer className="size-[18px]" />}
              tone={summary.endingIn3 > 0 ? "warning" : "neutral"}
              hint="anúncios"
            />
            <KpiCard
              title="Termina em 7 dias"
              value={formatInt(summary.endingIn7)}
              icon={<CalendarClock className="size-[18px]" />}
              tone="warning"
              hint="anúncios"
            />
            <KpiCard
              title="Convites abertos"
              value={formatInt(summary.candidates)}
              icon={<Handshake className="size-[18px]" />}
              tone="neutral"
              hint="anúncios convidados"
            />
          </div>

          {/* ---------- Aviso de cobertura ---------- */}
          {summary.withoutDate > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <strong>{formatInt(summary.withoutDate)} anúncio(s)</strong> em oferta relâmpago sem
                data de término. O Mercado Livre não informa essa data para esse tipo de promoção —
                não é falha do sistema.
              </p>
            </div>
          )}

          {/* ---------- Filtros ---------- */}
          <PromotionFilterBar accounts={accounts} types={types} />

          {/* ---------- Tabela ---------- */}
          <section className="rounded-2xl border border-hairline bg-superficie shadow-[0_2px_8px_rgba(16,24,40,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-hairline px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-marca-suave text-marca-forte">
                  <Tags className="size-[18px]" aria-hidden />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-tinta">
                    {filters.status === "candidate"
                      ? "Convites de promoção"
                      : filters.status === "todos"
                        ? "Promoções e convites"
                        : "Anúncios em promoção"}
                  </h2>
                  <p className="text-[12px] text-tinta-suave">
                    {formatInt(total)} resultado(s) · página {filters.page} de{" "}
                    {Math.max(1, Math.ceil(total / filters.perPage))}
                  </p>
                </div>
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState status={filters.status} hasSync={summary.lastSync !== null} />
            ) : (
              <>
              <ul className="divide-y divide-hairline lg:hidden">
                {rows.map((row) => <MobileRow key={`${row.promotionUid}:${row.itemId}`} row={row} />)}
              </ul>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1120px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-hairline bg-fundo/60 text-left text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">
                      <th className="px-3 py-3 pl-5 font-semibold">Anúncio</th>
                      <th className="px-3 py-3 font-semibold">Conta</th>
                      <th className="px-3 py-3 font-semibold">Promoção</th>
                      <th className="px-3 py-3 text-right font-semibold">De</th>
                      <th className="px-3 py-3 text-right font-semibold">Por</th>
                      <th className="px-3 py-3 text-right font-semibold">Desconto</th>
                      <th className="px-3 py-3 font-semibold">Começa</th>
                      <th className="px-3 py-3 pr-5 font-semibold">Termina</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <Row key={`${row.promotionUid}:${row.itemId}`} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}

            <PromotionPagination page={filters.page} perPage={filters.perPage} total={total} />
          </section>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Linha da tabela
// ===========================================================================

function promotionHref(row: PromotionRow) {
  const query = new URLSearchParams({ conta: row.accountId, tipo: row.promotionType });
  return `/promocoes/${encodeURIComponent(row.promotionId)}?${query}`;
}

function MobileRow({ row }: { row: PromotionRow }) {
  return (
    <li className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <Thumbnail src={row.thumbnail ?? undefined} alt="" size={46} fit="contain" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-tinta">{row.title ?? row.itemId}</p>
          <p className="mt-1 text-xs text-tinta-suave">{row.account} · {row.itemId}</p>
          <Link href={promotionHref(row)} className="mt-1 inline-block text-sm font-semibold text-marca-forte">
            {row.promotionName ?? promoTypeLabel(row.promotionType)}
          </Link>
          {row.itemStatus === "candidate" && <p className="text-xs text-tinta-suave">Convite</p>}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-fundo p-3 text-xs">
        <div><dt className="text-tinta-suave">De</dt><dd>{formatCurrency(row.originalPrice)}</dd></div>
        <div><dt className="text-tinta-suave">Por</dt><dd className="font-bold">{formatCurrency(row.price)}</dd></div>
        <div><dt className="text-tinta-suave">Desconto</dt><dd className="font-bold text-emerald-700">{row.discountPct === null ? "—" : `${row.discountPct.toFixed(1)}%`}</dd></div>
      </dl>
      <p className="text-xs text-tinta-suave">
        Começa {row.startAt ? formatDate(row.startAt) : "—"} · Termina {row.finishAt ? formatDate(row.finishAt) : "sem data"}
        {(row.meliPct !== null || row.sellerPct !== null) && ` · ML ${row.meliPct ?? 0}% / vendedor ${row.sellerPct ?? 0}%`}
      </p>
    </li>
  );
}

function Row({ row }: { row: PromotionRow }) {
  const isCandidate = row.itemStatus === "candidate";
  const urgency = finishUrgency(row.finishAt);
  const source = finishSource(row.promotionType);

  return (
    <tr className="border-b border-hairline transition-colors last:border-b-0 hover:bg-marca-suave/30">
      {/* Anúncio */}
      <td className="py-3 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <Thumbnail src={row.thumbnail ?? undefined} alt={row.title ?? ""} size={46} fit="contain" />
          <div className="min-w-0">
            {row.permalink ? (
              <a
                href={row.permalink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 text-[13px] font-semibold text-tinta hover:text-marca-forte"
                title={row.title ?? ""}
              >
                <span className="max-w-[300px] truncate">{row.title ?? "Anúncio sem título"}</span>
                <ExternalLink className="size-3 shrink-0 text-tinta-fraca" aria-hidden />
              </a>
            ) : (
              <div className="max-w-[300px] truncate text-[13px] font-semibold text-tinta" title={row.title ?? ""}>
                {row.title ?? "Anúncio sem título"}
              </div>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-tinta-fraca">
              <span className="rounded bg-fundo px-1.5 py-0.5 font-mono">{row.itemId}</span>
              {isCandidate && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                  convite
                </span>
              )}
              {row.meliPct !== null || row.sellerPct !== null ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">
                  ML {row.meliPct ?? 0}% · você {row.sellerPct ?? 0}%
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </td>

      {/* Conta */}
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-marca-suave px-2 py-0.5 text-[11.5px] font-semibold text-marca-forte">
          <Store className="size-3" aria-hidden />
          {row.account}
        </span>
      </td>

      {/* Promoção */}
      <td className="px-3 py-3">
        <Link
          href={promotionHref(row)}
          className="text-[12.5px] font-semibold text-tinta hover:text-marca-forte hover:underline"
        >
          {row.promotionName ?? promoTypeLabel(row.promotionType)}
        </Link>
        <div className="mt-0.5 text-[11px] text-tinta-fraca">
          {promoTypeLabel(row.promotionType)} · {row.promotionId}
        </div>
      </td>

      {/* De */}
      <td className="px-3 py-3 text-right tabular-nums text-tinta-suave">
        {formatCurrency(row.originalPrice)}
      </td>

      {/* Por */}
      <td className="px-3 py-3 text-right">
        <span className="font-bold tabular-nums text-tinta">{formatCurrency(row.price)}</span>
        {row.tablePrice !== null &&
          row.originalPrice !== null &&
          Math.abs(row.tablePrice - row.originalPrice) > 0.01 && (
            <div className="text-[10.5px] text-tinta-fraca">tabela {formatCurrency(row.tablePrice)}</div>
          )}
      </td>

      {/* Desconto */}
      <td className="px-3 py-3 text-right">
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[12.5px] font-bold tabular-nums text-emerald-700">
          {row.discountPct === null ? "—" : `${row.discountPct.toFixed(1)}%`}
        </span>
        <div className="mt-0.5 text-[10.5px] tabular-nums text-tinta-fraca">
          {row.discountAmount === null ? "—" : `−${formatCurrency(row.discountAmount)}`}
        </div>
      </td>

      {/* Começa */}
      <td className="px-3 py-3 text-[12px] text-tinta-suave">
        {row.startAt ? formatDate(row.startAt) : "—"}
      </td>

      {/* Termina */}
      <td className="py-3 pl-3 pr-5">
        {row.finishAt ? (
          <>
            <div className={`text-[12.5px] font-semibold ${urgency.className}`}>
              {formatDate(row.finishAt)}
            </div>
            <div className={`text-[10.5px] ${urgency.className}`}>{urgency.label}</div>
          </>
        ) : (
          <div className="text-[12px] text-tinta-fraca">
            não informado
            <div className="text-[10px]">
              {source === "nenhuma" ? "o ML não envia" : "sem data na campanha"}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

/** Dias inteiros até o fim, no fuso de São Paulo. */
function daysUntil(date: Date): number {
  const diff = date.getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function finishUrgency(finishAt: Date | null): { label: string; className: string } {
  if (!finishAt) return { label: "", className: "" };
  const days = daysUntil(finishAt);
  if (days < 0) return { label: "encerrada", className: "text-tinta-fraca" };
  if (days === 0) return { label: "termina hoje", className: "text-rose-600" };
  if (days === 1) return { label: "termina amanhã", className: "text-rose-600" };
  if (days <= 3) return { label: `faltam ${days} dias`, className: "text-rose-600" };
  if (days <= 7) return { label: `faltam ${days} dias`, className: "text-amber-600" };
  return { label: `faltam ${days} dias`, className: "text-tinta-suave" };
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "agora";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function EmptyState({ status, hasSync }: { status: string; hasSync: boolean }) {
  return (
    <div className="px-4 py-16 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-[13px] text-tinta-suave">
        <Tag className="size-8 text-tinta-fraca" aria-hidden />
        <p>
          {status === "candidate"
            ? "Nenhum convite de promoção neste recorte."
            : "Nenhum anúncio em promoção neste recorte."}
        </p>
        <p className="text-[12px] text-tinta-fraca">
          {hasSync
            ? "Tire um filtro ou sincronize de novo para atualizar."
            : "Clique em “Sincronizar promoções” para buscar no Mercado Livre."}
        </p>
      </div>
    </div>
  );
}
