/**
 * Formatação de valores e datas na tela de Promoções.
 *
 * Always render currency in Brazilian Portuguese (R$). Numbers come from
 * Prisma as Decimal | number | bigint | null — the helpers accept all of
 * those and fall back to "—" for null/undefined.
 */
import type { Prisma } from "@prisma/client";

type Numeric = number | bigint | Prisma.Decimal | string | null | undefined;

function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  // Prisma.Decimal exposes toNumber()
  if (typeof (value as { toNumber?: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Format a value as Brazilian Real currency. Returns "—" when nullish. */
export function formatCurrency(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return brl.format(n);
}

/** Format a value as an integer with Brazilian thousands separator. */
export function formatInt(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return intFmt.format(Math.trunc(n));
}

const dtFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dtFmt.format(d);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFmt.format(d);
}
