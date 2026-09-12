/**
 * Prova a extração do PRAZO DE DESPACHO contra payloads REAIS do Mercado Livre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE TESTE EXISTE
 *
 * A fila de Expedição ficou com "—" em todos os pacotes porque a lista de campos
 * de onde o prazo é lido foi escrita a partir da documentação, e nenhum deles
 * existe no payload que o Mercado Livre devolve de verdade para esta conta. Foram
 * três tentativas no escuro antes de alguém olhar o dado.
 *
 * Os três envios abaixo são payloads reais, colhidos por
 * `scripts/diagnostico-prazo.ts`, um por modalidade. Eles fixam a conta que hoje
 * preenche a fila inteira: `date_created + estimated_delivery_time.handling`
 * horas. Se alguém reordenar os níveis ou mexer na derivação, isto quebra aqui e
 * não na tela do galpão.
 *
 * NÃO precisa de banco nem de token: o extrator é função pura, e o SQL do
 * backfill é capturado por um stub do Prisma.
 *
 * Uso:
 *   npx tsx scripts/teste-prazo-despacho.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* O stub do Prisma tem de existir ANTES do import do backfill: `src/lib/prisma.ts`
   faz `global.prisma ?? new PrismaClient()`, e sem isto ele tenta abrir conexão. */
const sqlCapturado: string[] = [];

(globalThis as Record<string, unknown>).prisma = {
  $executeRawUnsafe: (sql: string) => {
    sqlCapturado.push(sql);
    return Promise.resolve(0);
  },
  meliVenda: { count: async () => 0 },
  shopeeVenda: { count: async () => 0 },
};

import { extrairPrazoDespachoMeli } from "../src/lib/prazo-despacho";

let falhas = 0;

function confere(rotulo: string, obtido: unknown, esperado: unknown) {
  const ok = String(obtido) === String(esperado);
  if (!ok) falhas++;
  console.log(
    `  ${ok ? "ok  " : "FALHA"} ${rotulo}\n        obtido:   ${String(obtido)}\n        esperado: ${String(esperado)}`,
  );
}

/* -------------------------------------------------------------------------- */
/*                    Payloads reais, um por modalidade                       */
/* -------------------------------------------------------------------------- */

/** COLETA (cross_docking). handling 48h. Pedido 2000018416911924. */
const COLETA = {
  status: "ready_to_ship",
  substatus: "invoice_pending",
  logistic_type: "cross_docking",
  date_created: "2026-09-11T21:46:58.906-04:00",
  shipping_option: {
    name: "Normal",
    buffering: { date: null },
    estimated_delivery_time: {
      date: "2026-09-17T00:00:00.000-03:00",
      unit: "hour",
      handling: 48,
      schedule: null,
      shipping: 72,
      pay_before: "2026-09-15T10:00:00.000-03:00",
      offset: { date: "2026-09-18T00:00:00.000-03:00", shipping: 24 },
    },
    estimated_delivery_final: { date: null },
    estimated_delivery_limit: { date: null },
    estimated_schedule_limit: { date: null },
    estimated_delivery_extended: { date: null },
  },
};

/** FLEX (self_service). handling 0. Pedido 2000018412213096. */
const FLEX = {
  status: "ready_to_ship",
  substatus: "ready_to_print",
  logistic_type: "self_service",
  date_created: "2026-09-11T16:18:23.644-04:00",
  shipping_option: {
    name: "Prioritario",
    estimated_delivery_time: {
      date: "2026-09-12T00:00:00.000-03:00",
      unit: "hour",
      handling: 0,
      schedule: null,
      shipping: 0,
      pay_before: "2026-09-12T12:00:00.000-03:00",
      offset: { date: null, shipping: null },
    },
    // Repare: estes TRÊS vêm preenchidos no Flex, e são prazo de ENTREGA.
    // Se algum deles entrar na lista de níveis, o Flex passa a mostrar a data de
    // entrega como se fosse o limite de despacho.
    estimated_delivery_final: { date: "2026-09-12T00:00:00.000-03:00" },
    estimated_delivery_limit: { date: "2026-09-12T00:00:00.000-03:00" },
    estimated_delivery_extended: { date: "2026-09-12T00:00:00.000-03:00" },
    estimated_schedule_limit: { date: null },
  },
};

