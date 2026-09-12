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
  type LinhaResumo,
  type OrdemExpedicao,
  type PacoteExpedicao,
  type ResultadoExpedicao,
  type StatusVenda,
  type TemPrazo,
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
 * Estados de cancelamento da Shopee.
 *
 * `TO_RETURN` entra junto porque, para o galpão, é o mesmo problema dos outros
 * dois: um pacote que talvez já esteja separado e NÃO deve sair. Não é
 * cancelamento no sentido contábil, e é por isso que a lista tem nome próprio em
 * vez de ser chamada de "cancelados".
 */
const SP_STATUS_CANCELADO = ["CANCELLED", "IN_CANCEL", "TO_RETURN"];

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

/* -------------------------------------------------------------------------- */
/*                  UMA LINHA POR PRODUTO VENDIDO                             */
/* -------------------------------------------------------------------------- */

/**
 * ────────────────────────────────────────────────────────────────────────────
 * O DEFEITO QUE ESTAS LATERAIS CONSERTAM
 *
 * `meli_venda` e `shopee_venda` têm `order_id` ÚNICO: uma linha por PEDIDO. E o
 * sync grava, nessa linha, o título e o SKU do PRIMEIRO item do pedido, com a
 * `quantidade` sendo a SOMA de todos os itens:
 *
 *     const firstItem = orderItems[0];                      // ← só o primeiro
 *     titulo: firstItemTitle                                 // ← do primeiro
 *     sku:    itemData?.seller_sku                            // ← do primeiro
 *     quantidade: orderItems.reduce((s, i) => s + i.quantity) // ← soma de todos
 *
 * Consequência na tela de separação: um pedido de 1 Step Preto + 1 Azul + 1 Cinza
 * aparecia como UMA linha, "3 un. — Step Preto". Quem separa pegava 3 Pretos e
 * fechava a caixa. Os outros dois produtos não existiam em lugar nenhum da tela.
 * A assinatura disso era visível nos cartões: 46 pacotes, 46 "itens" e 92
 * unidades — 46 unidades sem título e sem SKU.
 *
 * O CONSERTO NÃO PRECISA DE MIGRAÇÃO: o payload cru do pedido inteiro já está em
 * `raw_data`, com todos os itens. Estas laterais expandem esse array, e a fila
 * passa a ter uma linha por PRODUTO VENDIDO — que é o que a tela sempre
 * prometeu. É o mesmo formato do `unified_sales` do CyberDock, obtido sem
 * duplicar a tabela de vendas.
 *
 * `LEFT JOIN LATERAL` e não `CROSS JOIN`: quando o array não existe (linha antiga,
 * JSON truncado, pedido sem `order_items`), a função geradora devolve zero linhas
 * e o `LEFT JOIN` mantém a venda com as colunas em NULL — e os `COALESCE` abaixo
 * caem no valor da tabela. Com `CROSS JOIN` essas vendas DESAPARECERIAM da fila,
 * trocando um defeito de contagem por trabalho invisível, que é pior.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Itens do pedido do Mercado Livre, de `raw_data->'order'->'order_items'`. */
const ITENS_ML = Prisma.raw(`
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(TRIM(oi->'item'->>'title'), '')                      AS titulo,
      COALESCE(
        NULLIF(TRIM(oi->'item'->>'seller_sku'), ''),
        NULLIF(TRIM(oi->'item'->>'seller_custom_field'), '')
      )                                                            AS sku,
      (oi->>'quantity')::int                                       AS quantidade,
      NULLIF(TRIM(oi->'item'->>'id'), '')                          AS item_id,
      NULLIF(TRIM(oi->'item'->>'variation_id'), '')                AS variation_id,
      ROUND(
        (oi->>'quantity')::numeric * COALESCE((oi->>'unit_price')::numeric, 0), 2
      )                                                            AS valor_total,
      pos
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v.raw_data -> 'order' -> 'order_items') = 'array'
        THEN v.raw_data -> 'order' -> 'order_items'
      END
    ) WITH ORDINALITY AS t(oi, pos)
    -- Item sem quantidade numérica é lixo de payload e não vira linha: sem este
    -- teste, o cast estoura e a consulta INTEIRA aborta por causa de um pedido.
    WHERE (oi ->> 'quantity') ~ '^[0-9]+$'
      AND (oi ->> 'quantity')::int > 0
  ) it ON TRUE
`);

