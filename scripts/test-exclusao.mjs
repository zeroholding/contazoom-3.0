/**
 * Conferência das regras de exclusão.
 *
 * Roda com: node --experimental-strip-types scripts/test-exclusao.mjs
 *
 * O que este teste protege, em ordem de importância:
 *
 * 1. `confirmacaoConfere` é a trava que impede apagar a empresa errada, e é
 *    executada NOS DOIS LADOS — servidor para decidir, cliente para habilitar o
 *    botão. Se as duas respostas discordassem, o operador veria o botão liberar e
 *    a rota recusar, sem nenhuma pista do motivo. Foi por isso que a função saiu
 *    de dentro do componente e virou módulo compartilhado: agora existe UMA
 *    implementação, e ela é testada aqui.
 *
 * 2. `validarMotivo` guarda o CHECK de `registro_exclusao`. Se ela aceitasse o
 *    que o banco recusa, a exclusão estouraria com erro de constraint no meio da
 *    transação em vez de devolver um 400 legível.
 *
 * 3. `textoContagens` é o texto que a pessoa lê antes de confirmar. Zero na lista
 *    esconde o número que importa.
 */

import assert from "node:assert/strict";
import {
  MOTIVO_MINIMO,
  confirmacaoConfere,
  normalizarConfirmacao,
  temContagem,
  textoContagens,
  validarMotivo,
} from "../src/lib/exclusao-regras.ts";

let checagens = 0;
function conferir(descricao, real, esperado) {
  assert.deepEqual(
    real,
    esperado,
    `${descricao}: ${JSON.stringify(real)} != ${JSON.stringify(esperado)}`
  );
  checagens += 1;
}

/* -------------------------------- Motivo --------------------------------- */

conferir("mínimo é 3", MOTIVO_MINIMO, 3);

conferir("motivo vazio", validarMotivo(""), {
  ok: false,
  erro: "Informe o motivo da exclusão.",
});
conferir("motivo só espaço", validarMotivo("   "), {
  ok: false,
  erro: "Informe o motivo da exclusão.",
});
conferir("motivo nulo", validarMotivo(null), {
  ok: false,
  erro: "Informe o motivo da exclusão.",
});
conferir("motivo undefined", validarMotivo(undefined), {
  ok: false,
  erro: "Informe o motivo da exclusão.",
});
conferir("motivo número", validarMotivo(123), {
  ok: false,
  erro: "Informe o motivo da exclusão.",
});
conferir("motivo objeto", validarMotivo({ motivo: "x" }), {
  ok: false,
  erro: "Informe o motivo da exclusão.",
});

// Ponto solto é o caso que o CHECK do banco recusa. Tem de virar 400 antes.
conferir("motivo de 1 caractere", validarMotivo("."), {
  ok: false,
  erro: "O motivo deve ter ao menos 3 caracteres.",
});
conferir("motivo de 2 caracteres", validarMotivo("ok"), {
  ok: false,
  erro: "O motivo deve ter ao menos 3 caracteres.",
});
// Espaço em volta não conta para o mínimo: " ab " tem 4 caracteres, mas 2 úteis.
conferir("motivo curto com espaço em volta", validarMotivo("  ab  "), {
  ok: false,
  erro: "O motivo deve ter ao menos 3 caracteres.",
});

conferir("motivo de 3 caracteres passa", validarMotivo("dup"), {
  ok: true,
  motivo: "dup",
});
conferir("motivo é aparado", validarMotivo("  cadastro duplicado  "), {
  ok: true,
  motivo: "cadastro duplicado",
});
conferir(
  "motivo longo passa",
  validarMotivo("cliente encerrou contrato em agosto"),
  { ok: true, motivo: "cliente encerrou contrato em agosto" }
);

/* ----------------------------- Normalização ------------------------------ */

conferir("normaliza caixa", normalizarConfirmacao("PADARIA XPTO"), "padaria xpto");
conferir("normaliza espaço em volta", normalizarConfirmacao("  xpto  "), "xpto");
conferir(
  "normaliza espaço duplo no meio",
  normalizarConfirmacao("padaria    do    xpto"),
  "padaria do xpto"
);
conferir(
  "normaliza tabulação e quebra de linha",
  normalizarConfirmacao("padaria\tdo\nxpto"),
  "padaria do xpto"
);
conferir("normaliza acento em caixa", normalizarConfirmacao("AÇÃO LTDA"), "ação ltda");

