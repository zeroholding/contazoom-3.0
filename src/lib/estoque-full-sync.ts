/**
 * Sincronização do Estoque Full (Mercado Envíos Full / fulfillment).
 *
 * Estoque NÃO é derivável de venda: unidade entra por reposição, sai por
 * devolução, fica retida por avaria. Só a API do Mercado Livre sabe o número, e
 * é por isso que existe snapshot em tabela em vez de cálculo em cima de vendas.
 *
 * FLUXO POR CONTA — quatro endpoints, e a ordem importa
 *
 *   1. GET /users/{seller}/items/search?logistic_type=fulfillment
 *        quais anúncios estão no Full
 *   2. GET /items?ids=...
 *        variações → `inventory_id`, `user_product_id`, SKU, título, foto
 *   3. GET /user-products/{id}          (só para quem ficou sem SKU)
 *        o SKU do modelo novo de estoque
 *   4. GET /inventories/{inventory_id}/stock/fulfillment
 *        os números
 *
 * O `inventory_id` só existe via (2) e o estoque só via (4) — não há atalho.
 *
 * OBSERVAÇÕES DA API, confirmadas no projeto irmão contra a API oficial:
 *
 *   - As unidades em transferência vêm DENTRO de `not_available_quantity`, mas o
 *     painel do próprio Mercado Livre as mostra separadas, como "A caminho". Se
 *     a gente não separar, o número de "não aptas" aqui fica maior que o do
 *     painel do ML e ninguém entende por quê. Guardamos os dois: `transfer` é o
 *     a caminho, e `notAvailable` já vai líquido.
 *   - Anúncio no modelo novo de estoque (user_products) NÃO traz o SKU na
 *     variação do `/items`. Sem a chamada (3) uma parte do catálogo aparece sem
 *     SKU, e sem SKU não há junção com o cadastro — logo, sem hierarquia e fora
 *     dos filtros de categoria. O shape da resposta é diferente do `/items`:
 *     `attributes[].values[0].name` e `thumbnail.secure_url` como objeto.
 *   - O endpoint de estoque não exige `seller_id`; o de `items/search` exige.
 *
 * DUAS COISAS QUE ESTE PORTE FAZ DIFERENTE DO PROJETO IRMÃO, de propósito:
 *
 *   - Paginação por `search_type=scan` + `scroll_id` em vez de `offset`. O
 *     `items/search` do ML recusa offset acima de ~1000, e o irmão pagina por
 *     offset com teto de 200 páginas: numa conta com mais de mil anúncios em
 *     Full a lista sairia truncada em silêncio. O `scan` não tem esse limite, e o
 *     CONTAZOOM já o usa em `sku-discovery.ts`.
 *   - O "dia" do histórico é calculado em horário de São Paulo, não em UTC. O
 *     irmão usa `Date.UTC` enquanto o SQL de leitura usa `CURRENT_DATE`; entre
 *     21h e meia-noite de Brasília os dois discordam, e o histórico ganha duas
 *     linhas para o mesmo dia ou pula um.
 */

import prisma from "@/lib/prisma";
import { pMap } from "@/lib/concorrencia";
import { refreshMeliAccountToken } from "@/lib/meli";
import { sendProgressToUser } from "@/lib/sse-progress";

const MELI_API_BASE =
  process.env.MELI_API_BASE?.replace(/\/$/, "") || "https://api.mercadolibre.com";

/** Anúncios por página do `items/search` com `scan`. 100 é o teto do endpoint. */
const BUSCA_PAGINA = 100;
/** Teto do multiget `/items`. Acima disso o ML recusa a chamada inteira. */
const ITEMS_LOTE = 20;
const ITEMS_CONCORRENCIA = 5;
const ESTOQUE_CONCORRENCIA = 8;
const USERPRODUCT_CONCORRENCIA = 6;
const TIMEOUT_MS = 15_000;
/** Guarda contra laço infinito se o `scroll_id` nunca terminar. */
const MAX_PAGINAS = 300;

/** Marcador de "olhei e não havia variação". Igual ao do backfill de vendas. */
const VARIACAO_AUSENTE = "-";

