/**
 * Consultas da fila de Expedição. Só servidor.
 *
 * SOMENTE LEITURA. Não existe `$executeRaw` aqui e nenhuma coluna de
 * "despachado": o estado de um pacote é o que o marketplace diz no último sync.
 * É a mesma escolha do CyberDock e do NEXUS v2, e ela é deliberada — um botão
 * "marcar como despachado" no CONTAZOOM criaria uma segunda verdade que o
 * próximo sync sobrescreveria sem avisar, e a tela passaria a discordar do painel
 * do Mercado Livre sem ninguém saber qual das duas está certa.
 *
 * A UNIDADE É O PACOTE. Ver `PacoteExpedicao` em `expedicao.ts`.
 */

import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import {
  CANAIS,
  classificarUrgencia,
  URGENCIAS,
  type Canal,
  type ContaExpedicao,
  type FiltrosExpedicao,
  type ItemPacote,
  type OrdemExpedicao,
  type PacoteExpedicao,
  type ResultadoExpedicao,
  type Urgencia,
} from "@/lib/expedicao";

/* -------------------------------------------------------------------------- */
/*                        Regras duras da fila                                */
/* -------------------------------------------------------------------------- */

/**
 * Estados de envio do ML que significam "saiu daqui" — o pacote não é mais
 * trabalho de galpão.
 *
 * LISTA NEGRA, e não lista branca, de propósito. O vocabulário de
 * `shipping_status` do ML é aberto e muda sem aviso (`to_be_agreed`, `delayed`,
 * `handling`, `printed`, `stale`...). Com lista branca, um estado novo que a
 * lista não conhecesse faria o pacote DESAPARECER da fila — trabalho invisível,
 * que é o pior defeito possível numa tela de expedição. Com lista negra, o
 * estado desconhecido aparece; no máximo aparece algo demais, e isso alguém vê e
 * corrige. É a mesma escolha do CyberDock.
 *
 * `shipping_status` NULL ou vazio PERMANECE na fila: é a venda recém-paga cujo
 * envio o ML ainda não criou.
 */
const ML_ENVIO_ENCERRADO = [
  "shipped",
  "delivered",
  "not_delivered",
  "cancelled",
  "canceled",
  "closed",
  "returned",
  "stale",
];

/** Vendas que nem deveriam existir como trabalho. */
const ML_STATUS_MORTO = ["cancelled", "canceled", "cancelado", "invalid"];

/**
 * Estados da Shopee que representam "tenho de despachar".
 *
 * Aqui a LISTA BRANCA é a certa, ao contrário do ML: o `order_status` da Shopee é
 * um enum fechado e pequeno (UNPAID, READY_TO_SHIP, PROCESSED, RETRY_SHIP,
 * SHIPPED, TO_CONFIRM_RECEIVE, IN_CANCEL, CANCELLED, TO_RETURN, COMPLETED,
 * INVOICE_PENDING), e só três deles são trabalho de expedição. Uma lista negra
 * teria de nomear oito estados para excluir três, e deixaria UNPAID e
 * INVOICE_PENDING entrarem na fila — pedido que ainda não pode ser despachado.
 */
const SP_STATUS_FILA = ["READY_TO_SHIP", "PROCESSED", "RETRY_SHIP"];

/**
 * FULL nunca entra na fila.
 *
 * Em fulfillment o estoque já está no centro de distribuição do ML e quem
 * despacha é o próprio ML — não há nada a fazer no galpão. Uma venda FULL na
 * lista de expedição é uma linha que ninguém consegue "resolver", e ela contamina
 * todos os contadores.
 *
 * A checagem cobre `logistic_type` E `envio_mode` porque os dois campos vêm de
 * lugares diferentes no sync (`logistic_type` do `/shipments/{id}`,
 * `envio_mode` do `shipping.mode` do pedido) e qualquer um deles pode ser o único
 * preenchido. Olhar só um deixa passar venda FULL.
 */
const MODALIDADE_FULL = ["fulfillment", "full"];

/* -------------------------------------------------------------------------- */
/*                              Expressões SQL                                */
/* -------------------------------------------------------------------------- */

