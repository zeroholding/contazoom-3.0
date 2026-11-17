"use client";

/**
 * Paginação de /promocoes. Mesmo comportamento das outras telas: estado na URL.
 */
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function PromotionPagination({
  page,
  perPage,
  total,
}: {
  page: number;
  perPage: number;
  total: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const firstRow = total === 0 ? 0 : (page - 1) * perPage + 1;
  const lastRow = Math.min(total, page * perPage);

  function go(nextPage: number) {
    const params = new URLSearchParams(sp.toString());
    if (nextPage <= 1) params.delete("pagina");
    else params.set("pagina", String(nextPage));
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `/promocoes?${qs}` : "/promocoes", { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-hairline bg-superficie px-4 py-3 text-[12.5px] text-tinta-suave">
      <div>
        Mostrando <strong className="text-tinta">{firstRow.toLocaleString("pt-BR")}</strong>–
        <strong className="text-tinta">{lastRow.toLocaleString("pt-BR")}</strong> de{" "}
        <strong className="text-tinta">{total.toLocaleString("pt-BR")}</strong>
      </div>
      <div className="flex items-center gap-1.5">
        <Btn disabled={page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
          <span>Anterior</span>
        </Btn>
        <span className="px-2 text-[12px] text-tinta">
          Página <strong>{page}</strong> / {lastPage}
        </span>
        <Btn disabled={page >= lastPage} onClick={() => go(page + 1)}>
          <span>Próxima</span>
          <ChevronRight className="size-4" aria-hidden />
        </Btn>
      </div>
    </div>
  );
}

function Btn({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-hairline bg-superficie px-2.5 py-1.5 text-[12px] font-medium text-tinta",
        "hover:border-marca-borda hover:bg-marca-suave hover:text-marca-forte",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-hairline disabled:hover:bg-superficie disabled:hover:text-tinta",
      )}
    >
      {children}
    </button>
  );
}