/**
 * Itens do pedido da Shopee, de `raw_data->'item_list'`.
 *
 * `raw_data` da Shopee é o pedido cru (`rawData: order`), então o array está na
 * raiz — diferente do ML, onde o sync embrulha em `{ order, shipment, freight }`.
 *
 * A quantidade vem de `model_quantity_purchased` com `quantity_purchased` de
 * reserva: a Shopee usa o primeiro em anúncio com variação (modelo) e o segundo
 * em anúncio simples, e olhar só um deixa metade dos itens com quantidade nula.
 */
const ITENS_SP = Prisma.raw(`
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(TRIM(oi->>'item_name'), '')                           AS titulo,
      COALESCE(
        NULLIF(TRIM(oi->>'item_sku'), ''),
        NULLIF(TRIM(oi->>'model_sku'), ''),
        NULLIF(TRIM(oi->>'variation_sku'), '')
      )                                                            AS sku,
      COALESCE(
        NULLIF(oi->>'model_quantity_purchased', '')::int,
        NULLIF(oi->>'quantity_purchased', '')::int
      )                                                            AS quantidade,
      NULL::text                                                   AS item_id,
      NULL::text                                                   AS variation_id,
      NULL::numeric                                                AS valor_total,
      pos
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v.raw_data -> 'item_list') = 'array'
        THEN v.raw_data -> 'item_list'
      END
    ) WITH ORDINALITY AS t(oi, pos)
    WHERE COALESCE(
            NULLIF(oi->>'model_quantity_purchased', ''),
            NULLIF(oi->>'quantity_purchased', '')
          ) ~ '^[0-9]+$'
      AND COALESCE(
            NULLIF(oi->>'model_quantity_purchased', '')::int,
            NULLIF(oi->>'quantity_purchased', '')::int
          ) > 0
  ) it ON TRUE
`);

/**
 * As colunas do ITEM, com a coluna da venda como reserva.
 *
 * Uma constante por campo, usada tanto no `SELECT` quanto nos filtros (busca,
 * SKU) e na junção com o cadastro. Repetir a expressão em cada lugar é como o
 * filtro de SKU passaria a olhar um campo e a coluna exibida outro.
 */
const TITULO_ITEM = Prisma.raw(`COALESCE(it.titulo, v.titulo)`);
const SKU_ITEM_TXT = `COALESCE(it.sku, v.sku, '')`;
const SKU_ITEM = Prisma.raw(`NULLIF(${SKU_ITEM_TXT}, '')`);
const QTD_ITEM = Prisma.raw(`COALESCE(it.quantidade, v.quantidade)`);

/**
 * O valor do PEDIDO, atribuído a UMA linha só.
 *
 * Com uma linha por produto, somar `v.valor_total` em cada linha multiplicaria o
 * valor do pedido pela quantidade de itens — um pedido de R$ 100 com três
 * produtos apareceria como R$ 300 na fila.
 *
 * A saída não é ratear: é atribuir o valor inteiro ao PRIMEIRO item e zero aos
 * demais. Assim `SUM` sobre as linhas devolve exatamente a soma dos pedidos, sem
 * arredondamento acumulado, e sem depender de a plataforma informar preço
 * unitário líquido por item (a Shopee não informa: o desconto é rateado dentro do
 * `escrow_details`).
 *
 * O preço fica igual ao que a tela de Vendas mostra, porque é a MESMA coluna já
 * auditada. Somar `quantity * unit_price` dos itens daria um número parecido e
 * diferente, e duas telas do mesmo sistema discordando de centavos é pior que uma
 * coluna de valor que não desce ao nível do item.
 *
 * `COALESCE(it.pos, 1)` cobre a venda sem `order_items` no `raw_data`: a lateral
 * não produziu linha, `it.pos` é NULL, e existe exatamente uma linha — que tem de
 * levar o valor.
 */
const VALOR_UMA_VEZ = Prisma.raw(
  `CASE WHEN COALESCE(it.pos, 1) = 1 THEN v.valor_total ELSE 0 END`,
);

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
/**
 * A junção é feita no SKU DO ITEM, não no `v.sku` da venda.
 *
 * `v.sku` é o SKU do PRIMEIRO item do pedido (ver `ITENS_ML`), então juntar por
 * ele trazia a categoria do primeiro produto para todos os itens do pedido — e o
 * resumo por categoria contava o pedido inteiro na prateleira de um produto só.
 */
const JUNCAO_SKU = Prisma.raw(`
  LEFT JOIN sku k
    ON k.user_id = v.user_id
   AND UPPER(TRIM(k.sku)) = UPPER(TRIM(${SKU_ITEM_TXT}))
`);

const HIERARQUIA_1 = Prisma.raw(`NULLIF(TRIM(k.hierarquia_1), '')`);
const HIERARQUIA_2 = Prisma.raw(`NULLIF(TRIM(k.hierarquia_2), '')`);

