/**
 * Conferência do calendário de dias úteis.
 *
 * Roda com: node --experimental-strip-types scripts/test-dias-uteis.mjs
 *
 * Existe porque feriado móvel é a única parte do módulo de tarefas que erra em
 * silêncio: a conta de Páscoa pode estar errada por anos sem ninguém notar, até
 * um prazo de abril fechar um dia adiantado. As datas de referência abaixo são
 * as oficiais de Páscoa (calendário gregoriano) para 2024 a 2030.
 */

import assert from "node:assert/strict";
import {
  contagemPrazo,
  diasCorridosEntre,
  diasUteisEntre,
  domingoDePascoa,
  ehDiaUtil,
  ehFeriado,
  textoContagemCurto,
  textoContagemPrazo,
} from "../src/lib/dias-uteis.ts";

const dia = (texto) => new Date(`${texto}T00:00:00.000Z`);
const iso = (data) => data.toISOString().slice(0, 10);

let checagens = 0;
function conferir(descricao, real, esperado) {
  assert.deepEqual(real, esperado, `${descricao}: ${real} != ${esperado}`);
  checagens += 1;
}

/* ------------------------------- Páscoa ---------------------------------- */

const PASCOA = {
  2024: "2024-03-31",
  2025: "2025-04-20",
  2026: "2026-04-05",
  2027: "2027-03-28",
  2028: "2028-04-16",
  2029: "2029-04-01",
  2030: "2030-04-21",
};

for (const [ano, esperado] of Object.entries(PASCOA)) {
  conferir(`Páscoa de ${ano}`, iso(domingoDePascoa(Number(ano))), esperado);
}

/* ------------------------------ Feriados --------------------------------- */

// Fixos de 2026.
for (const data of [
  "2026-01-01",
  "2026-04-21",
  "2026-05-01",
  "2026-09-07",
  "2026-10-12",
  "2026-11-02",
  "2026-11-15",
  "2026-11-20",
  "2026-12-25",
]) {
  conferir(`feriado fixo ${data}`, ehFeriado(dia(data)), true);
}

// Móveis de 2026, derivados da Páscoa em 05/04/2026.
conferir("carnaval segunda 2026", ehFeriado(dia("2026-02-16")), true);
conferir("carnaval terça 2026", ehFeriado(dia("2026-02-17")), true);
conferir("sexta-feira santa 2026", ehFeriado(dia("2026-04-03")), true);
conferir("corpus christi 2026", ehFeriado(dia("2026-06-04")), true);

// Móveis de 2027, para provar que a conta acompanha o ano.
conferir("carnaval terça 2027", ehFeriado(dia("2027-02-09")), true);
conferir("sexta-feira santa 2027", ehFeriado(dia("2027-03-26")), true);
conferir("corpus christi 2027", ehFeriado(dia("2027-05-27")), true);

// Dias comuns não são feriado.
conferir("dia comum não é feriado", ehFeriado(dia("2026-09-15")), false);
conferir("quarta de cinzas é dia útil", ehDiaUtil(dia("2026-02-18")), true);

/* ----------------------------- Fim de semana ----------------------------- */

conferir("sábado não é útil", ehDiaUtil(dia("2026-09-12")), false);
conferir("domingo não é útil", ehDiaUtil(dia("2026-09-13")), false);
conferir("segunda é útil", ehDiaUtil(dia("2026-09-14")), true);
conferir("natal não é útil", ehDiaUtil(dia("2026-12-25")), false);

/* --------------------------- Contagem de dias ---------------------------- */

// 14/09/2026 é segunda. Até sexta 18/09 são 4 dias úteis (ter, qua, qui, sex).
conferir("segunda -> sexta", diasUteisEntre(dia("2026-09-14"), dia("2026-09-18")), 4);
conferir("segunda -> sexta corridos", diasCorridosEntre(dia("2026-09-14"), dia("2026-09-18")), 4);

// Atravessando o fim de semana: segunda 14 até segunda 21 são 5 dias úteis.
conferir("segunda -> segunda", diasUteisEntre(dia("2026-09-14"), dia("2026-09-21")), 5);
conferir("segunda -> segunda corridos", diasCorridosEntre(dia("2026-09-14"), dia("2026-09-21")), 7);

