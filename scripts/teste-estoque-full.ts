/**
 * Prova o Estoque Full contra Postgres de verdade.
 *
 * O QUE ESTE TESTE PROTEGE, em ordem de gravidade:
 *
 * 1. COBERTURA POR VARIAÇÃO. É o defeito que este módulo existe para evitar e o
 *    único que erra em silêncio: se o join de vendas ignorar a variação, as três
 *    variações de um anúncio recebem as vendas do anúncio INTEIRO, a venda diária
 *    triplica e a tela manda repor tudo ao mesmo tempo. A semente foi montada
 *    para que o número certo e o errado sejam bem diferentes (60 dias contra 20).
 * 2. ISOLAMENTO ENTRE INQUILINOS. Existe uma linha do vizinho com o MESMO
 *    inventory_id e uma venda de 300 unidades na mesma variação. Se vazar, a
 *    conta do usuário muda e ninguém percebe.
 * 3. Cancelada e venda velha fora da conta de 30 dias.
 * 4. As quatro faixas de situação, e que os quatro filtros somados dão o total.
 * 5. O backfill de variação converge e não altera mais nada.
 *
 * NÃO faz chamada ao Mercado Livre: o pipeline de sync depende de token real e é
 * verificado à parte.
 *
 * Uso:
 *   $env:DATABASE_URL='postgresql://postgres@127.0.0.1:5480/cz_full'
 *   node_modules\.bin\tsx scripts/teste-estoque-full.ts
 */

import prisma from "../src/lib/prisma";
import {
  backfillVariacaoAte,
  contarVariacaoPendente,
  VARIACAO_AUSENTE,
} from "../src/lib/estoque-full-backfill";
import {
  coberturaEmDias,
  DIAS_ESTOQUE_ALTO,
  DIAS_REPOR,
  rotuloCobertura,
  situacaoDoEstoque,
} from "../src/lib/estoque-full-cobertura";

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

const U1 = "u1";
const U2 = "u2";

const BASE = {
  contas: [] as string[],
  busca: "",
  situacao: "" as const,
  estoque: "" as const,
  hierarquia1: "",
  hierarquia2: "",
  ordem: "aptas" as const,
  direcao: "desc" as const,
  pagina: 1,
  porPagina: 50,
};

/** Foto do que precisa sobreviver ao backfill. */
async function foto() {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ order_id: string; quantidade: number; valor_total: unknown; status: string }>
  >(`SELECT order_id, quantidade, valor_total, status FROM meli_venda ORDER BY order_id`);
  return rows.map((r) => `${r.order_id}|${r.quantidade}|${String(r.valor_total)}|${r.status}`);
}