/**
 * Quantas PEÇAS cada unidade vendida tira da prateleira.
 *
 * `sku.quantidade` é o tamanho do kit: um anúncio cadastrado como "kit de 3"
 * vende 1 unidade e o galpão separa 3 peças. Sem esta multiplicação a Expedição
 * pedia 1 onde precisava de 3, que é erro de separação garantido em quem vende
 * kit. É a mesma conta do NEXUS v2 (`quantity * quantity_sku`).
 *
 * `NULLIF(..., 0)` porque o padrão da coluna é `0` e zero aqui significa "não
 * cadastrado", não "zero peças" — multiplicar por zero zeraria a fila inteira de
 * quem nunca preencheu o campo.
 */
const KIT_SKU = Prisma.raw(`COALESCE(NULLIF(k.quantidade, 0), 1)`);

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
  // Título e SKU do ITEM, com a coluna da venda como reserva: buscar em `v.sku`
  // acharia só o primeiro produto do pedido, e o segundo — que está na tela —
  // ficaria invisível para a busca.
  return Prisma.sql`AND (
    v.order_id ILIKE ${alvo}
    OR ${TITULO_ITEM} ILIKE ${alvo}
    OR ${Prisma.raw(SKU_ITEM_TXT)} ILIKE ${alvo}
    OR v.comprador ILIKE ${alvo}
    OR COALESCE(v.shipping_id, '') ILIKE ${alvo}
  )`;
}

