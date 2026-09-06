/**
 * Preenche `meli_venda.variation_id` a partir do `raw_data` que já está no banco.
 *
 * NENHUMA CHAMADA DE API — mesmo raciocínio de `anuncios-backfill.ts`: a variação
 * do anúncio sempre chegou dentro do pedido, em `order_items[0].item.variation_id`,
 * e era descartada no sync. O dado histórico inteiro já está no Postgres.
 *
 * POR QUE ISTO É NECESSÁRIO PARA O ESTOQUE FULL
 *
 * No Mercado Livre um anúncio com variações (P/M/G) tem estoque SEPARADO por
 * variação. A cobertura que a tela mostra ("quantos dias o estoque aguenta") é
 * estoque ÷ venda diária, então as vendas também têm de ser por variação.
 *
 * Sem esta coluna o join só poderia ser por anúncio, e as três variações
 * receberiam as vendas do anúncio inteiro: a venda diária tripli­caria em cada
 * linha e a tela diria "repor" em todas ao mesmo tempo. No sentido contrário, a
 * variação que está de fato acabando ficaria escondida atrás do volume das
 * outras. Número errado com cara de número certo é pior que coluna faltando.
 */

import prisma from "@/lib/prisma";

/**
 * Caminho da variação dentro do `raw_data`.
 *
 * O sync grava `{ order, shipment, freight }`, então o pedido fica sob `order`.
 * O `COALESCE` cobre o formato antigo, em que o pedido era a raiz do JSON — sem
 * ele as vendas gravadas por versões anteriores ficariam de fora e a cobertura
 * dessas variações sairia zerada.
 */
const VARIACAO_DO_JSON = `
  COALESCE(
    raw_data -> 'order' -> 'order_items' -> 0 -> 'item' ->> 'variation_id',
    raw_data -> 'order_items' -> 0 -> 'item' ->> 'variation_id'
  )
`;

/**
 * "Olhei o pedido e não havia variação" — anúncio simples.
 *
 * É DIFERENTE de NULL, que significa "ainda não preenchido". Sem essa distinção
 * as vendas de anúncio sem variação voltariam à fila em toda rodada, o backfill
 * nunca chegaria a zero e ficaria relendo o mesmo JSON para sempre.
 *
 * O snapshot do Full usa o mesmo marcador para inventário sem variação, e é isso
 * que permite o join ser uma igualdade simples em vez de um `OR (ambos IS NULL)`
 * — que é onde o projeto irmão precisou de cuidado extra, porque em SQL
 * `NULL = NULL` não é verdadeiro e o join perderia silenciosamente todo anúncio
 * simples.
 */
export const VARIACAO_AUSENTE = "-";

export type BackfillVariacaoResult = {
  /** Linhas examinadas nesta rodada. */
  processadas: number;
  /** Linhas que ganharam uma variação de verdade. */
  preenchidas: number;
  /** Linhas de anúncio simples, marcadas para sair da fila. */
  semVariacao: number;
  /** Quanto ainda falta depois desta rodada. */
  restantes: number;
};

const LOTE_PADRAO = 5000;

/** Quantas vendas ainda não têm `variation_id`. */
export async function contarVariacaoPendente(userId?: string): Promise<number> {
  return prisma.meliVenda.count({
    where: { variationId: null, ...(userId ? { userId } : {}) },
  });
}

/**
 * Processa um lote. Idempotente: só toca em linha com `variation_id IS NULL`.
 *
 * Duas passadas, e a segunda é o que garante convergência — ver `VARIACAO_AUSENTE`.
 */
export async function backfillVariacaoChunk(
  limite: number = LOTE_PADRAO,
  userId?: string,
): Promise<BackfillVariacaoResult> {
  const teto = Math.max(1, Math.min(limite, 20_000));
  const filtroUsuario = userId ? `AND v.user_id = $2` : ``;
  const parametros: unknown[] = userId ? [teto, userId] : [teto];

  const alvoJson = VARIACAO_DO_JSON.replace(/raw_data/g, "v.raw_data");

  // Passada 1: extrai a variação de quem tem.
  const preenchidas = await prisma.$executeRawUnsafe(
    `
    WITH alvo AS (
      SELECT v.id, ${alvoJson} AS variacao
      FROM meli_venda v
      WHERE v.variation_id IS NULL ${filtroUsuario}
      ORDER BY v.data_venda DESC
      LIMIT $1
    )
    UPDATE meli_venda AS m
    SET variation_id = LEFT(a.variacao, 32)
    FROM alvo a
    WHERE m.id = a.id AND a.variacao IS NOT NULL AND a.variacao <> ''
    `,
    ...parametros,
  );

  // Passada 2: anúncio simples sai da fila com o marcador.
  const semVariacao = await prisma.$executeRawUnsafe(
    `
    WITH alvo AS (
      SELECT v.id
      FROM meli_venda v
      WHERE v.variation_id IS NULL
        AND COALESCE(${alvoJson}, '') = ''
        ${filtroUsuario}
      ORDER BY v.data_venda DESC
      LIMIT $1
    )
    UPDATE meli_venda AS m
    SET variation_id = '${VARIACAO_AUSENTE}'
    FROM alvo a
    WHERE m.id = a.id
    `,
    ...parametros,
  );

  const restantes = await contarVariacaoPendente(userId);

  return {
    processadas: preenchidas + semVariacao,
    preenchidas,
    semVariacao,
    restantes,
  };
}

/**
 * Roda lotes até acabar ou até bater o teto de tempo.
 *
 * O teto existe porque isto é chamado de dentro de uma requisição: melhor
 * devolver "ainda falta X" e deixar a próxima visita continuar do que estourar o
 * tempo e perder o trabalho. Cada lote é commitado, então parar no meio não
 * desperdiça nada.
 */
export async function backfillVariacaoAte(
  msMaximo = 8_000,
  userId?: string,
): Promise<BackfillVariacaoResult> {
  const inicio = Date.now();
  const total: BackfillVariacaoResult = {
    processadas: 0,
    preenchidas: 0,
    semVariacao: 0,
    restantes: await contarVariacaoPendente(userId),
  };

  while (total.restantes > 0 && Date.now() - inicio < msMaximo) {
    const rodada = await backfillVariacaoChunk(LOTE_PADRAO, userId);
    total.processadas += rodada.processadas;
    total.preenchidas += rodada.preenchidas;
    total.semVariacao += rodada.semVariacao;
    total.restantes = rodada.restantes;
    // Nenhuma linha mudou: insistir seria laço infinito.
    if (rodada.processadas === 0) break;
  }

  return total;
}
