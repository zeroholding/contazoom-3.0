/**
 * Preenche `meli_venda.item_id` a partir do `raw_data` que já está no banco.
 *
 * NENHUMA CHAMADA DE API. O MLB do anúncio sempre chegou dentro do pedido, em
 * `order_items[0].item.id`, e era descartado no sync — apenas título e SKU
 * eram persistidos. Então o dado histórico inteiro já está lá; é só extrair.
 * Isso muda a ordem de grandeza da operação: em vez de milhares de requisições
 * ao Mercado Livre, é um UPDATE lendo JSON local.
 *
 * EM LOTES, e não de uma vez, por dois motivos:
 *   - um UPDATE numa tabela de vendas inteira segura a transação e trava
 *     escrita, o que pararia o sync no meio;
 *   - lote pequeno cabe no limite de tempo de uma requisição, então a tela
 *     pode disparar o backfill sem estourar timeout.
 *
 * IDEMPOTENTE E RETOMÁVEL. Só toca em linha com `item_id IS NULL`, nunca
 * reescreve valor já gravado. Rodar dez vezes dá o mesmo resultado que rodar
 * uma; interromper no meio não corrompe nada, a próxima rodada continua de onde
 * parou. Casa com o índice parcial `meli_venda_item_id_pendente_idx`.
 */

import prisma from "@/lib/prisma";

/**
 * Caminho do MLB dentro do `raw_data`.
 *
 * O sync grava `{ order, shipment, freight }`, então o pedido fica sob `order`.
 * O `COALESCE` cobre o formato antigo, em que o pedido era a raiz do JSON — sem
 * ele, vendas gravadas por versões anteriores do sync ficariam de fora e
 * pareceriam "anúncios sem venda" na tela.
 */
const MLB_DO_JSON = `
  COALESCE(
    raw_data -> 'order' -> 'order_items' -> 0 -> 'item' ->> 'id',
    raw_data -> 'order_items' -> 0 -> 'item' ->> 'id'
  )
`;

/**
 * Expressão reutilizável para as CONSULTAS, não para o backfill.
 *
 * Enquanto o backfill não termina, a tela precisa mostrar a venda de qualquer
 * jeito — senão o ranking sai errado e ninguém saberia por quê. Então as
 * consultas usam a coluna e caem no JSON como reserva. É mais lento, mas só
 * para o que ainda falta, e o custo desaparece quando o backfill converge.
 */
export const ITEM_ID_SQL = `COALESCE(v.item_id, ${MLB_DO_JSON.replace(/raw_data/g, "v.raw_data")})`;

export type BackfillItemIdResult = {
  /** Linhas examinadas nesta rodada. */
  processadas: number;
  /** Linhas que ganharam `item_id`. */
  preenchidas: number;
  /** Linhas cujo `raw_data` não tem MLB — marcadas para sair da fila. */
  semMlb: number;
  /** Quanto ainda falta depois desta rodada. */
  restantes: number;
};

/** Marcador de "olhei e não havia MLB no JSON". Ver `LOTE` abaixo. */
export const ITEM_ID_AUSENTE = "-";

const LOTE_PADRAO = 5000;

/** Quantas vendas ainda não têm `item_id`. */
export async function contarItemIdPendente(userId?: string): Promise<number> {
  return prisma.meliVenda.count({
    where: { itemId: null, ...(userId ? { userId } : {}) },
  });
}

/**
 * Processa um lote.
 *
 * Duas passadas no mesmo lote, e a segunda é o que garante convergência: as
 * linhas cujo JSON realmente não tem MLB recebem o marcador `"-"`. Sem isso
 * elas voltariam à fila em toda rodada, o backfill nunca chegaria a zero e
 * ficaria relendo o mesmo JSON para sempre.
 */
export async function backfillItemIdChunk(
  limite: number = LOTE_PADRAO,
  userId?: string,
): Promise<BackfillItemIdResult> {
  const teto = Math.max(1, Math.min(limite, 20_000));

  const filtroUsuario = userId ? `AND v.user_id = $2` : ``;
  const parametros: unknown[] = userId ? [teto, userId] : [teto];

  // Passada 1: extrai o MLB de quem tem.
  const preenchidas = await prisma.$executeRawUnsafe(
    `
    WITH alvo AS (
      SELECT v.id, ${MLB_DO_JSON.replace(/raw_data/g, "v.raw_data")} AS mlb
      FROM meli_venda v
      WHERE v.item_id IS NULL ${filtroUsuario}
      ORDER BY v.data_venda DESC
      LIMIT $1
    )
    UPDATE meli_venda AS m
    SET item_id = LEFT(a.mlb, 32)
    FROM alvo a
    WHERE m.id = a.id AND a.mlb IS NOT NULL AND a.mlb <> ''
    `,
    ...parametros,
  );

  // Passada 2: quem não tem MLB no JSON sai da fila com o marcador.
  const semMlb = await prisma.$executeRawUnsafe(
    `
    WITH alvo AS (
      SELECT v.id
      FROM meli_venda v
      WHERE v.item_id IS NULL
        AND COALESCE(${MLB_DO_JSON.replace(/raw_data/g, "v.raw_data")}, '') = ''
        ${filtroUsuario}
      ORDER BY v.data_venda DESC
      LIMIT $1
    )
    UPDATE meli_venda AS m
    SET item_id = '${ITEM_ID_AUSENTE}'
    FROM alvo a
    WHERE m.id = a.id
    `,
    ...parametros,
  );

  const restantes = await contarItemIdPendente(userId);

  return {
    processadas: preenchidas + semMlb,
    preenchidas,
    semMlb,
    restantes,
  };
}

/**
 * Roda lotes até acabar ou até bater o teto de tempo.
 *
 * O teto existe porque isto é chamado de dentro de uma requisição: melhor
 * devolver "ainda falta X" e deixar o próximo clique continuar do que estourar
 * o tempo e perder o trabalho já feito — cada lote é commitado, então parar no
 * meio não desperdiça nada.
 */
export async function backfillItemIdAte(
  msMaximo = 8_000,
  userId?: string,
): Promise<BackfillItemIdResult> {
  const inicio = Date.now();
  const total: BackfillItemIdResult = {
    processadas: 0,
    preenchidas: 0,
    semMlb: 0,
    restantes: await contarItemIdPendente(userId),
  };

  while (total.restantes > 0 && Date.now() - inicio < msMaximo) {
    const rodada = await backfillItemIdChunk(LOTE_PADRAO, userId);
    total.processadas += rodada.processadas;
    total.preenchidas += rodada.preenchidas;
    total.semMlb += rodada.semMlb;
    total.restantes = rodada.restantes;
    // Nenhuma linha mudou: insistir seria laço infinito.
    if (rodada.processadas === 0) break;
  }

  return total;
}