function fragmentoContas(coluna: string, contas: string[]): Prisma.Sql {
  if (contas.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.raw(`v.${coluna}`)} IN (${Prisma.join(contas)})`;
}

/**
 * Recorte pela DATA DA VENDA, dentro da janela.
 *
 * `< data + 1 dia` no limite superior, e não `<= data`: `data_venda` é um
 * INSTANTE, não uma data. Com `<=`, uma venda das 14h do próprio dia escolhido
 * ficaria de fora, porque `2026-09-09 14:00` é maior que `2026-09-09 00:00`. É o
 * erro clássico de faixa de data em coluna de timestamp.
 */
function fragmentoVenda(de: string | null, ate: string | null): Prisma.Sql {
  const partes: Prisma.Sql[] = [];
  if (de) partes.push(Prisma.sql`AND v.data_venda >= ${de}::date`);
  if (ate) partes.push(Prisma.sql`AND v.data_venda < (${ate}::date + INTERVAL '1 day')`);
  return partes.length === 0 ? Prisma.empty : Prisma.join(partes, " ");
}

/**
 * Recorte pelo PRAZO DE DESPACHO, em data civil de São Paulo.
 *
 * `prazo_despacho` é `timestamptz`, então `AT TIME ZONE 'America/Sao_Paulo'`
 * devolve o horário local e `::date` o dia local — a mesma expressão usada para
 * classificar a urgência. Comparar a data civil, e não o instante, é o que faz
 * "vence hoje" significar o dia inteiro, inclusive um prazo às 23h.
 *
 * Vendas SEM prazo saem da lista quando existe qualquer recorte de prazo: elas
 * não têm como satisfazer a condição. Quem quer vê-las usa `temPrazo = "sem"`.
 */
function fragmentoPrazo(de: string | null, ate: string | null): Prisma.Sql {
  const dia = Prisma.raw(`(v.prazo_despacho AT TIME ZONE 'America/Sao_Paulo')::date`);
  const partes: Prisma.Sql[] = [];
  if (de) partes.push(Prisma.sql`AND ${dia} >= ${de}::date`);
  if (ate) partes.push(Prisma.sql`AND ${dia} <= ${ate}::date`);
  return partes.length === 0 ? Prisma.empty : Prisma.join(partes, " ");
}

/**
 * Tem ou não prazo registrado.
 *
 * Independente do recorte de faixa: `sem` só faz sentido quando não há faixa, e a
 * combinação das duas devolve vazio de propósito em vez de escolher uma delas em
 * silêncio — adivinhar a intenção aqui daria uma lista que não corresponde a
 * nenhum dos dois filtros que estão visíveis na tela.
 */
function fragmentoTemPrazo(valor: TemPrazo): Prisma.Sql {
  if (valor === "com") return Prisma.sql`AND v.prazo_despacho IS NOT NULL`;
  if (valor === "sem") return Prisma.sql`AND v.prazo_despacho IS NULL`;
  return Prisma.empty;
}

/**
 * O PORTÃO da fila: quais vendas do Mercado Livre existem, para dado recorte de
 * situação.
 *
 * É aqui, e não num filtro somado depois, porque `statusVenda` não estreita a
 * fila — ele TROCA o conjunto. "Canceladas" pedido como filtro adicional sobre a
 * fila normal devolveria SEMPRE zero, já que a fila normal exclui venda morta e
 * envio encerrado por definição: seriam duas condições que se anulam, e o
 * controle na tela só poderia dar lista vazia.
 *
 * E "Canceladas" é uma pergunta REAL de galpão, não de contabilidade: pedido que
 * caiu depois de alguém já ter separado a caixa não pode sair, e descobrir isso
 * na fila é mais barato que descobrir na transportadora.
 *
 * O `REPLACE` de espaço por underscore existe porque o sync do ML grava o status
 * da venda com o underscore trocado por espaço (`payment_in_process` vira
 * `payment in process`). Sem ele, "pago" funcionaria por acaso (`paid` não tem
 * underscore) e todo status composto escaparia da comparação.
 */
function portaoMeli(status: StatusVenda): Prisma.Sql {
  const venda = Prisma.raw(`REPLACE(LOWER(COALESCE(v.status, '')), ' ', '_')`);
  const envio = Prisma.raw(`REPLACE(LOWER(COALESCE(v.shipping_status, '')), ' ', '_')`);

  // Cancelado inverte o portão: nenhuma das duas exclusões da fila normal se
  // aplica, senão o resultado seria vazio por construção.
  if (status === "cancelado") {
    return Prisma.sql`AND ${venda} IN (${lista(ML_STATUS_MORTO)})`;
  }

  const partes: Prisma.Sql[] = [
    Prisma.sql`AND ${venda} NOT IN (${lista(ML_STATUS_MORTO)})`,
    Prisma.sql`AND ${envio} NOT IN (${lista(ML_ENVIO_ENCERRADO)})`,
  ];

  // `todos` deixa entrar `payment_required`, `payment_in_process` e
  // `invoice_pending` — vendas que não são canceladas nem pagas. É o recorte de
  // quem procura por que um pedido não aparece na fila normal.
  if (status === "pago") partes.push(Prisma.sql`AND ${venda} IN ('paid', 'pago')`);

  return Prisma.join(partes, " ");
}

/**
 * O portão da Shopee.
 *
 * `pago` e `todos` dão o MESMO conjunto, e isso é correto: a fila da Shopee é uma
 * lista branca de três estados de despacho, e todos os três pressupõem pedido
 * pago. Alargar `todos` para o enum inteiro traria `COMPLETED` e `SHIPPED` — o
 * que não é fila de expedição, é histórico de vendas, e essa tela já existe.
 */
function portaoShopee(status: StatusVenda): Prisma.Sql {
  const venda = Prisma.raw(`UPPER(COALESCE(v.status, ''))`);

  if (status === "cancelado") {
    return Prisma.sql`AND ${venda} IN (${lista(SP_STATUS_CANCELADO)})`;
  }
  return Prisma.sql`AND ${venda} IN (${lista(SP_STATUS_FILA)})`;
}

/** Filtro de hierarquia. Aplicado na coluna já vinda da junção com o cadastro. */
function fragmentoHierarquia(coluna: Prisma.Sql, valores: string[]): Prisma.Sql {
  if (valores.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${coluna} IN (${lista(valores)})`;
}

/**
 * Filtro por SKU, aplicado na VENDA e não no pacote.
 *
 * É o que faz "só as vendas deste SKU" significar isso de verdade: como o corte
 * acontece antes do agrupamento, um pacote misto sobra na tela com APENAS o item
 * escolhido, e as unidades somam só o que vai ser separado. Filtrar depois do
 * agrupamento traria o pacote inteiro — inclusive os produtos que não fazem parte
 * do lote — e o total de unidades passaria a mentir.
 *
 * `UPPER(TRIM(...))` nos dois lados porque SKU digitado à mão vem com espaço e
 * caixa trocados, e a mesma normalização já é usada na junção com o cadastro
 * (`JUNCAO_SKU`). Comparar cru aqui faria o filtro achar nada para metade dos
 * códigos.
 */