async function main() {
  console.log("\nEstoque Full\n");

  console.log("0. Aponta para um banco DESCARTÁVEL");
  {
    const [{ db }] = await prisma.$queryRawUnsafe<Array<{ db: string }>>(
      `SELECT current_database() AS db`,
    );
    console.log(`      banco: ${db}`);
    const usuarios = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM usuario`,
    );
    const ok2 = db !== "postgres" && Number(usuarios[0].n) === 2;
    ok("é a semente de teste", ok2, `${db}, ${usuarios[0].n} usuários`);
    if (!ok2) {
      console.error("\nABORTANDO: este teste escreve no banco. Use o descartável.\n");
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  const antes = await foto();
  await prisma.$executeRawUnsafe(`UPDATE meli_venda SET variation_id = NULL`);

  console.log("\n1. A régua de cobertura, isolada");
  {
    // 6 unidades vendendo 30 em 30 dias = 1/dia = 6 dias de cobertura.
    ok("6 un. com 30 vendas = 6 dias", coberturaEmDias(6, 30) === 6);
    ok("60 un. com 30 vendas = 60 dias", coberturaEmDias(60, 30) === 60);
    ok("sem vendas devolve null, não infinito", coberturaEmDias(50, 0) === null);
    ok("rótulo em semanas para cima", rotuloCobertura(6) === "Até 1 sem.", rotuloCobertura(6));
    ok("13 dias viram 2 semanas", rotuloCobertura(13) === "Até 2 sem.");
    ok("sem vendas tem rótulo próprio", rotuloCobertura(null) === "Sem vendas");
    ok("zero é 'Esgotado'", rotuloCobertura(0) === "Esgotado");

    ok("6 dias é repor", situacaoDoEstoque(6, 30, 6) === "repor");
    ok(`o limiar ${DIAS_REPOR} ainda é repor`, situacaoDoEstoque(DIAS_REPOR, 30, 14) === "repor");
    ok(`${DIAS_ESTOQUE_ALTO} dias é alto`, situacaoDoEstoque(56, 30, 56) === "alto");
    ok("estoque sem venda é parado", situacaoDoEstoque(null, 0, 25) === "parado");
    // Sem venda e sem estoque não é problema de estoque: não há o que repor.
    ok("sem venda e sem estoque é saudável", situacaoDoEstoque(null, 0, 0) === "saudavel");
    ok("30 dias é saudável", situacaoDoEstoque(30, 30, 30) === "saudavel");
  }

  console.log("\n2. Backfill da variação a partir do rawData");
  {
    const pendentesAntes = await contarVariacaoPendente();
    ok("todas pendentes no começo", pendentesAntes === antes.length, `${pendentesAntes}`);

    const r = await backfillVariacaoAte(20_000);
    ok("preencheu as vendas com variação", r.preenchidas === 93, `${r.preenchidas}`);
    ok("marcou as 15 do anúncio simples", r.semVariacao === 15, `${r.semVariacao}`);
    ok("CONVERGIU: zero pendente", r.restantes === 0, `${r.restantes}`);

    const p = await prisma.meliVenda.findUnique({
      where: { orderId: "801001" },
      select: { variationId: true },
    });
    ok("variação lida do JSON", p?.variationId === "111", `${p?.variationId}`);

    const c = await prisma.meliVenda.findUnique({
      where: { orderId: "804001" },
      select: { variationId: true },
    });
    ok("anúncio simples recebe o marcador", c?.variationId === VARIACAO_AUSENTE, `${c?.variationId}`);

    const denovo = await backfillVariacaoAte(5_000);
    ok("idempotente: nada a fazer", denovo.preenchidas === 0 && denovo.semVariacao === 0);
  }

  console.log("\n3. Nenhuma venda foi alterada além da variação");
  {
    const depois = await foto();
    ok("mesma quantidade de vendas", depois.length === antes.length);
    ok("cada venda idêntica", depois.every((l, i) => l === antes[i]));
  }

  const { buscarEstoqueFull } = await import("../src/lib/estoque-full-data");

  console.log("\n4. ⚠️  COBERTURA POR VARIAÇÃO — o defeito que erra em silêncio");
  {
    const r = await buscarEstoqueFull(U1, BASE);
    const porInv = new Map(r.linhas.map((l) => [l.inventoryId, l]));

    const P = porInv.get("INV-P");
    const M = porInv.get("INV-M");
    const G = porInv.get("INV-G");

    // Cada variação vendeu 30 un. Se o join ignorasse a variação, cada uma
    // receberia 90 (a soma do anúncio).
    ok("P recebeu SÓ as vendas dela (30)", P?.vendas30dUnidades === 30, `${P?.vendas30dUnidades}`);
    ok("M recebeu SÓ as vendas dela (30)", M?.vendas30dUnidades === 30, `${M?.vendas30dUnidades}`);
    ok("G recebeu SÓ as vendas dela (30)", G?.vendas30dUnidades === 30, `${G?.vendas30dUnidades}`);

    ok("P: 6 un. / 1 por dia = 6 dias", P?.cobertura === 6, `${P?.cobertura}`);
    ok("M: 60 un. / 1 por dia = 60 dias", M?.cobertura === 60, `${M?.cobertura}`);
    ok("G: 90 un. / 1 por dia = 90 dias", G?.cobertura === 90, `${G?.cobertura}`);

    // A prova negativa: com o join errado, M daria 20 dias e viraria "saudável".
    ok("M NÃO caiu em 20 dias (join por anúncio)", M?.cobertura !== 20);

    ok("P é o único a repor", P?.situacao === "repor", `${P?.situacao}`);
    ok("M é estoque alto", M?.situacao === "alto", `${M?.situacao}`);
    ok("G é estoque alto", G?.situacao === "alto", `${G?.situacao}`);

    // O título tem de distinguir as variações, senão as três linhas ficam iguais.
    ok(
      "os títulos distinguem as variações",
      new Set([P?.titulo, M?.titulo, G?.titulo]).size === 3,
      `${P?.titulo} | ${M?.titulo} | ${G?.titulo}`,
    );
  }

  console.log("\n5. Anúncio SIMPLES casa pelo marcador, não por NULL");
  {
    const r = await buscarEstoqueFull(U1, BASE);
    const C = r.linhas.find((l) => l.inventoryId === "INV-C");
    // Em SQL `NULL = NULL` não é verdadeiro: sem o marcador este join se perderia
    // e o anúncio simples apareceria com zero vendas.
    ok("as 15 vendas casaram", C?.vendas30dUnidades === 15, `${C?.vendas30dUnidades}`);
    ok("30 un. / 0,5 por dia = 60 dias", C?.cobertura === 60, `${C?.cobertura}`);
  }

  console.log("\n6. Cancelada e venda velha ficam fora");
  {
    const r = await buscarEstoqueFull(U1, BASE);
    const P = r.linhas.find((l) => l.inventoryId === "INV-P");
    const M = r.linhas.find((l) => l.inventoryId === "INV-M");
    // A cancelada tem 10 un na variação P; a velha tem 50 un na M, fora dos 30 dias.
    ok("cancelada não entrou (P segue 30)", P?.vendas30dUnidades === 30, `${P?.vendas30dUnidades}`);
    ok("venda de 120 dias não entrou (M segue 30)", M?.vendas30dUnidades === 30, `${M?.vendas30dUnidades}`);
  }

  console.log("\n7. ISOLAMENTO entre inquilinos");
  {
    const r1 = await buscarEstoqueFull(U1, BASE);
    const P = r1.linhas.find((l) => l.inventoryId === "INV-P");
    // O vizinho tem INV-P com 999 aptas e uma venda de 300 un na variação 111.
    ok("aptas do u1 sem o vizinho (6, não 999)", P?.disponivel === 6, `${P?.disponivel}`);
    ok("vendas do u1 sem o vizinho (30, não 330)", P?.vendas30dUnidades === 30, `${P?.vendas30dUnidades}`);
    ok("u1 vê 6 inventários", r1.total === 6, `${r1.total}`);

    const r2 = await buscarEstoqueFull(U2, BASE);
    ok("o vizinho vê só 1", r2.total === 1, `${r2.total}`);
    ok("com os números dele", r2.linhas[0]?.disponivel === 999, `${r2.linhas[0]?.disponivel}`);
    ok("e as vendas dele", r2.linhas[0]?.vendas30dUnidades === 300, `${r2.linhas[0]?.vendas30dUnidades}`);
  }

  console.log("\n8. Resumo e o 'a caminho' separado das não aptas");
  {
    const r = await buscarEstoqueFull(U1, BASE);
    ok("6 itens", r.resumo.itens === 6, `${r.resumo.itens}`);
    // 6+60+90+30+25+0
    ok("211 un. aptas", r.resumo.aptas === 211, `${r.resumo.aptas}`);
    // 2+0+5 — sem o transfer somado
    ok("7 não aptas (sem o a caminho)", r.resumo.naoAptas === 7, `${r.resumo.naoAptas}`);
    ok("10 a caminho, em campo próprio", r.resumo.aCaminho === 10, `${r.resumo.aCaminho}`);
    // 30+30+30+15
    ok("105 un. vendidas em 30d", r.resumo.vendasUnidades === 105, `${r.resumo.vendasUnidades}`);
    ok("receita 9.750", Math.abs(r.resumo.vendasReceita - 9750) < 0.01, `${r.resumo.vendasReceita}`);
    ok("1 a repor", r.resumo.aRepor === 1, `${r.resumo.aRepor}`);
    ok("1 parado", r.resumo.parados === 1, `${r.resumo.parados}`);
    ok("tem data de atualização", r.resumo.ultimaAtualizacao !== null);
    ok("não é 'nunca sincronizou'", r.nuncaSincronizou === false);
    ok("backfill zerado", r.backfillPendente === 0, `${r.backfillPendente}`);
  }

  console.log("\n9. Estoque médio: histórico vira número, ausência vira null");
  {
    const r = await buscarEstoqueFull(U1, BASE);
    const M = r.linhas.find((l) => l.inventoryId === "INV-M");
    const G = r.linhas.find((l) => l.inventoryId === "INV-G");
    ok("M tem média 50 (10 dias a 50)", M?.estoqueMedio === 50, `${M?.estoqueMedio}`);
    // Sem histórico é null, não zero: zero diria "o estoque estava vazio".
    ok("G sem histórico é null, não 0", G?.estoqueMedio === null, `${G?.estoqueMedio}`);
  }

  console.log("\n10. Os quatro filtros de situação somam o total");
  {
    const total = (await buscarEstoqueFull(U1, BASE)).total;
    const contagens: Record<string, number> = {};
    for (const s of ["repor", "parado", "alto", "saudavel"] as const) {
      contagens[s] = (await buscarEstoqueFull(U1, { ...BASE, situacao: s })).total;
    }
    const soma = Object.values(contagens).reduce((a, b) => a + b, 0);
    ok(
      `repor+parado+alto+saudavel = ${total}`,
      soma === total,
      `${JSON.stringify(contagens)} soma ${soma}`,
    );
    ok("1 a repor", contagens.repor === 1, `${contagens.repor}`);
    ok("1 parado", contagens.parado === 1, `${contagens.parado}`);
    ok("3 estoque alto (M, G e o simples)", contagens.alto === 3, `${contagens.alto}`);
    // O V2 jogava os "parados" dentro de "estoque alto": a linha aparecia no
    // filtro de alto mostrando o selo "Parado". Aqui as faixas não se sobrepõem.
    const alto = await buscarEstoqueFull(U1, { ...BASE, situacao: "alto" });
    ok("nenhum 'parado' no filtro de alto", alto.linhas.every((l) => l.situacao === "alto"));
  }

  console.log("\n11. Demais filtros");
  {
    const semEstoque = await buscarEstoqueFull(U1, { ...BASE, estoque: "sem" });
    ok("só o esgotado", semEstoque.total === 1 && semEstoque.linhas[0].inventoryId === "INV-Z");

    const comEstoque = await buscarEstoqueFull(U1, { ...BASE, estoque: "com" });
    ok("os outros 5", comEstoque.total === 5, `${comEstoque.total}`);

    const busca = await buscarEstoqueFull(U1, { ...BASE, busca: "Colchonete" });
    ok("busca por título", busca.total === 1 && busca.linhas[0].inventoryId === "INV-C");

    const porInv = await buscarEstoqueFull(U1, { ...BASE, busca: "INV-M" });
    ok("busca pelo código do estoque", porInv.total === 1);

    const h1 = await buscarEstoqueFull(U1, { ...BASE, hierarquia1: "Fitness" });
    // P, M, G e o colchonete são Fitness; o parado é Casa; o esgotado não tem SKU.
    ok("hierarquia 1 filtra", h1.total === 4, `${h1.total}`);

    const h2 = await buscarEstoqueFull(U1, { ...BASE, hierarquia2: "Musculação" });
    ok("hierarquia 2 filtra", h2.total === 3, `${h2.total}`);

    ok("as opções de hierarquia vêm preenchidas", h1.hierarquias1.length >= 2, `${h1.hierarquias1}`);
    ok("as contas vêm preenchidas", h1.contasDisponiveis.length === 1);

    const porConta = await buscarEstoqueFull(U1, { ...BASE, contas: ["acc-u1"] });
    ok("filtro de conta", porConta.total === 6, `${porConta.total}`);
  }

  console.log("\n12. Ordenação e paginação estável");
  {
    const desc = await buscarEstoqueFull(U1, { ...BASE, ordem: "aptas", direcao: "desc" });
    ok("aptas desc começa em G (90)", desc.linhas[0].inventoryId === "INV-G", desc.linhas[0].inventoryId);

    const asc = await buscarEstoqueFull(U1, { ...BASE, ordem: "aptas", direcao: "asc" });
    ok("aptas asc começa no esgotado", asc.linhas[0].inventoryId === "INV-Z", asc.linhas[0].inventoryId);

    const cob = await buscarEstoqueFull(U1, { ...BASE, ordem: "cobertura", direcao: "asc" });
    // `NULLS LAST` mesmo em ASC: cobertura nula é "sem vendas" e não deve
    // encabeçar a lista de quem está mais perto de acabar.
    ok("cobertura asc começa no P (6 dias)", cob.linhas[0].inventoryId === "INV-P", cob.linhas[0].inventoryId);
    ok("os sem cobertura vão para o fim", cob.linhas[cob.linhas.length - 1].cobertura === null);

    // Paginação estável: duas linhas empatadas em aptas não podem trocar de
    // página entre carregamentos, por isso o desempate por inventory_id.
    const p1 = await buscarEstoqueFull(U1, { ...BASE, porPagina: 2, pagina: 1 });
    const p2 = await buscarEstoqueFull(U1, { ...BASE, porPagina: 2, pagina: 2 });
    const p1b = await buscarEstoqueFull(U1, { ...BASE, porPagina: 2, pagina: 1 });
    ok("2 por página", p1.linhas.length === 2 && p2.linhas.length === 2);
    ok("3 páginas", p1.totalPaginas === 3, `${p1.totalPaginas}`);
    ok("sem sobreposição entre páginas",
      !p1.linhas.some((a) => p2.linhas.some((b) => b.inventoryId === a.inventoryId)));
    ok("mesma página duas vezes dá o mesmo resultado",
      p1.linhas.map((l) => l.inventoryId).join() === p1b.linhas.map((l) => l.inventoryId).join());

    const alem = await buscarEstoqueFull(U1, { ...BASE, porPagina: 2, pagina: 99 });
    ok("página além do fim volta para a última", alem.pagina === 3, `${alem.pagina}`);
  }

  console.log("\n13. 'Nunca sincronizou' é diferente de 'filtro vazio'");
  {
    // O u2 tem inventário, então filtro impossível dá vazio SEM dizer para
    // sincronizar. É o defeito do projeto irmão, que mostra a mesma mensagem nos
    // dois casos e manda sincronizar quando bastava limpar o filtro.
    const semResultado = await buscarEstoqueFull(U2, { ...BASE, busca: "xpto-nao-existe" });
    ok("filtro sem resultado: total 0", semResultado.total === 0);
    ok("mas NÃO é 'nunca sincronizou'", semResultado.nuncaSincronizou === false);
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
