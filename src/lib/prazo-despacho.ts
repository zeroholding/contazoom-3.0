/**
 * Extração do PRAZO DE DESPACHO a partir dos payloads crus de ML e Shopee.
 *
 * Prazo de despacho é o horário limite para o VENDEDOR postar/entregar o pacote
 * à transportadora. Não é o prazo de ENTREGA ao comprador, que é dias depois e
 * não serve para priorizar trabalho de galpão. Confundir os dois faz a fila
 * mostrar tudo como "folgado".
 *
 * Vive numa lib própria, e não dentro do sync, porque três lugares diferentes
 * precisam da MESMA regra:
 *
 *   1. `src/utils/sync-prepare-sale-data.ts`  (caminho Redis/worker do ML)
 *   2. `src/app/api/meli/vendas/sync/route.ts` (caminho direto do ML)
 *   3. `src/app/api/shopee/vendas/sync/route.ts`
 *
 * O ML tem os dois caminhos de gravação vivos, com mapeadores duplicados e já
 * divergentes entre si no cálculo do frete. Uma cópia da regra em cada um seria
 * a quarta chance de divergir — e o sintoma de divergência aqui é a venda
 * aparecer com prazo num caminho e sem prazo no outro, dependendo de o Redis
 * estar de pé.
 *
 * O backfill (`prazo-despacho-backfill.ts`) reimplementa os MESMOS caminhos em
 * SQL, porque ele lê `raw_data` direto no banco sem trazer o JSON para o Node.
 * Os dois arquivos precisam ser alterados juntos.
 */

/** Marcador de "processei e o payload não tinha prazo". Ver o schema. */
export const PRAZO_ORIGEM_AUSENTE = "ausente";

export type PrazoDespacho = {
  prazo: Date | null;
  /** Nunca NULL: quando não achou nada, vem `PRAZO_ORIGEM_AUSENTE`. */
  origem: string;
};

const SEM_PRAZO: PrazoDespacho = { prazo: null, origem: PRAZO_ORIGEM_AUSENTE };

/**
 * Faixa aceitável para um prazo de despacho, em epoch de segundos.
 *
 * De 2017 a 2049. O piso é o que barra o `0` da Shopee, que significa "não se
 * aplica" e não "1º de janeiro de 1970" — convertido literalmente, ele faz a
 * tela anunciar "atrasado há 20.657 dias". O teto barra epoch em
 * MILISSEGUNDOS enviado por engano no lugar de segundos, que cairia no ano
 * 57000 e ordenaria a fila ao contrário.
 */
const EPOCH_MINIMO = 1_500_000_000;
const EPOCH_MAXIMO = 2_500_000_000;

/** Converte para Date, ou NULL se não for uma data plausível. */
function dataValida(valor: unknown): Date | null {
  if (valor instanceof Date) {
    return Number.isFinite(valor.getTime()) ? valor : null;
  }

  if (typeof valor === "number" && Number.isFinite(valor)) {
    // Número aqui é sempre epoch. Segundos, porque é o que ML e Shopee usam.
    if (valor < EPOCH_MINIMO || valor > EPOCH_MAXIMO) return null;
    return new Date(valor * 1000);
  }

  if (typeof valor !== "string") return null;

  const texto = valor.trim();
  if (texto === "") return null;

  // Epoch em texto (a Shopee às vezes serializa número como string).
  if (/^\d+$/.test(texto)) {
    const n = Number(texto);
    if (!Number.isFinite(n) || n < EPOCH_MINIMO || n > EPOCH_MAXIMO) return null;
    return new Date(n * 1000);
  }

  // ISO 8601. A checagem de formato ANTES do parse é deliberada: o ML já
  // devolveu string vazia e `"null"` neste campo, e `new Date("null")` não
  // levanta erro — devolve Invalid Date, que segue adiante e só estoura na
  // gravação, derrubando a venda inteira por causa de um campo acessório.
  if (!/^\d{4}-\d{2}-\d{2}/.test(texto)) return null;

  const d = new Date(texto);
  if (!Number.isFinite(d.getTime())) return null;

  const segundos = Math.floor(d.getTime() / 1000);
  if (segundos < EPOCH_MINIMO || segundos > EPOCH_MAXIMO) return null;

  return d;
}

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

