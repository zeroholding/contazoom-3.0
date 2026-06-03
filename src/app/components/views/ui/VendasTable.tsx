"use client";

import { openVendaDetails } from "./VendaDetailsModal";
import { classifyFrete, formatCurrency, formatarFreteShopee } from "@/lib/frete";
import FreteDetailsDropdown from "./FreteDetailsDropdown";
import TaxaDetailsDropdown from "./TaxaDetailsDropdown";
import { PlataformaBadge } from "@/components/ui/PlataformaBadge";

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
  cmv?: number | null; // cmv - Custo da Mercadoria Vendida
  
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
  isMargemReal?: boolean; // true = margem real (com CMV), false = receita líquida
  
  // Dados de frete detalhados
  shipping: {
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

interface VendasTableProps {
  vendas: ProcessedVenda[];
  isLoading?: boolean;
  currentPage: number;
  itemsPerPage: number;
  colunasVisiveis?: import('./FiltrosVendas').ColunasVisiveis;
  platform?: "Mercado Livre" | "Shopee" | "Geral";
  managePage?: boolean;
}

// Skeleton para carregamento
function TabelaVendasSkeleton() {
  return (
    <div className="h-full flex flex-col">
      {/* CSS para ocultar scrollbars */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .table-scroll-container {
            overflow: auto;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE and Edge */
          }
          .table-scroll-container::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
          }
        `
      }} />
      
      {/* Container com scroll horizontal e vertical - scrollbar oculta */}
      <div className="flex-1 table-scroll-container relative">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {[...Array(16)].map((_, index) => (
                <th key={index} className="px-6 py-3 bg-gray-50">
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {[...Array(10)].map((_, index) => (
              <tr key={index}>
                {[...Array(16)].map((_, cellIndex) => (
                  <td key={cellIndex} className="px-6 py-4 whitespace-nowrap">
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

export default function VendasTable({ 
  vendas, 
  isLoading, 
  currentPage, 
  itemsPerPage,
  colunasVisiveis = {
    data: true,
    canal: true,
    conta: true,
    pedido: true, // id venda
    comprador: true, // comprador/cliente
    ads: false,
    exposicao: true,
    tipo: true, // tipo de anuncio
    produto: true,
    sku: true,
    quantidade: true,
    unitario: true,
    valor: true, // valor total
    taxa: true, // taxa plataforma
    frete: true,
    cmv: true,
    margem: true, // margem contribuição
    envioMode: true, // modalidade de envio
  },
  platform = "Mercado Livre",
  managePage = false
}: VendasTableProps) {
  const paginatedVendas = managePage ? vendas.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ) : vendas;

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
    return <TabelaVendasSkeleton />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* CSS para ocultar scrollbars e animação de gradiente */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .table-scroll-container {
            overflow: auto;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE and Edge */
          }
          .table-scroll-container::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
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
          <thead className="bg-gray-50 sticky top-0 z-10">
            {platform === "Geral" ? (
              /* Layout Otimizado para Vendas Gerais (Sem scroll gigante) */
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[130px] premium-th">
                  Data / Canal
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[140px] premium-th">
                  Venda / Conta
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[180px] premium-th">
                  Produto / SKU
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[150px] premium-th">
                  Cliente / Envio
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[100px] premium-th">
                  Qtd / Unitário
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[160px] premium-th">
                  Financeiro Detalhado
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[130px] premium-th">
                  CMV / Margem
                </th>
              </tr>
            ) : (
              /* Layout Padrão para visualizações específicas */
              <tr>
                {colunasVisiveis.data && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px] bg-gray-50">
                    Data
                  </th>
                )}
                {colunasVisiveis.canal && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50">
                    Canal
                  </th>
                )}
                {colunasVisiveis.conta && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-gray-50">
                    Conta
                  </th>
                )}
                {colunasVisiveis.pedido && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-gray-50">
                    Id venda
                  </th>
                )}
                {colunasVisiveis.comprador && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px] bg-gray-50">
                    Cliente
                  </th>
                )}
                {colunasVisiveis.ads && platform !== "Shopee" && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] bg-gray-50">
                    ADS
                  </th>
                )}
                {colunasVisiveis.exposicao && platform !== "Shopee" && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50">
                    Exposição
                  </th>
                )}
                {colunasVisiveis.tipo && platform !== "Shopee" && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-gray-50">
                    Tipo de anúncio
                  </th>
                )}
                {colunasVisiveis.produto && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px] bg-gray-50">
                    Produto
                  </th>
                )}
                {colunasVisiveis.sku && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50">
                    SKU
                  </th>
                )}
                {colunasVisiveis.envioMode && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-gray-50">
                    Mod. Envio
                  </th>
                )}
                {colunasVisiveis.quantidade && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50">
                    Quantidade
                  </th>
                )}
                {colunasVisiveis.unitario && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50">
                    Unitário
                  </th>
                )}
                {colunasVisiveis.valor && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-gray-50">
                    Valor total
                  </th>
                )}
                {colunasVisiveis.taxa && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px] bg-gray-50">
                    Taxa plataforma
                  </th>
                )}
                {colunasVisiveis.frete && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50">
                    Frete
                  </th>
                )}
                {colunasVisiveis.cmv && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50">
                    CMV
                  </th>
                )}
                {colunasVisiveis.margem && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px] bg-gray-50">
                    Margem contribuição
                  </th>
                )}
              </tr>
            )}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedVendas.map((item) => {
              const { venda, isCalculating } = item;
              
              if (platform === "Geral") {
                const dateParts = formatDateTime(venda.dataVenda);
                const isShopee = (venda.canal || venda.plataforma) === "Shopee";
                
                return (
                  <tr key={venda.id} className="premium-row">
                    {/* 1. Data / Canal */}
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <PlataformaBadge plataforma={venda.canal || venda.plataforma} size={26} />
                        </div>
                        <div className="text-sm">
                          <div className="font-semibold text-gray-900">{dateParts.data}</div>
                          <div className="text-xs text-gray-500 font-medium">{dateParts.hora}</div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Venda / Conta */}
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="text-sm">
                        <div 
                          className="font-semibold text-gray-800 cursor-pointer hover:text-orange-600 hover:underline transition-colors"
                          onClick={() => openVendaDetails(venda)}
                          title="Clique para ver detalhes completos da venda"
                        >
                          {venda.conta ?? "-"}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5" title="ID do Pedido">
                          {venda.id}
                        </div>
                      </div>
                    </td>

                    {/* 3. Produto / SKU */}
                    <td className="px-6 py-3">
                      <div className="max-w-[240px] text-sm">
                        <div className="font-medium text-gray-900 line-clamp-1 hover:line-clamp-none transition-all" title={venda.titulo}>
                          {venda.titulo}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {venda.sku ? (
                            <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold font-mono rounded bg-gray-100 text-gray-700 border border-gray-200">
                              {venda.sku}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-mono">- Sem SKU -</span>
                          )}
                          {!isShopee && (
                            <>
                              {venda.ads === "ADS" && (
                                <span className="inline-flex px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-50 text-red-700 border border-red-200">
                                  ADS
                                </span>
                              )}
                              {venda.exposicao && (
                                <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-bold rounded ${
                                  venda.exposicao === 'Premium' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                                  'bg-blue-50 text-blue-800 border border-blue-200'
                                }`}>
                                  {venda.exposicao}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 4. Cliente / Envio */}
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-semibold text-gray-900 max-w-[140px] truncate" title={venda.comprador || "-"}>
                          {venda.comprador || <span className="text-xs text-gray-400 font-normal">-</span>}
                        </div>
                        <div className="mt-1">
                          {(() => {
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
                                  <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-gray-100 text-gray-800 border border-gray-200 capitalize">
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

                    {/* 5. Qtd / Unitário */}
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-bold text-gray-900">
                          {venda.quantidade}x
                        </div>
                        <div className="text-xs text-gray-500 font-medium mt-0.5">
                          {formatCurrency(venda.unitario)}
                        </div>
                      </div>
                    </td>

                    {/* 6. Financeiro Detalhado */}
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-bold text-gray-900">
                          {formatCurrency(venda.valorTotal)}
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium mt-0.5 flex flex-col gap-0.5 leading-tight">
                          {venda.taxaPlataforma ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">Taxa:</span>
                              <TaxaDetailsDropdown venda={venda}>
                                <span className="negative-value font-semibold cursor-pointer hover:underline">
                                  {formatCurrency(venda.taxaPlataforma)}
                                </span>
                              </TaxaDetailsDropdown>
                            </div>
                          ) : null}
                          {venda.frete !== undefined && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">Frete:</span>
                              {isShopee ? (
                                <FreteDetailsDropdown venda={venda}>
                                  <span className={`font-semibold cursor-pointer hover:underline ${venda.frete >= 0 ? "frete-positivo" : "frete-negativo"}`}>
                                    {formatCurrency(venda.frete)}
                                  </span>
                                </FreteDetailsDropdown>
                              ) : (
                                <span className={`font-semibold ${venda.frete >= 0 ? "frete-positivo" : "frete-negativo"}`}>
                                  {formatCurrency(venda.frete)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 7. CMV / Margem */}
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="text-sm">
                        {venda.margemContribuicao !== null && venda.margemContribuicao !== undefined ? (
                          <div>
                            <div className="font-bold text-gray-900">
                              {formatCurrency(venda.margemContribuicao)}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5 flex flex-col gap-0.5 leading-tight">
                              <span className="font-medium">
                                {venda.isMargemReal ? "Margem Real" : "Receita Líq."}
                              </span>
                              {venda.cmv ? (
                                <div className="text-red-700 font-semibold">
                                  CMV: {formatCurrency(venda.cmv)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 font-normal">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              /* Renderizador padrão para outras plataformas */
              return (
              <tr key={venda.id} className="hover:bg-gray-50 transition-colors duration-200">
                {/* Data */}
                {colunasVisiveis.data && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[140px]">
                    <div className="text-sm text-gray-900">
                      <div className="font-medium">{formatDateTime(venda.dataVenda).data}</div>
                      <div className="text-xs text-gray-500">{formatDateTime(venda.dataVenda).hora}</div>
                    </div>
                  </td>
                )}
                {/* Canal */}
                {colunasVisiveis.canal && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="flex justify-center items-center">
                      <PlataformaBadge plataforma={venda.canal || venda.plataforma} size={28} />
                    </div>
                  </td>
                )}
                {/* Conta */}
                {colunasVisiveis.conta && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div 
                      className="text-sm text-gray-900 cursor-pointer hover:text-orange-600 hover:underline transition-colors duration-200"
                      onClick={() => openVendaDetails(venda)}
                      title="Clique para ver detalhes completos da venda"
                    >
                      {venda.conta ?? "-"}
                    </div>
                  </td>
                )}
                {/* Id venda */}
                {colunasVisiveis.pedido && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className="text-sm font-mono text-gray-900">{venda.id}</div>
                  </td>
                )}
                {/* Cliente */}
                {colunasVisiveis.comprador && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[150px]">
                    <div className="text-sm text-gray-900 font-medium max-w-[150px] truncate" title={venda.comprador || "-"}>
                      {venda.comprador || <span className="text-xs text-gray-400">-</span>}
                    </div>
                  </td>
                )}
                {/* ADS - Apenas para Mercado Livre */}
                {colunasVisiveis.ads && platform !== "Shopee" && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[80px]">
                    {venda.plataforma === "Mercado Livre" ? (
                      <div className="text-sm text-gray-900">
                        {venda.ads === "ADS" ? (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            ADS
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">N/A</span>
                    )}
                  </td>
                )}
                {/* Exposição - Apenas para Mercado Livre */}
                {colunasVisiveis.exposicao && platform !== "Shopee" && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    {venda.plataforma === "Mercado Livre" ? (
                      <div className="text-sm text-gray-900">
                        {venda.exposicao ? (
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            venda.exposicao === 'Premium' ? 'bg-yellow-100 text-yellow-800' :
                            venda.exposicao === 'Clássico' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {venda.exposicao}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">N/A</span>
                    )}
                  </td>
                )}
                {/* Tipo de anúncio - Apenas para Mercado Livre */}
                {colunasVisiveis.tipo && platform !== "Shopee" && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    {venda.plataforma === "Mercado Livre" ? (
                      <div className="text-sm text-gray-900">
                        {venda.tipoAnuncio ? (
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            venda.tipoAnuncio === 'Catálogo' ? 'bg-purple-100 text-purple-800' :
                            venda.tipoAnuncio === 'Próprio' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {venda.tipoAnuncio}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">N/A</span>
                    )}
                  </td>
                )}
                {/* Produto */}
                {colunasVisiveis.produto && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[200px]">
                    <div className="text-sm font-medium text-gray-900 max-w-[200px] truncate" title={venda.titulo}>
                      {venda.titulo}
                    </div>
                  </td>
                )}
                {/* SKU */}
                {colunasVisiveis.sku && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="text-sm text-gray-900">
                      {venda.sku || <span className="text-xs text-gray-400">-</span>}
                    </div>
                  </td>
                )}
                {/* Mod. Envio */}
                {colunasVisiveis.envioMode && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className="text-sm text-gray-900">
                      {(() => {
                        const logistic = (venda.logisticType || venda.envioMode || "").toLowerCase();
                        if (venda.plataforma === "Shopee") {
                          const shipmentDetails = (venda as any).shipmentDetails || venda.raw?.shipmentDetails || {};
                          const shippingCarrier = shipmentDetails.shipping_carrier || venda.shippingStatus || "";
                          return shippingCarrier ? (
                            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-orange-50 text-orange-800 border border-orange-200 capitalize">
                              {shippingCarrier}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          );
                        } else {
                          // Mercado Livre mappings
                          if (logistic.includes("fulfillment") || logistic === "full") {
                            return (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                                FULL
                              </span>
                            );
                          } else if (logistic.includes("flex")) {
                            return (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 border border-green-200">
                                FLEX
                              </span>
                            );
                          } else if (logistic.includes("agencia") || logistic === "me2" || logistic === "coleta") {
                            return (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                Agência
                              </span>
                            );
                          } else if (logistic) {
                            return (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800 border border-gray-200 capitalize">
                                {venda.logisticType || venda.envioMode}
                              </span>
                            );
                          }
                          return <span className="text-xs text-gray-400">-</span>;
                        }
                      })()}
                    </div>
                  </td>
                )}
                {/* Quantidade */}
                {colunasVisiveis.quantidade && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="text-sm text-gray-900">{venda.quantidade}</div>
                  </td>
                )}
                {/* Unitário */}
                {colunasVisiveis.unitario && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="text-sm text-gray-900">
                      {formatCurrency(venda.unitario)}
                    </div>
                  </td>
                )}
                {/* Valor total */}
                {colunasVisiveis.valor && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(venda.valorTotal)}
                    </div>
                  </td>
                )}
                {/* Taxa plataforma */}
                {colunasVisiveis.taxa && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className="text-sm">
                      {venda.taxaPlataforma ? (
                        <TaxaDetailsDropdown venda={venda}>
                          <span className="negative-value">
                            {formatCurrency(venda.taxaPlataforma)}
                          </span>
                        </TaxaDetailsDropdown>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                )}
                {/* Frete */}
                {colunasVisiveis.frete && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className={`transition-all duration-300 ${isCalculating ? 'filter blur-sm' : ''}`}>
                      {isCalculating ? (
                        <div className="flex items-center justify-center">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500"></div>
                        </div>
                      ) : (
                        <div className="text-sm">
                          {venda.plataforma === "Shopee" ? (
                            (() => {
                              const shipmentDetails = (venda as any).shipmentDetails || venda.raw?.shipmentDetails || {};
                              const shippingCarrier = shipmentDetails.shipping_carrier || venda.shippingStatus;
                              
                              return (
                                <FreteDetailsDropdown venda={venda}>
                                  <div className={venda.frete >= 0 ? "frete-positivo" : "frete-negativo"}>
                                    {formatCurrency(venda.frete)}
                                  </div>
                                  {shippingCarrier && (
                                    <div className="text-xs text-gray-500 mt-1 capitalize">
                                      {shippingCarrier}
                                    </div>
                                  )}
                                </FreteDetailsDropdown>
                              );
                            })()
                          ) : (
                            <>
                              {venda.frete >= 0 ? (
                                <span className="frete-positivo">
                                  {formatCurrency(venda.frete)}
                                </span>
                              ) : venda.frete < 0 ? (
                                <span className="frete-negativo">
                                  {formatCurrency(venda.frete)}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                )}
                {/* CMV */}
                {colunasVisiveis.cmv && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="text-sm text-gray-900">
                      {venda.cmv ? (
                        <span className="negative-value">
                          {formatCurrency(venda.cmv)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                )}
                {/* Margem contribuição */}
                {colunasVisiveis.margem && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[140px]">
                    <div className="text-sm text-gray-900">
                      {venda.margemContribuicao !== null && venda.margemContribuicao !== undefined ? (
                        <div>
                          <div className="font-medium">
                            {formatCurrency(venda.margemContribuicao)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {venda.isMargemReal ? "Margem Real" : "Receita Líquida"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                )}
                {/* Produto */}
                {colunasVisiveis.produto && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[200px]">
                    <div className="text-sm font-medium text-gray-900 max-w-[200px] truncate" title={venda.titulo}>
                      {venda.titulo}
                    </div>
                  </td>
                )}
                {/* SKU */}
                {colunasVisiveis.sku && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="text-sm text-gray-900">
                      {venda.sku || <span className="text-xs text-gray-400">-</span>}
                    </div>
                  </td>
                )}
                {/* Mod. Envio */}
                {colunasVisiveis.envioMode && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className="text-sm text-gray-900">
                      {(() => {
                        const logistic = (venda.logisticType || venda.envioMode || "").toLowerCase();
                        if (venda.plataforma === "Shopee") {
                          const shipmentDetails = (venda as any).shipmentDetails || venda.raw?.shipmentDetails || {};
                          const shippingCarrier = shipmentDetails.shipping_carrier || venda.shippingStatus || "";
                          return shippingCarrier ? (
                            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-orange-50 text-orange-800 border border-orange-200 capitalize">
                              {shippingCarrier}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          );
                        } else {
                          // Mercado Livre mappings
                          if (logistic.includes("fulfillment") || logistic === "full") {
                            return (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                                FULL
                              </span>
                            );
                          } else if (logistic.includes("flex")) {
                            return (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 border border-green-200">
                                FLEX
                              </span>
                            );
                          } else if (logistic.includes("agencia") || logistic === "me2" || logistic === "coleta") {
                            return (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                Agência
                              </span>
                            );
                          } else if (logistic) {
                            return (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800 border border-gray-200 capitalize">
                                {venda.logisticType || venda.envioMode}
                              </span>
                            );
                          }
                          return <span className="text-xs text-gray-400">-</span>;
                        }
                      })()}
                    </div>
                  </td>
                )}
                {/* Quantidade */}
                {colunasVisiveis.quantidade && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="text-sm text-gray-900">{venda.quantidade}</div>
                  </td>
                )}
                {/* Unitário */}
                {colunasVisiveis.unitario && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="text-sm text-gray-900">
                      {formatCurrency(venda.unitario)}
                    </div>
                  </td>
                )}
                {/* Valor total */}
                {colunasVisiveis.valor && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(venda.valorTotal)}
                    </div>
                  </td>
                )}
                {/* Taxa plataforma */}
                {colunasVisiveis.taxa && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className="text-sm">
                      {venda.taxaPlataforma ? (
                        <TaxaDetailsDropdown venda={venda}>
                          <span className="negative-value">
                            {formatCurrency(venda.taxaPlataforma)}
                          </span>
                        </TaxaDetailsDropdown>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                )}
                {/* Frete */}
                {colunasVisiveis.frete && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                    <div className={`transition-all duration-300 ${isCalculating ? 'filter blur-sm' : ''}`}>
                      {isCalculating ? (
                        <div className="flex items-center justify-center">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500"></div>
                        </div>
                      ) : (
                        <div className="text-sm">
                          {venda.plataforma === "Shopee" ? (
                            (() => {
                              const shipmentDetails = (venda as any).shipmentDetails || venda.raw?.shipmentDetails || {};
                              const shippingCarrier = shipmentDetails.shipping_carrier || venda.shippingStatus;
                              
                              return (
                                <FreteDetailsDropdown venda={venda}>
                                  <div className={venda.frete >= 0 ? "frete-positivo" : "frete-negativo"}>
                                    {formatCurrency(venda.frete)}
                                  </div>
                                  {shippingCarrier && (
                                    <div className="text-xs text-gray-500 mt-1 capitalize">
                                      {shippingCarrier}
                                    </div>
                                  )}
                                </FreteDetailsDropdown>
                              );
                            })()
                          ) : (
                            <>
                              {venda.frete >= 0 ? (
                                <span className="frete-positivo">
                                  {formatCurrency(venda.frete)}
                                </span>
                              ) : venda.frete < 0 ? (
                                <span className="frete-negativo">
                                  {formatCurrency(venda.frete)}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                )}
                {/* CMV */}
                {colunasVisiveis.cmv && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                    <div className="text-sm text-gray-900">
                      {venda.cmv ? (
                        <span className="negative-value">
                          {formatCurrency(venda.cmv)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                )}
                {/* Margem contribuição */}
                {colunasVisiveis.margem && (
                  <td className="px-6 py-4 whitespace-nowrap min-w-[140px]">
                    <div className="text-sm text-gray-900">
                      {venda.margemContribuicao !== null && venda.margemContribuicao !== undefined ? (
                        <div>
                          <div className="font-medium">
                            {formatCurrency(venda.margemContribuicao)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {venda.isMargemReal ? "Margem Real" : "Receita Líquida"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
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
