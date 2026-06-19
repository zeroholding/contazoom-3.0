"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import gsap from "gsap";
import Sidebar from "@/app/components/views/ui/Sidebar";
import Topbar from "@/app/components/views/ui/Topbar";
import { toast } from "@/hooks/use-toast";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";
const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function ConfiguracaoFretePage() {
  // Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Config state
  const [config, setConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [custoPorPacote, setCustoPorPacote] = useState("");
  const [unidadesPorCobranca, setUnidadesPorCobranca] = useState("1");
  const [descricao, setDescricao] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Layout init
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

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Fetch config
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/configuracoes/flex");
      if (res.ok) {
        const data = await res.json();
        const active = data.configs?.[0] || null;
        setConfig(active);
        if (active) {
          setCustoPorPacote(String(active.custoPorPacote));
          setUnidadesPorCobranca(String(active.unidadesPorCobranca));
          setDescricao(active.descricao || "");
        }
      }
    } catch (error) {
      console.error("Erro ao buscar configuração:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const custo = parseFloat(custoPorPacote);
    const unidades = parseInt(unidadesPorCobranca);

    if (!custo || custo <= 0) {
      toast({ title: "Erro", description: "Informe um custo válido maior que zero.", variant: "destructive" });
      return;
    }
    if (!unidades || unidades < 1) {
      toast({ title: "Erro", description: "Unidades deve ser pelo menos 1.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/configuracoes/flex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custoPorPacote: custo, unidadesPorCobranca: unidades, descricao }),
      });

      if (res.ok) {
        toast({ title: "✅ Salvo", description: "Configuração de frete Flex salva com sucesso!" });
        setIsEditing(false);
        fetchConfig();
      } else {
        const err = await res.json();
        toast({ title: "Erro", description: err.error || "Erro ao salvar", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro de conexão", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    if (!confirm("Tem certeza que deseja remover a configuração de custo Flex?")) return;

    try {
      const res = await fetch(`/api/configuracoes/flex/${config.id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "✅ Removido", description: "Configuração removida com sucesso." });
        setConfig(null);
        setCustoPorPacote("");
        setUnidadesPorCobranca("1");
        setDescricao("");
        setIsEditing(false);
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao remover", variant: "destructive" });
    }
  };

  // Example calculation
  const custoNum = parseFloat(custoPorPacote) || 0;
  const unidadesNum = parseInt(unidadesPorCobranca) || 1;
  const exemploReceita = 1.10;
  const exemploCusto = Math.ceil(1 / unidadesNum) * custoNum;
  const exemploLiquido = exemploReceita - exemploCusto;

  const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div ref={containerRef} className="flex h-screen bg-[#F3F3F3] font-sans">
      <Sidebar
        collapsed={isSidebarCollapsed}
        mobileOpen={isSidebarMobileOpen}
        onMobileClose={() => setIsSidebarMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden lg:ml-[var(--sidebar-w)] transition-all duration-200">
        <Topbar
          collapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          onMobileMenu={() => setIsSidebarMobileOpen(true)}
        />
        <main className="flex-1 overflow-auto pt-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Configuração de Frete Flex</h1>
              <p className="mt-1 text-sm text-gray-500">
                Configure o custo da transportadora para envios na modalidade Flex do Mercado Livre.
                Este valor será usado para calcular o débito real do frete em todas as vendas Flex.
              </p>
            </div>

            {isLoading ? (
              <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-gray-200 rounded w-1/3 mx-auto"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3 mx-auto"></div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Current Config Card */}
                {config && !isEditing && (
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
                      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        📦 Configuração Ativa
                      </h2>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Custo por Pacote</div>
                          <div className="mt-1 text-2xl font-bold text-gray-900">
                            {formatCurrency(Number(config.custoPorPacote))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Unidades por Cobrança</div>
                          <div className="mt-1 text-2xl font-bold text-gray-900">
                            {config.unidadesPorCobranca} un
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Custo por Unidade</div>
                          <div className="mt-1 text-2xl font-bold text-orange-600">
                            {formatCurrency(Number(config.custoPorPacote) / config.unidadesPorCobranca)}
                          </div>
                        </div>
                      </div>
                      {config.descricao && (
                        <div className="mt-4 text-sm text-gray-500">
                          <span className="font-medium">Descrição:</span> {config.descricao}
                        </div>
                      )}
                      <div className="mt-6 flex gap-3">
                        <button
                          onClick={() => setIsEditing(true)}
                          className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={handleDelete}
                          className="px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                        >
                          🗑️ Remover
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Form */}
                {(!config || isEditing) && (
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">
                      <h2 className="text-lg font-semibold text-white">
                        {config ? "✏️ Editar Configuração" : "➕ Nova Configuração"}
                      </h2>
                    </div>
                    <div className="p-6 space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Custo por Pacote (R$) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={custoPorPacote}
                            onChange={(e) => setCustoPorPacote(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="12.00"
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">Valor que você paga à transportadora por pacote Flex</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Unidades por Cobrança *
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={unidadesPorCobranca}
                          onChange={(e) => setUnidadesPorCobranca(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="1"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Quantas unidades cada cobrança cobre (padrão: 1). Ex: se a transportadora cobra R$ 12 a cada 2 unidades, coloque 2.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Descrição (opcional)
                        </label>
                        <input
                          type="text"
                          value={descricao}
                          onChange={(e) => setDescricao(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="Ex: Transportadora XYZ"
                        />
                      </div>

                      {/* Example Calculation */}
                      {custoNum > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Exemplo de Cálculo (1 unidade vendida)</div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Receita Flex (ML)</span>
                              <span className="font-semibold text-green-600">+{formatCurrency(exemploReceita)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Custo Transportadora</span>
                              <span className="font-semibold text-red-600">-{formatCurrency(exemploCusto)}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between text-sm">
                              <span className="font-medium text-gray-700">Resultado Líquido</span>
                              <span className={`font-bold ${exemploLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(exemploLiquido)}
                              </span>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] text-gray-400">* Receita Flex de exemplo (R$ 1,10). O valor real varia por venda.</p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleSave}
                          disabled={isSaving}
                          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {isSaving ? "Salvando..." : "💾 Salvar Configuração"}
                        </button>
                        {isEditing && (
                          <button
                            onClick={() => {
                              setIsEditing(false);
                              if (config) {
                                setCustoPorPacote(String(config.custoPorPacote));
                                setUnidadesPorCobranca(String(config.unidadesPorCobranca));
                                setDescricao(config.descricao || "");
                              }
                            }}
                            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Info Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-blue-800 mb-2">ℹ️ Como funciona</h3>
                  <ul className="text-xs text-blue-700 space-y-1.5">
                    <li>• O custo configurado será aplicado automaticamente em <strong>todas as vendas com envio Flex</strong> do Mercado Livre.</li>
                    <li>• O cálculo é: <code className="bg-blue-100 px-1 rounded">ceil(quantidade ÷ unidades) × custo</code></li>
                    <li>• O resultado líquido (receita ML - custo transportadora) aparecerá no <strong>dropdown de frete</strong> de cada venda e no <strong>dashboard</strong>.</li>
                    <li>• A configuração é <strong>retroativa</strong>: ao salvar, todas as vendas Flex passadas serão recalculadas.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
