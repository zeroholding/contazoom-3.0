/**
 * Preenche `prazo_despacho` em `meli_venda` e `shopee_venda` a partir do
 * `raw_data` que já está no banco.
 *
 * NENHUMA CHAMADA DE API — mesmo raciocínio de `estoque-full-backfill.ts` e
 * `anuncios-backfill.ts`: o prazo sempre chegou no sync e era descartado, mas o
 * payload cru inteiro é persistido (`raw_data`), então o histórico está todo no
 * Postgres. Refazer o sync para recuperá-lo custaria dezenas de milhares de
 * chamadas ao ML e à Shopee para buscar um dado que já temos.
 *
 * POR QUE ISTO É NECESSÁRIO
 *
 * A tela de Expedição ordena a fila pelo prazo. Numa base recém-migrada, TODA
 * venda estaria com prazo nulo e a fila cairia na reserva (data da venda), que é
 * justamente a ordenação errada — venda antiga com prazo folgado apareceria na
 * frente de venda nova com prazo vencendo hoje. A tela funcionaria e mentiria.
 *
 * AS EXPRESSÕES AQUI SÃO A TRADUÇÃO EM SQL DE `src/lib/prazo-despacho.ts`.
 * Os dois arquivos têm de ser alterados juntos: se a ordem de preferência
 * divergir, uma venda antiga (preenchida por aqui) e uma nova (preenchida pelo
 * sync) passam a tirar o prazo de campos diferentes, e a fila mistura dois
 * critérios sem nada na tela indicando isso.
 */

import prisma from "@/lib/prisma";
import { PRAZO_ORIGEM_AUSENTE } from "@/lib/prazo-despacho";

/** Faixa aceitável em epoch de segundos. Espelha `prazo-despacho.ts`. */
const EPOCH_MINIMO = 1_500_000_000;
const EPOCH_MAXIMO = 2_500_000_000;

const LOTE_PADRAO = 5000;

/* -------------------------------------------------------------------------- */
/*                         Construção das expressões                          */
/* -------------------------------------------------------------------------- */

/**
 * Data em texto ISO -> `timestamptz`, ou NULL se não parecer uma data.
 *
 * O `~ '^\d{4}-\d{2}-\d{2}'` NÃO é zelo: é o que impede a consulta inteira de
 * abortar. `('lixo')::timestamptz` levanta erro em tempo de execução, e num
 * `UPDATE ... FROM` de 5000 linhas basta UMA linha com string vazia, `"null"` ou
 * data pela metade no JSON para o lote todo virar exceção — e o backfill nunca
 * mais avançar, porque a próxima rodada pega o mesmo lote. É a mesma proteção que
 * o CyberDock precisou pôr dentro da view `unified_sales`.
 */
function iso(caminho: string): string {
  return `CASE WHEN ${caminho} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN (${caminho})::timestamptz END`;
}

/**
 * Epoch em segundos (texto) -> `timestamptz`, ou NULL fora da faixa.
 *
 * O `BETWEEN` é o que transforma o `ship_by_date = 0` da Shopee em NULL. Sem ele,
 * `to_timestamp(0)` dá 01/01/1970 e a tela anuncia "atrasado há 20.657 dias" —
 * e, pior, essas linhas ficam ordenadas ANTES de tudo, empurrando os prazos reais
 * para o fim da fila.
 */
function epoch(caminho: string): string {
  return `CASE
    WHEN ${caminho} ~ '^[0-9]+$'
     AND (${caminho})::bigint BETWEEN ${EPOCH_MINIMO} AND ${EPOCH_MAXIMO}
    THEN to_timestamp((${caminho})::bigint)
  END`;
}

/** `COALESCE` das variações de caminho de um mesmo campo lógico. */
function primeiro(expressoes: string[]): string {
  return expressoes.length === 1
    ? expressoes[0]
    : `COALESCE(${expressoes.join(", ")})`;
}

type Nivel = { origem: string; expressao: string };

/**
 * `prazo_despacho` = primeiro nível que produzir data;
 * `prazo_despacho_origem` = qual nível foi.
 *
 * Um nível presente mas com lixo dentro não consome a vez do próximo, porque a
 * checagem de validade está DENTRO de cada nível (nos `CASE` acima) e não em
 * volta do conjunto.
 */
