"use client";

import { useEffect, useState } from "react";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";
import FiltrosDashboard, { FiltroPeriodo } from "./FiltrosDashboard";
import FiltrosDashboardExtra, { type FiltroCanal, type FiltroStatus, type FiltroTipoAnuncio, type FiltroModalidadeEnvio } from "./FiltrosDashboardExtra";
import FiltroSKU, { type FiltroAgrupamentoSKU } from "./FiltroSKU";
import BotaoSincronizarDashboard from "./BotaoSincronizarDashboard";
import { LogoCanal } from "../comum/logos";
import { API_CONFIG } from "@/lib/api-config";

interface HeaderDashboardProps {
  periodoAtivo: FiltroPeriodo;
  onPeriodoChange: (periodo: FiltroPeriodo) => void;
  onPeriodoPersonalizadoChange?: (dataInicio: Date, dataFim: Date) => void;
  canalAtivo: FiltroCanal;
  onCanalChange: (v: FiltroCanal) => void;
  statusAtivo: FiltroStatus;
  onStatusChange: (v: FiltroStatus) => void;
  tipoAnuncioAtivo: FiltroTipoAnuncio;
  onTipoAnuncioChange: (v: FiltroTipoAnuncio) => void;
  modalidadeEnvioAtiva: FiltroModalidadeEnvio;
  onModalidadeEnvioChange: (v: FiltroModalidadeEnvio) => void;
  agrupamentoSKUAtivo: FiltroAgrupamentoSKU;
  onAgrupamentoSKUChange: (v: FiltroAgrupamentoSKU) => void;
  onForceRefresh: () => void;
  selectedAccount?: { platform: 'meli' | 'shopee' | 'todos'; id?: string; label?: string };
  onAccountChange?: (account: { platform: 'meli' | 'shopee' | 'todos'; id?: string; label?: string }) => void;
}

