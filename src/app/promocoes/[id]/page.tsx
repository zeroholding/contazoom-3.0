/**
 * /promocoes/[id] — detalhe de uma campanha do Mercado Livre.
 *
 * A MESMA campanha existe em várias contas (o "11.11 da Black" está em 7), mas
 * cada conta tem os seus próprios anúncios e preços. Por isso a conta é parte
 * da identidade: sem `?conta=`, a tela abre na conta com mais anúncios
 * participando — abrir na conta errada mostraria uma campanha "vazia".
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Handshake,
  Store,
  Tag,
  Timer,
} from "lucide-react";

import { Thumbnail } from "../thumbnail.client";
import { Cabecalho } from "@/app/components/views/comum/shell";
import { requirePromotionUser } from "@/lib/ml-promotions-session";
import { formatCurrency, formatDate, formatDateTime, formatInt } from "../format";
import { finishSource, promoTypeLabel } from "@/lib/ml-promotions-query";
import { fetchPromotionDetail } from "@/lib/ml-promotions-sql";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PromocaoDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const userId = await requirePromotionUser();
  const sp = await searchParams;
  const conta = typeof sp.conta === "string" ? sp.conta : undefined;

  const detail = await fetchPromotionDetail(userId, id, { account: conta, type: typeof sp.tipo === "string" ? sp.tipo : undefined });
  if (!detail.promotion) notFound();

  const promotion = detail.promotion;
  const source = finishSource(promotion.promotionType);
  const started = detail.items.filter((i) => i.itemStatus === "started");
  const candidates = detail.items.filter((i) => i.itemStatus === "candidate");

  const totalDiscount = started.reduce((sum, i) => sum + (i.discountAmount ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <Cabecalho
        titulo={promotion.name ?? promoTypeLabel(promotion.promotionType)}
        descricao={`${promoTypeLabel(promotion.promotionType)} · ${promotion.account} · ${promotion.promotionId}`}
        acao={
          <Link
            href="/promocoes"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-superficie px-3 py-2 text-[13px] font-medium text-tinta transition-colors hover:border-marca-borda hover:bg-marca-suave hover:text-marca-forte"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Voltar
          </Link>
        }
      />

      <div>
        <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
          {/* ---------- Resumo da campanha ---------- */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoCard
              icon={<Tag className="size-[18px]" />}
              label="Anúncios participando"
              value={formatInt(detail.counts.started)}
              hint={detail.counts.candidate > 0 ? `${formatInt(detail.counts.candidate)} convite(s)` : undefined}
              tone="brand"
            />
            <InfoCard
              icon={<Timer className="size-[18px]" />}
              label="Começa"
              value={promotion.startAt ? formatDate(promotion.startAt) : "não informado"}
              hint={promotion.startAt ? formatDateTime(promotion.startAt) : undefined}
            />
            <InfoCard
              icon={<CalendarClock className="size-[18px]" />}
              label="Termina"
              value={promotion.finishAt ? formatDate(promotion.finishAt) : "não informado"}
              hint={
                promotion.finishAt
                  ? daysLabel(promotion.finishAt)
                  : source === "nenhuma"
                    ? "o Mercado Livre não envia para este tipo"
                    : "sem data na campanha"
              }
            />
            <InfoCard
              icon={<Store className="size-[18px]" />}
              label="Conta"
              value={promotion.account}
              hint={`vista pela última vez ${formatDateTime(promotion.lastSeenAt)}`}
            />
          </section>

          {promotion.deadlineAt ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[12.5px] text-blue-800">
              <Handshake className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Prazo para aceitar o convite: <strong>{formatDate(promotion.deadlineAt)}</strong> (
                {daysLabel(promotion.deadlineAt)}).
              </p>
            </div>
          ) : null}

          {/* ---------- Itens ---------- */}
          <section className="rounded-2xl border border-hairline bg-superficie shadow-[0_2px_8px_rgba(16,24,40,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-hairline px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-marca-suave text-marca-forte">
                  <Tag className="size-[18px]" aria-hidden />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-tinta">Anúncios da campanha</h2>
                  <p className="text-[12px] text-tinta-suave">
                    {formatInt(started.length)} participando
                    {candidates.length > 0 ? ` · ${formatInt(candidates.length)} convidado(s)` : ""}
                    {totalDiscount > 0 ? ` · ${formatCurrency(totalDiscount)} de desconto somado` : ""}
                  </p>
                </div>
              </div>
            </div>

            {detail.items.length === 0 ? (
              <div className="px-4 py-14 text-center text-[13px] text-tinta-suave">
                Esta campanha ainda não tem anúncio participando.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-hairline bg-fundo/60 text-left text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">
                      <th className="px-3 py-3 pl-5 font-semibold">Anúncio</th>
                      <th className="px-3 py-3 font-semibold">Situação</th>
                      <th className="px-3 py-3 text-right font-semibold">De</th>
                      <th className="px-3 py-3 text-right font-semibold">Por</th>
                      <th className="px-3 py-3 text-right font-semibold">Desconto</th>
                      <th className="px-3 py-3 pr-5 font-semibold">Termina</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...started, ...candidates].map((item) => (
                      <tr
                        key={item.itemId}
                        className="border-b border-hairline transition-colors last:border-b-0 hover:bg-marca-suave/30"
                      >
                        <td className="py-3 pl-5 pr-3">
                          <div className="flex items-center gap-3">
                            <Thumbnail
                              src={item.thumbnail ?? undefined}
                              alt={item.title ?? ""}
                              size={44}
                              fit="contain"
                            />
                            <div className="min-w-0">
                              {item.permalink ? (
                                <a
                                  href={item.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex max-w-full items-center gap-1.5 text-[13px] font-semibold text-tinta hover:text-marca-forte"
                                  title={item.title ?? ""}
                                >
                                  <span className="max-w-[320px] truncate">
                                    {item.title ?? "Anúncio sem título"}
                                  </span>
                                  <ExternalLink className="size-3 shrink-0 text-tinta-fraca" aria-hidden />
                                </a>
                              ) : (
                                <div className="max-w-[320px] truncate text-[13px] font-semibold text-tinta">
                                  {item.title ?? "Anúncio sem título"}
                                </div>
                              )}
                              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-tinta-fraca">
                                <span className="rounded bg-fundo px-1.5 py-0.5 font-mono">{item.itemId}</span>
                                {item.meliPct !== null || item.sellerPct !== null ? (
                                  <span className="rounded-full bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">
                                    ML {item.meliPct ?? 0}% · você {item.sellerPct ?? 0}%
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={
                              item.itemStatus === "started"
                                ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                                : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                            }
                          >
                            {item.itemStatus === "started" ? "participando" : "convidado"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-tinta-suave">
                          {formatCurrency(item.originalPrice)}
                        </td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-tinta">
                          {formatCurrency(item.price)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {item.discountPct === null ? (
                            <span className="text-tinta-fraca">—</span>
                          ) : (
                            <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[12.5px] font-bold tabular-nums text-emerald-700">
                              {item.discountPct.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="py-3 pl-3 pr-5 text-[12px] text-tinta-suave">
                          {item.finishAt ? formatDate(item.finishAt) : "não informado"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="pb-2 text-[11.5px] text-tinta-fraca">
            Este módulo é somente leitura: nada aqui cria, altera ou cancela promoção no Mercado
            Livre.
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  hint,
  tone = "ink",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "brand";
}) {
  return (
    <div className="rounded-xl border border-hairline bg-superficie p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-tinta-suave">
        <span className="grid size-7 place-items-center rounded-lg bg-marca-suave text-marca-forte">
          {icon}
        </span>
        {label}
      </div>
      <div
        className={`mt-2 text-[18px] font-bold tabular-nums ${
          tone === "brand" ? "text-marca-forte" : "text-tinta"
        }`}
      >
        {value}
      </div>
      {hint ? <div className="text-[11px] text-tinta-fraca">{hint}</div> : null}
    </div>
  );
}

function daysLabel(date: Date): string {
  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "já passou";
  if (days === 0) return "é hoje";
  if (days === 1) return "é amanhã";
  return `faltam ${days} dias`;
}
