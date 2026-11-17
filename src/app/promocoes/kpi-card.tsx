/**
 * Premium KPI card.
 *
 * Visual anatomy:
 *
 *   ┌──────────────────────────────────────┐
 *   │ TITLE                  [icon chip]   │
 *   │                                       │
 *   │ R$ 24.351,90                          │
 *   │                                       │
 *   │ [pct pill]   [optional helper text]   │
 *   │                       [watermark SVG] │
 *   └──────────────────────────────────────┘
 *
 * - `tone` controls the chip / accents / pill colors.
 * - `watermark` paints a faded copy of the icon in the bottom-right corner
 *   to add depth without competing with the value.
 * - `featured` enlarges the value and lifts the card with a stronger
 *   shadow — used for hero KPIs (Faturamento, Margem).
 */
import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

export type KpiTone = "primary" | "positive" | "negative" | "neutral" | "warning";

type KpiCardProps = {
  title: string;
  value: ReactNode;
  /** Small icon shown both as a chip (top-right) and as a watermark. */
  icon: ReactNode;
  /** Percent of revenue, e.g. "12.7%". Renders inside a colored pill. */
  pct?: string | null;
  /** Sign helper for the pct pill arrow. Inferred from value when omitted. */
  delta?: "up" | "down" | "flat";
  /** Optional helper text shown next to the pill. */
  hint?: string;
  /** Color theme. */
  tone?: KpiTone;
  /** Hero card variant — bigger value, stronger lift. */
  featured?: boolean;
  className?: string;
};

type ToneStyles = {
  chipBg: string;
  chipIcon: string;
  watermark: string;
  pillBg: string;
  pillFg: string;
  accent: string;
};

const TONES: Record<KpiTone, ToneStyles> = {
  primary: {
    chipBg:   "bg-marca-suave",
    chipIcon: "text-marca-forte",
    watermark:"text-marca-borda",
    pillBg:   "bg-marca-suave",
    pillFg:   "text-marca-forte",
    accent:   "from-marca-suave/60 to-transparent",
  },
  positive: {
    chipBg:   "bg-emerald-50",
    chipIcon: "text-emerald-600",
    watermark:"text-emerald-50",
    pillBg:   "bg-emerald-50",
    pillFg:   "text-emerald-700",
    accent:   "from-emerald-50/40 to-transparent",
  },
  negative: {
    chipBg:   "bg-rose-50",
    chipIcon: "text-rose-600",
    watermark:"text-rose-50",
    pillBg:   "bg-rose-50",
    pillFg:   "text-rose-700",
    accent:   "from-rose-50/40 to-transparent",
  },
  neutral: {
    chipBg:   "bg-slate-100",
    chipIcon: "text-slate-700",
    watermark:"text-slate-100",
    pillBg:   "bg-slate-100",
    pillFg:   "text-slate-700",
    accent:   "from-slate-50/60 to-transparent",
  },
  warning: {
    chipBg:   "bg-amber-50",
    chipIcon: "text-amber-600",
    watermark:"text-amber-50",
    pillBg:   "bg-amber-50",
    pillFg:   "text-amber-700",
    accent:   "from-amber-50/40 to-transparent",
  },
};

export function KpiCard({
  title,
  value,
  icon,
  pct,
  delta,
  hint,
  tone = "neutral",
  featured = false,
  className,
}: KpiCardProps) {
  const t = TONES[tone];

  const inferredDelta: KpiCardProps["delta"] =
    delta ?? (pct?.startsWith("-") ? "down" : pct ? "up" : "flat");

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-hairline bg-superficie transition-shadow",
        featured
          ? "shadow-[0_8px_24px_-8px_rgba(16,24,40,0.10)] hover:shadow-[0_12px_32px_-8px_rgba(16,24,40,0.16)]"
          : "shadow-[0_2px_8px_rgba(16,24,40,0.04)] hover:shadow-[0_6px_18px_-6px_rgba(16,24,40,0.10)]",
        className,
      )}
    >
      {/* Soft tinted gradient background */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br",
          t.accent,
        )}
      />

      {/* Big watermark version of the icon, low opacity */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-6 -right-6 text-[140px] leading-none opacity-60 transition-transform duration-300 group-hover:scale-105",
          t.watermark,
        )}
      >
        <div className="size-[120px]">{icon}</div>
      </div>

      <div className="relative flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-tinta-suave">
            {title}
          </span>
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl",
              t.chipBg,
              t.chipIcon,
            )}
          >
            <span className="size-[18px]">{icon}</span>
          </span>
        </div>

        <div
          className={cn(
            "mt-3 truncate font-bold leading-tight tracking-tight text-tinta",
            featured ? "text-[28px]" : "text-[22px]",
          )}
        >
          {value}
        </div>

        {(pct || hint) && (
          <div className="mt-3 flex items-center gap-2 text-[11.5px]">
            {pct && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold",
                  t.pillBg,
                  t.pillFg,
                )}
              >
                {inferredDelta === "up" && <TrendingUp className="size-3" aria-hidden />}
                {inferredDelta === "down" && <TrendingDown className="size-3" aria-hidden />}
                {pct}
              </span>
            )}
            {hint && <span className="truncate text-tinta-suave">{hint}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder used during initial paint / loading transitions.
 */
export function KpiCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-superficie p-5 shadow-[0_2px_8px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between">
        <div className="h-2.5 w-16 rounded-full bg-fundo" />
        <div className="size-9 rounded-xl bg-fundo" />
      </div>
      <div className={cn("mt-3 rounded-md bg-fundo", featured ? "h-7 w-40" : "h-6 w-32")} />
      <div className="mt-3 h-3 w-20 rounded-full bg-fundo" />
    </div>
  );
}