/**
 * Modalidade de envio normalizada.
 *
 * O sync grava o valor CRU do ML (`self_service`, `xd_drop_off`,
 * `cross_docking`), e não o nome traduzido — a função `convertLogisticTypeName`
 * existe no projeto mas não está no caminho da gravação. Então a tradução é
 * feita aqui, na leitura, e o `WHEN ... <> '' THEN UPPER(...)` no fim garante que
 * um valor novo do ML apareça como está em vez de virar "OUTROS" e se misturar
 * com o que é de fato desconhecido.
 */
const MODALIDADE_ML = Prisma.raw(`
  CASE
    WHEN LOWER(COALESCE(v.logistic_type, '')) IN ('fulfillment', 'full')        THEN 'FULL'
    WHEN LOWER(COALESCE(v.logistic_type, '')) IN ('self_service', 'flex')       THEN 'FLEX'
    WHEN LOWER(COALESCE(v.logistic_type, '')) IN ('xd_drop_off', 'drop_off')    THEN 'AGENCIA'
    WHEN LOWER(COALESCE(v.logistic_type, '')) IN ('cross_docking', 'coleta')    THEN 'COLETA'
    WHEN COALESCE(v.logistic_type, '') <> ''                                    THEN UPPER(v.logistic_type)
    ELSE 'OUTROS'
  END
`);

/**
 * Na Shopee a "modalidade" útil é a TRANSPORTADORA.
 *
 * A Shopee não tem modalidade logística no sentido do ML, e `logistic_type` fica
 * NULL nas vendas dela — filtrar por esse campo devolveria "OUTROS" para tudo e o
 * filtro seria decorativo. A transportadora é o que muda o corte do dia e a pilha
 * onde o pacote vai, então é ela que serve para separar trabalho.
 *
 * Ela está gravada em `shipping_status` porque o sync da Shopee põe
 * `shippingCarrier` nessa coluna (ver `route.ts` do sync). Isso é confuso o
 * bastante para merecer o comentário: a coluna se chama "status" e guarda uma
 * transportadora.
 */
const MODALIDADE_SP = Prisma.raw(`
  COALESCE(NULLIF(UPPER(TRIM(v.shipping_status)), ''), 'SHOPEE')
`);

/**
 * Junção com o cadastro de SKU, para trazer a hierarquia.
 *
 * `LEFT JOIN` e não `JOIN`: venda de SKU que ainda não foi cadastrado tem de
 * continuar aparecendo na fila. Ela existe, o pacote precisa sair, e sumir da
 * tela por falta de cadastro seria esconder trabalho — o mesmo defeito que a
 * lista branca de status.
 *
 * O `user_id` no ON, e não só no WHERE de fora: a unicidade do cadastro é
 * `@@unique([userId, sku])`, ou seja o MESMO código de SKU existe em usuários
 * diferentes. Sem essa condição a junção casaria o SKU de um inquilino com a
 * venda de outro e multiplicaria as linhas do pacote.
 */
const JUNCAO_SKU = Prisma.raw(`
  LEFT JOIN sku k
    ON k.user_id = v.user_id
   AND UPPER(TRIM(k.sku)) = UPPER(TRIM(v.sku))
`);

const HIERARQUIA_1 = Prisma.raw(`NULLIF(TRIM(k.hierarquia_1), '')`);
const HIERARQUIA_2 = Prisma.raw(`NULLIF(TRIM(k.hierarquia_2), '')`);

/**
 * Chave do pacote.
 *
 * No ML, várias vendas do mesmo comprador saem numa etiqueta só e compartilham
 * `shipping_id` — é por ele que se agrupa. Sem envio (ou sem o id ainda), cada
 * venda é o seu próprio pacote, e o prefixo `order:` impede que um `order_id`
 * colida com um `shipping_id` de mesmo valor numérico.
 *
 * O prefixo do canal impede o outro lado da colisão: ML e Shopee numeram de forma
 * independente, e sem ele um pacote do ML poderia se fundir com um da Shopee.
 */
