// Leitura de status de venda no FRONT-END (contadores e filtros das telas de
// vendas).
//
// ⚠️  ESTAS LISTAS TÊM DE CASAR COM `src/lib/dashboard-filters.ts`, que é a
// contraparte no servidor (`PAID_STATUS_FILTER` / cancelados). Quando divergem, o
// sintoma é cruel de achar: a tela conta um número e o dashboard mostra outro para
// o mesmo período, sem nada errado em nenhum dos dois isoladamente.
//
// Por que não dá para usar só a heurística de texto: os três canais nomeiam as
// coisas de formas incompatíveis. "pago" no Mercado Livre é `paid`; na Shopee não
// existe estado "pago" e o que vale é a lista de estados ativos; no TikTok o
// pedido pago mas não despachado é `AWAITING_SHIPMENT`, que não contém nem "pag"
// nem "paid" nem "completed". Sem a lista explícita, o filtro "Pagos" do TikTok
// (que é o padrão da tela) esconderia justamente os pedidos que dão trabalho.

/** Estados ATIVOS da Shopee: o pedido vale como venda. */
const SHOPEE_PAGO = [
  "ready_to_ship",
  "processed",
  "shipped",
  "to_confirm_receive",
  "completed",
];

const SHOPEE_CANCELADO = ["cancelled", "in_cancel"];

/**
 * Estados do TikTok Shop em que o pedido vale como venda.
 *
 * O enum é fechado: `UNPAID`, `AWAITING_SHIPMENT`, `AWAITING_COLLECTION`,
 * `PARTIALLY_SHIPPING`, `IN_TRANSIT`, `DELIVERED`, `COMPLETED`, `CANCELLED`.
 * `UNPAID` fica fora de propósito (pedido criado e não pago não é venda), e
 * `CANCELLED` entra na lista de cancelados.
 */
const TIKTOK_PAGO = [
  "awaiting_shipment",
  "awaiting_collection",
  "partially_shipping",
  "in_transit",
  "delivered",
  "completed",
];

const TIKTOK_CANCELADO = ["cancelled"];

/**
 * Qual canal estamos lendo.
 *
 * Aceita tanto o rótulo longo ("Shopee", "TikTok Shop") quanto a sigla do canal
 * ("SP", "TT"), porque as duas formas circulam: as telas por plataforma passam o
 * rótulo e a tabela unificada passa a sigla.
 */
function canal(plataforma?: string): "ML" | "SP" | "TT" {
  if (!plataforma) return "ML";
  const p = plataforma.toLowerCase();
  if (p.includes("tiktok") || plataforma === "TT") return "TT";
  if (p.includes("shopee") || plataforma === "SP") return "SP";
  return "ML";
}

export function isStatusCancelado(status: string, plataforma?: string): boolean {
  if (!status) return false;
  const statusLower = status.toLowerCase();

  switch (canal(plataforma)) {
    case "SP":
      return SHOPEE_CANCELADO.includes(statusLower);
    case "TT":
      return TIKTOK_CANCELADO.includes(statusLower);
    default:
      return (
        statusLower.includes("cancelad") ||
        statusLower.includes("cancel") ||
        statusLower === "cancelled"
      );
  }
}

export function isStatusPago(status: string, plataforma?: string): boolean {
  if (!status) return false;
  const statusLower = status.toLowerCase();

  switch (canal(plataforma)) {
    case "SP":
      return SHOPEE_PAGO.includes(statusLower);
    case "TT":
      return TIKTOK_PAGO.includes(statusLower);
    default:
      return (
        statusLower.includes("pag") ||
        statusLower.includes("paid") ||
        statusLower === "completed"
      );
  }
}