function fragmentoSkus(valores: string[]): Prisma.Sql {
  if (valores.length === 0) return Prisma.empty;
  const alvos = valores.map((v) => v.trim().toUpperCase()).filter(Boolean);
  if (alvos.length === 0) return Prisma.empty;
  // No SKU DO ITEM. Agora que a fila tem uma linha por produto, escolher um SKU
  // deixa na tela exatamente as linhas daquele código — e um pedido misto sobra
  // com o item escolhido apenas, que é o que a promessa do filtro sempre foi.
  return Prisma.sql`AND UPPER(TRIM(${Prisma.raw(SKU_ITEM_TXT)})) IN (${lista(alvos)})`;
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
  const extras = opcoes.aplicarFiltros
    ? Prisma.join(
        [
          fragmentoContas("meli_account_id", filtros.contas),
          fragmentoBusca(filtros.busca),
          fragmentoVenda(filtros.vendaDe, filtros.vendaAte),
          fragmentoPrazo(filtros.prazoDe, filtros.prazoAte),
          fragmentoTemPrazo(filtros.temPrazo),
          fragmentoHierarquia(HIERARQUIA_1, filtros.hierarquias1),
          fragmentoHierarquia(HIERARQUIA_2, filtros.hierarquias2),
          fragmentoSkus(filtros.skus),
        ],
        " ",
      )
    : Prisma.empty;

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
      -- Titulo, SKU e quantidade DO ITEM, com a coluna da venda como reserva.
      -- Ver o bloco "UMA LINHA POR PRODUTO VENDIDO" no topo do arquivo.
      ${TITULO_ITEM}                             AS titulo,
      ${SKU_ITEM}                                AS sku,
      ${QTD_ITEM}                                AS quantidade,
      ${KIT_SKU}                                 AS kit,
      ${VALOR_UMA_VEZ}                           AS valor_total,
      -- item_id e variation_id NAO aparecem na tela: servem para achar a FOTO da
      -- variacao no Mercado Livre e montar o link do anuncio. Sem a variacao, um
      -- anuncio de camiseta com seis cores mostraria a mesma capa nas seis
      -- linhas, e a foto deixaria de ajudar exatamente na conferencia.
      COALESCE(it.item_id, v.item_id)             AS item_id,
      COALESCE(it.variation_id, v.variation_id)   AS variation_id,
      ${HIERARQUIA_1}                            AS hierarquia1,
      ${HIERARQUIA_2}                            AS hierarquia2
    FROM meli_venda v
    ${ITENS_ML}
    ${JUNCAO_SKU}
    WHERE v.user_id = ${userId}
      ${fragmentoJanela(filtros.janelaDias)}
      -- FULL sai sempre, em qualquer recorte de situacao: quem despacha e o
      -- proprio Mercado Livre, e nao ha nada a fazer no galpao nem quando a venda
      -- e cancelada.
      AND LOWER(COALESCE(v.logistic_type, '')) NOT IN (${lista(MODALIDADE_FULL)})
      AND LOWER(COALESCE(v.envio_mode, ''))    NOT IN (${lista(MODALIDADE_FULL)})
      ${portaoMeli(filtros.statusVenda)}
      ${extras}
  `;
}

/** Ramo da Shopee. Mesmas colunas, mesma ordem — ver `baseMeli`. */
function baseShopee(
  userId: string,
  filtros: FiltrosExpedicao,
  opcoes: OpcoesBase,
): Prisma.Sql {
  const extras = opcoes.aplicarFiltros
    ? Prisma.join(
        [
          fragmentoContas("shopee_account_id", filtros.contas),
          fragmentoBusca(filtros.busca),
          fragmentoVenda(filtros.vendaDe, filtros.vendaAte),
          fragmentoPrazo(filtros.prazoDe, filtros.prazoAte),
          fragmentoTemPrazo(filtros.temPrazo),
          fragmentoHierarquia(HIERARQUIA_1, filtros.hierarquias1),
          fragmentoHierarquia(HIERARQUIA_2, filtros.hierarquias2),
          fragmentoSkus(filtros.skus),
        ],
        " ",
      )
    : Prisma.empty;

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
      ${TITULO_ITEM}                             AS titulo,
      ${SKU_ITEM}                                AS sku,
      ${QTD_ITEM}                                AS quantidade,
      ${KIT_SKU}                                 AS kit,
      ${VALOR_UMA_VEZ}                           AS valor_total,
      -- A Shopee nao tem anuncio nem variacao no nosso modelo, mas as colunas
      -- precisam existir: e um UNION ALL, e o Postgres casa por POSICAO. Sem os
      -- NULL aqui, a hierarquia da Shopee cairia na coluna do item_id.
      NULL::text                                 AS item_id,
      NULL::text                                 AS variation_id,
      ${HIERARQUIA_1}                            AS hierarquia1,
      ${HIERARQUIA_2}                            AS hierarquia2
    FROM shopee_venda v
    ${ITENS_SP}
    ${JUNCAO_SKU}
    WHERE v.user_id = ${userId}
      ${fragmentoJanela(filtros.janelaDias)}
      ${portaoShopee(filtros.statusVenda)}
      ${extras}
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
        -- PEDIDOS conta vendas DISTINTAS, nao linhas. Era COUNT(*), e funcionava
        -- porque havia uma linha por pedido; agora ha uma linha por PRODUTO, e
        -- COUNT(*) passaria a contar itens no lugar de vendas -- fazendo a tela
        -- dizer "3 vendas a despachar" num pedido unico de tres produtos.
        COUNT(DISTINCT b.order_id) AS pedidos,
        -- ITENS e a contagem de linhas de produto: e o numero que o galpao
        -- confere item a item, e o que faltava na tela.
        COUNT(*)               AS itens,
        -- UNIDADES multiplica pelo tamanho do kit do SKU: um "kit de 3" vendido
        -- uma vez tira tres pecas da prateleira. Ver KIT_SKU no topo do arquivo.
        SUM(b.quantidade * b.kit) AS unidades,
        -- Somavel porque VALOR_UMA_VEZ poe o valor do pedido numa linha so e zero
        -- nas outras. Sem isso, um pedido de R$ 100 com tres produtos apareceria
        -- como R$ 300.
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
            -- UNIDADES do item, ja com o kit. E o numero que vai no badge de
            -- Qtd. da tela: quem separa quer saber quantas PECAS pegar, nao
            -- quantas unidades de anuncio foram vendidas.
            'quantidade',  b.quantidade * b.kit,
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
    ),
    -- Volta ao nivel da VENDA, carregando a urgencia e a modalidade do pacote.
    --
    -- Existe por causa do resumo por SKU. Os outros resumos (categoria,
    -- modalidade) agrupam PACOTES, e um pacote tem uma categoria so -- a do
    -- primeiro item. SKU nao: um pacote misto tem varios, e agrupar por SKU no
    -- nivel do pacote contaria o pacote inteiro para o SKU do primeiro item e
    -- perderia os demais.
    --
    -- O JOIN com fila (e nao com base direto) e o que faz o resumo por SKU
    -- respeitar os mesmos recortes de urgencia e modalidade que a lista de cima,
    -- que sao calculados por pacote.
    itens_fila AS (
      SELECT
        b.chave,
        b.order_id,
        NULLIF(TRIM(b.sku), '') AS sku,
        b.quantidade * b.kit AS quantidade,
        b.valor_total,
        f.urgencia,
        f.modalidade
      FROM base b
      JOIN fila f ON f.chave = b.chave
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
/*                                  Resumos                                   */
/* -------------------------------------------------------------------------- */

type LinhaPacote = Record<string, unknown>;

/**
 * Colunas agrupáveis do resumo, por nome fixo.
 *
 * Mapa fechado pelo mesmo motivo de `COLUNA_ORDEM`: o nome entra na consulta como
 * texto, e não como parâmetro (`GROUP BY $1` não existe em SQL). Nenhuma destas
 * chaves vem da query string hoje, mas a tranca fica no lugar onde o dano
 * aconteceria, e não no lugar onde a validação está.
 */
const COLUNA_RESUMO = {
  hierarquia1: "hierarquia1",
  hierarquia2: "hierarquia2",
  modalidade: "modalidade",
} as const;

type ChaveResumo = keyof typeof COLUNA_RESUMO;

/**
 * "Onde o trabalho está concentrado", para o rodapé.
 *
 * Roda sobre a CTE JÁ FILTRADA, ao contrário das opções de filtro: a lista
 * responde "o que despachar" e o resumo responde "por onde começar", e as duas
 * perguntas têm de falar do mesmo conjunto. Um resumo que ignorasse os filtros
 * somaria pacotes que não estão na tela, e a conferência nunca fecharia.
 *
 * Ordena por PACOTES e não alfabeticamente: a maior pilha primeiro é a ordem em
 * que o galpão realmente ataca o dia. `LIMIT 30` porque isto é um resumo — cem
 * linhas de uma categoria com um pacote cada não ajudam ninguém a decidir nada.
 */
async function buscarResumo(
  cte: Prisma.Sql,
  chave: ChaveResumo,
  recortes: Prisma.Sql,
): Promise<LinhaResumo[]> {
  const coluna = Prisma.raw(COLUNA_RESUMO[chave]);

  const linhas = await prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
    ${cte}
    SELECT
      ${coluna}        AS rotulo,
      COUNT(*)         AS pacotes,
      SUM(pedidos)     AS vendas,
      SUM(unidades)    AS unidades,
      SUM(valor_total) AS valor_total
    FROM fila
    WHERE TRUE ${recortes}
    GROUP BY ${coluna}
    ORDER BY COUNT(*) DESC, ${coluna} ASC NULLS LAST
    LIMIT 30
  `);

  return linhas.map((linha) => ({
    // NULL vira rótulo explícito em vez de linha em branco: SKU sem cadastro é
    // trabalho de verdade e precisa ser somado em algum lugar visível. Some-lo
    // numa linha vazia faria a conta do rodapé não fechar com o total do topo,
    // sem dizer por quê.
    rotulo: linha.rotulo ? texto(linha.rotulo) : "Sem categoria",
    pacotes: numero(linha.pacotes),
    vendas: numero(linha.vendas),
    unidades: numero(linha.unidades),
    valorTotal: numero(linha.valor_total),
  }));
}