function chavePacote(canal: Canal): Prisma.Sql {
  return Prisma.raw(
    `'${canal}:' || COALESCE(NULLIF(v.shipping_id, ''), 'order:' || v.order_id)`,
  );
}

/* -------------------------------------------------------------------------- */
/*                          Fragmentos de filtro                              */
/* -------------------------------------------------------------------------- */

/**
 * Janela obrigatória sobre a data da venda.
 *
 * Existe como proteção, não como recurso: sem ela a consulta varre `meli_venda`
 * inteira e estoura o tempo limite do banco em base grande — foi o que obrigou o
 * CyberDock a criar o `ADMIN_SALES_WINDOW_DAYS`.
 *
 * O corte é aceitável porque pacote pendente de despacho é recente por natureza.
 * Ainda assim é ajustável na tela (até um ano), para o caso raro de um pedido
 * antigo preso, e a tela diz qual janela está em uso — um filtro invisível que
 * esconde trabalho seria o mesmo defeito que a lista branca de status.
 *
 * `AT TIME ZONE 'UTC'` porque `data_venda` é `timestamp` sem fuso guardado em
 * UTC, e `NOW()` é `timestamptz`. Comparar os dois direto faz o Postgres
 * converter usando o fuso da SESSÃO, que num servidor em UTC funciona e num
 * servidor em São Paulo desloca a janela em 3 horas. Trazer o `NOW()` para UTC
 * deixa a comparação entre iguais e o resultado igual em qualquer servidor.
 */
function fragmentoJanela(janelaDias: number): Prisma.Sql {
  // Interpolado como TEXTO e não como parâmetro: `INTERVAL '$1 days'` não existe
  // em SQL (o literal de intervalo é analisado antes de os parâmetros serem
  // ligados). Seguro porque `dias` passa por `Math.trunc` e por um `clamp` de 1 a
  // 365 logo acima — o que chega ao SQL é sempre um inteiro dessa faixa, nunca
  // texto da query string.
  const dias = Math.max(1, Math.min(Math.trunc(janelaDias) || 60, 365));
  return Prisma.raw(
    `AND v.data_venda >= ((NOW() - INTERVAL '${dias} days') AT TIME ZONE 'UTC')`,
  );
}

/**
 * Busca livre.
 *
 * `%` e `_` digitados pela pessoa são escapados: sem isso, buscar `100%` viraria
 * um curinga e devolveria a tabela toda, o que parece defeito de filtro. A barra
 * invertida é o escape padrão do `LIKE` no Postgres, então não precisa de cláusula
 * `ESCAPE`.
 */
function fragmentoBusca(busca: string): Prisma.Sql {
  const limpo = busca.trim();
  if (limpo === "") return Prisma.empty;

  const alvo = `%${limpo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return Prisma.sql`AND (
    v.order_id ILIKE ${alvo}
    OR v.titulo ILIKE ${alvo}
    OR COALESCE(v.sku, '') ILIKE ${alvo}
    OR v.comprador ILIKE ${alvo}
    OR COALESCE(v.shipping_id, '') ILIKE ${alvo}
  )`;
}

function fragmentoContas(coluna: string, contas: string[]): Prisma.Sql {
  if (contas.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.raw(`v.${coluna}`)} IN (${Prisma.join(contas)})`;
}

/** Lista de textos para comparação em minúsculas/maiúsculas. */
function lista(valores: string[]): Prisma.Sql {
  return Prisma.join(valores.map((v) => Prisma.sql`${v}`));
}

/* -------------------------------------------------------------------------- */
/*                            Base: uma linha por venda                      */
/* -------------------------------------------------------------------------- */

type OpcoesBase = {
  /** Quando falso, ignora canal/conta/busca — usado para montar as facetas. */
  aplicarFiltros: boolean;
};

/**
 * Ramo do Mercado Livre.
 *
 * As colunas e a ordem TÊM de ser idênticas às do ramo da Shopee: é um
 * `UNION ALL`, e o Postgres casa as colunas por POSIÇÃO, não por nome. Trocar
 * duas de lugar em um só dos ramos não gera erro se os tipos forem compatíveis —
 * gera SKU no lugar de título na tela.
 */
