/**
 * Prova o backfill do `item_id` e a agregação dos rankings contra Postgres real.
 *
 * O que este teste protege, em ordem de gravidade:
 *   1. ISOLAMENTO ENTRE INQUILINOS. O sistema é multiusuário e a semente tem uma
 *      venda de outro usuário com o MESMO MLB do campeão. Se o `user_id` vazar de
 *      qualquer consulta, o número do vizinho entra no relatório de quem olha —
 *      é o pior defeito possível aqui, e é silencioso.
 *   2. O backfill não perde venda e CONVERGE (chega a zero pendente).
 *   3. Cancelada não conta como venda.
 *   4. Nenhuma venda é alterada além do `item_id`.
 *
 * NÃO faz chamada ao Mercado Livre: o enriquecimento de estoque é testado à
 * parte, porque depende de token real.
 *
 * Uso:
 *   $env:DATABASE_URL='postgresql://postgres@127.0.0.1:5480/cz'
 *   npx tsx scripts/teste-anuncios.ts
 */

import prisma from "../src/lib/prisma";
import {
  backfillItemIdAte,
  contarItemIdPendente,
  ITEM_ID_AUSENTE,
} from "../src/lib/anuncios-backfill";

let passou = 0;
let falhou = 0;

function ok(rotulo: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    passou += 1;
    console.log(`  OK    ${rotulo}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${rotulo}${detalhe ? ` :: ${detalhe}` : ""}`);
  }
}

const U1 = "user-teste-1";
const U2 = "user-teste-2";

/**
 * Devolve o banco ao estado de "antes do backfill".
 *
 * Sem isto o teste só passa na primeira execução: na segunda o `item_id` já está
 * preenchido e a seção 2 mede zero preenchidas. Teste que só passa uma vez não
 * serve para provar nada depois da primeira vez.
 */
async function zerarItemId() {
  await prisma.$executeRawUnsafe(`UPDATE meli_venda SET item_id = NULL`);
}

/** Foto do que precisa sobreviver intacto ao backfill. */
async function foto() {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ order_id: string; valor_total: unknown; quantidade: number; titulo: string }>
  >(`SELECT order_id, valor_total, quantidade, titulo FROM meli_venda ORDER BY order_id`);
  return rows.map((r) => `${r.order_id}|${String(r.valor_total)}|${r.quantidade}|${r.titulo}`);
}

