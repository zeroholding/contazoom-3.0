/**
 * Estoque, status e preço REAIS dos anúncios, direto do Mercado Livre.
 *
 * O banco não guarda estoque — e não deveria: estoque muda a cada venda, então
 * um número persistido nasce velho. A tela precisa da verdade do momento em que
 * alguém está olhando, senão a decisão "reativar ou repor" sai errada.
 *
 * Endpoint: multiget `GET /items?ids=...&attributes=...`, 20 ids por chamada.
 *
 * TRÊS COISAS QUE NÃO SÃO ÓBVIAS E FORAM APRENDIDAS DO PROJETO IRMÃO:
 *
 * 1. AGRUPAR POR CONTA É OBRIGATÓRIO. O multiget tem de ir com o token do dono
 *    do anúncio. Um token só para ids de contas diferentes faz o ML devolver
 *    `unauthorized` item a item, sem erro global — o resultado vem vazio e
 *    parece "anúncio não encontrado".
 *
 * 2. `sub_status` importa tanto quanto `status`. Um anúncio pausado por
 *    `out_of_stock` está morto por FALTA DE ESTOQUE, o que é um problema de
 *    compras. Um pausado com estoque é decisão de quem anuncia. Mesma cor na
 *    tela para os dois casos manda a pessoa resolver a coisa errada.
 *
 * 3. Cache com TTL curto, e TTL menor no ERRO. Guardar a falha pelo mesmo tempo
 *    que o acerto faz um 401 momentâneo apagar o estoque da tela por minutos;
 *    com TTL curto no erro a tela se recupera sozinha na próxima visita.
 */

import prisma from "@/lib/prisma";
import { refreshMeliAccountToken } from "@/lib/meli";
import { fetchWithRetry } from "@/lib/v2/utils/fetch-with-retry";

const MELI_API_BASE =
  process.env.MELI_API_BASE?.replace(/\/$/, "") || "https://api.mercadolibre.com";

/** Teto do multiget do ML. Acima de 20 ele recusa a chamada inteira. */
const LOTE = 20;
/** Lotes simultâneos por conta. Acima disso o ML começa a devolver 429. */
const CONCORRENCIA = 4;
/**
 * Curto de propósito: isto roda dentro de uma requisição de página. Melhor
 * devolver a tela com estoque faltando em alguns anúncios do que fazer a pessoa
 * esperar meio minuto por causa de uma conta lenta.
 */
const TIMEOUT_MS = 8_000;
const TENTATIVAS = 2;

const TTL_ACERTO_MS = 5 * 60 * 1000;
const TTL_ERRO_MS = 60 * 1000;

export type AnuncioInfo = {
  itemId: string;
  titulo?: string;
  thumbnailUrl?: string;
  permalink?: string;
  /** `active`, `paused`, `closed`, `under_review`. */
  status?: string;
  /** `out_of_stock`, `deleted`, ... Ver observação 2 no topo do arquivo. */
  subStatus?: string[];
  preco?: number;
  /** O ESTOQUE: unidades disponíveis para venda agora. */
  estoqueDisponivel?: number;
  /** Total já vendido pelo anúncio, na contagem do próprio ML. */
  totalVendido?: number;
  /** `fulfillment` (Full), `self_service` (Flex), `cross_docking`, ... */
  logisticType?: string;
  /** Saúde do anúncio, 0 a 1. */
  health?: number;
  catalogo?: boolean;
};

type EntradaMultiGet = {
  code?: number;
  body?: {
    id?: string;
    title?: string;
    secure_thumbnail?: string;
    thumbnail?: string;
    permalink?: string;
    status?: string;
    sub_status?: string[];
    price?: number;
    available_quantity?: number;
    sold_quantity?: number;
    health?: number;
    catalog_listing?: boolean;
    shipping?: { logistic_type?: string };
  };
};

type EntradaCache = { info: AnuncioInfo | null; expiraEm: number };

/**
 * Cache no processo. Chave é o MLB, não (usuário, MLB): o anúncio é o mesmo
 * objeto público independentemente de quem consulta, e o que o torna acessível
 * é o token usado na busca, não a chave do cache.
 */
const cache = new Map<string, EntradaCache>();

function doCache(itemId: string): AnuncioInfo | null | undefined {
  const entrada = cache.get(itemId);
  if (!entrada) return undefined;
  if (entrada.expiraEm < Date.now()) {
    cache.delete(itemId);
    return undefined;
  }
  return entrada.info;
}

function guardar(itemId: string, info: AnuncioInfo | null): void {
  cache.set(itemId, {
    info,
    expiraEm: Date.now() + (info ? TTL_ACERTO_MS : TTL_ERRO_MS),
  });
}