function baseMeli(
  userId: string,
  filtros: FiltrosExpedicao,
  opcoes: OpcoesBase,
): Prisma.Sql {
  const contas = opcoes.aplicarFiltros
    ? fragmentoContas("meli_account_id", filtros.contas)
    : Prisma.empty;
  const busca = opcoes.aplicarFiltros ? fragmentoBusca(filtros.busca) : Prisma.empty;

  return Prisma.sql`
    SELECT
      ${chavePacote("ML")}                       AS chave,
      'ML'                                       AS canal,
      v.meli_account_id                          AS account_id,
      v.conta                                    AS conta,
      v.comprador                                AS comprador,
      NULLIF(v.shipping_id, '')                  AS shipping_id,
      ${MODALIDADE_ML}                           AS modalidade,
      NULLIF(TRIM(v.shipping_status), '')        AS shipping_status,
      v.status                                   AS status,
      v.data_venda                               AS data_venda,
      v.prazo_despacho                           AS prazo_despacho,
      v.order_id                                 AS order_id,
      v.titulo                                   AS titulo,
      v.sku                                      AS sku,
      v.quantidade                               AS quantidade,
      v.valor_total                              AS valor_total,
      -- item_id e variation_id NAO aparecem na tela: servem para achar a FOTO da
      -- variacao no Mercado Livre e montar o link do anuncio. Sem a variacao, um
      -- anuncio de camiseta com seis cores mostraria a mesma capa nas seis
      -- linhas, e a foto deixaria de ajudar exatamente na conferencia.
      v.item_id                                  AS item_id,
      v.variation_id                             AS variation_id,
      ${HIERARQUIA_1}                            AS hierarquia1,
      ${HIERARQUIA_2}                            AS hierarquia2
    FROM meli_venda v
    ${JUNCAO_SKU}
    WHERE v.user_id = ${userId}
      ${fragmentoJanela(filtros.janelaDias)}
      AND LOWER(COALESCE(v.logistic_type, '')) NOT IN (${lista(MODALIDADE_FULL)})
      AND LOWER(COALESCE(v.envio_mode, ''))    NOT IN (${lista(MODALIDADE_FULL)})
      AND REPLACE(LOWER(COALESCE(v.status, '')), ' ', '_') NOT IN (${lista(ML_STATUS_MORTO)})
      AND REPLACE(LOWER(COALESCE(v.shipping_status, '')), ' ', '_') NOT IN (${lista(ML_ENVIO_ENCERRADO)})
      ${contas}
      ${busca}
  `;
}

/** Ramo da Shopee. Mesmas colunas, mesma ordem — ver `baseMeli`. */
function baseShopee(
  userId: string,
  filtros: FiltrosExpedicao,
  opcoes: OpcoesBase,
): Prisma.Sql {
  const contas = opcoes.aplicarFiltros
    ? fragmentoContas("shopee_account_id", filtros.contas)
    : Prisma.empty;
  const busca = opcoes.aplicarFiltros ? fragmentoBusca(filtros.busca) : Prisma.empty;

  return Prisma.sql`
    SELECT
      ${chavePacote("SP")}                       AS chave,
      'SP'                                       AS canal,
      v.shopee_account_id                        AS account_id,
      v.conta                                    AS conta,
      v.comprador                                AS comprador,
      NULLIF(v.shipping_id, '')                  AS shipping_id,
      ${MODALIDADE_SP}                           AS modalidade,
      NULLIF(TRIM(v.shipping_status), '')        AS shipping_status,
      v.status                                   AS status,
      v.data_venda                               AS data_venda,
      v.prazo_despacho                           AS prazo_despacho,
      v.order_id                                 AS order_id,
      v.titulo                                   AS titulo,
      v.sku                                      AS sku,
      v.quantidade                               AS quantidade,
      v.valor_total                              AS valor_total,
      -- A Shopee nao tem anuncio nem variacao no nosso modelo, mas as colunas
      -- precisam existir: e um UNION ALL, e o Postgres casa por POSICAO. Sem os
      -- NULL aqui, a hierarquia da Shopee cairia na coluna do item_id.
      NULL::text                                 AS item_id,
      NULL::text                                 AS variation_id,
      ${HIERARQUIA_1}                            AS hierarquia1,
      ${HIERARQUIA_2}                            AS hierarquia2
    FROM shopee_venda v
    ${JUNCAO_SKU}
    WHERE v.user_id = ${userId}
      ${fragmentoJanela(filtros.janelaDias)}
      AND UPPER(COALESCE(v.status, '')) IN (${lista(SP_STATUS_FILA)})
      ${contas}
      ${busca}
  `;
}

