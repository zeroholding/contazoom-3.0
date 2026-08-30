/**
 * Conferência das máscaras e validações de CPF, CNPJ, CEP e telefone.
 *
 * Roda com: node --experimental-strip-types scripts/test-documento.mjs
 *
 * O que está sendo testado é o dígito verificador, que é o ponto onde a
 * validação de verdade acontece: qualquer checagem de tamanho aceita
 * "111.111.111-11". Os números válidos abaixo são de teste, não pertencem a
 * ninguém, e foram escolhidos por terem DV correto.
 */

import assert from "node:assert/strict";
import {
  aplicarMascara,
  cepValido,
  cnpjValido,
  cpfParcial,
  cpfValido,
  digitosFaltando,
  documentoValido,
  erroDocumento,
  formatarCep,
  formatarCnpj,
  formatarCpf,
  formatarTelefone,
  limparInscricao,
  mascaraCep,
  mascaraCnpj,
  mascaraCpf,
  mascaraTelefone,
  somenteDigitos,
  telefoneValido,
} from "../src/lib/documento.ts";

let checagens = 0;
function conferir(descricao, real, esperado) {
  assert.deepEqual(real, esperado, `${descricao}: ${JSON.stringify(real)} != ${JSON.stringify(esperado)}`);
  checagens += 1;
}

/* ------------------------------- Dígitos --------------------------------- */

conferir("digitos limpa máscara", somenteDigitos("12.345.678/0001-95"), "12345678000195");
conferir("digitos de nulo", somenteDigitos(null), "");
conferir("digitos de undefined", somenteDigitos(undefined), "");

/* --------------------------------- CNPJ ---------------------------------- */

conferir("cnpj válido sem máscara", cnpjValido("11222333000181"), true);
conferir("cnpj válido com máscara", cnpjValido("11.222.333/0001-81"), true);
conferir("cnpj com DV errado", cnpjValido("11222333000182"), false);
conferir("cnpj todos iguais", cnpjValido("11111111111111"), false);
conferir("cnpj curto", cnpjValido("1122233300018"), false);
conferir("cnpj longo", cnpjValido("112223330001811"), false);
conferir("cnpj vazio", cnpjValido(""), false);
conferir("cnpj nulo", cnpjValido(null), false);

conferir("máscara cnpj parcial 2", mascaraCnpj("11"), "11");
conferir("máscara cnpj parcial 5", mascaraCnpj("11222"), "11.222");
conferir("máscara cnpj parcial 8", mascaraCnpj("11222333"), "11.222.333");
conferir("máscara cnpj parcial 12", mascaraCnpj("112223330001"), "11.222.333/0001");
conferir("máscara cnpj completa", mascaraCnpj("11222333000181"), "11.222.333/0001-81");
conferir("máscara cnpj corta excesso", mascaraCnpj("112223330001819999"), "11.222.333/0001-81");
conferir("máscara cnpj ignora letra", mascaraCnpj("11a222b333"), "11.222.333");
conferir("formata cnpj incompleto devolve entrada", formatarCnpj("112"), "112");
conferir("formata cnpj nulo", formatarCnpj(null), "");

/* ---------------------------------- CPF ---------------------------------- */

conferir("cpf válido sem máscara", cpfValido("52998224725"), true);
conferir("cpf válido com máscara", cpfValido("529.982.247-25"), true);
conferir("segundo cpf válido", cpfValido("11144477735"), true);
conferir("cpf com DV errado", cpfValido("52998224726"), false);
conferir("cpf todos iguais", cpfValido("11111111111"), false);
conferir("cpf curto", cpfValido("5299822472"), false);
conferir("cpf vazio", cpfValido(""), false);

conferir("máscara cpf parcial 3", mascaraCpf("529"), "529");
conferir("máscara cpf parcial 6", mascaraCpf("529982"), "529.982");
conferir("máscara cpf parcial 9", mascaraCpf("529982247"), "529.982.247");
conferir("máscara cpf completa", mascaraCpf("52998224725"), "529.982.247-25");
conferir("máscara cpf corta excesso", mascaraCpf("5299822472599"), "529.982.247-25");
conferir("formata cpf", formatarCpf("52998224725"), "529.982.247-25");
conferir("formata cpf incompleto", formatarCpf("529"), "529");
conferir("cpf parcial", cpfParcial("52998224725"), "529.***.**7-25");
conferir("cpf parcial incompleto", cpfParcial("529"), "529");

/* ---------------------------------- CEP ---------------------------------- */

conferir("cep válido", cepValido("01310930"), true);
conferir("cep válido com máscara", cepValido("01310-930"), true);
conferir("cep zerado", cepValido("00000000"), false);
conferir("cep curto", cepValido("0131093"), false);
conferir("máscara cep parcial", mascaraCep("01310"), "01310");
conferir("máscara cep completa", mascaraCep("01310930"), "01310-930");
conferir("máscara cep corta excesso", mascaraCep("013109309999"), "01310-930");
conferir("formata cep", formatarCep("01310930"), "01310-930");