function https(url: string | undefined): string | undefined {
  return url?.replace(/^http:\/\//i, "https://");
}

/**
 * A miniatura padrão do ML vem pequena e serrilhada na tabela. `2X_` é a mesma
 * imagem em resolução dobrada, servida pelo mesmo CDN.
 */
function miniatura(url: string | undefined): string | undefined {
  return https(url)?.replace("/D_NQ_NP_", "/D_NQ_NP_2X_");
}

const ATRIBUTOS = [
  "id",
  "title",
  "secure_thumbnail",
  "thumbnail",
  "permalink",
  "status",
  "sub_status",
  "price",
  "available_quantity",
  "sold_quantity",
  "health",
  "catalog_listing",
  "shipping",
].join(",");

async function buscarLote(ids: string[], token: string): Promise<void> {
  const acertos = new Set<string>();
  try {
    const url = `${MELI_API_BASE}/items?ids=${ids.join(",")}&attributes=${ATRIBUTOS}`;
    const resposta = await fetchWithRetry(
      url,
      {
        cache: "no-store",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      },
      TENTATIVAS,
      // Sem `userId` de propósito: `fetchWithRetry` usa esse parâmetro para
      // empurrar avisos pelo SSE do SYNC. Um estoque lento na tela de anúncios
      // apareceria como se a sincronização de vendas estivesse com problema.
      undefined,
      TIMEOUT_MS,
    );

    if (!resposta.ok) {
      for (const id of ids) guardar(id, null);
      return;
    }

    const entradas = (await resposta.json()) as EntradaMultiGet[];
    for (const entrada of entradas) {
      const corpo = entrada.body;
      if (entrada.code !== 200 || !corpo?.id) continue;
      guardar(corpo.id, {
        itemId: corpo.id,
        titulo: corpo.title,
        thumbnailUrl: miniatura(corpo.secure_thumbnail ?? corpo.thumbnail),
        permalink: https(corpo.permalink),
        status: corpo.status,
        subStatus: Array.isArray(corpo.sub_status) ? corpo.sub_status : [],
        preco: corpo.price,
        estoqueDisponivel: corpo.available_quantity,
        totalVendido: corpo.sold_quantity,
        logisticType: corpo.shipping?.logistic_type,
        health: corpo.health,
        catalogo: corpo.catalog_listing,
      });
      acertos.add(corpo.id);
    }
  } catch {
    for (const id of ids) guardar(id, null);
    return;
  }

  // Id que o ML não devolveu: anúncio apagado ou de outra conta. Guarda como
  // erro para não repetir a chamada a cada carregamento da tela.
  for (const id of ids) if (!acertos.has(id)) guardar(id, null);
}

/** Divide em lotes de `LOTE`. */
function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

/**
 * Estoque e status de vários anúncios.
 *
 * `userId` não é opcional e não é decoração: as contas consultadas são só as
 * daquele usuário. Sem esse filtro, um MLB de outro inquilino passaria a ser
 * consultável com o token de quem pediu.
 */
export async function buscarAnuncioInfo(
  userId: string,
  refs: ReadonlyArray<{ itemId: string; meliAccountId: string }>,
): Promise<Map<string, AnuncioInfo>> {
  const resultado = new Map<string, AnuncioInfo>();
  const porConta = new Map<string, Set<string>>();

  for (const ref of refs) {
    if (!ref.itemId || !ref.itemId.startsWith("ML")) continue;
    const emCache = doCache(ref.itemId);
    if (emCache === undefined) {
      const grupo = porConta.get(ref.meliAccountId) ?? new Set<string>();
      grupo.add(ref.itemId);
      porConta.set(ref.meliAccountId, grupo);
    } else if (emCache) {
      resultado.set(ref.itemId, emCache);
    }
  }

  if (porConta.size > 0) {
    // Sem `select`: `refreshMeliAccountToken` recebe o registro inteiro.
    const contas = await prisma.meliAccount.findMany({
      where: {
        userId,
        id: { in: [...porConta.keys()] },
        // Conta com refresh token já reconhecido como inválido não é tentada.
        // O projeto tem essa coluna justamente para não bater na API sabendo que
        // vai falhar; ignorá-la aqui faria cada carregamento da tela repetir uma
        // renovação condenada, por conta, e o operador esperaria por nada.
        OR: [
          { refresh_token_invalid_until: null },
          { refresh_token_invalid_until: { lt: new Date() } },
        ],
      },
    });
    const porId = new Map(contas.map((c) => [c.id, c]));

    await Promise.all(
      [...porConta.entries()].map(async ([contaId, ids]) => {
        const conta = porId.get(contaId);
        if (!conta) {
          // Não é deste usuário, foi desconectada, ou o refresh está inválido.
          for (const id of ids) guardar(id, null);
          return;
        }

        let token: string;
        try {
          // UMA tentativa, e não `smartRefreshMeliAccountToken`.
          //
          // A versão "smart" tenta 3 vezes com espera exponencial (1s, 2s, 4s).
          // Isso é certo num job de sincronização, que pode esperar; numa tela é
          // fazer a pessoa olhar sete segundos de nada por conta com problema.
          // Aqui a falha tem saída barata: mostra "—" no estoque e segue.
          token = (await refreshMeliAccountToken(conta)).access_token;
        } catch {
          for (const id of ids) guardar(id, null);
          return;
        }

        const lotes = emLotes([...ids], LOTE);
        for (let i = 0; i < lotes.length; i += CONCORRENCIA) {
          await Promise.all(
            lotes.slice(i, i + CONCORRENCIA).map((lote) => buscarLote(lote, token)),
          );
        }
      }),
    );
  }

  for (const ref of refs) {
    if (resultado.has(ref.itemId)) continue;
    const info = doCache(ref.itemId);
    if (info) resultado.set(ref.itemId, info);
  }

  return resultado;
}

/** Esquece o cache. Usado pelo botão de atualizar da tela. */
export function esquecerAnuncioInfo(): void {
  cache.clear();
}
