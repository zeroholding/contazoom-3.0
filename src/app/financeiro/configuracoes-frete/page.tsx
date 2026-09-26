"use client";

import {
  AlertCircle,
  Calculator,
  Info,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import gsap from "gsap";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import Sidebar from "@/app/components/views/ui/Sidebar";
import Topbar from "@/app/components/views/ui/Topbar";
import { toast } from "@/hooks/use-toast";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";
const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type FlexConfig = {
  id: string;
  custoPorPacote: number | string;
  unidadesPorCobranca: number;
  descricao: string | null;
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ConfiguracaoFretePage() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [config, setConfig] = useState<FlexConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [custoPorPacote, setCustoPorPacote] = useState("");
  const [unidadesPorCobranca, setUnidadesPorCobranca] = useState("1");
  const [descricao, setDescricao] = useState("");

  useIsoLayout(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "1") setIsSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    gsap.to(containerRef.current, {
      duration: 0.2,
      ease: "power2.out",
      css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W },
    });
  }, [isSidebarCollapsed]);

  const fillForm = useCallback((active: FlexConfig | null) => {
    setCustoPorPacote(active ? String(active.custoPorPacote) : "");
    setUnidadesPorCobranca(active ? String(active.unidadesPorCobranca) : "1");
    setDescricao(active?.descricao ?? "");
  }, []);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/configuracoes/flex", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar a configuração");

      const active = (data.configs?.[0] as FlexConfig | undefined) ?? null;
      setConfig(active);
      fillForm(active);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar a configuração");
    } finally {
      setIsLoading(false);
    }
  }, [fillForm]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem(LS_KEY, next ? "1" : "0");
      return next;
    });
  };

  const parsedCost = Number(custoPorPacote.replace(",", "."));
  const parsedUnits = Number(unidadesPorCobranca);
  const validCost = Number.isFinite(parsedCost) && parsedCost > 0;
  const validUnits = Number.isInteger(parsedUnits) && parsedUnits >= 1;
  const costPerUnit = validCost && validUnits ? parsedCost / parsedUnits : 0;
  const exampleRevenue = 1.1;
  const exampleCost = validCost && validUnits ? Math.ceil(1 / parsedUnits) * parsedCost : 0;
  const exampleNet = exampleRevenue - exampleCost;

  const handleSave = async () => {
    if (!validCost) {
      toast({ title: "Custo inválido", description: "Informe um custo maior que zero.", variant: "destructive" });
      return;
    }
    if (!validUnits) {
      toast({ title: "Quantidade inválida", description: "Use um número inteiro igual ou maior que 1.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/configuracoes/flex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custoPorPacote: parsedCost,
          unidadesPorCobranca: parsedUnits,
          descricao: descricao.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao salvar configuração");

      setConfig(data.config as FlexConfig);
      fillForm(data.config as FlexConfig);
      setIsEditing(false);
      toast({ title: "Configuração salva", description: "O custo Flex já está disponível nos cálculos." });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro de conexão",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/configuracoes/flex/${config.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao remover configuração");

      setConfig(null);
      fillForm(null);
      setIsEditing(false);
      setConfirmingDelete(false);
      toast({ title: "Configuração removida", description: "O custo personalizado deixou de ser aplicado." });
    } catch (error) {
      toast({
        title: "Erro ao remover",
        description: error instanceof Error ? error.message : "Erro de conexão",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelEdit = () => {
    fillForm(config);
    setIsEditing(false);
  };

  return (
    <div ref={containerRef} className="flex h-screen bg-[var(--cz-fundo)] font-sans">
      <Sidebar
        collapsed={isSidebarCollapsed}
        mobileOpen={isSidebarMobileOpen}
        onMobileClose={() => setIsSidebarMobileOpen(false)}
      />
      <div className="flex h-screen flex-1 flex-col overflow-hidden transition-all duration-200 lg:ml-[var(--sidebar-w)]">
        <Topbar
          collapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          onMobileMenu={() => setIsSidebarMobileOpen(true)}
        />

        <main className="flex-1 overflow-auto pt-[var(--cz-topbar-h)]">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <header className="mb-6">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--cz-laranja-forte)]">
                <Calculator className="size-4" />
                Financeiro
              </div>
              <h1 className="mt-1 text-2xl font-extrabold text-[var(--cz-texto)] sm:text-3xl">
                Configuração de Frete Flex
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--cz-texto-suave)]">
                Informe quanto a transportadora cobra e quantas unidades cada cobrança cobre. A regra será aplicada às vendas Flex do Mercado Livre.
              </p>
            </header>

            {isLoading ? (
              <div className="grid min-h-72 place-items-center rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
                <Loader2 className="size-8 animate-spin text-[var(--cz-laranja)]" />
              </div>
            ) : loadError ? (
              <div className="grid min-h-72 place-items-center rounded-[var(--cz-raio-cartao)] border border-rose-200 bg-[var(--cz-superficie)] p-6 text-center">
                <div>
                  <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-rose-50 text-rose-500">
                    <AlertCircle className="size-6" />
                  </div>
                  <h2 className="font-bold text-[var(--cz-texto)]">Não foi possível carregar</h2>
                  <p className="mt-1 text-sm text-[var(--cz-texto-suave)]">{loadError}</p>
                  <button
                    type="button"
                    onClick={() => void fetchConfig()}
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--cz-laranja)] px-4 text-sm font-bold text-white hover:bg-[var(--cz-laranja-forte)]"
                  >
                    <RefreshCw className="size-4" />
                    Tentar novamente
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
                <div className="space-y-5">
                  {config && !isEditing ? (
                    <section className="overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cz-hairline)] px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 place-items-center rounded-xl bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                            <Package className="size-5" />
                          </span>
                          <div>
                            <h2 className="font-extrabold text-[var(--cz-texto)]">Configuração ativa</h2>
                            <p className="text-xs text-[var(--cz-texto-suave)]">Aplicada automaticamente às vendas Flex</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                          Ativa
                        </span>
                      </div>

                      <div className="p-5">
                        <div className="grid gap-3 sm:grid-cols-3">
                          {[
                            ["Custo por cobrança", formatCurrency(Number(config.custoPorPacote))],
                            ["Unidades cobertas", `${config.unidadesPorCobranca} un`],
                            ["Custo por unidade", formatCurrency(Number(config.custoPorPacote) / config.unidadesPorCobranca)],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] p-4">
                              <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--cz-texto-fraco)]">{label}</p>
                              <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--cz-texto)]">{value}</p>
                            </div>
                          ))}
                        </div>

                        {config.descricao && (
                          <div className="mt-4 rounded-xl border border-[var(--cz-hairline)] px-4 py-3">
                            <p className="text-xs font-bold text-[var(--cz-texto-fraco)]">Descrição</p>
                            <p className="mt-0.5 text-sm text-[var(--cz-texto)]">{config.descricao}</p>
                          </div>
                        )}

                        {confirmingDelete ? (
                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                            <p className="text-sm font-semibold text-rose-700">Remover esta regra de custo Flex?</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmingDelete(false)}
                                disabled={isDeleting}
                                className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete()}
                                disabled={isDeleting}
                                className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-60"
                              >
                                {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
                                Confirmar remoção
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-5 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setIsEditing(true)}
                              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--cz-laranja)] px-4 text-sm font-bold text-white hover:bg-[var(--cz-laranja-forte)]"
                            >
                              <Pencil className="size-4" />
                              Editar configuração
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDelete(true)}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-bold text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="size-4" />
                              Remover
                            </button>
                          </div>
                        )}
                      </div>
                    </section>
                  ) : (
                    <section className="overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
                      <div className="flex items-center gap-3 border-b border-[var(--cz-hairline)] px-5 py-4">
                        <span className="grid size-10 place-items-center rounded-xl bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                          <Package className="size-5" />
                        </span>
                        <div>
                          <h2 className="font-extrabold text-[var(--cz-texto)]">{config ? "Editar configuração" : "Criar configuração"}</h2>
                          <p className="text-xs text-[var(--cz-texto-suave)]">Preencha os dados cobrados pela transportadora</p>
                        </div>
                      </div>

                      <div className="space-y-5 p-5">
                        <div className="grid gap-5 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-sm font-bold text-[var(--cz-texto)]">Custo por cobrança</span>
                            <span className="mt-1 flex h-11 items-center rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] focus-within:border-[var(--cz-laranja)] focus-within:ring-2 focus-within:ring-[var(--cz-laranja-suave)]">
                              <span className="border-r border-[var(--cz-hairline)] px-3 text-sm font-bold text-[var(--cz-texto-suave)]">R$</span>
                              <input
                                inputMode="decimal"
                                value={custoPorPacote}
                                onChange={(event) => setCustoPorPacote(event.target.value)}
                                placeholder="12,00"
                                className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-[var(--cz-texto)] outline-none"
                              />
                            </span>
                            <span className="mt-1.5 block text-xs text-[var(--cz-texto-suave)]">Valor pago a cada cobrança da transportadora.</span>
                          </label>

                          <label className="block">
                            <span className="text-sm font-bold text-[var(--cz-texto)]">Unidades por cobrança</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={unidadesPorCobranca}
                              onChange={(event) => setUnidadesPorCobranca(event.target.value)}
                              className="mt-1 h-11 w-full rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-sm font-semibold text-[var(--cz-texto)] outline-none focus:border-[var(--cz-laranja)] focus:ring-2 focus:ring-[var(--cz-laranja-suave)]"
                            />
                            <span className="mt-1.5 block text-xs text-[var(--cz-texto-suave)]">Ex.: uma cobrança a cada 2 unidades.</span>
                          </label>
                        </div>

                        <label className="block">
                          <span className="text-sm font-bold text-[var(--cz-texto)]">Descrição <span className="font-normal text-[var(--cz-texto-fraco)]">(opcional)</span></span>
                          <input
                            type="text"
                            value={descricao}
                            onChange={(event) => setDescricao(event.target.value)}
                            placeholder="Ex.: Transportadora regional"
                            maxLength={200}
                            className="mt-1 h-11 w-full rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-3 text-sm text-[var(--cz-texto)] outline-none focus:border-[var(--cz-laranja)] focus:ring-2 focus:ring-[var(--cz-laranja-suave)]"
                          />
                        </label>

                        {validCost && validUnits && (
                          <div className="rounded-xl border border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)]/50 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.05em] text-[var(--cz-laranja-forte)]">Prévia</p>
                            <div className="mt-2 flex items-end justify-between gap-3">
                              <span className="text-sm text-[var(--cz-texto-suave)]">Custo médio por unidade</span>
                              <strong className="text-xl tabular-nums text-[var(--cz-texto)]">{formatCurrency(costPerUnit)}</strong>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={isSaving}
                            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--cz-laranja)] px-5 text-sm font-bold text-white hover:bg-[var(--cz-laranja-forte)] disabled:opacity-60"
                          >
                            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                            {isSaving ? "Salvando..." : "Salvar configuração"}
                          </button>
                          {config && (
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-4 text-sm font-bold text-[var(--cz-texto-suave)] hover:bg-[var(--cz-fundo)]"
                            >
                              <X className="size-4" />
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                </div>

                <aside className="space-y-5">
                  <section className="rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-5">
                    <div className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-lg bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                        <Calculator className="size-4" />
                      </span>
                      <h2 className="font-extrabold text-[var(--cz-texto)]">Exemplo do cálculo</h2>
                    </div>
                    <div className="mt-4 space-y-2.5 text-sm">
                      <div className="flex justify-between gap-3 text-[var(--cz-texto-suave)]">
                        <span>Receita Flex do ML</span>
                        <strong className="text-emerald-600">+{formatCurrency(exampleRevenue)}</strong>
                      </div>
                      <div className="flex justify-between gap-3 text-[var(--cz-texto-suave)]">
                        <span>Custo da transportadora</span>
                        <strong className="text-rose-600">-{formatCurrency(exampleCost)}</strong>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-[var(--cz-hairline)] pt-3 font-bold text-[var(--cz-texto)]">
                        <span>Resultado líquido</span>
                        <strong className={exampleNet >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatCurrency(exampleNet)}</strong>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-[var(--cz-texto-fraco)]">Exemplo para 1 unidade e receita Flex de R$ 1,10. A receita real varia por venda.</p>
                  </section>

                  <section className="rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] p-5">
                    <div className="flex items-center gap-2 text-[var(--cz-laranja-forte)]">
                      <Info className="size-4" />
                      <h2 className="font-extrabold">Como funciona</h2>
                    </div>
                    <ul className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--cz-texto-suave)]">
                      <li>O custo é aplicado automaticamente a todas as vendas com envio Flex.</li>
                      <li><code className="rounded bg-[var(--cz-fundo)] px-1.5 py-0.5 text-xs font-bold text-[var(--cz-texto)]">ceil(quantidade ÷ unidades) × custo</code></li>
                      <li>A regra é retroativa e atualiza os cálculos do financeiro e do dashboard.</li>
                    </ul>
                  </section>
                </aside>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
