"use client";

import { useEffect, useState } from "react";
import { openVendaDetails } from "./VendaDetailsModal";
import { classifyFrete, formatCurrency, formatarFreteShopee } from "@/lib/frete";
import FreteDetailsDropdown from "./FreteDetailsDropdown";
import TaxaDetailsDropdown from "./TaxaDetailsDropdown";
import FinanceiroDetailsDropdown from "./FinanceiroDetailsDropdown";
import ReceitaLiquidaDetailsDropdown from "./ReceitaLiquidaDetailsDropdown";
import { PlataformaBadge } from "@/components/ui/PlataformaBadge";
import {
  GRUPOS_COLUNA,
  LARGURA_GRUPO,
  grupoVisivel,
  normalizarColunas,
  rotuloGrupo,
  type ColunasVisiveis,
  type GrupoColuna,
} from "./colunasVendas";

// Tipos para as vendas conforme especificação da API ML
export interface Venda {
  // 1. Dados Básicos da Venda
  id: string; // pedido - ID da venda/pedido
  dataVenda: string; // data - Data da venda
  status: string; // status - Status da venda (paid, cancelled, payment_required)
  conta?: string | null; // conta - Nome da conta ML
  meliAccountId?: string | null; // ID da conta ML para filtro
  
  // 2. Dados Financeiros
  valorTotal: number; // valor - Valor total da venda
  quantidade: number; // quantidade - Quantidade de itens
  unitario: number; // unit_price - Preço unitário
  taxaPlataforma?: number | null; // taxas - Taxa da plataforma ML
  frete: number; // frete - Valor do frete
  freteAjuste?: number | null; // frete_ajuste - Ajuste de frete calculado pelo banco
  receitaFlex?: number | null; // Repasse bruto recebido do Mercado Livre
  custoFlex?: number | null; // Custo calculado da transportadora Flex
  freteLiquidoFlex?: number | null; // Repasse ML menos custo da transportadora
  cobrancasFlex?: number | null; // Quantidade de cobranças/pacotes calculados
  flexConfigApplied?: boolean; // Indica que havia configuração ativa no cálculo
  cmv?: number | null; // cmv - Custo da Mercadoria Vendida
  imposto?: number | null; // Valor do imposto descontado na venda
  aliquotaImposto?: number | null; // Porcentagem da alíquota cadastrada que foi usada
  
  
  // 3. Dados do Produto
  titulo: string; // items[].title - Título do produto
  sku?: string | null; // items[].sku ou items[].seller_sku - SKU do produto
  
  // 4. Dados de Envio
  logisticType?: string | null; // logistic_type - Tipo de logística
  envioMode?: string | null; // envio_mode - Modo de envio
  
  // 4.1. Dados Detalhados do Frete
  freteBaseCost?: number | null; // frete_base_cost - Custo base do frete
  freteListCost?: number | null; // frete_list_cost - Custo listado do frete
  freteFinalCost?: number | null; // frete_final_cost - Custo final do frete
  freteAdjustment?: number | null; // frete_adjustment - Ajuste do frete
  freteCalculation?: any; // frete_calculation - Dados completos do cálculo
  
  // 5. Dados de Anúncio (Internal Tags)
  exposicao?: string | null; // baseado no listing_type_id
  tipoAnuncio?: string | null; // baseado nas tags[]
  ads?: string | null; // "ADS" se tem tag "ads" nas internal_tags, null se não tem
  
  // 6. Dados Raw (JSON Completo)
  raw?: any; // raw - Objeto JSON completo da venda da API ML
  
