"use client";

import { useEffect, useState } from "react";
import { useSmartDropdown } from "@/hooks/useSmartDropdown";
import FiltrosDashboard, { FiltroPeriodo } from "./FiltrosDashboard";
import FiltrosDashboardExtra, { type FiltroCanal, type FiltroStatus, type FiltroTipoAnuncio, type FiltroModalidadeEnvio } from "./FiltrosDashboardExtra";
import FiltroSKU, { type FiltroAgrupamentoSKU } from "./FiltroSKU";
import BotaoSincronizarDashboard from "./BotaoSincronizarDashboard";
import { LogoCanal, type CanalLogo } from "../comum/logos";
import { API_CONFIG } from "@/lib/api-config";
import FiltrosSheet from "@/components/ui/FiltrosSheet";

/**
 * Valores de fábrica dos filtros do Dashboard.
 *
 * Moram aqui, e o `Dashboard` parte deles, porque dois lugares precisam da mesma
 * resposta para "isto é o padrão?": o estado inicial da tela e o "Limpar" da folha
 * de filtros do celular (que também conta quantos filtros fogem do padrão para
 * mostrar o selo no botão). Com o número escrito nos dois, o selo passaria a
 * acusar um filtro ativo que ninguém mexeu — foi o que o `status: pagos`
 * provocaria se o padrão fosse assumido como "todos".
 */
export const FILTROS_PADRAO = {
  agrupamento: "mlb" as FiltroAgrupamentoSKU,
  canal: "todos" as FiltroCanal,
  status: "pagos" as FiltroStatus,
  tipoAnuncio: "todos" as FiltroTipoAnuncio,
  modalidadeEnvio: "todos" as FiltroModalidadeEnvio,
};

/** Plataforma da conta escolhida no dropdown (`todos` = sem filtro de conta). */
type PlataformaConta = 'meli' | 'shopee' | 'tiktok' | 'todos';

/**
 * A plataforma da conta -> o canal do logo.
 *
 * Era `platform === 'meli' ? 'ML' : 'SP'`, e ternário binário com TRÊS canais cai
 * silenciosamente no último ramo: o TikTok aparecia com o logo da Shopee.
 */
