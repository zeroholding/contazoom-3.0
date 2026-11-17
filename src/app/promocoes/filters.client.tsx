"use client";

/**
 * Barra de filtros de /promocoes. Estado vive na URL, como nas outras telas.
 *
 * A "visão" (Em promoção / Convites / Tudo) é um filtro separado da janela de
 * término: convite NÃO é promoção, e misturar os dois numa lista só foi o erro
 * que a §4 do dossiê avisa. Aqui a pessoa escolhe o que quer ver, e a tela
 * diz em qual visão está.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Loader2, Percent, RotateCcw, Search, Store, Tags, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  PROMO_DISCOUNTS,
  PROMO_STATUSES,
  PROMO_WINDOWS,
  promoTypeLabel,
  type PromotionFilters,
} from "@/lib/ml-promotions-query";

type AccountOption = { accountId: string; nickname: string };
type TypeOption = { type: string; total: number };

type Props = {
  accounts: AccountOption[];
  types: TypeOption[];
};

export function PromotionFilterBar({ accounts, types }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const filters: PromotionFilters = useMemo(() => {
    const raw = Object.fromEntries(sp.entries());
    return {
      accounts: raw.contas ? raw.contas.split(",").filter(Boolean) : [],
      types: raw.tipos ? raw.tipos.split(",").filter(Boolean) : [],
      window:
        raw.janela === "hoje" ||
        raw.janela === "amanha" ||
        raw.janela === "3" ||
        raw.janela === "7" ||
        raw.janela === "30" ||
        raw.janela === "sem-data"
          ? raw.janela
          : "todas",
      status:
        raw.situacao === "candidate" || raw.situacao === "todos" ? raw.situacao : "started",
      q: raw.q ?? "",
      sort: raw.ordem === "desconto" || raw.ordem === "preco" ? raw.ordem : "fim",
      minDiscount: Number.parseInt(raw.desconto ?? "", 10) || null,
      page: Number.parseInt(raw.pagina ?? "1", 10) || 1,
      perPage: Number.parseInt(raw.porPagina ?? "50", 10) || 50,
    };
  }, [sp]);

  const push = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `/promocoes?${qs}` : "/promocoes", { scroll: false });
      });
    },
    [router],
  );

  const apply = useCallback(
    (patch: Partial<Record<string, string | string[] | undefined>>) => {
      const params = new URLSearchParams();
      const set = (key: string, value: string | undefined) => {
        if (value && value !== "") params.set(key, value);
      };

      const merged = {
        contas: filters.accounts.join(","),
        tipos: filters.types.join(","),
        janela: filters.window === "todas" ? "" : filters.window,
        situacao: filters.status === "started" ? "" : filters.status,
        ordem: filters.sort === "fim" ? "" : filters.sort,
        desconto: filters.minDiscount === null ? "" : String(filters.minDiscount),
        q: filters.q,
        ...patch,
      };

      for (const [key, value] of Object.entries(merged)) {
        set(key, typeof value === "string" ? value : "");
      }
      // Qualquer mudança de filtro volta para a primeira página.
      push(params);
    },
    [filters, push],
  );

  // Busca com debounce: não recarrega a cada tecla.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (value.trim() !== filters.q) apply({ q: value.trim() });
    }, 400);
  };

  const accountSet = useMemo(() => new Set(filters.accounts), [filters.accounts]);
  const typeSet = useMemo(() => new Set(filters.types), [filters.types]);
  const hasFilters =
    filters.accounts.length > 0 ||
    filters.types.length > 0 ||
    filters.window !== "todas" ||
    filters.status !== "started" ||
    filters.q !== "" ||
    filters.sort !== "fim" ||
    filters.minDiscount !== null;

  return (
    <section className="rounded-xl border border-hairline bg-superficie p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Visão */}
        <div className="inline-flex rounded-lg border border-hairline bg-fundo p-0.5">
          {PROMO_STATUSES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => apply({ situacao: option.value === "started" ? "" : option.value })}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                filters.status === option.value
                  ? "bg-superficie text-marca-forte shadow-[0_1px_3px_rgba(16,24,40,0.10)]"
                  : "text-tinta-suave hover:text-tinta",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Janela de término */}
        <Dropdown
          icon={<Timer className="size-3.5" aria-hidden />}
          label={
            filters.window === "todas"
              ? "Qualquer prazo"
              : (PROMO_WINDOWS.find((w) => w.value === filters.window)?.label ?? "Qualquer prazo")
          }
          active={filters.window !== "todas"}
        >
          {(close) => (
            <>
              {PROMO_WINDOWS.map((option) => (
                <Option
                  key={option.value}
                  selected={filters.window === option.value}
                  onClick={() => {
                    apply({ janela: option.value === "todas" ? "" : option.value });
                    close();
                  }}
                >
                  {option.label}
                </Option>
              ))}
            </>
          )}
        </Dropdown>

        {/* Desconto mínimo */}
        <Dropdown
          icon={<Percent className="size-3.5" aria-hidden />}
          label={
            filters.minDiscount === null
              ? "Qualquer desconto"
              : `A partir de ${filters.minDiscount}%`
          }
          active={filters.minDiscount !== null}
        >
          {(close) => (
            <>
              {PROMO_DISCOUNTS.map((option) => (
                <Option
                  key={String(option.value)}
                  selected={filters.minDiscount === option.value}
                  onClick={() => {
                    apply({ desconto: option.value === null ? "" : String(option.value) });
                    close();
                  }}
                >
                  {option.label}
                </Option>
              ))}
            </>
          )}
        </Dropdown>

        {/* Contas */}
        <Dropdown
          icon={<Store className="size-3.5" aria-hidden />}
          label={
            filters.accounts.length === 0
              ? "Todas as contas"
              : `${filters.accounts.length} conta(s)`
          }
          active={filters.accounts.length > 0}
        >
          {() => (
            <>
              {accounts.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] text-tinta-fraca">Nenhuma conta com promoção.</p>
              ) : (
                accounts.map((account) => (
                  <Option
                    key={account.accountId}
                    selected={accountSet.has(account.accountId)}
                    onClick={() => {
                      const next = new Set(accountSet);
                      if (next.has(account.accountId)) next.delete(account.accountId);
                      else next.add(account.accountId);
                      apply({ contas: Array.from(next).join(",") });
                    }}
                  >
                    {account.nickname}
                  </Option>
                ))
              )}
            </>
          )}
        </Dropdown>

        {/* Tipos */}
        <Dropdown
          icon={<Tags className="size-3.5" aria-hidden />}
          label={filters.types.length === 0 ? "Todos os tipos" : `${filters.types.length} tipo(s)`}
          active={filters.types.length > 0}
        >
          {() => (
            <>
              {types.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] text-tinta-fraca">Nenhum tipo no momento.</p>
              ) : (
                types.map((item) => (
                  <Option
                    key={item.type}
                    selected={typeSet.has(item.type)}
                    onClick={() => {
                      const next = new Set(typeSet);
                      if (next.has(item.type)) next.delete(item.type);
                      else next.add(item.type);
                      apply({ tipos: Array.from(next).join(",") });
                    }}
                  >
                    <span className="flex-1">{promoTypeLabel(item.type)}</span>
                    <span className="text-[11px] text-tinta-fraca">{item.total}</span>
                  </Option>
                ))
              )}
            </>
          )}
        </Dropdown>

        {/* Ordem */}
        <Dropdown
          label={
            filters.sort === "desconto"
              ? "Maior desconto"
              : filters.sort === "preco"
                ? "Menor preço"
                : "Termina antes"
          }
          active={filters.sort !== "fim"}
        >
          {(close) => (
            <>
              {[
                { value: "fim", label: "Termina antes" },
                { value: "desconto", label: "Maior desconto" },
                { value: "preco", label: "Menor preço" },
              ].map((option) => (
                <Option
                  key={option.value}
                  selected={filters.sort === option.value}
                  onClick={() => {
                    apply({ ordem: option.value === "fim" ? "" : option.value });
                    close();
                  }}
                >
                  {option.label}
                </Option>
              ))}
            </>
          )}
        </Dropdown>

        {/* Busca */}
        <div className="relative ml-auto">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tinta-fraca"
            aria-hidden
          />
          <input
            type="search"
            defaultValue={filters.q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Anúncio, MLB ou campanha…"
            aria-label="Buscar anúncio, código ou campanha"
            className="h-8.5 w-[230px] rounded-lg border border-hairline bg-superficie pl-8 pr-3 text-[12.5px] text-tinta placeholder:text-tinta-fraca focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca-borda"
          />
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => push(new URLSearchParams())}
            className="inline-flex h-8.5 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-[12.5px] font-medium text-tinta-suave transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Limpar
          </button>
        )}

        {pending && <Loader2 className="size-4 animate-spin text-marca-forte" aria-label="Carregando" />}
      </div>
    </section>
  );
}

function Dropdown({
  icon,
  label,
  active,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "inline-flex h-8.5 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
          active
            ? "border-marca-borda bg-marca-suave text-marca-forte"
            : "border-hairline bg-superficie text-tinta hover:border-marca-borda hover:bg-marca-suave",
        )}
      >
        {icon}
        <span className="max-w-[170px] truncate">{label}</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-[320px] w-[250px] overflow-y-auto rounded-xl border border-hairline bg-superficie p-1 shadow-[0_12px_32px_-8px_rgba(16,24,40,0.18)]">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function Option({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
        selected ? "bg-marca-suave font-semibold text-marca-forte" : "text-tinta hover:bg-fundo",
      )}
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded border",
          selected ? "border-marca bg-marca text-white" : "border-hairline",
        )}
        aria-hidden
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}