type ContaMeli = {
  id: string;
  userId: string;
  ml_user_id: bigint;
  nickname: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  refresh_token_invalid_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

type EntradaInventario = {
  inventoryId: string;
  itemId: string;
  variationId: string;
  userProductId: string | null;
  sku: string | null;
  titulo: string | null;
  thumbnail: string | null;
  logisticType: string | null;
};

export type ResumoSyncFull = {
  totalSalvo: number;
  porConta: { conta: string; salvos: number; erro?: string }[];
  iniciadoEm: string;
  terminadoEm: string;
  /** `true` quando o orçamento de tempo acabou antes de terminar as contas. */
  faltouTempo: boolean;
};

/**
 * GET no ML que NUNCA lança.
 *
 * Devolver `null` em qualquer falha (rede, timeout, 401, 429, 500) é o que
 * permite usar `pMap` sem `try/catch` em toda chamada de leitura. O preço é não
 * distinguir os motivos — aceitável aqui, porque a reação é a mesma em todos:
 * não confiar no resultado e não apagar nada por causa dele.
 */
async function mlGet<T = unknown>(caminho: string, token: string): Promise<T | null> {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${MELI_API_BASE}${caminho}`, {
      signal: controlador.signal,
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Todos os anúncios em Full de uma conta.
 *
 * `ok` é um selo de confiança para a LIMPEZA, e só para isso. Quando alguma
 * página falha, a lista está incompleta — e apagar os inventários que "não
 * apareceram" apagaria o Full inteiro da conta por causa de um token que expirou
 * no meio da paginação. Os ids já coletados continuam sendo sincronizados; o que
 * se perde é apenas o direito de apagar.
 */
async function listarAnunciosFull(
  sellerId: string,
  token: string,
): Promise<{ ids: string[]; ok: boolean }> {
  const ids: string[] = [];
  let scrollId: string | null = null;
  let ok = true;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const params = new URLSearchParams({
      search_type: "scan",
      logistic_type: "fulfillment",
      limit: String(BUSCA_PAGINA),
    });
    if (scrollId) params.set("scroll_id", scrollId);

    const dados = await mlGet<{ results?: string[]; scroll_id?: string }>(
      `/users/${sellerId}/items/search?${params.toString()}`,
      token,
    );

    if (dados === null) {
      ok = false;
      break;
    }

    const resultados = Array.isArray(dados.results) ? dados.results : [];
    for (const id of resultados) if (id) ids.push(String(id));

    scrollId = dados.scroll_id ? String(dados.scroll_id) : null;
    // O `scan` termina quando a página vem vazia ou o scroll_id desaparece.
    if (resultados.length === 0 || !scrollId) break;
  }

  return { ids: Array.from(new Set(ids)), ok };
}

/**
 * Título da linha quando o anúncio tem variações.
 *
 * Sem isto, as três variações de um anúncio aparecem na tela com o MESMO texto e
 * a pessoa não tem como saber qual delas está para acabar — que é justamente a
 * informação que a tela existe para dar. `attribute_combinations` é onde o ML
 * guarda "Tamanho: M", "Cor: Preto".
 */
function nomeDaVariacao(titulo: string | null, variacao: Record<string, unknown>): string | null {
  const combinacoes = variacao.attribute_combinations;
  if (!Array.isArray(combinacoes)) return titulo;

  const partes = combinacoes
    .map((c) => (c as { value_name?: string })?.value_name)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");

  if (partes.length === 0) return titulo;
  return titulo ? `${titulo} — ${partes.join(" / ")}` : partes.join(" / ");
}

/** Primeiro texto não vazio. */
function primeiroSku(...valores: unknown[]): string | null {
  for (const v of valores) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/** SELLER_SKU dos atributos do item, quando o campo direto vem vazio. */
function skuDosAtributos(atributos: unknown): string | null {
  if (!Array.isArray(atributos)) return null;
  const attr = atributos.find((a) => (a as { id?: string })?.id === "SELLER_SKU") as
    | { value_name?: string }
    | undefined;
  return attr?.value_name?.trim() || null;
}

/**
 * Multiget de itens → uma entrada por inventário.
 *
 * Item com variações gera uma entrada por variação; item simples gera uma, com
 * `variationId` no marcador de ausência. Variação sem `inventory_id` é
 * descartada: sem inventário não há estoque para consultar.
 */
async function itensParaInventarios(
  itemIds: string[],
  token: string,
): Promise<EntradaInventario[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < itemIds.length; i += ITEMS_LOTE) {
    lotes.push(itemIds.slice(i, i + ITEMS_LOTE));
  }

  const respostas = await pMap(lotes, ITEMS_CONCORRENCIA, (lote) =>
    mlGet<Array<{ body?: Record<string, unknown> }>>(
      `/items?ids=${lote.join(",")}`,
      token,
    ),
  );

  const entradas: EntradaInventario[] = [];

  for (const dados of respostas) {
    if (!Array.isArray(dados)) continue;

    for (const entrada of dados) {
      const corpo = entrada?.body;
      if (!corpo || corpo.id == null) continue;

      const itemId = String(corpo.id);
      // A API responde em inglês (`title`); a nossa coluna é `titulo`.
      const tituloReal = typeof corpo.title === "string" ? corpo.title : null;
      const thumbnail =
        (typeof corpo.secure_thumbnail === "string" && corpo.secure_thumbnail) ||
        (typeof corpo.thumbnail === "string" && corpo.thumbnail) ||
        null;
      const logisticType =
        (corpo.shipping as { logistic_type?: string } | undefined)?.logistic_type ?? null;
      const skuDoItem = primeiroSku(
        corpo.seller_custom_field,
        skuDosAtributos(corpo.attributes),
      );

      const variacoes: unknown[] = Array.isArray(corpo.variations) ? corpo.variations : [];

      if (variacoes.length > 0) {
        for (const v of variacoes as Array<Record<string, unknown>>) {
          const invId = typeof v.inventory_id === "string" ? v.inventory_id : null;
          if (!invId) continue;
          entradas.push({
            inventoryId: invId,
            itemId,
            variationId: v.id != null ? String(v.id) : VARIACAO_AUSENTE,
            userProductId: typeof v.user_product_id === "string" ? v.user_product_id : null,
            sku: primeiroSku(v.seller_sku, skuDosAtributos(v.attributes), skuDoItem),
            titulo: nomeDaVariacao(tituloReal, v),
            thumbnail,
            logisticType,
          });
        }
      } else if (typeof corpo.inventory_id === "string" && corpo.inventory_id) {
        entradas.push({
          inventoryId: corpo.inventory_id,
          itemId,
          variationId: VARIACAO_AUSENTE,
          userProductId:
            typeof corpo.user_product_id === "string" ? corpo.user_product_id : null,
          sku: skuDoItem,
          titulo: tituloReal,
          thumbnail,
          logisticType,
        });
      }
      // Sem variação E sem inventory_id: o anúncio não tem estoque próprio no
      // Full. Fica de fora sem erro — não há o que consultar.
    }
  }

  // Dedupe por inventário: dois anúncios podem apontar o mesmo user_product.
  const vistos = new Set<string>();
  return entradas.filter((e) => {
    if (vistos.has(e.inventoryId)) return false;
    vistos.add(e.inventoryId);
    return true;
  });
}

/** SKU e foto do `user_product`, para o modelo novo de estoque do ML. */
async function buscarUserProduct(
  userProductId: string,
  token: string,
): Promise<{ sku: string | null; thumbnail: string | null } | null> {
  const dados = await mlGet<{
    attributes?: Array<{ id?: string; values?: Array<{ name?: string }> }>;
    thumbnail?: { secure_url?: string };
  }>(`/user-products/${userProductId}`, token);
  if (!dados) return null;

  const attr = dados.attributes?.find((a) => a.id === "SELLER_SKU");
  return {
    sku: attr?.values?.[0]?.name?.trim() || null,
    thumbnail: dados.thumbnail?.secure_url ?? null,
  };
}

/** Completa SKU e foto de quem veio sem. Muta as entradas, best-effort. */
async function completarDosUserProducts(
  entradas: EntradaInventario[],
  token: string,
): Promise<void> {
  const pendentes = entradas.filter((e) => !e.sku && e.userProductId);
  if (pendentes.length === 0) return;

  await pMap(pendentes, USERPRODUCT_CONCORRENCIA, async (e) => {
    try {
      const up = await buscarUserProduct(e.userProductId!, token);
      if (up) {
        if (up.sku) e.sku = up.sku;
        if (!e.thumbnail && up.thumbnail) e.thumbnail = up.thumbnail;
      }
    } catch {
      // Sem SKU o item ainda aparece na tela, só sem hierarquia. Não é motivo
      // para derrubar a conta inteira.
    }
  });
}

type ResultadoEstoque = {
  total: number;
  disponivel: number;
  naoDisponivel: number;
  transferencia: number;
  detalhe: unknown;
};

/** GET /inventories/{id}/stock/fulfillment → os números. */
async function buscarEstoque(
  inventoryId: string,
  token: string,
): Promise<ResultadoEstoque | null> {
  const dados = await mlGet<Record<string, unknown>>(
    `/inventories/${inventoryId}/stock/fulfillment`,
    token,
  );
  // 200 com corpo inesperado é falha, não estoque zero. Tratar como zero
  // gravaria "esgotado" num produto que pode estar cheio.
  if (!dados || dados.inventory_id == null) return null;

  const detalhe: Array<{ status?: string; quantity?: number }> = Array.isArray(
    dados.not_available_detail,
  )
    ? (dados.not_available_detail as Array<{ status?: string; quantity?: number }>)
    : [];

  const transferencia = detalhe
    .filter((d) => String(d.status).toLowerCase() === "transfer")
    .reduce((acc, d) => acc + (Number(d.quantity) || 0), 0);

  return {
    total: Number(dados.total) || 0,
    disponivel: Number(dados.available_quantity) || 0,
    naoDisponivel: Number(dados.not_available_quantity) || 0,
    transferencia,
    detalhe,
  };
}

/** Meia-noite de hoje em São Paulo, como `Date` de data pura. */
function diaDeHojeSp(): Date {
  const agora = new Date();
  // `sv-SE` é o único locale que devolve `yyyy-mm-dd` direto.
  const [ano, mes, dia] = agora
    .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .split("-")
    .map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Sincroniza uma conta. Devolve quantos inventários foram gravados. */
async function sincronizarConta(
  conta: ContaMeli,
  aoProcessar: () => void,
): Promise<number> {
  const atualizada = await refreshMeliAccountToken(conta);
  const token = atualizada.access_token;
  const sellerId = conta.ml_user_id.toString();

  const { ids: itemIds, ok: buscaConfiavel } = await listarAnunciosFull(sellerId, token);

  // Limpa o que saiu do Full — só quando a busca foi confiável. Ver o comentário
  // de `listarAnunciosFull`.
  if (buscaConfiavel) {
    if (itemIds.length === 0) {
      await prisma.meliFullStock.deleteMany({
        where: { userId: conta.userId, meliAccountId: conta.id },
      });
    } else {
      await prisma.meliFullStock.deleteMany({
        where: {
          userId: conta.userId,
          meliAccountId: conta.id,
          itemId: { notIn: itemIds },
        },
      });
    }
  }

  if (itemIds.length === 0) return 0;

  const entradas = await itensParaInventarios(itemIds, token);
  if (entradas.length === 0) return 0;

  await completarDosUserProducts(entradas, token);

  const dia = diaDeHojeSp();
  let salvos = 0;

  await pMap(entradas, ESTOQUE_CONCORRENCIA, async (e) => {
    // `try/catch` DENTRO do callback é obrigatório: `pMap` rejeita inteiro se o
    // callback lançar, e um único erro de gravação abortaria a conta.
    try {
      const estoque = await buscarEstoque(e.inventoryId, token);
      if (!estoque) {
        aoProcessar();
        return;
      }

      // O "a caminho" vem somado no não disponível — ver o cabeçalho do arquivo.
      // `Math.max(0, ...)` protege da leitura inconsistente em que o ML devolve
      // transferência maior que o não disponível.
      const naoAptasReal = Math.max(0, estoque.naoDisponivel - estoque.transferencia);

      const comuns = {
        userId: conta.userId,
        meliAccountId: conta.id,
        itemId: e.itemId,
        variationId: e.variationId,
        userProductId: e.userProductId,
        sku: e.sku,
        titulo: e.titulo,
        thumbnail: e.thumbnail,
        logisticType: e.logisticType,
        total: estoque.total,
        availableQuantity: estoque.disponivel,
        notAvailableQuantity: naoAptasReal,
        transferQuantity: estoque.transferencia,
        notAvailableDetail: estoque.detalhe as never,
      };

      await prisma.meliFullStock.upsert({
        where: {
          meliAccountId_inventoryId: {
            meliAccountId: conta.id,
            inventoryId: e.inventoryId,
          },
        },
        create: { inventoryId: e.inventoryId, ...comuns },
        update: { ...comuns, sincronizadoEm: new Date() },
      });

      // Uma linha por inventário por dia: o snapshot do dia é SOBRESCRITO. Rodar
      // o sync cinco vezes num dia não pode inflar a média de 30 dias.
      await prisma.meliFullStockHistory.upsert({
        where: {
          userId_inventoryId_dia: {
            userId: conta.userId,
            inventoryId: e.inventoryId,
            dia,
          },
        },
        create: {
          userId: conta.userId,
          inventoryId: e.inventoryId,
          dia,
          availableQuantity: estoque.disponivel,
          total: estoque.total,
        },
        update: { availableQuantity: estoque.disponivel, total: estoque.total },
      });

      salvos += 1;
      aoProcessar();
    } catch (err) {
      console.warn(`[estoque-full] erro no inventário ${e.inventoryId}:`, err);
      aoProcessar();
    }
  });

  return salvos;
}

/**
 * Sincroniza o Estoque Full de todas as contas do usuário.
 *
 * Contas em SEQUÊNCIA (o paralelismo fica dentro de cada uma): o progresso é
 * global por usuário e duas contas ao mesmo tempo se sobrescreveriam nos avisos,
 * além de triplicar a rajada na API.
 *
 * Erro numa conta não derruba as outras — vai para `porConta[].erro`. Conta com
 * refresh token inválido é a causa mais comum e não deve impedir o resto.
 *
 * `msMaximo` é o orçamento de tempo: quando acaba, para de começar contas novas e
 * devolve `faltouTempo: true`. É o padrão do projeto para trabalho maior que a
 * janela da rota — fatiar e ser retomável, em vez de inventar um worker que não
 * existe aqui.
 */
export async function sincronizarEstoqueFull(
  userId: string,
  msMaximo = 240_000,
): Promise<ResumoSyncFull> {
  const iniciadoEm = new Date().toISOString();
  const inicio = Date.now();

  const contas = (await prisma.meliAccount.findMany({
    where: { userId },
    orderBy: { nickname: "asc" },
  })) as ContaMeli[];

  const porConta: ResumoSyncFull["porConta"] = [];
  let totalSalvo = 0;
  let faltouTempo = false;
  let processados = 0;

  sendProgressToUser(userId, {
    type: "estoque_full_start",
    message:
      contas.length === 0
        ? "Nenhuma conta do Mercado Livre conectada."
        : `Atualizando estoque Full de ${contas.length} conta(s)…`,
    total: contas.length,
    current: 0,
  });

  for (const [indice, conta] of contas.entries()) {
    const rotulo = conta.nickname ?? conta.ml_user_id.toString();

    if (Date.now() - inicio > msMaximo) {
      faltouTempo = true;
      porConta.push({ conta: rotulo, salvos: 0, erro: "não coube no tempo desta rodada" });
      continue;
    }

    sendProgressToUser(userId, {
      type: "estoque_full_progress",
      message: `Conta ${rotulo}…`,
      current: indice,
      total: contas.length,
      accountId: conta.id,
      accountNickname: rotulo,
    });

    try {
      const salvos = await sincronizarConta(conta, () => {
        processados += 1;
        // Avisa a cada 10 para não inundar o SSE — um sync grande passa de mil
        // inventários, e mil mensagens não informam mais que cem.
        if (processados % 10 === 0) {
          sendProgressToUser(userId, {
            type: "estoque_full_progress",
            message: `${processados} inventário(s) atualizado(s)…`,
            current: indice,
            total: contas.length,
            fetched: processados,
          });
        }
      });
      totalSalvo += salvos;
      porConta.push({ conta: rotulo, salvos });
    } catch (err) {
      porConta.push({
        conta: rotulo,
        salvos: 0,
        erro: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }

  sendProgressToUser(userId, {
    type: "estoque_full_complete",
    message: faltouTempo
      ? `${totalSalvo} item(ns) atualizado(s). Faltaram contas nesta rodada — clique de novo.`
      : `${totalSalvo} item(ns) de estoque atualizado(s).`,
    total: contas.length,
    current: contas.length,
    fetched: totalSalvo,
    hasMoreToSync: faltouTempo,
  });

  return {
    totalSalvo,
    porConta,
    iniciadoEm,
    terminadoEm: new Date().toISOString(),
    faltouTempo,
  };
}