  // Campos legados mantidos para compatibilidade
  preco: number;
  comprador: string;
  plataforma: string;
  canal: string;
  tags: string[];
  internalTags: string[];
  shippingStatus?: string;
  shippingId?: string;
  margemContribuicao?: number | null;
  isMargemReal?: boolean;
  shipping?: {
    mode?: string;
    cost?: number;
    totalAmount?: number;
    logisticType?: string;
    baseCost?: number;
    finalCost?: number;
    listCost?: number;
    logisticTypeSource?: string | null;
    finalCostSource?: string | null;
    orderCostFallback?: number | null;
    quantity?: number | null;
    unitPrice?: number | null;
    diffBaseList?: number | null;
    adjustedCost?: number | null;
    adjustmentSource?: string | null;
  };
}

export type ProcessedVenda = {
  venda: Venda;
  isCalculating: boolean;
};

type PendingSkuStatus = {
  cadastrado: boolean;
  situacao?: "Sem custo" | "Nao cadastrado";
};

interface VendasTableProps {
  vendas: ProcessedVenda[];
  isLoading?: boolean;
  currentPage: number;
  itemsPerPage: number;

  /**
   * Quais pedaços da tabela mostrar.
   *
   * Era `unknown` e nem entrava no destructuring do componente — a prop era
   * aceita e jogada fora, e é por isso que o botão "Exibir/Ocultar colunas" não
   * fazia nada. Ver o cabeçalho de `colunasVendas.ts`.
   */
  colunasVisiveis?: Partial<ColunasVisiveis>;
  platform?: "Mercado Livre" | "Shopee" | "Geral";
  managePage?: boolean;
}

/**
 * Esqueleto de carregamento.
 *
 * `colunas` é passado porque o esqueleto desenhava 16 colunas para uma tabela de
 * 7: ao trocar pelo conteúdo real, a largura das células mudava e a tabela dava
 * um salto. Com o número certo, o esqueleto tem a forma do que vem — que é a
 * única razão de existir um esqueleto em vez de um spinner.
 */
