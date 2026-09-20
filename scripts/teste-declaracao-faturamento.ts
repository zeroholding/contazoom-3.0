/** Teste puro da janela de declaração. Sem banco, servidor ou rede. */

import {
  ErroDeclaracaoFaturamento,
  construirPeriodo,
  hashConteudo,
  jsonCanonico,
} from "../src/lib/declaracao-faturamento";

let falhas = 0;
let checks = 0;
const check = (nome: string, condicao: boolean, detalhe = "") => {
  checks += 1;
  if (condicao) console.log(`  ok   ${nome}`);
  else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
};

function codigo(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (erro) {
    return erro instanceof ErroDeclaracaoFaturamento ? erro.code : String(erro);
  }
}

console.log("\nDeclaração de 12 meses");

const agosto = construirPeriodo("2026-08");
check("tem exatamente 12 competências", agosto.length === 12, String(agosto.length));
check("começa em setembro/2025", agosto[0]?.chave === "2025-09", agosto[0]?.chave);
check("termina em agosto/2026", agosto[11]?.chave === "2026-08", agosto[11]?.chave);
check("rótulo inicial em português", agosto[0]?.label === "Setembro/2025", agosto[0]?.label);
check("rótulo final em português", agosto[11]?.label === "Agosto/2026", agosto[11]?.label);

const janeiro = construirPeriodo("2026-01");
check("atravessa o ano sem pular dezembro", janeiro[10]?.chave === "2025-12");
check("mantém janeiro como último mês", janeiro[11]?.chave === "2026-01");

for (let indice = 1; indice < agosto.length; indice += 1) {
  const anterior = agosto[indice - 1];
  const atual = agosto[indice];
  const a = anterior.ano * 12 + anterior.mes;
  const b = atual.ano * 12 + atual.mes;
  check(`mês ${indice + 1} é contíguo`, b - a === 1, `${anterior.chave} -> ${atual.chave}`);
}

check("recusa formato MM/AAAA", codigo(() => construirPeriodo("08/2026")) === "PERIODO_INVALIDO");
check("recusa mês 13", codigo(() => construirPeriodo("2026-13")) === "PERIODO_INVALIDO");
check("recusa janela vazia", codigo(() => construirPeriodo("2026-08", 0)) === "PERIODO_INVALIDO");
check("recusa mais de 24 meses", codigo(() => construirPeriodo("2026-08", 25)) === "PERIODO_INVALIDO");

console.log("\nHash canônico do snapshot");
const ordemA = { z: 1, linhas: [{ mes: 8, ano: 2026, valor: "10.00" }], a: null };
const ordemB = { a: null, linhas: [{ valor: "10.00", ano: 2026, mes: 8 }], z: 1 };
check("ordem de chaves não muda o JSON canônico", jsonCanonico(ordemA) === jsonCanonico(ordemB));
check("ordem de chaves não muda o SHA-256", hashConteudo(ordemA) === hashConteudo(ordemB));
check(
  "alterar um valor muda o hash",
  hashConteudo(ordemA) !== hashConteudo({ ...ordemB, z: 2 }),
);

console.log(`\n${falhas === 0 ? `TUDO OK — ${checks} checks` : `${falhas} FALHA(S) em ${checks} checks`}`);
process.exitCode = falhas === 0 ? 0 : 1;