/** AGÊNCIA (xd_drop_off). handling 24h. Pedido 2000018410376958. */
const AGENCIA = {
  status: "ready_to_ship",
  substatus: "invoice_pending",
  logistic_type: "xd_drop_off",
  date_created: "2026-09-11T14:21:02.464-04:00",
  shipping_option: {
    name: "Normal",
    estimated_delivery_time: {
      date: "2026-09-14T00:00:00.000-03:00",
      unit: "hour",
      handling: 24,
      schedule: null,
      shipping: 24,
      pay_before: "2026-09-14T08:00:00.000-03:00",
      offset: { date: "2026-09-16T00:00:00.000-03:00", shipping: 48 },
    },
    estimated_delivery_final: { date: null },
    estimated_delivery_limit: { date: null },
    estimated_schedule_limit: { date: null },
    estimated_delivery_extended: { date: null },
  },
};

/** O envio que veio vazio na amostra: `{ id: null }`. Não pode dar prazo. */
const VAZIO = { id: null };

async function main() {
  console.log("\n1. Payloads reais: o prazo sai do handling\n");

  const coleta = extrairPrazoDespachoMeli(COLETA);
  confere("coleta · origem", coleta.origem, "ml_handling_derivado");
  // 11/09 21:46:58.906 -04:00 == 22:46:58.906 -03:00. Mais 48h.
  confere("coleta · prazo", coleta.prazo?.toISOString(), "2026-09-14T01:46:58.906Z");

  const agencia = extrairPrazoDespachoMeli(AGENCIA);
  confere("agência · origem", agencia.origem, "ml_handling_derivado");
  confere("agência · prazo", agencia.prazo?.toISOString(), "2026-09-12T18:21:02.464Z");

  const flex = extrairPrazoDespachoMeli(FLEX);
  confere("flex · origem", flex.origem, "ml_handling_derivado");
  // handling 0 -> fim do dia civil de SP em que o envio foi criado.
  // 11/09 16:18 -04:00 == 17:18 -03:00, mesmo dia civil -> 11/09 23:59:59 -03:00.
  confere("flex · prazo", flex.prazo?.toISOString(), "2026-09-12T02:59:59.000Z");

  const vazio = extrairPrazoDespachoMeli(VAZIO);
  confere("envio vazio · origem", vazio.origem, "ausente:3");
  confere("envio vazio · prazo", vazio.prazo, null);

  console.log("\n2. O prazo de ENTREGA não pode virar prazo de despacho\n");

  // O Flex traz `estimated_delivery_limit` e `estimated_delivery_extended`
  // preenchidos com 12/09 (a ENTREGA). O prazo devolvido tem de ser o do
  // handling (11/09 23:59), e não 12/09 — senão a fila mostra um dia a mais e
  // atrasa o despacho.
  const flexPrazo = flex.prazo?.toISOString() ?? "";
  confere(
    "flex não usou a entrega de 12/09",
    flexPrazo.startsWith("2026-09-12T02:59"),
    true,
  );

  console.log("\n3. Precedência: handling_limit explícito ganha do derivado\n");

  const comExplicito = extrairPrazoDespachoMeli({
    ...COLETA,
    shipping_option: {
      ...COLETA.shipping_option,
      estimated_handling_limit: { date: "2026-09-12T20:00:00.000-03:00" },
    },
  });
  confere("origem", comExplicito.origem, "ml_handling_limit");
  confere("prazo", comExplicito.prazo?.toISOString(), "2026-09-12T23:00:00.000Z");

  console.log("\n4. O SQL do backfill é gerado e está bem formado\n");

  const { backfillPrazoChunk } = await import("../src/lib/prazo-despacho-backfill");
  await backfillPrazoChunk(10, "user-1");

  console.log(`  consultas capturadas: ${sqlCapturado.length}`);
  for (const [i, sql] of sqlCapturado.entries()) {
    const abre = (sql.match(/\(/g) ?? []).length;
    const fecha = (sql.match(/\)/g) ?? []).length;
    confere(`consulta ${i + 1} · parênteses`, `${abre}/${fecha}`, `${abre}/${abre}`);
  }

  const mlSql = sqlCapturado[0] ?? "";
  confere("SQL do ML deriva do handling", mlSql.includes("make_interval(hours =>"), true);
  confere(
    "SQL do ML protege o cast com jsonb_typeof",
    mlSql.includes("jsonb_typeof"),
    true,
  );
  confere(
    "SQL reexamina linha marcada com versão antiga",
    mlSql.includes("prazo_despacho_origem <> 'ausente:3'"),
    true,
  );

  console.log(
    falhas === 0
      ? "\nTODOS OS TESTES PASSARAM.\n"
      : `\n${falhas} FALHA(S). Ver acima.\n`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
