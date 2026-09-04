/**
 * Prova as DUAS telas de anúncios por HTTP, contra o banco descartável.
 *
 * O teste de `teste-anuncios.ts` cobre a agregação e o backfill em JVM/Node
 * direto. Este cobre o que aquele não alcança: a rota `/api/anuncios` com auth
 * de verdade, os parâmetros que cada tela manda, e o HTML renderizado das duas
 * páginas — inclusive o menu, que precisa mostrar as duas entradas.
 *
 * Uso:
 *   $env:JWT_SECRET='...'
 *   node scripts/teste-anuncios-telas.mjs http://localhost:3500
 */

const BASE = process.argv[2] || "http://localhost:3500";
const USUARIO = process.env.USUARIO_TESTE || "user-teste-1";

let passou = 0;
let falhou = 0;

function ok(rotulo, condicao, detalhe = "") {
  if (condicao) {
    passou += 1;
    console.log(`  OK    ${rotulo}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${rotulo}${detalhe ? ` :: ${detalhe}` : ""}`);
  }
}

function texto(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ");
}

let cookie = "";

async function main() {
  console.log(`\nTelas de anúncios em ${BASE}\n`);

  const { SignJWT } = await import("jose");
  const token = await new SignJWT({ sub: USUARIO, email: "teste1@exemplo.com", name: "Teste" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  cookie = `session=${token}`;

  const api = async (query) => {
    const r = await fetch(`${BASE}/api/anuncios${query}`, { headers: { cookie } });
    return { status: r.status, json: r.ok ? await r.json() : null };
  };
  const pagina = async (rota) => {
    const r = await fetch(`${BASE}${rota}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, destino: r.headers.get("location"), html: await r.text() };
  };

  console.log("1. A rota exige sessão");
  {
    const r = await fetch(`${BASE}/api/anuncios?modo=mortos`, { redirect: "manual" });
    ok("sem cookie devolve 401", r.status === 401, `veio ${r.status}`);
  }

  console.log("\n2. API — Mais Vendidos (o que a tela 1 manda)");
  {
    const { status, json } = await api(
      "?modo=mais_vendidos&janelaDias=0&ordem=unidades_desc&pagina=1&porPagina=20",
    );
    ok("HTTP 200", status === 200, `veio ${status}`);
    ok("dois anúncios", json?.total === 2, `${json?.total}`);
    ok("ordenado por unidades", json?.linhas?.[0]?.itemId === "MLB9999888877", json?.linhas?.[0]?.itemId);
    ok("45 unidades no campeão de faturamento",
      json?.linhas?.some((l) => l.itemId === "MLB4321098765" && l.unidades === 45));
    // Sem token de ML válido no ambiente de teste, o estoque tem de vir null —
    // e null NÃO pode virar 0, senão a tela afirma "esgotado" sem saber.
    ok("estoque null (API do ML indisponível), nunca 0",
      json?.linhas?.every((l) => l.estoque === null));
    ok("resumo declara escopo de página", json?.resumo?.escopoEstoque === "pagina");
  }

  console.log("\n3. API — Mortos (o que a tela 2 manda)");
  {
    const { status, json } = await api(
      "?modo=mortos&janelaDias=0&diasSemVenda=90&minUnidades=10&minFaturamento=1000&ordem=faturamento_desc&pagina=1&porPagina=20",
    );
    ok("HTTP 200", status === 200, `veio ${status}`);
    ok("só o anúncio parado", json?.total === 1, `${json?.total}`);
    ok("é o colchonete", json?.linhas?.[0]?.itemId === "MLB9999888877");
    ok("parado há mais de 90 dias", (json?.linhas?.[0]?.diasSemVenda ?? 0) > 90);
    ok("média de tempo parado calculada", (json?.resumo?.mediaHoras ?? 0) > 0);
    ok("o campeão não aparece aqui",
      !json?.linhas?.some((l) => l.itemId === "MLB4321098765"));
  }

  console.log("\n4. Os dois mínimos são OU, não E");
  {
    const so = await api(
      "?modo=mortos&janelaDias=0&diasSemVenda=90&minUnidades=99999&minFaturamento=100&ordem=faturamento_desc",
    );
    ok("faturamento sozinho qualifica", so.json?.total === 1, `${so.json?.total}`);

    const nada = await api(
      "?modo=mortos&janelaDias=0&diasSemVenda=90&minUnidades=99999&minFaturamento=9999999",
    );
    ok("nenhum dos dois, nada passa", nada.json?.total === 0, `${nada.json?.total}`);
  }

  console.log("\n5. Isolamento entre usuários pela rota");
  {
    const outro = await new SignJWT({ sub: "user-teste-2" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const r = await fetch(`${BASE}/api/anuncios?modo=mais_vendidos&janelaDias=0`, {
      headers: { cookie: `session=${outro}` },
    });
    const j = await r.json();
    // O vizinho tem UMA venda, no MESMO MLB do campeão do usuário 1.
    ok("o vizinho vê só o dele", j?.total === 1, `${j?.total}`);
    ok("com os números dele (50 un.)", j?.linhas?.[0]?.unidades === 50, `${j?.linhas?.[0]?.unidades}`);
  }

  // ATENÇÃO AO ESCOPO DAS SEÇÕES 6 E 7.
  //
  // As telas do CONTAZOOM são Client Components que buscam os dados num
  // `useEffect` (padrão do projeto, ver `TopProdutosFaturamento.tsx`). Então o
  // HTML que o servidor devolve tem a MOLDURA — título, filtros, cabeçalho de
  // tabela estático, menu — e não tem linha de dado nenhuma: elas só existem
  // depois de o JavaScript rodar e a API responder.
  //
  // Por isso aqui se afirma só o que é server-rendered. Os dados das duas telas
  // estão provados nas seções 2 a 5, que batem direto na rota que as telas
  // consomem. Afirmar "o anúncio X aparece na tabela" contra este HTML falharia
  // sempre, e por um motivo que não tem nada a ver com a tela estar correta.

  console.log("\n6. Tela 1: a moldura certa, e nada da outra tela");
  {
    const { status, html } = await pagina("/anuncios/mais-vendidos");
    const t = texto(html);
    ok("HTTP 200", status === 200, `veio ${status}`);
    ok("título próprio", t.includes("Anúncios Mais Vendidos"));
    ok("descrição fala de cobertura", t.includes("quantos dias o estoque atual aguenta"));
    ok("filtro de período", t.includes("Últimos 30 dias"));
    ok("ordena por unidades", t.includes("Mais unidades vendidas"));
    ok("filtro de estoque", t.includes("Esgotado"));
    // O que é exclusivo da outra tela não pode ter vazado para cá.
    ok("sem os mínimos de relevância", !t.includes("Vendia ao menos"));
    ok("sem os recortes por motivo", !t.includes("Todos os parados"));
  }

  console.log("\n7. Tela 2: a moldura certa, e nada da outra tela");
  {
    const { status, html } = await pagina("/anuncios/mortos");
    const t = texto(html);
    ok("HTTP 200", status === 200, `veio ${status}`);
    ok("título próprio", t.includes("Anúncios Mortos"));
    ok("descrição separa reposição de anúncio",
      t.includes("problema de reposição") && t.includes("problema do anúncio"));
    ok("os três recortes por motivo",
      t.includes("Todos os parados") && t.includes("Com estoque") && t.includes("Sem estoque"));
    ok("mínimos de relevância", t.includes("Vendia ao menos"));
    ok("explica que os mínimos são OU", t.includes("dos dois mínimos"));
    ok("ordena por faturamento que parou", t.includes("Faturamento que parou"));
    // O que é exclusivo da tela 1 não pode ter vazado para cá.
    ok("sem filtro de período", !t.includes("Últimos 30 dias"));
    ok("sem menção a cobertura", !t.includes("Cobertura"));
  }

  console.log("\n8. /anuncios redireciona, não dá 404");
  {
    const { status, destino } = await pagina("/anuncios");
    ok("é redirecionamento", status >= 300 && status < 400, `veio ${status}`);
    ok("para mais-vendidos", (destino ?? "").includes("/anuncios/mais-vendidos"), `${destino}`);
  }

  console.log("\n9. O menu mostra as duas entradas");
  {
    const { html } = await pagina("/anuncios/mortos");
    const nav = html.match(/<nav[\s\S]*?<\/nav>/);
    const t = texto(nav ? nav[0] : "");
    const bruto = nav ? nav[0] : "";
    ok("grupo Gestão de Anúncios", t.includes("Gestão de Anúncios"));
    ok("entrada Mais Vendidos", t.includes("Anúncios Mais Vendidos"));
    ok("entrada Mortos", t.includes("Anúncios Mortos"));
    ok("os dois links existem",
      bruto.includes('href="/anuncios/mais-vendidos"') && bruto.includes('href="/anuncios/mortos"'));
    // A abertura automática do grupo é feita por `useEffect` + GSAP no cliente,
    // então no HTML do servidor `aria-expanded` é sempre "false". O que dá para
    // afirmar aqui é que o grupo existe como botão com submenu declarado.
    ok("o grupo é um botão com submenu", bruto.includes('aria-controls="submenu-ads"'));
  }

  console.log("\n10. Paginação e limites de parâmetro");
  {
    const p2 = await api("?modo=mais_vendidos&janelaDias=0&porPagina=1&pagina=2&ordem=unidades_desc");
    ok("página 2 com 1 por página", p2.json?.linhas?.length === 1);
    ok("total continua 2", p2.json?.total === 2);

    const alem = await api("?modo=mais_vendidos&janelaDias=0&porPagina=1&pagina=99");
    ok("página além do fim volta para a última", alem.json?.pagina === 2, `${alem.json?.pagina}`);

    // porPagina fora da lista aceita cai no padrão, não estoura.
    // Valor absurdo é LIMITADO ao teto, não recusado — e o teto é o que impede
    // alguém pedir 100 mil linhas numa resposta.
    const bobo = await api("?modo=mais_vendidos&janelaDias=0&porPagina=7777");
    ok("porPagina absurdo é limitado a 100", bobo.json?.filtros?.porPagina === 100, `${bobo.json?.filtros?.porPagina}`);

    // Valor fora do seletor da tela precisa ser RESPEITADO, não trocado em
    // silêncio: senão um link compartilhado abre diferente de como foi montado.
    const fora = await api("?modo=mais_vendidos&janelaDias=0&porPagina=25");
    ok("porPagina fora do seletor é respeitado", fora.json?.filtros?.porPagina === 25, `${fora.json?.filtros?.porPagina}`);

    const ordemBoba = await api("?modo=mais_vendidos&janelaDias=0&ordem=xpto");
    ok("ordem inválida não derruba", ordemBoba.status === 200);
  }

  console.log(`\n────────────────────────────\n${passou} passaram, ${falhou} falharam\n`);
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => {
  console.error("erro no teste:", e);
  process.exit(1);
});
