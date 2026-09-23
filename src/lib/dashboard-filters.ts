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

  // TikTok Shop. `COMPLETED` e `DELIVERED` já entram pelas linhas acima; os
  // quatro abaixo são os estados intermediários que só existem aqui.
  //
  // `UNPAID` fica de FORA de propósito: é pedido criado e não pago, o que
  // corresponde a `cStat` pendente e não deve somar em faturamento. `CANCELLED`
  // cai na lista de cancelados.
  { status: { contains: 'awaiting_shipment', mode: 'insensitive' as const } },
  { status: { contains: 'awaiting_collection', mode: 'insensitive' as const } },
  { status: { contains: 'partially_shipping', mode: 'insensitive' as const } },
  { status: { contains: 'in_transit', mode: 'insensitive' as const } },
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
 * Cria filtro de status que funciona para as três plataformas
 * - Mercado Livre: 'paid' para pagos, 'cancelled' para cancelados
 * - Shopee: 'COMPLETED' para pagos, 'CANCELLED' para cancelados
 * - TikTok Shop: 'COMPLETED'/'DELIVERED'/em trânsito para pagos, 'CANCELLED'
 *   para cancelados, 'UNPAID' para nenhum dos dois
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

  // Pagos: variações reais usadas pelas três plataformas (ver as listas acima).
  return {
    OR: paidStatusConditions,
  };
}

/**
 * Trecho que identifica cada plataforma na coluna `plataforma`.
 *
 * É `contains` e não igualdade porque a coluna guarda o rótulo por extenso
 * ("Mercado Livre", "Shopee", "TikTok Shop"). `tiktok` casa com os dois formatos
 * que podem existir: "TikTok" e "TikTok Shop".
 */
const CANAL_PLATAFORMA: Record<string, string> = {
  mercado_livre: 'mercado',
  shopee: 'shopee',
  tiktok: 'tiktok',
};

const CANAIS_CONHECIDOS = Object.keys(CANAL_PLATAFORMA);

/**
 * Cria filtro de canal/plataforma.
 *
 * Era uma cadeia de `if` em que o PRIMEIRO canal reconhecido ganhava e os demais
 * eram descartados em silêncio. Com duas plataformas o caso "as duas" caía no
 * `hasAll` e o defeito não aparecia; com três, escolher duas de três passaria a
 * mostrar só uma — número errado na tela, sem erro nenhum.
 *
 * Agora é um OR sobre tudo que foi selecionado.
 */
export function getCanalWhere(canalParam?: string | null) {
  const canais = parseMultiValue(canalParam);

  // Nada selecionado, ou todos os canais: sem filtro.
  if (canais.length === 0 || hasAll(canais, CANAIS_CONHECIDOS)) {
    return {};
  }

  const conditions = canais
    .map((canal) => CANAL_PLATAFORMA[canal])
    .filter((trecho): trecho is string => Boolean(trecho))
    .map((trecho) => ({
      plataforma: { contains: trecho, mode: 'insensitive' as const },
    }));

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { OR: conditions };
}

/** Chave curta de plataforma usada pelas rotas de dashboard. */
export type PlataformaDashboard = 'meli' | 'shopee' | 'tiktok';

/** `canal` na query string -> chave curta de plataforma. */
const CANAL_PARA_PLATAFORMA: Record<string, PlataformaDashboard> = {
  mercado_livre: 'meli',
  shopee: 'shopee',
  tiktok: 'tiktok',
};

/**
 * A plataforma entra no resultado, dado o filtro de canal?
 *
 * Existe para substituir o guard por EXCLUSÃO que as rotas usavam:
 *
 *     canalParam === "shopee" ? [] : prisma.meliVenda.groupBy(...)
 *
 * Aquilo funcionava com duas plataformas porque "não é Shopee" equivalia a "é
 * ML". Com três deixou de funcionar: filtrando por `tiktok`, a condição
 * `=== "shopee"` é falsa e a consulta do ML roda igual — o painel soma Mercado
 * Livre dentro de um filtro de TikTok. Perguntar por INCLUSÃO não tem esse
 * problema, e continua valendo se entrar uma quarta plataforma.
 */
export function canalIncluiPlataforma(
  canalParam: string | null | undefined,
  plataforma: PlataformaDashboard,
): boolean {
  const canais = parseMultiValue(canalParam);

  // Nada selecionado (ou "todos"): todas as plataformas entram.
  if (canais.length === 0) return true;

  const selecionadas = canais
    .map((canal) => CANAL_PARA_PLATAFORMA[canal])
    .filter((valor): valor is PlataformaDashboard => Boolean(valor));

  // Só valores desconhecidos: trata como sem filtro, em vez de zerar a tela.
  if (selecionadas.length === 0) return true;

  return selecionadas.includes(plataforma);
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