function TabelaVendasSkeleton({ colunas }: { colunas: number }) {
  return (
    <div className="h-full flex flex-col">
      {/* CSS para ocultar scrollbars */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .table-scroll-container {
            overflow: auto;
            /* scrollbar-width: none; */
            /* -ms-overflow-style: none; */
          }
          .table-scroll-container::-webkit-scrollbar {
            /* display: none; Removed to allow scrolling on mobile */
          }
        `
      }} />
      
      {/* Container com scroll horizontal e vertical - scrollbar oculta */}
      <div className="flex-1 table-scroll-container relative">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {[...Array(colunas)].map((_, index) => (
                <th key={index} className="px-3 py-2 sm:px-6 sm:py-3 bg-gray-50">
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {[...Array(10)].map((_, index) => (
              <tr key={index}>
                {[...Array(colunas)].map((_, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function skuStatusKey(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

export default function VendasTable({ 
  vendas, 
  isLoading, 
  currentPage, 
  itemsPerPage,
  colunasVisiveis,
  platform = "Mercado Livre",
  managePage = false
}: VendasTableProps) {
  const [pendingSkuStatus, setPendingSkuStatus] = useState<Record<string, PendingSkuStatus>>({});

  // `normalizarColunas` em vez de um default no destructuring: o que chega pode
  // ser parcial (preferência salva antes de uma coluna nova existir), e o que
  // falta tem de virar o PADRÃO e não `undefined` — que seria falso, e faria a
  // coluna nascer escondida só para quem já usava o sistema.
  const cols = normalizarColunas(colunasVisiveis);

  const mostrar = (grupo: GrupoColuna) => grupoVisivel(cols, grupo);

  const paginatedVendas = managePage ? vendas.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ) : vendas;
  const pendingSkuRefreshKey = paginatedVendas
    .map((item) => skuStatusKey(item.venda.sku))
    .filter(Boolean)
    .sort()
    .join("|");

  useEffect(() => {
    let isMounted = true;

    async function loadPendingSkus() {
      if (!pendingSkuRefreshKey) {
        if (isMounted) setPendingSkuStatus({});
        return;
      }

      try {
        const response = await fetch("/api/sku/pendentes", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;

        const data = await response.json();
        const map: Record<string, PendingSkuStatus> = {};
        for (const item of data?.skusPendentes || []) {
          const sku = String(item?.sku || "").trim();
          if (!sku) continue;
          map[skuStatusKey(sku)] = {
            cadastrado: Boolean(item?.cadastrado),
            situacao: item?.situacao,
          };
        }

        if (isMounted) setPendingSkuStatus(map);
      } catch (error) {
        console.warn("Não foi possível carregar status de SKUs pendentes:", error);
      }
    }

    loadPendingSkus();

    return () => {
      isMounted = false;
    };
  }, [pendingSkuRefreshKey]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Pendente":
        return "bg-yellow-100 text-yellow-800";
      case "Pago":
        return "bg-blue-100 text-blue-800";
      case "Enviado":
        return "bg-purple-100 text-purple-800";
      case "Entregue":
        return "bg-green-100 text-green-800";
      case "Cancelado":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return { data: "-", hora: "-" };
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return { data: "-", hora: "-" };
    return {
      data: date.toLocaleDateString("pt-BR"),
      hora: date.toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })
    };
  };

  const translateStatus = (status: string) => {
    const statusMap: { [key: string]: string } = {
      'paid': 'Pago',
      'pago': 'Pago',
      'pending': 'Pendente',
      'pendente': 'Pendente',
      'cancelled': 'Cancelado',
      'cancelado': 'Cancelado',
      'payment_required': 'Pagamento Pendente',
      'waiting_for_payment': 'Aguardando Pagamento',
      'payment_approved': 'Pagamento Aprovado',
      'confirmed': 'Confirmado',
      'delivered': 'Entregue',
      'shipped': 'Enviado',
      'ready_to_ship': 'Pronto para Envio',
      'handling': 'Em Preparação',
      'invoiced': 'Faturado',
    };
    return statusMap[status.toLowerCase()] || status;
  };


  if (isLoading) {
    return <TabelaVendasSkeleton colunas={GRUPOS_COLUNA.filter(mostrar).length || 1} />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* CSS para ocultar scrollbars e animação de gradiente */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .table-scroll-container {
            overflow: auto;
            /* scrollbar-width: none; */
            /* -ms-overflow-style: none; */
          }
          .table-scroll-container::-webkit-scrollbar {
            /* display: none; Removed to allow scrolling on mobile */
          }
          /* Garantir que dropdowns não sejam cortados */
          .table-scroll-container .smart-dropdown {
            position: fixed !important;
          }
          @keyframes gradient-animation {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }
          .frete-positivo {
            color: #10b981; /* Emerald green modern */
            font-weight: 600;
          }
          .frete-negativo {
            color: #ef4444; /* Red modern */
            font-weight: 600;
          }
          .negative-value {
            color: #ef4444; /* Red modern */
            font-weight: 600;
          }
          .frete-neutro {
            color: #9ca3af;
            font-weight: 400;
          }

          /* Efeitos Visuais Premium - Tabela de Vendas */
          .premium-row {
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .premium-row:nth-child(even) {
            background-color: #fafafa; /* Zebra sutil */
          }
          .premium-row > td:first-child {
            position: relative;
          }
          .premium-row > td:first-child::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background-color: #f97316; /* Laranja ContaZoom */
            transform: scaleY(0);
            transition: transform 0.2s ease-in-out;
            z-index: 10;
          }
          .premium-row:hover {
            background-color: #fffaf0 !important; /* Laranja ultra claro */
            box-shadow: inset 1px 0 0 #ffedd5, inset -1px 0 0 #ffedd5, 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          }
          .premium-row:hover > td:first-child::before {
            transform: scaleY(1);
          }
          .premium-th {
            background-color: #f8fafc !important;
            border-bottom: 2px solid #e2e8f0;
            letter-spacing: 0.05em;
            color: #64748b !important;
            font-weight: 700 !important;
          }
        `
      }} />
      
      {/* Container com scroll horizontal e vertical - scrollbar completamente oculta */}
      <div className="flex-1 table-scroll-container">
        <table className="min-w-full divide-y divide-gray-200">
          {/*
            O cabeçalho é GERADO a partir da lista de grupos, não escrito à mão.
            Duas razões: o rótulo passa a acompanhar o que está de fato visível
            ("Data / Canal" com o canal desligado vira "Data"), e a `<th>` deixa
            de poder sair de sincronia com a `<td>` — elas casam por POSIÇÃO, e
            esconder só uma das duas deslocaria todas as colunas seguintes.
          */}
          <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {GRUPOS_COLUNA.filter(mostrar).map((grupo) => (
                  <th
                    key={grupo}
                    className={`px-3 py-2 sm:px-6 sm:py-3.5 text-left text-xs font-semibold uppercase tracking-wider premium-th ${LARGURA_GRUPO[grupo]}`}
                  >
                    {/* "Financeiro Detalhado" só fica com esse nome quando os três
                        valores estão visíveis; com um só, o rótulo dele é mais
                        útil que a palavra "financeiro". */}
                    {grupo === "financeiro" && rotuloGrupo(cols, grupo, platform).split(" / ").length === 3
                      ? "Financeiro Detalhado"
                      : rotuloGrupo(cols, grupo, platform)}
                  </th>
                ))}
              </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedVendas.map((item) => {
              const { venda, isCalculating } = item;
              const skuStatus = venda.sku
                ? pendingSkuStatus[skuStatusKey(venda.sku)]
                : undefined;
              
                const dateParts = formatDateTime(venda.dataVenda);
                const isShopee = venda.plataforma === "Shopee" || venda.canal === "SP" || venda.canal === "Shopee";
                const hasFlexDetails = !isShopee
                  && (venda.logisticType?.toLowerCase() === "flex" || venda.logisticType === "self_service")
                  && venda.flexConfigApplied === true
                  && venda.freteLiquidoFlex !== undefined
                  && venda.freteLiquidoFlex !== null;
                const freteExibido = hasFlexDetails ? venda.freteLiquidoFlex! : venda.frete;
                
                return (
                  <tr key={venda.id} className="premium-row">
                    {/* 1. Data / Canal */}
                    {mostrar("dataCanal") && (
                      <td className="px-3 py-2 sm:px-6 sm:py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {cols.canal && (
                            <div className="flex-shrink-0">
                              <PlataformaBadge plataforma={venda.canal || venda.plataforma} size={26} />
                            </div>
                          )}
                          {cols.data && (
                            <div className="text-sm">
                              <div className="font-semibold text-gray-900">{dateParts.data}</div>
                              <div className="text-xs text-gray-500 font-medium">{dateParts.hora}</div>
                            </div>
                          )}
                        </div>
                      </td>
                    )}

                    {/* 2. Venda / Conta */}
                    {mostrar("vendaConta") && (
                      <td className="px-3 py-2 sm:px-6 sm:py-3 whitespace-nowrap">
                        <div className="text-sm">
                          {/* O clique que abre os detalhes da venda mora nesta
                              célula. Com a conta escondida ele migra para o id do
                              pedido, em vez de desaparecer: é o único acesso ao
                              detalhamento completo na tabela, e perdê-lo por causa
                              de um filtro de coluna seria esconder uma ação, não
                              um dado. */}
                          {cols.conta && (
                            <div
                              className="font-semibold text-gray-800 cursor-pointer hover:text-orange-600 hover:underline transition-colors"
                              onClick={() => openVendaDetails(venda)}
                              title="Clique para ver detalhes completos da venda"
                            >
                              {venda.conta ?? "-"}
                            </div>
                          )}
                          {cols.pedido && (
                            <div
                              className={`text-xs font-mono mt-0.5 ${
                                cols.conta
                                  ? "text-gray-400"
                                  : "text-gray-600 cursor-pointer hover:text-orange-600 hover:underline transition-colors"
                              }`}
                              onClick={cols.conta ? undefined : () => openVendaDetails(venda)}
                              title={
                                cols.conta
                                  ? "ID do Pedido"
                                  : "Clique para ver detalhes completos da venda"
                              }
                            >
                              {venda.id}
                            </div>
                          )}
                        </div>
                      </td>
                    )}

                    {/* 3. Produto / SKU */}
                    {mostrar("produtoSku") && (
                    <td className="px-3 py-2 sm:px-6 sm:py-3">
                      <div className="max-w-[240px] text-sm">
                        {cols.produto && (
                          <div className="font-medium text-gray-900 line-clamp-1 hover:line-clamp-none transition-all" title={venda.titulo}>
                            {venda.titulo}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {cols.sku && (venda.sku ? (
                            <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold font-mono rounded bg-gray-100 text-gray-700 border border-[var(--cz-hairline)]">
                              {venda.sku}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-mono">- Sem SKU -</span>
                          ))}
                          {!isShopee && (
                            <>
                              {cols.ads && venda.ads === "ADS" && (
                                <span className="inline-flex px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-50 text-red-700 border border-red-200">
                                  ADS
                                </span>
                              )}
                              {cols.exposicao && venda.exposicao && (
                                <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-bold rounded ${
                                  venda.exposicao === 'Premium' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                                  'bg-blue-50 text-blue-800 border border-blue-200'
                                }`}>
                                  {venda.exposicao}
                                </span>
                              )}
                              {/* Tipo de anúncio (catálogo / próprio). A caixa de
                                  seleção existia no painel desde sempre e não tinha
                                  nada para controlar: a tabela nunca desenhou este
                                  selo, embora o dado venha do sync. Um controle que
                                  não controla nada é o defeito que este ajuste
                                  corrige, então o selo passa a existir. */}
                              {cols.tipo && venda.tipoAnuncio && (
                                <span className="inline-flex px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-50 text-slate-700 border border-slate-200 capitalize">
                                  {venda.tipoAnuncio}
                                </span>
                              )}
                            </>
                          )}
                          {skuStatus && (
                            <a
                              href="/sku?pendentes=1"
                              className={`inline-flex px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
                                skuStatus.cadastrado
                                  ? "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                              }`}
                              title={
                                skuStatus.cadastrado
                                  ? "SKU cadastrado sem custo unitário. O CMV e a margem dependem desse custo."
                                  : "SKU encontrado na venda, mas ainda sem cadastro na Gestão de SKU."
                              }
                            >
                              {skuStatus.cadastrado ? "SKU sem custo" : "SKU sem cadastro"}
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    )}

                    {/* 4. Cliente / Envio */}
                    {mostrar("clienteEnvio") && (
                    <td className="px-3 py-2 sm:px-6 sm:py-3 whitespace-nowrap">
                      <div className="text-sm">
                        {cols.comprador && (
                          <div className="font-semibold text-gray-900 max-w-[140px] truncate" title={venda.comprador || "-"}>
                            {venda.comprador || <span className="text-xs text-gray-400 font-normal">-</span>}
                          </div>
                        )}
                        <div className={cols.comprador ? "mt-1" : ""}>
                          {cols.envioMode && (() => {
                            const logistic = (venda.logisticType || venda.envioMode || "").toLowerCase();
                            if (isShopee) {
                              const shipmentDetails = (venda as any).shipmentDetails || venda.raw?.shipmentDetails || {};
                              const shippingCarrier = shipmentDetails.shipping_carrier || venda.shippingStatus || "";
                              return shippingCarrier ? (
                                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-50 text-orange-800 border border-orange-200 capitalize">
                                  {shippingCarrier}
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400">-</span>
                              );
                            } else {
                              if (logistic.includes("fulfillment") || logistic === "full") {
                                return (
                                  <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-yellow-100 text-yellow-800 border border-yellow-200">
                                    FULL
                                  </span>
                                );
                              } else if (logistic.includes("flex")) {
                                return (
                                  <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-800 border border-green-200">
                                    FLEX
                                  </span>
                                );
                              } else if (logistic.includes("agencia") || logistic === "me2" || logistic === "coleta") {
                                return (
                                  <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-800 border border-blue-200">
                                    Agência
                                  </span>
                                );
                              } else if (logistic) {
                                return (
                                  <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-gray-100 text-gray-800 border border-[var(--cz-hairline)] capitalize">
                                    {venda.logisticType || venda.envioMode}
                                  </span>
                                );
                              }
                              return <span className="text-[10px] text-gray-400">-</span>;
                            }
                          })()}
                        </div>
                      </div>
                    </td>
                    )}

                    {/* 5. Qtd / Unitário */}
                    {mostrar("qtdUnitario") && (
                    <td className="px-3 py-2 sm:px-6 sm:py-3 whitespace-nowrap">
                      <div className="text-sm">
                        {/* O total da linha (qtd x unitário) depende dos dois, então
                            só aparece quando os dois estão ligados. Mostrá-lo com
                            um deles escondido daria um número que a coluna não
                            explica. */}
                        {cols.quantidade && cols.unitario && (
                          <div className="font-bold text-gray-900">
                            {formatCurrency(venda.quantidade * venda.unitario)}
                          </div>
                        )}
                        <div className="text-[11px] text-gray-500 font-medium mt-0.5 flex flex-col gap-0.5 leading-tight">
                          <div>
                            {cols.quantidade && `${venda.quantidade}x`}
                            {cols.quantidade && cols.unitario && " "}
                            {cols.unitario && formatCurrency(venda.unitario)}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5" title={venda.imposto ? `Imposto de ${venda.aliquotaImposto}% aplicado sobre a Venda Bruta` : "Nenhum imposto configurado"}>
                            <span className="text-gray-400">Imp:</span>
                            <span className="text-red-700 font-semibold flex items-center gap-1">
                              -{formatCurrency(venda.imposto || 0)}
                              {venda.valorTotal > 0 && (
                                <span className="text-[10px] text-gray-400 font-normal">
                                  ({(((venda.imposto || 0) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    )}

                    {/* 6. Financeiro Detalhado */}
                    {mostrar("financeiro") && (
                    <td className="px-3 py-2 sm:px-6 sm:py-3 whitespace-nowrap">
                      <div className="text-sm">
                        {/* A linha de destaque (Receita Líquida no ML, valor total
                            na Shopee) é a SOMA de valor, taxa e frete, então ela só
                            aparece com os três ligados: com um deles escondido, o
                            número não fecha com o que a célula mostra e a conferência
                            passa a acusar um erro que não existe. */}
                        {cols.valor && cols.taxa && cols.frete && (isShopee ? (
                          <FinanceiroDetailsDropdown venda={venda}>
                            <div className="font-bold text-gray-900 cursor-pointer hover:underline flex items-center gap-1">
                              {formatCurrency(venda.valorTotal)}
                            </div>
                          </FinanceiroDetailsDropdown>
                        ) : (
                          <ReceitaLiquidaDetailsDropdown venda={venda} freteExibido={freteExibido}>
                            <div className="font-bold text-emerald-600 flex items-center gap-1" title="Clique para ver detalhamento de valores">
                              <span className="text-[10px] text-emerald-700/80 uppercase font-bold tracking-tight">Rec. Líq:</span>
                              {formatCurrency(venda.valorTotal + (venda.taxaPlataforma || 0) + (freteExibido || 0))}
                              {venda.valorTotal > 0 && (
                                <span className="text-[10px] text-gray-400 font-normal">
                                  ({(((venda.valorTotal + (venda.taxaPlataforma || 0) + (freteExibido || 0)) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                                </span>
                              )}
                            </div>
                          </ReceitaLiquidaDetailsDropdown>
                        ))}
                        <div className="text-[11px] text-gray-500 font-medium mt-0.5 flex flex-col gap-0.5 leading-tight">
                          {/* Na Shopee o valor bruto JÁ é a linha de destaque acima,
                              então repeti-lo aqui seria o mesmo número duas vezes.
                              Quando a linha de destaque não aparece (porque taxa ou
                              frete estão escondidos), o bruto passa a ser a única
                              forma de ver o valor da venda — e aí ele entra também
                              na Shopee. */}
                          {cols.valor && (!isShopee || !(cols.taxa && cols.frete)) && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">Bruto:</span>
                              <span className="font-semibold text-gray-700 flex items-center gap-1">
                                {formatCurrency(venda.valorTotal)}
                              </span>
                            </div>
                          )}
                          {cols.taxa && venda.taxaPlataforma ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">Taxa:</span>
                              <TaxaDetailsDropdown venda={venda}>
                                <span className="negative-value font-semibold cursor-pointer hover:underline flex items-center gap-1">
                                  {formatCurrency(venda.taxaPlataforma)}
                                  {venda.valorTotal > 0 && (
                                    <span className="text-[10px] text-gray-400 font-normal">
                                      ({((Math.abs(venda.taxaPlataforma) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                                    </span>
                                  )}
                                </span>
                              </TaxaDetailsDropdown>
                            </div>
                          ) : null}
                          {cols.frete && venda.frete !== undefined && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">Frete:</span>
                              {isShopee || hasFlexDetails ? (
                                <FreteDetailsDropdown venda={venda}>
                                  <span className={`font-semibold cursor-pointer hover:underline flex items-center gap-1 ${freteExibido >= 0 ? "frete-positivo" : "frete-negativo"}`}>
                                    {formatCurrency(freteExibido)}
                                    {venda.valorTotal > 0 && (
                                      <span className="text-[10px] text-gray-400 font-normal">
                                        ({((Math.abs(freteExibido) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                                      </span>
                                    )}
                                  </span>
                                </FreteDetailsDropdown>
                              ) : (
                                <span className={`font-semibold flex items-center gap-1 ${venda.frete >= 0 ? "frete-positivo" : "frete-negativo"}`}>
                                  {formatCurrency(venda.frete)}
                                  {venda.valorTotal > 0 && (
                                    <span className="text-[10px] text-gray-400 font-normal">
                                      ({((Math.abs(venda.frete) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    )}

                    {/* 7. CMV / Margem */}
                    {mostrar("cmvMargem") && (
                    <td className="px-3 py-2 sm:px-6 sm:py-3 whitespace-nowrap">
                      <div className="text-sm">
                        {venda.margemContribuicao !== null && venda.margemContribuicao !== undefined ? (
                          <div>
                            {cols.margem && (
                              <div className="font-bold text-gray-900 flex items-baseline gap-1">
                                <span>{formatCurrency(venda.margemContribuicao)}</span>
                                {venda.valorTotal > 0 && (
                                  <span className="text-[11px] text-gray-500 font-medium font-mono">
                                    ({((venda.margemContribuicao / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="text-[10px] text-gray-500 mt-0.5 flex flex-col gap-0.5 leading-tight">
                              {/* O rótulo diz de QUAL margem se trata; sem a margem
                                  na tela ele ficaria explicando um número ausente. */}
                              {cols.margem && (
                                <span className="font-medium">
                                  {venda.isMargemReal ? "Margem Real" : "Receita Líq."}
                                </span>
                              )}
                              {cols.cmv && venda.cmv ? (
                                <div className="text-red-700 font-semibold flex items-center gap-1">
                                  CMV: {formatCurrency(venda.cmv)}
                                  {venda.valorTotal > 0 && (
                                    <span className="text-[10px] text-gray-400 font-normal">
                                      ({((Math.abs(venda.cmv) / venda.valorTotal) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 font-normal">-</span>
                        )}
                      </div>
                    </td>
                    )}
                  </tr>
                );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
