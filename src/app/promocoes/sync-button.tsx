"use client";

/**
 * "Sincronizar promoções" — busca na API do Mercado Livre e regrava o espelho.
 * Feedback do processamento e resultado por conta.
 */
import { useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

import { syncPromotionsAction, type PromotionSyncResult } from "./sync-actions";


export function PromotionSyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PromotionSyncResult | null>(null);
  function handleSync() {
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await syncPromotionsAction());
      } catch {
        setResult({ ok: false, error: "Não foi possível concluir a sincronização. Tente novamente." });
      }
    });
  }


  return (
    <div className="flex flex-wrap items-center gap-3">
      {result && !pending && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium sm:inline-flex",
            result.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
          )}
        >
          {result.ok ? (
            <>
              <CheckCircle2 className="size-3.5" aria-hidden />
              {result.summary.accounts === 0 ? "Conecte uma conta do Mercado Livre." : `${result.summary.startedItems} participações em promoção`}
              {result.summary.errors.length > 0 ? ` · ${result.summary.errors.length} conta(s) com aviso` : ""}
            </>
          ) : (
            <>
              <CircleAlert className="size-3.5" aria-hidden />
              {result.error}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleSync}
        disabled={pending}
        aria-live="polite"
        className={cn(
          "relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-lg px-3.5 text-[13px] font-semibold text-white transition-colors",
          "bg-marca hover:bg-marca-forte",
          "disabled:cursor-not-allowed disabled:opacity-100",
        )}
      >
        <span className="relative z-10 flex items-center gap-2">
          <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden />
          {pending ? "Sincronizando…" : "Sincronizar promoções"}
        </span>
      </button>
    </div>
  );
}