// Mesmo dia é zero nas duas contagens.
conferir("mesmo dia útil", diasUteisEntre(dia("2026-09-14"), dia("2026-09-14")), 0);
conferir("mesmo dia corrido", diasCorridosEntre(dia("2026-09-14"), dia("2026-09-14")), 0);

// Feriado no meio derruba a contagem de úteis, não a de corridos.
// 05/11/2026 (quinta) até 17/11 (terça): 12 dias corridos. Fora: sáb 7, dom 8,
// sáb 14, dom 15, e os feriados 15/11 (que é domingo, já fora) e 20/11 (depois).
// Úteis: 6,9,10,11,12,13,16,17 = 8.
conferir("com feriado", diasUteisEntre(dia("2026-11-05"), dia("2026-11-17")), 8);
conferir("com feriado corridos", diasCorridosEntre(dia("2026-11-05"), dia("2026-11-17")), 12);

// Retroceder devolve negativo.
conferir("prazo passado útil", diasUteisEntre(dia("2026-09-18"), dia("2026-09-14")), -4);
conferir("prazo passado corrido", diasCorridosEntre(dia("2026-09-18"), dia("2026-09-14")), -4);

/* ---------------------------- Contagem do card --------------------------- */

const hoje = dia("2026-09-14");

conferir("sem prazo", contagemPrazo(null, false, hoje), null);
conferir("concluído não conta", contagemPrazo(dia("2026-09-18"), true, hoje), null);
conferir("data inválida", contagemPrazo("não é data", false, hoje), null);

conferir("no prazo", contagemPrazo(dia("2026-09-18"), false, hoje), {
  corridos: 4,
  uteis: 4,
  hoje: false,
  atrasado: false,
});

conferir("prazo hoje", contagemPrazo(dia("2026-09-14"), false, hoje), {
  corridos: 0,
  uteis: 0,
  hoje: true,
  atrasado: false,
});

conferir("atrasado", contagemPrazo(dia("2026-09-09"), false, hoje), {
  corridos: -5,
  uteis: -3,
  hoje: false,
  atrasado: true,
});

// Prazo em string ISO, que é como chega da API.
conferir("prazo em string", contagemPrazo("2026-09-18T00:00:00.000Z", false, hoje), {
  corridos: 4,
  uteis: 4,
  hoje: false,
  atrasado: false,
});

/* -------------------------------- Textos --------------------------------- */

conferir(
  "texto no prazo",
  textoContagemPrazo(contagemPrazo(dia("2026-09-18"), false, hoje)),
  "Faltam 4 dias úteis · 4 corridos"
);
conferir(
  "texto singular",
  textoContagemPrazo(contagemPrazo(dia("2026-09-15"), false, hoje)),
  "Faltam 1 dia útil · 1 corrido"
);
conferir(
  "texto hoje",
  textoContagemPrazo(contagemPrazo(dia("2026-09-14"), false, hoje)),
  "O prazo é hoje"
);
conferir(
  "texto atraso",
  textoContagemPrazo(contagemPrazo(dia("2026-09-09"), false, hoje)),
  "Atrasado há 5 dias · 3 dias úteis"
);
conferir("texto sem prazo", textoContagemPrazo(null), null);

conferir(
  "texto curto",
  textoContagemCurto(contagemPrazo(dia("2026-09-18"), false, hoje)),
  "4 úteis · 4 corridos"
);
conferir(
  "texto curto atraso",
  textoContagemCurto(contagemPrazo(dia("2026-09-09"), false, hoje)),
  "3 úteis · 5 corridos de atraso"
);
conferir(
  "texto curto hoje",
  textoContagemCurto(contagemPrazo(dia("2026-09-14"), false, hoje)),
  "Prazo hoje"
);

/* ------------------------------- Robustez -------------------------------- */

// Data absurda não trava o laço: o teto de 3660 iterações devolve um número
// grande em vez de pendurar a renderização.
const absurdo = diasUteisEntre(dia("2026-09-14"), dia("2099-01-01"));
assert.ok(absurdo > 0 && absurdo <= 3660, `teto do laço: ${absurdo}`);
checagens += 1;

console.log(`OK — ${checagens} checagens do calendário de dias úteis passaram.`);