/**
 * CTE completa: vendas -> pacotes -> urgência.
 *
 * O filtro de CANAL é aplicado montando o `UNION ALL` só com os ramos escolhidos,
 * em vez de somar um `WHERE canal = ...` depois. A diferença é de custo: assim a
 * tabela não escolhida nem é lida.
 */
function montarCte(
  userId: string,
  filtros: FiltrosExpedicao,
  opcoes: OpcoesBase,
): Prisma.Sql {
  const canais: Canal[] =
    opcoes.aplicarFiltros && filtros.canais.length > 0 ? filtros.canais : CANAIS;

  const ramos: Prisma.Sql[] = [];
  if (canais.includes("ML")) ramos.push(baseMeli(userId, filtros, opcoes));
  if (canais.includes("SP")) ramos.push(baseShopee(userId, filtros, opcoes));

  const base = Prisma.join(ramos, " UNION ALL ");

  return Prisma.sql`
    WITH base AS (${base}),
    pacotes AS (
      SELECT
        b.chave,
        b.canal,
        MIN(b.account_id)      AS account_id,
        MIN(b.conta)           AS conta,
        MIN(b.comprador)       AS comprador,
        MIN(b.shipping_id)     AS shipping_id,
        MIN(b.modalidade)      AS modalidade,
        MIN(b.shipping_status) AS shipping_status,
        MIN(b.status)          AS status,
        -- O prazo do pacote é o MENOR entre as vendas que ele junta: quem manda é
        -- o primeiro corte a vencer. Usar o maior faria um pacote com uma venda
        -- atrasada dentro parecer folgado.
        MIN(b.prazo_despacho)  AS prazo_despacho,
        MIN(b.data_venda)      AS data_venda,
        COUNT(*)               AS pedidos,
        SUM(b.quantidade)      AS unidades,
        SUM(b.valor_total)     AS valor_total,
        -- Hierarquia do pacote = a do PRIMEIRO item, para o filtro e o resumo.
        -- Pacote com itens de categorias diferentes existe, e nesse caso a
        -- etiqueta pertence a mais de uma prateleira; a decisão aqui é mostrar
        -- uma e deixar as demais visíveis linha a linha, dentro do pacote.
        MIN(b.hierarquia1)     AS hierarquia1,
        MIN(b.hierarquia2)     AS hierarquia2,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'orderId',     b.order_id,
            'titulo',      b.titulo,
            'sku',         b.sku,
            'quantidade',  b.quantidade,
            'valorTotal',  b.valor_total,
            'itemId',      b.item_id,
            'variationId', b.variation_id,
            'hierarquia1', b.hierarquia1,
            'hierarquia2', b.hierarquia2
          )
          ORDER BY b.titulo, b.order_id
        ) AS itens
      FROM base b
      GROUP BY b.chave, b.canal
    ),
    classificados AS (
      SELECT
        p.*,
        -- Diferenca entre DATAS CIVIS em Sao Paulo. prazo_despacho e timestamptz,
        -- entao AT TIME ZONE devolve o horario local de SP e ::date o dia local.
        -- Fosse timestamp sem fuso, a mesma expressao trataria o valor como se ja
        -- fosse local e deslocaria tudo em 3h, jogando todo prazo entre 21h e
        -- meia-noite para o dia seguinte.
        CASE
          WHEN p.prazo_despacho IS NULL THEN NULL
          ELSE (
            (p.prazo_despacho AT TIME ZONE 'America/Sao_Paulo')::date
            - (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
          )
        END AS dias_restantes,
        -- Sem prazo, ordena pela data da venda. E reserva, nao equivalente: a
        -- ordem fica errada de proposito assumido, e e por isso que o backfill de
        -- prazo importa. O AT TIME ZONE 'UTC' iguala os tipos -- COALESCE de
        -- timestamptz com timestamp converteria pelo fuso da sessao.
        COALESCE(p.prazo_despacho, p.data_venda AT TIME ZONE 'UTC') AS ordem_prazo
      FROM pacotes p
    ),
    fila AS (
      SELECT
        c.*,
        CASE
          WHEN c.dias_restantes IS NULL THEN 'semPrazo'
          WHEN c.dias_restantes <  0    THEN 'atrasado'
          WHEN c.dias_restantes =  0    THEN 'hoje'
          WHEN c.dias_restantes =  1    THEN 'amanha'
          WHEN c.dias_restantes <= 3    THEN 'proximo'
          ELSE 'futuro'
        END AS urgencia
      FROM classificados c
    )
  `;
}

