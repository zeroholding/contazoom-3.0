/**
 * Confere o SQL que a fila de Expedição gera — SEM banco.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE TESTE EXISTE
 *
 * `expedicao-data.ts` monta SQL grande por concatenação de fragmentos, e os erros
 * dessa montagem NÃO aparecem em `tsc` nem em `eslint`: o tipo continua certo, a
 * string continua string, e o defeito só se revela como erro do Postgres na cara de
 * quem abriu a tela. Já aconteceu três vezes:
 *
 *   1. `ERROR 42702 column reference "itens" is ambiguous` — duas colunas com o
 *      mesmo alias na CTE `pacotes`. Derrubou a fila inteira.
 *   2. `Prisma.raw(...)` interpolado DENTRO de outro `Prisma.raw(...)`: o objeto
 *      `Sql` virou o literal "[object Object]" no meio do JOIN.
 *   3. Parêntese sobrando ao editar fragmento aninhado.
 *
 * Os três são detectáveis lendo o SQL final, e é o que este arquivo faz: um stub do
 * Prisma captura o texto das consultas e as regras abaixo olham para ele. Nada de
 * conexão, nada de token.
 *
 * Uso:
 *   npx tsx scripts/teste-sql-expedicao.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* O stub tem de existir ANTES do import: `src/lib/prisma.ts` faz
   `global.prisma ?? new PrismaClient()`, e sem isto ele tenta abrir conexão. */
const capturado: { sql: string }[] = [];

function texto(arg: unknown): string {
  if (typeof arg === "string") return arg;
  const o = arg as { text?: string; sql?: string; strings?: string[] };
  if (typeof o?.text === "string") return o.text;
  if (typeof o?.sql === "string") return o.sql;
  if (Array.isArray(o?.strings)) return o.strings.join(" $ ");
  return String(arg);
}

const registra = (arg: unknown) => {
  capturado.push({ sql: texto(arg) });
};

(globalThis as Record<string, unknown>).prisma = {
  $queryRaw: (arg: unknown) => {
    registra(arg);
    return Promise.resolve([]);
  },
  $queryRawUnsafe: (arg: unknown) => {
    registra(arg);
    return Promise.resolve([]);
  },
  $executeRawUnsafe: (arg: unknown) => {
    registra(arg);
    return Promise.resolve(0);
  },
  meliVenda: { count: async () => 0 },
  shopeeVenda: { count: async () => 0 },
  sku: { findMany: async () => [] },
};

let falhas = 0;
function confere(rotulo: string, ok: boolean, detalhe = "") {
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok  " : "FALHA"} ${rotulo}${detalhe ? ` -> ${detalhe}` : ""}`);
}

/** Comentário `--` fora. O texto deles cita nomes de coluna e confundiria as regras. */
const semComentario = (s: string) => s.replace(/--[^\n]*/g, " ");

/** Achata parênteses de dentro para fora: sobra só o nível externo do SELECT. */
function nivelDeFora(s: string): string {
  let raso = s;
  for (let i = 0; i < 100 && /\([^()]*\)/.test(raso); i++) {
    raso = raso.replace(/\([^()]*\)/g, " ");
  }
  return raso;
}

/** Cada `nome AS ( ... )` do SQL, com o corpo delimitado por contagem de parênteses. */
function blocosDeCte(sql: string): { nome: string; corpo: string }[] {
  const blocos: { nome: string; corpo: string }[] = [];
  const re = /(\w+)\s+AS\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const inicio = re.lastIndex;
    let profundidade = 1;
    let j = inicio;
    while (j < sql.length && profundidade > 0) {
      if (sql[j] === "(") profundidade++;
      else if (sql[j] === ")") profundidade--;
      j++;
    }
    blocos.push({ nome: m[1], corpo: sql.slice(inicio, j - 1) });
    re.lastIndex = inicio; // continua de dentro: CTE aninhada também conta.
  }
  return blocos;
}

async function main() {
  const { buscarExpedicao } = await import("../src/lib/expedicao-data");
  const { FILTROS_PADRAO } = await import("../src/lib/expedicao");

  try {
    await buscarExpedicao("user-1", { ...FILTROS_PADRAO });
  } catch {
    // Esperado: o stub devolve listas vazias e o montador da resposta reclama. O
    // que interessa já foi capturado.
  }

  capturado.forEach((c) => (c.sql = semComentario(c.sql)));
  const todo = capturado.map((c) => c.sql).join("\n;\n");

  console.log(`\nconsultas capturadas: ${capturado.length}\n`);
  confere("a tela gera consulta", capturado.length > 0, `${capturado.length}`);

  /* 1. Nenhum "[object Object]": Sql interpolado dentro de Prisma.raw. */
  confere("nenhum [object Object] no SQL", !/\[object Object\]/.test(todo));

  /* 2. As laterais de item só rodam onde podem revelar mais de um produto.
        `ON TRUE` lê o TOAST de `raw_data` em TODA venda da janela, e a fila levava
        minutos. Ver SO_SE_PUDER_TER_MAIS_DE_UM em expedicao-data.ts. */
  const comCondicao = (todo.match(/\)\s*it\s+ON\s+v\.quantidade\s*>\s*1/gi) ?? []).length;
  confere("lateral de item condicionada", comCondicao >= 2, `${comCondicao} ocorrências`);
  confere("nenhuma lateral em ON TRUE", !/\)\s*it\s+ON\s+TRUE/i.test(todo));

  /* 3. A reserva da lateral: sem ela, pedido de um item ficaria sem título. */
  confere("COALESCE(it.titulo, v.titulo)", /COALESCE\(it\.titulo,\s*v\.titulo\)/i.test(todo));
  confere("COALESCE(it.item_id, v.item_id)", /COALESCE\(it\.item_id,\s*v\.item_id\)/i.test(todo));

  /* 4. Parênteses balanceados em cada consulta. */
  let desbalanceadas = 0;
  capturado.forEach((c, i) => {
    let saldo = 0;
    for (const ch of c.sql) {
      if (ch === "(") saldo++;
      else if (ch === ")") saldo--;
    }
    if (saldo !== 0) {
      desbalanceadas++;
      console.log(`  FALHA parênteses na consulta ${i + 1}: saldo ${saldo}`);
    }
  });
  confere("parênteses balanceados em todas", desbalanceadas === 0);

  /* 5. Alias repetido no MESMO bloco de CTE — o erro 42702.
        Ramos de UNION ALL são contados separados: repetir alias entre eles é
        OBRIGATÓRIO, porque o Postgres casa as colunas por posição. */
  let repetidos = 0;
  let blocos = 0;
  capturado.forEach((c, i) => {
    for (const b of blocosDeCte(c.sql)) {
      blocos++;
      for (const ramo of b.corpo.split(/\bUNION\s+ALL\b/i)) {
        const vistos = new Set<string>();
        for (const x of nivelDeFora(ramo).matchAll(/\bAS\s+([a-z_][a-z0-9_]*)\b/gi)) {
          const nome = x[1].toLowerCase();
          if (vistos.has(nome)) {
            repetidos++;
            console.log(`  FALHA alias "${nome}" repetido na CTE ${b.nome} (consulta ${i + 1})`);
          }
          vistos.add(nome);
        }
      }
    }
  });
  confere(`nenhum alias repetido (${blocos} blocos de CTE)`, repetidos === 0);

  console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM.\n" : `\n${falhas} FALHA(S).\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

void main();