export default function HeaderDashboard({
  periodoAtivo,
  onPeriodoChange,
  onPeriodoPersonalizadoChange,
  canalAtivo,
  onCanalChange,
  statusAtivo,
  onStatusChange,
  tipoAnuncioAtivo,
  onTipoAnuncioChange,
  modalidadeEnvioAtiva,
  onModalidadeEnvioChange,
  agrupamentoSKUAtivo,
  onAgrupamentoSKUChange,
  onForceRefresh,
  selectedAccount,
  onAccountChange,
}: HeaderDashboardProps) {
  const [showContasDropdown, setShowContasDropdown] = useState(false);
  const contasDropdown = useSmartDropdown<HTMLButtonElement>({
    isOpen: showContasDropdown,
    onClose: () => setShowContasDropdown(false),
    preferredPosition: 'bottom-right',
    offset: 8,
    minDistanceFromEdge: 16
  });
  const [contasML, setContasML] = useState<Array<{ id: string; nickname: string | null; ml_user_id: number; expires_at: string }>>([]);
  const [contasShopee, setContasShopee] = useState<Array<{ id: string; shop_id: string; shop_name: string | null; expires_at: string }>>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  useEffect(() => {
    if (!showContasDropdown) return;
    let aborted = false;
    const load = async () => {
      try {
        setIsLoadingAccounts(true);
        
        // Carregar contas do Mercado Livre
        const resML = await API_CONFIG.fetch('/api/meli/accounts', { cache: 'no-store', credentials: 'include' });
        if (resML.ok) {
          const rowsML = await resML.json();
          if (!aborted) setContasML(rowsML || []);
        }

        // Carregar contas do Shopee
        const resShopee = await API_CONFIG.fetch('/api/shopee/accounts', { cache: 'no-store', credentials: 'include' });
        if (resShopee.ok) {
          const rowsShopee = await resShopee.json();
          if (!aborted) setContasShopee(rowsShopee || []);
        }
      } catch {
        if (!aborted) {
          setContasML([]);
          setContasShopee([]);
        }
      } finally {
        if (!aborted) setIsLoadingAccounts(false);
      }
    };
    load();
    return () => { aborted = true; };
  }, [showContasDropdown]);

  const handleSyncComplete = () => {
    // Recarregar dados do dashboard após sincronização
    onForceRefresh();
  };

  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
        <div className="text-left w-full sm:flex-1">
          <h1 className="cz-titulo text-[20px] leading-7 sm:text-[22px]">Dashboard</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--cz-texto-suave)]">
            Visão geral das estatísticas e métricas do negócio.
          </p>
        </div>
        
        {/* Sincronizar: UM clique, e o progresso ao lado do botão.
            O menu de plataforma e o modal de conferência que ficavam aqui viraram
            quatro cliques para confirmar sempre o mesmo padrão ("todas as
            contas"). Ver o cabeçalho de `BotaoSincronizarDashboard`. */}
        <BotaoSincronizarDashboard onConcluido={handleSyncComplete} />
      </div>

      {/* Filtros e Contas */}
      <div className="mt-4 sm:mt-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap w-full">
          {/* Filtro de Agrupamento por SKU */}
          <FiltroSKU
            agrupamentoAtivo={agrupamentoSKUAtivo}
            onAgrupamentoChange={onAgrupamentoSKUChange}
          />
          
          <FiltrosDashboardExtra 
            canalAtivo={canalAtivo}
            onCanalChange={onCanalChange}
            statusAtivo={statusAtivo}
            onStatusChange={onStatusChange}
            tipoAnuncioAtivo={tipoAnuncioAtivo}
            onTipoAnuncioChange={onTipoAnuncioChange}
            modalidadeEnvioAtiva={modalidadeEnvioAtiva}
            onModalidadeEnvioChange={onModalidadeEnvioChange}
          />
          <FiltrosDashboard
            periodoAtivo={periodoAtivo}
            onPeriodoChange={onPeriodoChange}
            onPeriodoPersonalizadoChange={onPeriodoPersonalizadoChange}
          />
        </div>

        {/* Contas Dropdown */}
        <div className="flex-shrink-0 w-full sm:w-auto">
          <div className="relative w-full">
            <button
              ref={contasDropdown.triggerRef}
              onClick={() => setShowContasDropdown(!showContasDropdown)}
              className={`w-full sm:w-auto justify-center inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all duration-200 ${
                showContasDropdown 
                  ? "border-gray-400 bg-gray-50 text-gray-900" 
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400"
              }`}
            >
              {/* Com uma conta escolhida, o LOGO do canal entra no lugar do
                  ícone genérico de pessoas: o gatilho passa a dizer de qual
                  marketplace é a conta selecionada sem gastar palavra nenhuma —
                  hoje ele mostrava só o apelido, e apelido de loja não diz o
                  canal. Sem seleção, volta o ícone de contas. */}
              {selectedAccount?.platform === 'meli' || selectedAccount?.platform === 'shopee' ? (
                <LogoCanal canal={selectedAccount.platform === 'meli' ? 'ML' : 'SP'} />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              )}
              <span className="max-w-[180px] truncate">{selectedAccount?.label ? selectedAccount.label : 'Contas'}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showContasDropdown ? 'rotate-180' : ''}`}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>
            {contasDropdown.isVisible && (
              <div 
                ref={contasDropdown.dropdownRef}
                className={`smart-dropdown w-80 ${contasDropdown.isOpen ? 'dropdown-enter' : 'dropdown-exit'}`}
                style={contasDropdown.position}
              >
                <div className="p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-xs font-semibold text-gray-900">Selecionar conta</h3>
                    <button
                      className="text-[11px] text-gray-600 hover:text-gray-900 underline"
                      onClick={() => {
                        onAccountChange && onAccountChange({ platform: 'todos' });
                        setShowContasDropdown(false);
                      }}
                    >
                      Limpar filtro
                    </button>
                  </div>
                  {/* O nome do marketplace com o LOGO ao lado, em vez de só o
                      texto. As duas listas ficam uma embaixo da outra e são
                      tipograficamente idênticas; o logo é o que faz a pessoa
                      achar a seção certa antes de ler qualquer coisa. */}
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                      <LogoCanal canal="ML" />
                      Mercado Livre
                    </h3>
                    {isLoadingAccounts ? (
                      <div className="text-xs text-gray-600">Carregando...</div>
                    ) : contasML.length === 0 ? (
                      <div className="text-xs text-gray-600">Nenhuma conta conectada</div>
                    ) : (
                      <ul className="space-y-1">
                        {contasML.map((c) => (
                          <li key={c.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-gray-50">
                            <button
                              className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${selectedAccount?.platform === 'meli' && selectedAccount?.id === c.id ? 'font-semibold text-gray-900' : 'text-gray-800'}`}
                              onClick={() => {
                                onAccountChange && onAccountChange({ platform: 'meli', id: c.id, label: c.nickname || `Usuário ${c.ml_user_id}` });
                                setShowContasDropdown(false);
                              }}
                            >
                              {/* Repetido em cada linha, e não só no título: a
                                  lista rola, e com o cabeçalho fora de vista a
                                  linha perderia o canal. */}
                              <LogoCanal canal="ML" className="shrink-0" />
                              <span className="truncate">{c.nickname || `Usuário ${c.ml_user_id}`}</span>
                            </button>
                            <span className={`ml-2 shrink-0 px-2 py-0.5 rounded-full ${new Date(c.expires_at).getTime() > Date.now() ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {new Date(c.expires_at).getTime() > Date.now() ? 'Ativa' : 'Inativa'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                      <LogoCanal canal="SP" />
                      Shopee
                    </h3>
                    {isLoadingAccounts ? (
                      <div className="text-xs text-gray-600">Carregando...</div>
                    ) : contasShopee.length === 0 ? (
                      <div className="text-xs text-gray-600">Nenhuma conta conectada</div>
                    ) : (
                      <ul className="space-y-1">
                        {contasShopee.map((c) => (
                          <li key={c.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-gray-50">
                            <button
                              className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${selectedAccount?.platform === 'shopee' && selectedAccount?.id === c.id ? 'font-semibold text-gray-900' : 'text-gray-800'}`}
                              onClick={() => {
                                onAccountChange && onAccountChange({ platform: 'shopee', id: c.id, label: c.shop_name || `Shop ${c.shop_id}` });
                                setShowContasDropdown(false);
                              }}
                            >
                              <LogoCanal canal="SP" className="shrink-0" />
                              <span className="truncate">{c.shop_name || `Shop ${c.shop_id}`}</span>
                            </button>
                            <span className={`ml-2 shrink-0 px-2 py-0.5 rounded-full ${new Date(c.expires_at).getTime() > Date.now() ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {new Date(c.expires_at).getTime() > Date.now() ? 'Ativa' : 'Inativa'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

