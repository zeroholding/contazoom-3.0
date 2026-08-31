/**
 * Protocolo legível e token de URL do formulário de abertura.
 *
 * SÃO DUAS COISAS DIFERENTES, e separá-las é a decisão que importa aqui.
 *
 * O PROTOCOLO é o que a pessoa lê no telefone para o comercial: "CZ-7H2KQ4".
 * Curto para ser ditado sem erro — e por ser curto, é adivinhável por tentativa.
 * Então ele NÃO abre nada: serve para achar o formulário na tela interna, e é o
 * que o cliente cita quando liga.
 *
 * O TOKEN é o segredo da URL de consulta (`/formulario/recibo/<token>`). Longo e
 * aleatório, porque quem tem o link vê CPF, endereço e telefone dos sócios. Um
 * link "não listado" só é privado enquanto for impossível de adivinhar.
 *
 * Se os dois fossem o mesmo campo, ou o protocolo ficaria impossível de ditar, ou
 * a URL ficaria trivial de varrer.
 *
 * SÓ SERVIDOR: importa `node:crypto`. `Math.random()` não serve para o token —
 * não é criptograficamente forte e é semeado de forma previsível.
 */

import { randomBytes, randomInt } from "node:crypto";

/**
 * Alfabeto do protocolo, sem caractere ambíguo.
 *
 * Fora: `0`/`O`, `1`/`I`/`L`, e `U` (que virou `V` em fonte com serifa mais de
 * uma vez). O protocolo existe para ser DITADO e ANOTADO À MÃO; um `0` que o
 * cliente escreve como `O` custa uma ligação e uma busca que não acha nada.
 */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Tamanho do protocolo: 30^6 ≈ 729 milhões de combinações. */
const TAMANHO_PROTOCOLO = 6;

/** 32 hex = 128 bits. Mesma ordem de grandeza de um UUID v4. */
const BYTES_TOKEN = 16;

export const PREFIXO_PROTOCOLO = "CZ-";

/**
 * Gera um protocolo. NÃO confere unicidade — quem chama confere no banco.
 *
 * `randomInt` do `node:crypto` e não `Math.random()`: aqui a colisão custa uma
 * tentativa a mais, mas usar duas fontes de aleatoriedade diferentes no mesmo
 * arquivo convida alguém a copiar a errada para o token.
 */
export function gerarProtocolo(): string {
  let saida = "";
  for (let i = 0; i < TAMANHO_PROTOCOLO; i++) {
    saida += ALFABETO[randomInt(ALFABETO.length)];
  }
  return `${PREFIXO_PROTOCOLO}${saida}`;
}

export function gerarToken(): string {
  return randomBytes(BYTES_TOKEN).toString("hex");
}

/**
 * Normaliza o que a pessoa digitou na busca por protocolo.
 *
 * Aceita "cz-7h2kq4", "7H2KQ4", "cz 7h2kq4" e devolve "CZ-7H2KQ4". Quem digita
 * está lendo de um papel ou de um print, e exigir o formato exato transforma a
 * busca em adivinhação.
 *
 * Também conserta os ambíguos na ENTRADA: se a pessoa escreveu `O` onde era `0`,
 * o alfabeto não tem `0`, então `O` só pode ter sido erro de leitura de um
 * caractere que existe. Traduzir aqui é o que faz a busca achar.
 */
export function normalizarProtocolo(valor: string): string {
  const limpo = (valor ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/^CZ/, "")
    // Ambíguos que não existem no alfabeto, mapeados para o que existe.
    .replace(/0/g, "O")
    .replace(/O/g, "Q")
    .replace(/[1IL]/g, "J")
    .replace(/U/g, "V");

  // `0` → `O` → `Q` acima é intencional em cadeia: `Q` está no alfabeto e `O`
  // não. Não é perfeito (quem escreveu Q de verdade também cai em Q), e é o
  // melhor possível sem pedir para a pessoa digitar de novo.
  return limpo ? `${PREFIXO_PROTOCOLO}${limpo.slice(0, TAMANHO_PROTOCOLO)}` : "";
}

/** O texto tem cara de protocolo? Para a busca decidir por qual campo procurar. */
export function pareceProtocolo(valor: string): boolean {
  const limpo = (valor ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const semPrefixo = limpo.replace(/^CZ/, "");
  return semPrefixo.length >= 4 && semPrefixo.length <= TAMANHO_PROTOCOLO;
}