/* -------------------------------------------------------------------------- */
/*                              Ordenação                                     */
/* -------------------------------------------------------------------------- */

/**
 * Colunas de ordenação, por nome fixo.
 *
 * Mapa fechado porque isto entra na consulta como texto (`Prisma.raw`), e não
 * como parâmetro — `ORDER BY $1` não existe em SQL. Aceitar o valor da query
 * string direto aqui seria injeção. A rota já valida com `ehOrdem`; este mapa é a
 * segunda tranca, no lugar onde o dano aconteceria.
 */
const COLUNA_ORDEM: Record<OrdemExpedicao, string> = {
  prazo: "ordem_prazo",
  venda: "data_venda",
  valor: "valor_total",
  unidades: "unidades",
};

function fragmentoOrdem(ordem: OrdemExpedicao, direcao: "asc" | "desc"): Prisma.Sql {
  const coluna = COLUNA_ORDEM[ordem] ?? COLUNA_ORDEM.prazo;
  const sentido = direcao === "desc" ? "DESC" : "ASC";

  /**
   * Quem não tem prazo vai para o FIM, nas duas direções.
   *
   * Sem esta cláusula, o pacote sem prazo entra na ordem pela data da venda (a
   * reserva de `ordem_prazo`) e, sendo venda antiga, sobe para o topo — ficando
   * ACIMA do que vence hoje. Foi o que a validação mostrou: quatro pacotes sem
   * prazo abriam a lista e empurravam os urgentes para baixo, ou seja, a tela
   * cujo propósito é ordenar por urgência começava pelo que não tem urgência
   * conhecida.
   *
   * `ASC` fixo mesmo quando a direção é `desc`: "sem prazo" não é um extremo da
   * escala (nem o mais urgente nem o menos), é uma categoria à parte. Inverter
   * junto faria a lista decrescente abrir por ela, repetindo o defeito do outro
   * lado.
   *
   * Só se aplica à ordenação por prazo. Ordenar por valor ou por unidades é uma
   * pergunta diferente ("quais são os maiores"), e ali um pacote sem prazo tem
   * tanto direito ao topo quanto qualquer outro.
   */
  const semPrazoDepois = ordem === "prazo" ? "(prazo_despacho IS NULL) ASC, " : "";

  // `chave` como desempate: sem critério único a paginação não é estável, e duas
  // páginas podem repetir ou perder um pacote quando vários empatam no prazo.
  return Prisma.raw(`ORDER BY ${semPrazoDepois}${coluna} ${sentido} NULLS LAST, chave ASC`);
}

/* -------------------------------------------------------------------------- */
/*                             Conversão de tipos                             */
/* -------------------------------------------------------------------------- */

/** `COUNT`/`SUM` voltam como BigInt ou Decimal; a tela quer `number`. */
function numero(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === "bigint") return Number(valor);
  const n = Number(valor.toString());
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor);
}