/* -------------------------------------------------------------------------- */
/*                               Mercado Livre                                */
/* -------------------------------------------------------------------------- */

/**
 * Prazo de despacho de um envio do Mercado Livre.
 *
 * Ordem de preferência, e o motivo de cada uma:
 *
 * 1. `shipping_option.estimated_handling_limit.date` — é literalmente o limite de
 *    MANUSEIO, ou seja, o horário até o qual o pacote tem de estar despachado.
 *    É o campo certo, e é o que o painel do ML mostra ao vendedor.
 *
 * 2. `sla.expected_date` — o acordo de nível de serviço do envio. Cobre envio em
 *    que o ML não devolve `estimated_handling_limit` (coleta e Flex, sobretudo).
 *    É o campo que o CyberDock usa como principal.
 *
 * 3. `shipping_option.estimated_delivery_time.shipping_limit_date` — reserva
 *    final, para payload antigo em que os dois anteriores não existiam.
 *
 * Cada nível é aceito só se produzir uma data plausível: um campo presente mas
 * com lixo dentro NÃO consome a vez do próximo. Sem isso, um `sla` com
 * `expected_date: ""` bloquearia a reserva e a venda ficaria sem prazo tendo o
 * dado disponível dois campos abaixo.
 *
 * `shipment` e `order` são aceitos porque nem todo caminho tem o envio completo:
 * quando o `/shipments/{id}` falha, o sync guarda o `order.shipping` embutido no
 * pedido, que é mais pobre mas às vezes traz o `shipping_option`.
 */
export function extrairPrazoDespachoMeli(
  shipment: unknown,
  order?: unknown,
): PrazoDespacho {
  const fontes = [comoObjeto(shipment), comoObjeto(comoObjeto(order).shipping)];

  const candidatos: Array<{ origem: string; ler: (f: Record<string, unknown>) => unknown }> = [
    {
      origem: "ml_handling_limit",
      ler: (f) =>
        comoObjeto(comoObjeto(f.shipping_option).estimated_handling_limit).date,
    },
    {
      origem: "ml_sla_expected",
      ler: (f) => comoObjeto(f.sla).expected_date,
    },
    {
      origem: "ml_shipping_limit",
      ler: (f) =>
        comoObjeto(comoObjeto(f.shipping_option).estimated_delivery_time)
          .shipping_limit_date,
    },
  ];

  for (const candidato of candidatos) {
    for (const fonte of fontes) {
      const prazo = dataValida(candidato.ler(fonte));
      if (prazo) return { prazo, origem: candidato.origem };
    }
  }

  return SEM_PRAZO;
}

/* -------------------------------------------------------------------------- */
/*                                   Shopee                                   */
/* -------------------------------------------------------------------------- */

/**
 * Prazo de despacho de um pedido da Shopee.
 *
 * `ship_by_date` é campo PADRÃO da resposta de `get_order_detail` — não precisa
 * entrar em `response_optional_fields`, e incluir um nome que a Shopee não
 * reconhece como opcional faz a chamada inteira falhar. Por isso o sync não foi
 * alterado nesse ponto.
 *
 * Vem como epoch em SEGUNDOS. O `0` é o "não se aplica" da Shopee (pedido não
 * pago, cancelado, ou aguardando nota) e tem de virar NULL — ver `EPOCH_MINIMO`.
 *
 * A reserva em `package_list[0]` existe porque em pedido com mais de um pacote a
 * Shopee às vezes só preenche o prazo dentro do pacote. Pega-se o MENOR prazo
 * entre os pacotes: o que manda na urgência é o primeiro corte a vencer.
 */
export function extrairPrazoDespachoShopee(order: unknown): PrazoDespacho {
  const pedido = comoObjeto(order);

  const doPedido = dataValida(pedido.ship_by_date);
  if (doPedido) return { prazo: doPedido, origem: "sp_ship_by_date" };

  const pacotes = Array.isArray(pedido.package_list) ? pedido.package_list : [];
  let menor: Date | null = null;
  for (const pacote of pacotes) {
    const prazo = dataValida(comoObjeto(pacote).ship_by_date);
    if (prazo && (menor === null || prazo.getTime() < menor.getTime())) {
      menor = prazo;
    }
  }
  if (menor) return { prazo: menor, origem: "sp_package_ship_by_date" };

  return SEM_PRAZO;
}
