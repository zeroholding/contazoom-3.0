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

/**
 * Marcador de "processei e o payload não tinha prazo", COM VERSÃO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O NÚMERO NO FIM É O QUE PERMITE CONSERTAR ESTE ARQUIVO
 *
 * O marcador era só `"ausente"`, e o backfill só olha linha com
 * `prazo_despacho_origem IS NULL`. Junto, isso significa: uma vez marcada como
 * "não tinha prazo", a venda NUNCA MAIS é reexaminada. E quando descobrimos que
 * a lista de caminhos estava incompleta — o `sla` vinha de um endpoint que o sync
 * não chamava, e coleta/agendado guardam o limite em outro campo — as vendas já
 * marcadas ficaram presas: a tela continuava com "—" em tudo mesmo depois de o
 * código aprender onde olhar.
 *
 * Com versão, ampliar a lista de caminhos é subir este número. O backfill passa a
 * aceitar de volta toda linha marcada com versão ANTERIOR e sem prazo, examina de
 * novo com as regras novas, e converge: quem continuar sem prazo é remarcado com
 * a versão atual e sai da fila de trabalho de vez.
 *
 * QUEM ALTERAR `niveisMeli`/`niveisShopee` OU `extrairPrazoDespacho*` TEM DE
 * SUBIR ESTE NÚMERO. Sem isso, o caminho novo só vale para venda nova, e a base
 * fica com duas populações: as antigas sem prazo tendo o dado no JSON.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const PRAZO_ORIGEM_AUSENTE = "ausente:3";

/**
 * Fim do dia civil de São Paulo em que o instante caiu.
 *
 * Serve ao caso `handling = 0`: o Mercado Livre está dizendo "não há tempo de
 * manuseio", ou seja despacho no MESMO dia — é o que ele devolve em Flex. Somar
 * zero hora à criação do envio daria um prazo já vencido no instante da venda, e
 * a fila marcaria todo pedido Flex como atrasado no minuto em que ele entra.
 *
 * `-03:00` fixo: o Brasil não tem horário de verão desde 2019, e usar o fuso do
 * servidor faria o corte do dia mudar conforme onde a aplicação está hospedada.
 */
function fimDoDiaSP(instante: Date): Date {
  const dia = instante.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  return new Date(`${dia}T23:59:59-03:00`);
}

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
      // O MESMO campo, mas na RAIZ do envio.
      //
      // O ML devolve `estimated_handling_limit` em dois lugares dependendo do
      // envio, e só um deles estava sendo lido. Numa conta que despacha por
      // coleta, era o motivo de a fila inteira aparecer sem prazo: o dado estava
      // no JSON, um nível acima de onde o código procurava.
      origem: "ml_handling_limit_raiz",
      ler: (f) => comoObjeto(f.estimated_handling_limit).date,
    },
    {
      // COLETA E ENVIO AGENDADO.
      //
      // Nesses modos o limite não é de "manuseio", é o do agendamento: a
      // transportadora passa numa janela, e o que vale é estar pronto antes dela.
      // É o campo que o painel do ML mostra ao vendedor de coleta, e não existia
      // na lista — que é o caso exato de 44 pacotes em COLETA sem prazo.
      origem: "ml_schedule_limit",
      ler: (f) =>
        comoObjeto(comoObjeto(f.shipping_option).estimated_schedule_limit).date ??
        comoObjeto(f.estimated_schedule_limit).date,
    },
    {
      /**
       * DERIVADO: criação do envio + o TEMPO DE MANUSEIO, em horas.
       *
       * ────────────────────────────────────────────────────────────────────
       * ESTE É O NÍVEL QUE FUNCIONA COM O DADO QUE JÁ TEMOS.
       *
       * Um diagnóstico sobre 200 envios reais mostrou que NENHUM campo de
       * prazo em DATA existe no payload que o `/shipments/{id}` devolve para
       * esta conta: `estimated_handling_limit`, `estimated_schedule_limit` e
       * `sla` vêm ausentes ou nulos em 100% das linhas. O que existe, em
       * 199 de 200, é a DURAÇÃO:
       *
       *     "estimated_delivery_time": {
       *       "unit": "hour",
       *       "handling": 48,     ← tempo de manuseio
       *       "shipping": 72      ← tempo de transporte
       *     }
       *
       * Conferido nas três modalidades, contra a entrega estimada do próprio
       * payload:
       *   coleta   handling 48 · criado 11/09 22:46 → 13/09 22:46 · entrega 17/09
       *   agência  handling 24 · criado 11/09 15:21 → 12/09 15:21 · entrega 14/09
       *   flex     handling  0 · entrega no mesmo dia
       *
       * LIMITAÇÃO ASSUMIDA: são horas CORRIDAS. O Mercado Livre conta o prazo
       * de disponibilidade em dias ÚTEIS, então uma venda de sexta com 48h de
       * manuseio vence na terça no painel dele e no domingo nesta conta. Erra
       * para o lado seguro (mostra mais urgente do que é) e ordena a fila
       * corretamente, que é a função da tela. O número exato vem do nível
       * `ml_sla_expected`, logo abaixo, quando a venda for re-sincronizada.
       * ────────────────────────────────────────────────────────────────────
       */
      origem: "ml_handling_derivado",
      ler: (f) => {
        const entrega = comoObjeto(
          comoObjeto(f.shipping_option).estimated_delivery_time,
        );
        const horas = entrega.handling;
        if (typeof horas !== "number" || !Number.isFinite(horas) || horas < 0) {
          return null;
        }

        const criado = dataValida(f.date_created);
        if (!criado) return null;

        return horas === 0
          ? fimDoDiaSP(criado)
          : new Date(criado.getTime() + horas * 3_600_000);
      },
    },
    {
      /**
       * O número OFICIAL, de `/shipments/{id}/sla`.
       *
       * É o campo que o CyberDock (`raw_api_data->'sla_data'->>'expected_date'`)
       * e o NEXUS v2 (`shipment_delivery_sla`) usam como prazo — os dois chamam
       * esse endpoint separado, que este projeto não chamava. O sync passou a
       * chamar, então ele preenche a partir da próxima sincronização.
       *
       * Fica DEPOIS do derivado por um motivo prático, não de qualidade: o
       * derivado foi verificado contra dado real desta base e o `sla` ainda não.
       * Quando houver venda com os dois, basta comparar e, se o `sla` estiver
       * certo, subir este nível para cima do derivado.
       */
      origem: "ml_sla_expected",
      ler: (f) => comoObjeto(f.sla).expected_date,
    },
    {
      origem: "ml_shipping_limit",
      ler: (f) =>
        comoObjeto(comoObjeto(f.shipping_option).estimated_delivery_time)
          .shipping_limit_date,
    },
    {
      // ÚLTIMA RESERVA, e é uma aproximação assumida: o limite de HANDLING dentro
      // do prazo de entrega estimado. Fica no fim porque é o menos preciso — mas
      // um prazo aproximado ordena a fila, e nenhum prazo joga o pacote para o fim
      // dela junto com os que ninguém sabe quando vencem.
      origem: "ml_delivery_handling",
      ler: (f) =>
        comoObjeto(comoObjeto(f.shipping_option).estimated_delivery_time)
          .handling_limit_date,
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