/* -------------------------------- Telefone ------------------------------- */

conferir("celular válido", telefoneValido("11987654321"), true);
conferir("fixo válido", telefoneValido("1132654321"), true);
conferir("celular com máscara", telefoneValido("(11) 98765-4321"), true);
conferir("ddd inválido", telefoneValido("01987654321"), false);
conferir("ddd 10 inválido", telefoneValido("10987654321"), false);
conferir("celular sem o 9", telefoneValido("11887654321"), false);
conferir("telefone curto", telefoneValido("119876543"), false);
conferir("telefone longo", telefoneValido("119876543210"), false);

conferir("máscara telefone vazia", mascaraTelefone(""), "");
conferir("máscara telefone 2", mascaraTelefone("11"), "(11");
conferir("máscara telefone 6", mascaraTelefone("113265"), "(11) 3265");
conferir("máscara telefone fixo", mascaraTelefone("1132654321"), "(11) 3265-4321");
conferir("máscara telefone celular", mascaraTelefone("11987654321"), "(11) 98765-4321");
conferir("máscara telefone corta excesso", mascaraTelefone("119876543219999"), "(11) 98765-4321");
conferir("formata telefone", formatarTelefone("11987654321"), "(11) 98765-4321");
conferir("formata telefone incompleto", formatarTelefone("119"), "119");

/* ------------------------------- Inscrição ------------------------------- */

conferir("inscrição limpa espaço", limparInscricao("123 456 789 012"), "123456789012");
conferir("inscrição preserva ISENTO", limparInscricao("isento"), "ISENTO");
conferir("inscrição preserva pontuação", limparInscricao("123.456.789/012"), "123.456.789/012");
conferir("inscrição tira símbolo", limparInscricao("123#456@789"), "123456789");

/* -------------------------------- Genérico ------------------------------- */

conferir("aplicarMascara cpf", aplicarMascara("cpf", "52998224725"), "529.982.247-25");
conferir("aplicarMascara cnpj", aplicarMascara("cnpj", "11222333000181"), "11.222.333/0001-81");
conferir("aplicarMascara cep", aplicarMascara("cep", "01310930"), "01310-930");
conferir("aplicarMascara telefone", aplicarMascara("telefone", "11987654321"), "(11) 98765-4321");

conferir("documentoValido cpf", documentoValido("cpf", "529.982.247-25"), true);
conferir("documentoValido cnpj falso", documentoValido("cnpj", "11222333000182"), false);

conferir("faltando cpf", digitosFaltando("cpf", "529"), 8);
conferir("faltando cpf zero", digitosFaltando("cpf", "52998224725"), 0);
conferir("faltando cnpj", digitosFaltando("cnpj", "11222"), 9);
conferir("faltando cep", digitosFaltando("cep", "013"), 5);
// Telefone aceita 10 ou 11: com 5 dígitos faltam 5 para fechar o fixo.
conferir("faltando telefone fixo", digitosFaltando("telefone", "11326"), 5);
// Com 10 já fechou o fixo, então nada falta.
conferir("faltando telefone completo", digitosFaltando("telefone", "1132654321"), 0);

/* --------------------------------- Erros --------------------------------- */

conferir("erro vazio opcional", erroDocumento("cpf", ""), null);
conferir(
  "erro vazio obrigatório",
  erroDocumento("cpf", "", { obrigatorio: true }),
  "Informe o CPF."
);
conferir(
  "erro incompleto plural",
  erroDocumento("cpf", "529"),
  "CPF incompleto: faltam 8 dígitos."
);
conferir(
  "erro incompleto singular",
  erroDocumento("cpf", "5299822472"),
  "CPF incompleto: falta 1 dígito."
);
conferir(
  "erro DV cpf",
  erroDocumento("cpf", "52998224726"),
  "CPF inválido: o dígito verificador não confere. Confira a digitação."
);
conferir(
  "erro DV cnpj",
  erroDocumento("cnpj", "11222333000182"),
  "CNPJ inválido: o dígito verificador não confere. Confira a digitação."
);
conferir(
  "erro telefone",
  erroDocumento("telefone", "01987654321"),
  "Telefone inválido. Informe DDD e número (celular começa com 9)."
);
conferir("erro cep zerado", erroDocumento("cep", "00000000"), "CEP inválido.");
conferir("erro cpf válido", erroDocumento("cpf", "529.982.247-25"), null);
conferir("erro rótulo personalizado", erroDocumento("cpf", "", { obrigatorio: true, rotulo: "CPF do sócio" }), "Informe o CPF do sócio.");

console.log(`OK — ${checagens} checagens de máscara e validação passaram.`);