/**
 * Resumo por SKU — a lista de separação condensada.
 *
 * Roda sobre `itens_fila`, no nível da VENDA, e não sobre `fila`. É a diferença
 * que faz o número estar certo: um pacote misto contribui para vários SKUs, e
 * agrupar no nível do pacote daria a ele o SKU do primeiro item e perderia o
 * resto.
 *
 * `COUNT(DISTINCT chave)` para pacotes, porque o mesmo pacote aparece em várias
 * linhas de `itens_fila` — com `COUNT(*)` a coluna "pacotes" contaria vendas.
 *
 * Limite maior que os outros resumos (60 contra 30): aqui a lista É o trabalho.
 * Quem separa quer ver todos os códigos do dia, não os trinta maiores.
 */
async function buscarResumoSku(
  cte: Prisma.Sql,
  recortes: Prisma.Sql,
): Promise<LinhaResumo[]> {
  const linhas = await prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
    ${cte}
    SELECT
      sku                   AS rotulo,
      COUNT(DISTINCT chave)    AS pacotes,
      -- DISTINCT no pedido: era COUNT(*), que valia enquanto havia uma linha por
      -- venda. Com uma linha por PRODUTO, COUNT(*) contaria itens sob o rotulo
      -- "Vendas" -- e um pedido com tres unidades do mesmo SKU viraria tres vendas.
      COUNT(DISTINCT order_id) AS vendas,
      SUM(quantidade)          AS unidades,
      SUM(valor_total)      AS valor_total
    FROM itens_fila
    WHERE TRUE ${recortes}
    GROUP BY sku
    ORDER BY SUM(quantidade) DESC, sku ASC NULLS LAST
    LIMIT 60
  `);

  return linhas.map((linha) => ({
    rotulo: linha.rotulo ? texto(linha.rotulo) : "Sem SKU",
    pacotes: numero(linha.pacotes),
    vendas: numero(linha.vendas),
    unidades: numero(linha.unidades),
    valorTotal: numero(linha.valor_total),
  }));
}

/* -------------------------------------------------------------------------- */
/*                                  Consulta                                  */
/* -------------------------------------------------------------------------- */

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

  // Os dois recortes que ficam fora da CTE, juntos. Os resumos do rodapé usam
  // exatamente estes, para somarem o mesmo conjunto que a lista mostra.
  const recortes = Prisma.sql`${filtroUrgencia} ${filtroModalidade}`;

  const [
    linhas,
    resumo,
    resumoHierarquia1,
    resumoHierarquia2,
    resumoModalidade,
    resumoSku,
  ] = await Promise.all([
      prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
        ${cte}
        SELECT * FROM fila
        WHERE TRUE ${recortes}
        ${ordem}
        LIMIT ${porPagina} OFFSET ${deslocamento}
      `),
      // Uma consulta só devolve as fichas E os totais. Agrupar por urgência e
      // somar no Node evita uma terceira ida ao banco para o total da paginação.
      prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
        ${cte}
        SELECT
          urgencia,
          COUNT(*)           AS pacotes,
          -- pedidos e quantas VENDAS o pacote junta. Somado, da as vendas a
          -- despachar: o numero que fecha com o painel do marketplace, enquanto a
          -- contagem de pacotes e o numero de etiquetas a imprimir.
          -- (Sem acento e sem backtick de proposito: comentario SQL dentro de
          -- template literal, e backtick aqui encerra a string.)
          SUM(pedidos)       AS vendas,
          SUM(itens)         AS itens,
          SUM(unidades)      AS unidades,
          SUM(valor_total)   AS valor_total
        FROM fila
        WHERE TRUE ${filtroModalidade}
        GROUP BY urgencia
      `),
      buscarResumo(cte, "hierarquia1", recortes),
      buscarResumo(cte, "hierarquia2", recortes),
      buscarResumo(cte, "modalidade", recortes),
      buscarResumoSku(cte, recortes),
    ]);

  const porUrgencia = Object.fromEntries(
    URGENCIAS.map((u) => [u, 0]),
  ) as Record<Urgencia, number>;

  let total = 0;
  let vendas = 0;
  let itensTotal = 0;
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
      vendas += numero(linha.vendas);
      itensTotal += numero(linha.itens);
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
    vendas,
    itens: itensTotal,
    unidades,
    valorTotal,
    resumoHierarquia1,
    resumoHierarquia2,
    resumoModalidade,
    resumoSku,
    ...facetas,
  };
}

/**
 * Contas e modalidades disponíveis, mais quantas vendas faltam no backfill.
 *
 * Calculadas SEM os filtros de canal, conta, modalidade e busca — só com as
 * regras da fila e a janela. Se respeitassem os filtros, selecionar uma conta
 * apagaria as outras da lista e não haveria como voltar atrás sem limpar tudo.
 *
 * `statusVenda` é a EXCEÇÃO, e de propósito: ele não é um filtro, é o portão que
 * define QUAL conjunto está sendo consultado (ver `portaoMeli`). Sob
 * "Canceladas", a lista de contas tem de ser a das contas que têm cancelamento —
 * oferecer uma conta sem nenhum devolveria zero sem explicação.
 */
async function buscarFacetas(
  userId: string,
  filtros: FiltrosExpedicao,
): Promise<
  Pick<
    ResultadoExpedicao,
    | "contas"
    | "modalidades"
    | "opcoesHierarquia1"
    | "opcoesHierarquia2"
    | "opcoesSku"
    | "prazoPendente"
  >
> {
  const cte = montarCte(userId, filtros, { aplicarFiltros: false });

  const [linhas, hierarquias, skus, pendentes] = await Promise.all([
    prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
      ${cte}
      SELECT canal, account_id, MIN(conta) AS conta, modalidade, COUNT(*) AS pacotes
      FROM fila
      GROUP BY canal, account_id, modalidade
    `),
    // As duas hierarquias numa consulta so, em vez de duas: o custo aqui e a
    // CTE, nao o GROUP BY, e montar a CTE duas vezes dobraria a leitura das
    // tabelas de venda para responder uma pergunta de preenchimento de select.
    prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
      ${cte}
      SELECT DISTINCT 1 AS nivel, hierarquia1 AS valor FROM fila WHERE hierarquia1 IS NOT NULL
      UNION
      SELECT DISTINCT 2 AS nivel, hierarquia2 AS valor FROM fila WHERE hierarquia2 IS NOT NULL
    `),
    // Os SKUs vem de `itens_fila`, no nivel da venda: `fila` nao tem coluna de
    // SKU, porque um pacote misto tem varios.
    //
    // Ordenado por UNIDADES e nao alfabeticamente, e com teto: em base grande a
    // fila do dia tem centenas de codigos, e a lista do filtro precisa comecar
    // pelos que de fato movem o dia. O campo de busca do proprio filtro cobre o
    // resto -- alfabetico com 300 itens obriga a rolar para achar o que importa.
    prisma.$queryRaw<LinhaPacote[]>(Prisma.sql`
      ${cte}
      SELECT sku AS valor, SUM(quantidade) AS unidades
      FROM itens_fila
      WHERE sku IS NOT NULL
      GROUP BY sku
      ORDER BY SUM(quantidade) DESC, sku ASC
      LIMIT 300
    `),
    contarPrazoPendenteRapido(userId),
  ]);

  const contas = new Map<string, ContaExpedicao>();
  const modalidades = new Set<string>();
  const opcoes1 = new Set<string>();
  const opcoes2 = new Set<string>();

  for (const linha of hierarquias) {
    const valor = texto(linha.valor);
    if (valor === "") continue;
    if (numero(linha.nivel) === 1) opcoes1.add(valor);
    else opcoes2.add(valor);
  }

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
    // Alfabético, ao contrário dos resumos: aqui a pessoa está PROCURANDO uma
    // categoria que já tem em mente, e ordem por volume faria a busca visual
    // depender de quanto se vendeu naquele dia.
    opcoesHierarquia1: [...opcoes1].sort((a, b) => a.localeCompare(b, "pt-BR")),
    opcoesHierarquia2: [...opcoes2].sort((a, b) => a.localeCompare(b, "pt-BR")),
    // A ordem do SQL (por unidades) é PRESERVADA: reordenar alfabeticamente aqui
    // jogaria fora justamente o critério que faz os primeiros itens da lista
    // serem os que movem o dia.
    opcoesSku: skus.map((l) => texto(l.valor)).filter(Boolean),
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
