/**
 * Helper functions para filtros do dashboard
 * Centraliza a lógica de filtros para garantir consistência entre todos os endpoints
 */

export type StatusFilter = 'pagos' | 'cancelados' | 'todos';

type WhereFilter = Record<string, unknown>;

const paidStatusConditions = [
  // Mercado Livre
  { status: { contains: 'paid', mode: 'insensitive' as const } },
  { status: { contains: 'payment_approved', mode: 'insensitive' as const } },
  { status: { contains: 'delivered', mode: 'insensitive' as const } },

  // Shopee (conjunto de estados que representam pedidos pagos/ativos)
  { status: { contains: 'completed', mode: 'insensitive' as const } },
  { status: { contains: 'shipped', mode: 'insensitive' as const } },
  { status: { contains: 'ready_to_ship', mode: 'insensitive' as const } },
  { status: { contains: 'to_ship', mode: 'insensitive' as const } },
  { status: { contains: 'to_confirm_receive', mode: 'insensitive' as const } },
  { status: { contains: 'processed', mode: 'insensitive' as const } },
  { status: { contains: 'packed', mode: 'insensitive' as const } },
  { status: { contains: 'retry_ship', mode: 'insensitive' as const } },
  { status: { contains: 'pickup_done', mode: 'insensitive' as const } },
  { status: { contains: 'arranging_shipment', mode: 'insensitive' as const } },
  { status: { contains: 'first_mile_arrived', mode: 'insensitive' as const } },
];

const cancelledStatusConditions = [
  { status: { contains: 'cancel', mode: 'insensitive' as const } },
  { status: { contains: 'cancelled', mode: 'insensitive' as const } },
];

function parseMultiValue(param?: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value && value !== 'todos' && value !== 'todas');
}

function hasAll(values: string[], allowed: string[]): boolean {
  return allowed.every((option) => values.includes(option));
}

export function combineDashboardWhere(...filters: WhereFilter[]): WhereFilter {
  const applied = filters.filter((filter) => Object.keys(filter).length > 0);
  if (applied.length === 0) return {};
  if (applied.length === 1) return applied[0];
  return { AND: applied };
}

export function getDashboardFiltersWhere(filters: {
  status?: string | null;
  canal?: string | null;
  tipoAnuncio?: string | null;
  modalidade?: string | null;
}): WhereFilter {
  return combineDashboardWhere(
    getStatusWhere(filters.status),
    getCanalWhere(filters.canal),
    getTipoAnuncioWhere(filters.tipoAnuncio),
    getModalidadeWhere(filters.modalidade),
  );
}

/**
 * Cria filtro de status que funciona tanto para Mercado Livre quanto Shopee
 * - Mercado Livre: 'paid' para pagos, 'cancelled' para cancelados
 * - Shopee: 'COMPLETED' para pagos, 'CANCELLED' para cancelados
 */
export function getStatusWhere(statusParam?: string | null) {
  const statusValues = parseMultiValue(statusParam);

  // Cancelados: cobre variações (cancel/cancelled/cancelado)
  if (statusValues.length === 1 && statusValues[0] === 'cancelados') {
    return {
      OR: cancelledStatusConditions,
    };
  }

  // Todos: sem filtro de status
  if (statusParam === 'todos' || hasAll(statusValues, ['pagos', 'cancelados'])) {
    return {};
  }

  if (statusValues.includes('pagos') && statusValues.includes('cancelados')) {
    return { OR: [...paidStatusConditions, ...cancelledStatusConditions] };
  }

  if (statusValues.includes('cancelados')) {
    return { OR: cancelledStatusConditions };
  }

  // Pagos: incluir variações reais usadas por ML e Shopee
  // - Mercado Livre: paid, payment_approved
  // - Shopee (pagos/ativos): completed, shipped, ready_to_ship, to_ship, to_confirm_receive, processed, packed, retry_ship, pickup_done, arranging_shipment, first_mile_arrived
  return {
    OR: paidStatusConditions,
  };
}

/**
 * Cria filtro de canal/plataforma
 */
export function getCanalWhere(canalParam?: string | null) {
  const canais = parseMultiValue(canalParam);
  if (canais.length === 0 || hasAll(canais, ['mercado_livre', 'shopee'])) {
    return {};
  }

  if (canais.includes('shopee')) {
    return { plataforma: { contains: 'shopee', mode: 'insensitive' as const } };
  }

  if (canais.includes('mercado_livre')) {
    return { plataforma: { contains: 'mercado', mode: 'insensitive' as const } };
  }

  return {};
}

/**
 * Cria filtro de tipo de anúncio (apenas Mercado Livre)
 */
export function getTipoAnuncioWhere(tipoParam?: string | null) {
  const tipos = parseMultiValue(tipoParam);
  if (tipos.length === 0 || hasAll(tipos, ['catalogo', 'proprio'])) {
    return {};
  }

  if (tipos.includes('catalogo')) {
    return {
      OR: [
        { tipoAnuncio: { contains: 'catalog', mode: 'insensitive' as const } },
        { tipoAnuncio: { contains: 'catalogo', mode: 'insensitive' as const } }
      ]
    };
  }

  if (tipos.includes('proprio')) {
    return {
      OR: [
        { tipoAnuncio: { contains: 'proprio', mode: 'insensitive' as const } },
        { tipoAnuncio: { contains: 'próprio', mode: 'insensitive' as const } }
      ]
    };
  }

  return {};
}

/**
 * Cria filtro de modalidade de envio (apenas Mercado Livre)
 */
export function getModalidadeWhere(modalidadeParam?: string | null) {
  const modalidades = parseMultiValue(modalidadeParam);
  if (modalidades.length === 0 || hasAll(modalidades, ['me', 'full', 'flex'])) {
    return {};
  }

  const conditions: WhereFilter[] = [];

  if (modalidades.includes('full')) {
    conditions.push({ logisticType: { contains: 'fulfill', mode: 'insensitive' as const } });
  }

  if (modalidades.includes('flex')) {
    conditions.push({ logisticType: { contains: 'flex', mode: 'insensitive' as const } });
  }

  if (modalidades.includes('me')) {
    conditions.push({
      NOT: [
        { logisticType: { contains: 'fulfill', mode: 'insensitive' as const } },
        { logisticType: { contains: 'flex', mode: 'insensitive' as const } }
      ]
    });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { OR: conditions };
}