const CANAL_DA_PLATAFORMA: Record<'meli' | 'shopee' | 'tiktok', CanalLogo> = {
  meli: 'ML',
  shopee: 'SP',
  tiktok: 'TT',
};

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
  selectedAccount?: { platform: PlataformaConta; id?: string; label?: string };
  onAccountChange?: (account: { platform: PlataformaConta; id?: string; label?: string }) => void;
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
  const [contasTiktok, setContasTiktok] = useState<Array<{ id: string; shop_id: string; shop_name: string | null; expires_at: string }>>([]);
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

        // Carregar contas do TikTok Shop
        const resTiktok = await API_CONFIG.fetch('/api/tiktok/accounts', { cache: 'no-store', credentials: 'include' });
        if (resTiktok.ok) {
          const rowsTiktok = await resTiktok.json();
          if (!aborted) setContasTiktok(rowsTiktok || []);
        }
      } catch {
        if (!aborted) {
          setContasML([]);
          setContasShopee([]);
          setContasTiktok([]);
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

  // Folha de filtros do celular: quantos filtros fogem do padrão, e como voltar.
  // Período e conta ficam FORA da folha (são os dois que mudam toda hora), então
  // não entram na conta.
  const filtrosAtivos =
    Number(agrupamentoSKUAtivo !== FILTROS_PADRAO.agrupamento) +
    Number(canalAtivo !== FILTROS_PADRAO.canal) +
    Number(statusAtivo !== FILTROS_PADRAO.status) +
    Number(tipoAnuncioAtivo !== FILTROS_PADRAO.tipoAnuncio) +
    Number(modalidadeEnvioAtiva !== FILTROS_PADRAO.modalidadeEnvio);

  const limparFiltros = () => {
    onAgrupamentoSKUChange(FILTROS_PADRAO.agrupamento);
    onCanalChange(FILTROS_PADRAO.canal);
    onStatusChange(FILTROS_PADRAO.status);
    onTipoAnuncioChange(FILTROS_PADRAO.tipoAnuncio);
    onModalidadeEnvioChange(FILTROS_PADRAO.modalidadeEnvio);
  };

  return (
    <div className="mb-6 max-md:mb-4 max-md:[&_button.h-10]:h-12 max-md:[&_button.h-11]:px-3 max-md:[&_button[class*='max-md:min-h-11']]:px-3 max-md:[&_.smart-dropdown_button]:min-h-11 max-md:[&_.smart-dropdown_button.underline]:text-[13px] max-md:[&_.smart-dropdown_li]:py-0 max-md:[&_.smart-dropdown_li]:text-sm max-md:[&_[role=status]_span]:text-xs max-md:[&_[role=status]_span.truncate]:whitespace-normal max-md:[&_[role=status]_span.truncate]:line-clamp-2">
      {/* Celular, por seletores de descendente (todos `max-md:`): o botão de sincronizar vai
          a 48px; toda opção dos dropdowns de Período e Contas ganha 44px de altura (a lista
          de contas tinha linhas de ~26px, com o botão só do tamanho do texto); e o texto de
          progresso da sincronização passa de 11px para 12px e pode quebrar em 2 linhas, em
          vez de cortar "Mercado Livre: falha ao…" no meio. */}
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
      {/* No celular as três peças (Filtros, período e contas) dividem UMA linha,
          quebrando para a seguinte só se não couberem; os sete chips de antes
          empilhavam ~200px no topo da tela. */}
      <div className="mt-4 sm:mt-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4 max-md:flex-row max-md:flex-wrap max-md:items-center max-md:justify-start max-md:gap-2">
        <div className="flex items-center gap-3 flex-wrap w-full max-md:w-auto max-md:gap-2">
          {/* Agrupamento por SKU e filtros extras: no desktop ficam soltos aqui,
              como sempre; no celular viram o botão "Filtros" + folha inferior. */}
          <FiltrosSheet titulo="Filtros" ativos={filtrosAtivos} onLimpar={limparFiltros}>
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
          </FiltrosSheet>
          <FiltrosDashboard
            periodoAtivo={periodoAtivo}
            onPeriodoChange={onPeriodoChange}
            onPeriodoPersonalizadoChange={onPeriodoPersonalizadoChange}
          />
        </div>

        {/* Contas Dropdown */}
        <div className="flex-shrink-0 w-full sm:w-auto max-md:w-auto">
          <div className="relative w-full max-md:w-auto">
            <button
              ref={contasDropdown.triggerRef}
              onClick={() => setShowContasDropdown(!showContasDropdown)}
              className={`w-full sm:w-auto max-md:w-auto justify-center inline-flex items-center gap-2 px-3 py-1.5 max-md:min-h-11 max-md:px-3.5 max-md:text-[14px] rounded-md border text-xs font-medium transition-all duration-200 ${
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
              {selectedAccount && selectedAccount.platform !== 'todos' ? (
                <LogoCanal canal={CANAL_DA_PLATAFORMA[selectedAccount.platform]} />
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
                {/* Celular: o conteúdo rola dentro do dropdown (55% da altura da janela). Com três
                    listas de contas ele passava de 450px e ia parar por baixo da barra de abas. */}
                <div className="p-3 space-y-3 max-md:max-h-[55dvh] max-md:overflow-y-auto max-md:overscroll-contain">
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
                      texto. As três listas ficam uma embaixo da outra e são
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
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                      <LogoCanal canal="TT" />
                      TikTok Shop
                    </h3>
                    {isLoadingAccounts ? (
                      <div className="text-xs text-gray-600">Carregando...</div>
                    ) : contasTiktok.length === 0 ? (
                      <div className="text-xs text-gray-600">Nenhuma conta conectada</div>
                    ) : (
                      <ul className="space-y-1">
                        {contasTiktok.map((c) => (
                          <li key={c.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-gray-50">
                            <button
                              className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${selectedAccount?.platform === 'tiktok' && selectedAccount?.id === c.id ? 'font-semibold text-gray-900' : 'text-gray-800'}`}
                              onClick={() => {
                                onAccountChange && onAccountChange({ platform: 'tiktok', id: c.id, label: c.shop_name || `Loja ${c.shop_id}` });
                                setShowContasDropdown(false);
                              }}
                            >
                              <LogoCanal canal="TT" className="shrink-0" />
                              <span className="truncate">{c.shop_name || `Loja ${c.shop_id}`}</span>
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