function montarExpressoes(niveis: Nivel[]): { prazo: string; origem: string } {
  const prazo = `COALESCE(${niveis.map((n) => n.expressao).join(", ")})`;
  const origem = `CASE
    ${niveis.map((n) => `WHEN ${n.expressao} IS NOT NULL THEN '${n.origem}'`).join("\n    ")}
  END`;
  return { prazo, origem };
}

/**
 * Mercado Livre.
 *
 * `raw_data` é gravado como `{ order, shipment, freight }`. Os caminhos por
 * `'order' -> 'shipping'` e pela raiz cobrem, respectivamente, o envio embutido
 * no pedido (usado quando o `/shipments/{id}` falhou no sync) e o formato antigo
 * em que o pedido era a raiz do JSON. Sem essas variações, as vendas gravadas por
 * versões anteriores ficariam todas sem prazo.
 */
function niveisMeli(): Nivel[] {
  return [
    {
      origem: "ml_handling_limit",
      expressao: primeiro([
        iso(`v.raw_data -> 'shipment' -> 'shipping_option' -> 'estimated_handling_limit' ->> 'date'`),
        iso(`v.raw_data -> 'order' -> 'shipping' -> 'shipping_option' -> 'estimated_handling_limit' ->> 'date'`),
        iso(`v.raw_data -> 'shipping' -> 'shipping_option' -> 'estimated_handling_limit' ->> 'date'`),
      ]),
    },
    {
      origem: "ml_sla_expected",
      expressao: primeiro([
        iso(`v.raw_data -> 'shipment' -> 'sla' ->> 'expected_date'`),
        iso(`v.raw_data -> 'order' -> 'shipping' -> 'sla' ->> 'expected_date'`),
        iso(`v.raw_data -> 'shipping' -> 'sla' ->> 'expected_date'`),
      ]),
    },
    {
      origem: "ml_shipping_limit",
      expressao: primeiro([
        iso(`v.raw_data -> 'shipment' -> 'shipping_option' -> 'estimated_delivery_time' ->> 'shipping_limit_date'`),
        iso(`v.raw_data -> 'order' -> 'shipping' -> 'shipping_option' -> 'estimated_delivery_time' ->> 'shipping_limit_date'`),
      ]),
    },
  ];
}

/**
 * Shopee.
 *
 * `raw_data` é o pedido inteiro como veio do `get_order_detail`, então
 * `ship_by_date` está na raiz. A leitura de `shipment_details` existe porque o
 * sync despeja `package_list[0]` inteiro lá dentro (`...packageInfo`), o que dá
 * um segundo lugar onde o prazo pode estar em linha antiga.
 */