/* ---------------------------- Confirmação -------------------------------- */

const RAZAO = "Padaria do Xpto LTDA";

conferir("confere exato", confirmacaoConfere(RAZAO, RAZAO), true);
conferir(
  "confere minúsculo",
  confirmacaoConfere("padaria do xpto ltda", RAZAO),
  true
);
conferir(
  "confere maiúsculo",
  confirmacaoConfere("PADARIA DO XPTO LTDA", RAZAO),
  true
);
conferir(
  "confere com espaço em volta",
  confirmacaoConfere("   Padaria do Xpto LTDA   ", RAZAO),
  true
);
conferir(
  "confere com espaço duplo",
  confirmacaoConfere("Padaria  do   Xpto LTDA", RAZAO),
  true
);

// O que NÃO pode passar: é aqui que a trava trabalha.
conferir("recusa nome parecido", confirmacaoConfere("Padaria do Xpto", RAZAO), false);
conferir("recusa vazio", confirmacaoConfere("", RAZAO), false);
conferir("recusa só espaço", confirmacaoConfere("   ", RAZAO), false);
conferir("recusa nulo", confirmacaoConfere(null, RAZAO), false);
conferir("recusa undefined", confirmacaoConfere(undefined, RAZAO), false);
conferir("recusa número", confirmacaoConfere(123, RAZAO), false);
conferir("recusa objeto", confirmacaoConfere({}, RAZAO), false);
conferir(
  "recusa acento trocado",
  confirmacaoConfere("Padaria do Xptó LTDA", RAZAO),
  false
);
conferir(
  "recusa letra faltando",
  confirmacaoConfere("Padaria do Xpto LTD", RAZAO),
  false
);

/**
 * Esperado vazio recusa QUALQUER entrada, inclusive vazio.
 *
 * Sem esta guarda, uma empresa cadastrada com razão social em branco (ou um bug
 * que devolvesse `descricao: ""` na prévia) aceitaria confirmação vazia — e a
 * trava viraria enfeite justamente no caso em que ninguém está prestando atenção.
 */
conferir("esperado vazio recusa vazio", confirmacaoConfere("", ""), false);
conferir("esperado vazio recusa texto", confirmacaoConfere("qualquer", ""), false);
conferir("esperado só espaço recusa", confirmacaoConfere("  ", "   "), false);

/* ---------------------------- Texto do resumo ---------------------------- */

conferir("contagens vazias", textoContagens([]), "nenhum registro dependente");
conferir(
  "todas zero",
  textoContagens([
    { rotulo: "competências", quantidade: 0 },
    { rotulo: "anexos", quantidade: 0 },
  ]),
  "nenhum registro dependente"
);
conferir(
  "uma contagem",
  textoContagens([{ rotulo: "competência", quantidade: 1 }]),
  "1 competência"
);
conferir(
  "zeros ficam de fora",
  textoContagens([
    { rotulo: "competências", quantidade: 24 },
    { rotulo: "processos de legalização", quantidade: 0 },
    { rotulo: "etapas", quantidade: 251 },
    { rotulo: "registros de histórico", quantidade: 0 },
    { rotulo: "anexos", quantidade: 17 },
  ]),
  "24 competências, 251 etapas, 17 anexos"
);
// Negativo não deveria existir, mas se existir não entra no texto.
conferir(
  "negativo não entra",
  textoContagens([
    { rotulo: "etapas", quantidade: -3 },
    { rotulo: "anexos", quantidade: 2 },
  ]),
  "2 anexos"
);

conferir("temContagem vazio", temContagem([]), false);
conferir(
  "temContagem todas zero",
  temContagem([{ rotulo: "etapas", quantidade: 0 }]),
  false
);
conferir(
  "temContagem com uma",
  temContagem([
    { rotulo: "etapas", quantidade: 0 },
    { rotulo: "anexos", quantidade: 1 },
  ]),
  true
);

console.log(`OK — ${checagens} checagens das regras de exclusão passaram.`);