function iso(valor: unknown): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function itens(valor: unknown): ItemPacote[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((cru) => {
    const i = (cru ?? {}) as Record<string, unknown>;
    return {
      orderId: texto(i.orderId),
      titulo: texto(i.titulo) || "Produto sem título",
      sku: i.sku ? texto(i.sku) : null,
      quantidade: numero(i.quantidade),
      valorTotal: numero(i.valorTotal),
      itemId: i.itemId ? texto(i.itemId) : null,
      variationId: i.variationId ? texto(i.variationId) : null,
      // Preenchidos depois, na rota, com a consulta ao Mercado Livre. A camada de
      // SQL não fala com API externa de propósito: assim ela permanece testável e
      // uma falha do ML não derruba a fila.
      thumbnailUrl: null,
      permalink: null,
      hierarquia1: i.hierarquia1 ? texto(i.hierarquia1) : null,
      hierarquia2: i.hierarquia2 ? texto(i.hierarquia2) : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Consulta                                  */
/* -------------------------------------------------------------------------- */

type LinhaPacote = Record<string, unknown>;

export async function buscarExpedicao(
  userId: string,
  filtros: FiltrosExpedicao,
): Promise<ResultadoExpedicao> {
  const porPagina = Math.max(1, Math.min(Math.trunc(filtros.porPagina) || 50, 500));
  const pagina = Math.max(1, Math.trunc(filtros.pagina) || 1);

  const cte = montarCte(userId, filtros, { aplicarFiltros: true });

  // O filtro de urgência fica FORA da CTE: as fichas do topo precisam continuar
  // mostrando quantos existem em cada faixa mesmo com uma faixa selecionada,
  // senão selecionar "atrasado" zeraria as outras cinco e a pessoa perderia a
  // visão do todo — que é a informação pela qual ela abriu a tela.
  const filtroUrgencia =
    filtros.urgencias.length > 0
      ? Prisma.sql`AND urgencia IN (${lista(filtros.urgencias)})`
      : Prisma.empty;

  const filtroModalidade =
    filtros.modalidades.length > 0
      ? Prisma.sql`AND modalidade IN (${lista(filtros.modalidades)})`
      : Prisma.empty;

  const ordem = fragmentoOrdem(filtros.ordem, filtros.direcao);
  const deslocamento = (pagina - 1) * porPagina;

  const [linhas, resumo] = await Promise.all([
    prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
      ${cte}
      SELECT * FROM fila
      WHERE TRUE ${filtroUrgencia} ${filtroModalidade}
      ${ordem}
      LIMIT ${porPagina} OFFSET ${deslocamento}
    `),
    // Uma consulta só devolve as fichas E os totais. Agrupar por urgência e somar
    // no Node evita uma terceira ida ao banco para calcular o total da paginação.
    prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
      ${cte}
      SELECT
        urgencia,
        COUNT(*)           AS pacotes,
        SUM(unidades)      AS unidades,
        SUM(valor_total)   AS valor_total
      FROM fila
      WHERE TRUE ${filtroModalidade}
      GROUP BY urgencia
    `),
  ]);

  const porUrgencia = Object.fromEntries(
    URGENCIAS.map((u) => [u, 0]),
  ) as Record<Urgencia, number>;

  let total = 0;
  let unidades = 0;
  let valorTotal = 0;
  const selecionadas =
    filtros.urgencias.length > 0 ? new Set<string>(filtros.urgencias) : null;

  for (const linha of resumo) {
    const faixa = texto(linha.urgencia) as Urgencia;
    const pacotes = numero(linha.pacotes);
    if (faixa in porUrgencia) porUrgencia[faixa] = pacotes;

    if (selecionadas === null || selecionadas.has(faixa)) {
      total += pacotes;
      unidades += numero(linha.unidades);
      valorTotal += numero(linha.valor_total);
    }
  }

  const pacotes: PacoteExpedicao[] = linhas.map((linha) => {
    const dias =
      linha.dias_restantes === null || linha.dias_restantes === undefined
        ? null
        : numero(linha.dias_restantes);

    return {
      chave: texto(linha.chave),
      canal: (texto(linha.canal) === "SP" ? "SP" : "ML") as Canal,
      accountId: texto(linha.account_id),
      conta: texto(linha.conta),
      comprador: texto(linha.comprador) || "Comprador",
      shippingId: linha.shipping_id ? texto(linha.shipping_id) : null,
      modalidade: texto(linha.modalidade) || "OUTROS",
      shippingStatus: linha.shipping_status ? texto(linha.shipping_status) : null,
      status: texto(linha.status),
      dataVenda: iso(linha.data_venda) ?? new Date().toISOString(),
      prazoDespacho: iso(linha.prazo_despacho),
      diasRestantes: dias,
      // Reclassifica em TS a partir do mesmo `dias` que o SQL calculou. Não é
      // redundância: garante que a faixa que pinta a etiqueta e a que o SQL usou
      // para contar saiam da mesma regra, em vez de duas cópias que podem
      // divergir na próxima alteração.
      urgencia: classificarUrgencia(dias),
      pedidos: numero(linha.pedidos),
      unidades: numero(linha.unidades),
      valorTotal: numero(linha.valor_total),
      hierarquia1: linha.hierarquia1 ? texto(linha.hierarquia1) : null,
      hierarquia2: linha.hierarquia2 ? texto(linha.hierarquia2) : null,
      itens: itens(linha.itens),
    };
  });

  const facetas = await buscarFacetas(userId, filtros);

  return {
    pacotes,
    total,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    porUrgencia,
    unidades,
    valorTotal,
    ...facetas,
  };
}

/**
 * Contas e modalidades disponíveis, mais quantas vendas faltam no backfill.
 *
 * Calculadas SEM os filtros de canal, conta, modalidade e busca — só com as
 * regras da fila e a janela. Se respeitassem os filtros, selecionar uma conta
 * apagaria as outras da lista e não haveria como voltar atrás sem limpar tudo.
 */
async function buscarFacetas(
  userId: string,
  filtros: FiltrosExpedicao,
): Promise<Pick<ResultadoExpedicao, "contas" | "modalidades" | "prazoPendente">> {
  const cte = montarCte(userId, filtros, { aplicarFiltros: false });

  const [linhas, pendentes] = await Promise.all([
    prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
      ${cte}
      SELECT canal, account_id, MIN(conta) AS conta, modalidade, COUNT(*) AS pacotes
      FROM fila
      GROUP BY canal, account_id, modalidade
    `),
    contarPrazoPendenteRapido(userId),
  ]);

  const contas = new Map<string, ContaExpedicao>();
  const modalidades = new Set<string>();

  for (const linha of linhas) {
    const canal = (texto(linha.canal) === "SP" ? "SP" : "ML") as Canal;
    const accountId = texto(linha.account_id);
    const pacotes = numero(linha.pacotes);

    const atual = contas.get(accountId);
    if (atual) {
      atual.pacotes += pacotes;
    } else {
      contas.set(accountId, {
        accountId,
        conta: texto(linha.conta) || accountId,
        canal,
        pacotes,
      });
    }

    const modalidade = texto(linha.modalidade);
    if (modalidade) modalidades.add(modalidade);
  }

  return {
    contas: [...contas.values()].sort((a, b) => a.conta.localeCompare(b.conta, "pt-BR")),
    modalidades: [...modalidades].sort((a, b) => a.localeCompare(b, "pt-BR")),
    prazoPendente: pendentes,
  };
}

/**
 * Quantas vendas ainda não passaram pelo backfill de prazo.
 *
 * A tela mostra esse número porque ele explica a única incoerência possível aqui:
 * pacote sem prazo enquanto o backfill não terminou. Sem esse aviso, a pessoa
 * conclui que o sistema perdeu o prazo do pedido.
 *
 * `COUNT` das duas tabelas com o índice parcial de `prazo_despacho_origem IS NULL`
 * criado na migration — o índice encolhe conforme o backfill avança e o custo
 * disto vai a zero junto.
 */
async function contarPrazoPendenteRapido(userId: string): Promise<number> {
  const [ml, sp] = await Promise.all([
    prisma.meliVenda.count({ where: { userId, prazoDespachoOrigem: null } }),
    prisma.shopeeVenda.count({ where: { userId, prazoDespachoOrigem: null } }),
  ]);
  return ml + sp;
}