function niveisShopee(): Nivel[] {
  return [
    {
      origem: "sp_ship_by_date",
      expressao: epoch(`v.raw_data ->> 'ship_by_date'`),
    },
    {
      origem: "sp_package_ship_by_date",
      expressao: primeiro([
        epoch(`v.raw_data -> 'package_list' -> 0 ->> 'ship_by_date'`),
        epoch(`v.shipment_details ->> 'ship_by_date'`),
      ]),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*                                  Execução                                  */
/* -------------------------------------------------------------------------- */

export type BackfillPrazoResult = {
  /** Linhas que ganharam um prazo de verdade. */
  preenchidas: number;
  /** Linhas em que o JSON não tinha prazo, marcadas para sair da fila. */
  semPrazo: number;
  /** Quanto ainda falta depois desta rodada (ML + Shopee). */
  restantes: number;
};

/** Quantas vendas ainda não foram examinadas. */
export async function contarPrazoPendente(userId?: string): Promise<number> {
  const filtro = { prazoDespachoOrigem: null, ...(userId ? { userId } : {}) };
  const [ml, sp] = await Promise.all([
    prisma.meliVenda.count({ where: filtro }),
    prisma.shopeeVenda.count({ where: filtro }),
  ]);
  return ml + sp;
}

/**
 * Processa um lote de UMA tabela.
 *
 * Duas passadas. A segunda é o que garante convergência: ela marca
 * `'ausente'` SÓ onde a expressão de prazo dá NULL — repare no
 * `AND (${prazo}) IS NULL` do `WHERE`. Sem esse predicado, a segunda passada
 * marcaria como "sem prazo" as linhas que a primeira nem chegou a examinar
 * (a primeira tem LIMIT, e ao preencher encolhe o conjunto pendente, então as
 * duas janelas não coincidem), e essas vendas perderiam para sempre um prazo que
 * estava no JSON. É o mesmo cuidado do backfill de variação.
 */
async function processarTabela(
  tabela: "meli_venda" | "shopee_venda",
  niveis: Nivel[],
  limite: number,
  userId?: string,
): Promise<{ preenchidas: number; semPrazo: number }> {
  const teto = Math.max(1, Math.min(limite, 20_000));
  const filtroUsuario = userId ? `AND v.user_id = $2` : ``;
  const parametros: unknown[] = userId ? [teto, userId] : [teto];

  const { prazo, origem } = montarExpressoes(niveis);

  const preenchidas = await prisma.$executeRawUnsafe(
    `
    WITH alvo AS (
      SELECT v.id, ${prazo} AS prazo, ${origem} AS origem
      FROM ${tabela} v
      WHERE v.prazo_despacho_origem IS NULL ${filtroUsuario}
      ORDER BY v.data_venda DESC
      LIMIT $1
    )
    UPDATE ${tabela} AS m
    SET prazo_despacho = a.prazo,
        prazo_despacho_origem = a.origem
    FROM alvo a
    WHERE m.id = a.id AND a.prazo IS NOT NULL
    `,
    ...parametros,
  );

  const semPrazo = await prisma.$executeRawUnsafe(
    `
    WITH alvo AS (
      SELECT v.id
      FROM ${tabela} v
      WHERE v.prazo_despacho_origem IS NULL
        AND (${prazo}) IS NULL
        ${filtroUsuario}
      ORDER BY v.data_venda DESC
      LIMIT $1
    )
    UPDATE ${tabela} AS m
    SET prazo_despacho_origem = '${PRAZO_ORIGEM_AUSENTE}'
    FROM alvo a
    WHERE m.id = a.id
    `,
    ...parametros,
  );

  return { preenchidas, semPrazo };
}

/** Uma rodada nas duas tabelas. Idempotente: só toca em `origem IS NULL`. */
export async function backfillPrazoChunk(
  limite: number = LOTE_PADRAO,
  userId?: string,
): Promise<BackfillPrazoResult> {
  const ml = await processarTabela("meli_venda", niveisMeli(), limite, userId);
  const sp = await processarTabela("shopee_venda", niveisShopee(), limite, userId);

  return {
    preenchidas: ml.preenchidas + sp.preenchidas,
    semPrazo: ml.semPrazo + sp.semPrazo,
    restantes: await contarPrazoPendente(userId),
  };
}

/**
 * Roda lotes até acabar ou até bater o teto de tempo.
 *
 * O teto existe porque isto é chamado de dentro de uma requisição (a rota da
 * tela): melhor devolver "ainda falta X" e deixar a próxima visita continuar do
 * que estourar o tempo e perder o trabalho. Cada lote é commitado, então parar no
 * meio não desperdiça nada.
 */
export async function backfillPrazoAte(
  msMaximo = 8_000,
  userId?: string,
): Promise<BackfillPrazoResult> {
  const inicio = Date.now();
  const total: BackfillPrazoResult = {
    preenchidas: 0,
    semPrazo: 0,
    restantes: await contarPrazoPendente(userId),
  };

  while (total.restantes > 0 && Date.now() - inicio < msMaximo) {
    const rodada = await backfillPrazoChunk(LOTE_PADRAO, userId);
    total.preenchidas += rodada.preenchidas;
    total.semPrazo += rodada.semPrazo;
    total.restantes = rodada.restantes;
    // Nenhuma linha mudou: insistir seria laço infinito.
    if (rodada.preenchidas === 0 && rodada.semPrazo === 0) break;
  }

  return total;
}