async function main() {
  console.log("\nAnúncios: backfill e rankings\n");

  console.log("0. Aponta para um banco DESCARTÁVEL, não para produção");
  {
    const [{ db }] = await prisma.$queryRawUnsafe<Array<{ db: string }>>(
      `SELECT current_database() AS db`,
    );
    console.log(`      banco: ${db}`);
    ok("não é o banco de produção", db !== "postgres" && !db.includes("contazoom"), db);
    const usuarios = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM usuario`,
    );
    ok("é a semente de teste (2 usuários)", Number(usuarios[0].n) === 2, `${usuarios[0].n}`);
    if (db === "postgres" || Number(usuarios[0].n) !== 2) {
      console.error("\nABORTANDO: este teste escreve no banco. Use o descartável.\n");
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  const antes = await foto();
  await zerarItemId();

  console.log("\n1. Ponto de partida: nenhuma venda tem item_id");
  {
    const pendentes = await contarItemIdPendente();
    ok("todas pendentes", pendentes === antes.length, `${pendentes} de ${antes.length}`);
  }

  console.log("\n2. O backfill extrai o MLB do raw_data — sem tocar na API");
  {
    const r = await backfillItemIdAte(20_000);
    ok("preencheu alguma coisa", r.preenchidas > 0, `${r.preenchidas}`);
    ok("marcou a venda sem MLB", r.semMlb === 1, `${r.semMlb}`);
    ok("CONVERGIU: zero pendente", r.restantes === 0, `${r.restantes} restantes`);
  }

  console.log("\n3. Os dois formatos de raw_data foram lidos");
  {
    const novo = await prisma.meliVenda.findUnique({
      where: { orderId: "9001001" },
      select: { itemId: true },
    });
    ok("formato novo (order.order_items)", novo?.itemId === "MLB4321098765", `${novo?.itemId}`);

    const antigo = await prisma.meliVenda.findUnique({
      where: { orderId: "9003001" },
      select: { itemId: true },
    });
    ok("formato antigo (raiz)", antigo?.itemId === "MLB4321098765", `${antigo?.itemId}`);

    const semMlb = await prisma.meliVenda.findUnique({
      where: { orderId: "9004001" },
      select: { itemId: true },
    });
    ok("sem MLB recebeu o marcador", semMlb?.itemId === ITEM_ID_AUSENTE, `${semMlb?.itemId}`);
  }

  console.log("\n4. Rodar de novo não muda nada (idempotente)");
  {
    const r = await backfillItemIdAte(5_000);
    ok("nada a fazer", r.preenchidas === 0 && r.semMlb === 0, JSON.stringify(r));
    ok("segue em zero", r.restantes === 0);
  }

  console.log("\n5. NENHUMA venda foi alterada além do item_id");
  {
    const depois = await foto();
    ok("mesma quantidade", depois.length === antes.length, `${antes.length} -> ${depois.length}`);
    ok(
      "cada venda idêntica em id, valor, quantidade e título",
      depois.every((l, i) => l === antes[i]) && depois.length === antes.length,
    );
  }

  // A partir daqui usa a agregação de verdade, com o import dinâmico para o
  // módulo ver o cliente já conectado.
  const { buscarAnuncios } = await import("../src/lib/anuncios-data");

  const base = {
    janelaDias: 0,
    diasSemVenda: 30,
    minUnidades: 0,
    minFaturamento: 0,
    meliAccountId: "",
    busca: "",
    hierarquia1: "",
    hierarquia2: "",
    status: "",
    estoque: "",
    pagina: 1,
    porPagina: 20,
  } as const;

  console.log("\n6. Mais vendidos: agrupa por anúncio e ignora cancelada");
  {
    const r = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      ordem: "unidades_desc",
    });
    ok("dois anúncios", r.total === 2, `${r.total}`);

    const campeao = r.linhas.find((l) => l.itemId === "MLB4321098765");
    ok("campeão presente", Boolean(campeao));
    // 40 vendas + 5 do formato antigo = 45 pedidos, 45 unidades. A cancelada
    // (9 unidades, R$ 999) NÃO pode entrar.
    ok("45 pedidos, não 46", campeao?.pedidos === 45, `${campeao?.pedidos}`);
    ok("45 unidades, não 54", campeao?.unidades === 45, `${campeao?.unidades}`);
    ok(
      "faturamento sem a cancelada",
      Math.abs((campeao?.faturamento ?? 0) - 45 * 153.48) < 0.02,
      `${campeao?.faturamento}`,
    );
    ok("conta correta", campeao?.conta === "MOSCOU", `${campeao?.conta}`);
    ok("SKU agregado", campeao?.skus.includes("STEP60") === true);

    const morto = r.linhas.find((l) => l.itemId === "MLB9999888877");
    ok("o outro tem 50 unidades (25 vendas x 2)", morto?.unidades === 50, `${morto?.unidades}`);
    ok("ordenado por unidades", r.linhas[0].itemId === "MLB9999888877", r.linhas[0].itemId);
    ok(
      "o marcador '-' não virou anúncio",
      !r.linhas.some((l) => l.itemId === ITEM_ID_AUSENTE),
    );
  }

  console.log("\n7. ISOLAMENTO: a venda do outro inquilino não vaza");
  {
    const r = await buscarAnuncios(U1, { ...base, modo: "mais_vendidos", ordem: "unidades_desc" });
    const campeao = r.linhas.find((l) => l.itemId === "MLB4321098765");
    // O vizinho tem 50 unidades e R$ 5.000 no MESMO MLB. Se vazasse, daria 95.
    ok("unidades sem o vizinho", campeao?.unidades === 45, `${campeao?.unidades}`);
    ok(
      "faturamento sem o vizinho",
      (campeao?.faturamento ?? 0) < 7_000,
      `${campeao?.faturamento}`,
    );

    const outro = await buscarAnuncios(U2, { ...base, modo: "mais_vendidos", ordem: "unidades_desc" });
    ok("o vizinho vê só o dele", outro.total === 1, `${outro.total}`);
    ok("e com os números dele", outro.linhas[0]?.unidades === 50, `${outro.linhas[0]?.unidades}`);
  }

  console.log("\n8. Mortos: só o que parou de vender e foi relevante");
  {
    const r = await buscarAnuncios(U1, {
      ...base,
      modo: "mortos",
      diasSemVenda: 90,
      minUnidades: 10,
      minFaturamento: 0,
      ordem: "faturamento_desc",
    });
    ok("só um morto", r.total === 1, `${r.total}`);
    ok("é o colchonete", r.linhas[0]?.itemId === "MLB9999888877", r.linhas[0]?.itemId);
    ok("dias sem venda acima de 90", (r.linhas[0]?.diasSemVenda ?? 0) > 90, `${r.linhas[0]?.diasSemVenda}`);
    ok("o campeão NÃO está aqui", !r.linhas.some((l) => l.itemId === "MLB4321098765"));
    ok("média de horas calculada", r.resumo.mediaHoras > 0, `${r.resumo.mediaHoras}`);
  }

  console.log("\n9. O mínimo de relevância corta de verdade");
  {
    const alto = await buscarAnuncios(U1, {
      ...base,
      modo: "mortos",
      diasSemVenda: 90,
      minUnidades: 999,
      minFaturamento: 999_999,
      ordem: "faturamento_desc",
    });
    ok("nada passa com mínimo absurdo", alto.total === 0, `${alto.total}`);

    // Relevância é OU: passar em UM dos dois critérios basta.
    const ou = await buscarAnuncios(U1, {
      ...base,
      modo: "mortos",
      diasSemVenda: 90,
      minUnidades: 999,
      minFaturamento: 100,
      ordem: "faturamento_desc",
    });
    ok("faturamento sozinho qualifica (é OU, não E)", ou.total === 1, `${ou.total}`);
  }

  console.log("\n10. Filtros de conta, busca e período");
  {
    const porConta = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      meliAccountId: "acc-tokyo",
      ordem: "unidades_desc",
    });
    ok("filtro de conta isola", porConta.total === 1, `${porConta.total}`);
    ok("e é o da TOKYO", porConta.linhas[0]?.itemId === "MLB9999888877");

    const porBusca = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      busca: "Colchonete",
      ordem: "unidades_desc",
    });
    ok("busca por título", porBusca.total === 1, `${porBusca.total}`);

    const porMlb = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      busca: "MLB4321098765",
      ordem: "unidades_desc",
    });
    ok("busca por MLB", porMlb.total === 1 && porMlb.linhas[0].itemId === "MLB4321098765");

    // Janela de 30 dias: o colchonete (120+ dias) tem de sair.
    const janela = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      janelaDias: 30,
      ordem: "unidades_desc",
    });
    ok("período de 30 dias exclui o parado", janela.total === 1, `${janela.total}`);
  }

  console.log("\n11. Hierarquia vem do cadastro de SKU");
  {
    const r = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      hierarquia1: "Fitness",
      ordem: "unidades_desc",
    });
    ok("os dois são Fitness", r.total === 2, `${r.total}`);

    const h2 = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      hierarquia2: "Musculação",
      ordem: "unidades_desc",
    });
    ok("hierarquia 2 filtra", h2.total === 1, `${h2.total}`);
    ok("e é o Step", h2.linhas[0]?.itemId === "MLB4321098765");
  }

  console.log("\n12. Estoque honesto: sem API o campo é null, não zero");
  {
    const r = await buscarAnuncios(U1, { ...base, modo: "mais_vendidos", ordem: "unidades_desc" });
    ok("estoque é null e não 0", r.linhas.every((l) => l.estoque === null));
    ok("status é null e não 'unknown'", r.linhas.every((l) => l.status === null));
    ok(
      "o resumo declara o escopo",
      r.resumo.escopoEstoque === "pagina",
      r.resumo.escopoEstoque,
    );
    ok(
      "e conta como indisponível, não como sem estoque",
      r.resumo.semEstoque === 0 && r.resumo.estoqueIndisponivel === 2,
      `sem=${r.resumo.semEstoque} indisp=${r.resumo.estoqueIndisponivel}`,
    );
  }

  console.log("\n13. Paginação");
  {
    const r = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      porPagina: 1,
      pagina: 2,
      ordem: "unidades_desc",
    });
    ok("uma linha por página", r.linhas.length === 1);
    ok("total continua 2", r.total === 2);
    ok("duas páginas", r.totalPaginas === 2);
    ok("página 2 traz o segundo", r.linhas[0].itemId === "MLB4321098765", r.linhas[0].itemId);

    const forcada = await buscarAnuncios(U1, {
      ...base,
      modo: "mais_vendidos",
      porPagina: 1,
      pagina: 99,
      ordem: "unidades_desc",
    });
    ok("página além do fim volta para a última", forcada.pagina === 2, `${forcada.pagina}`);
  }

  console.log(`\n────────────────────────────\n${passou} passaram, ${falhou} falharam\n`);
  await prisma.$disconnect();
  process.exit(falhou ? 1 : 0);
}

main().catch(async (e) => {
  console.error("erro no teste:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
