/**
 * Regras puras da exclusão: motivo, confirmação por digitação e texto de resumo.
 *
 * ARQUIVO SEM IMPORTS, e o motivo é concreto.
 *
 * `src/lib/exclusao.ts` importa `prisma`, então `ModalExclusao.tsx` — que é
 * `"use client"` — não pode importar de lá. A primeira versão resolveu copiando a
 * função de normalização para dentro do componente, e isso é uma armadilha: a
 * comparação da confirmação é feita NOS DOIS LADOS, e se as duas cópias
 * divergirem (uma apara espaço, a outra não) o botão da tela libera e o servidor
 * recusa — ou pior, o inverso. O operador leria isso como sistema quebrado, sem
 * nenhuma pista do porquê.
 *
 * Com as regras aqui, cliente e servidor comparam com a MESMA função, e
 * `scripts/test-exclusao.mjs` testa essa função uma vez.
 */

/* -------------------------------------------------------------------------- */
/*                                   Motivo                                   */
/* -------------------------------------------------------------------------- */

/**
 * Mínimo de caracteres do motivo.
 *
 * O banco exige o mesmo, por CHECK em `registro_exclusao`. Três é baixo de
 * propósito: a intenção não é obrigar redação, é impedir o campo vazio e o ponto
 * solto. Motivo é a única coisa que responde "por que isso não está mais aqui"
 * meses depois, quando o registro apagado não existe para ser consultado.
 */
export const MOTIVO_MINIMO = 3;

export type ResultadoMotivo =
  | { ok: true; motivo: string }
  | { ok: false; erro: string };

export function validarMotivo(valor: unknown): ResultadoMotivo {
  if (typeof valor !== "string" || !valor.trim()) {
    return { ok: false, erro: "Informe o motivo da exclusão." };
  }
  const motivo = valor.trim();
  if (motivo.length < MOTIVO_MINIMO) {
    return {
      ok: false,
      erro: `O motivo deve ter ao menos ${MOTIVO_MINIMO} caracteres.`,
    };
  }
  return { ok: true, motivo };
}

/* -------------------------------------------------------------------------- */
/*                          Confirmação por digitação                         */
/* -------------------------------------------------------------------------- */

/**
 * Normalização usada na comparação da confirmação.
 *
 * Ignora caixa e espaço em excesso. Recusar "padaria xpto" porque a razão social
 * está cadastrada em maiúsculas transformaria uma trava de segurança em ginástica
 * de digitação — e a pessoa acabaria copiando e colando o nome, o que anula todo
 * o propósito, que é obrigá-la a LER o nome do que está apagando.
 *
 * `toLocaleLowerCase("pt-BR")` e não `toLowerCase()`: a diferença aparece em
 * caractere acentuado e é de graça garantir a regra do idioma certo.
 */
export function normalizarConfirmacao(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

/**
 * O texto digitado corresponde ao esperado.
 *
 * Usada no servidor (para decidir) e no cliente (para habilitar o botão). Uma
 * função só, para as duas respostas nunca discordarem.
 */
export function confirmacaoConfere(
  informado: unknown,
  esperado: string
): boolean {
  if (typeof informado !== "string") return false;
  if (!esperado.trim()) return false;
  return normalizarConfirmacao(informado) === normalizarConfirmacao(esperado);
}

/* -------------------------------------------------------------------------- */
/*                              Texto do resumo                               */
/* -------------------------------------------------------------------------- */

export type Contagem = { rotulo: string; quantidade: number };

/**
 * "24 competências, 3 processos, 251 etapas, 17 anexos".
 *
 * Contagem zero fica FORA. "0 anexos" ocupa a largura de uma informação sem ser
 * uma, e numa lista de seis itens quatro zeros escondem os dois números que
 * decidem se a pessoa clica.
 */
export function textoContagens(contagens: Contagem[]): string {
  const partes = contagens
    .filter((c) => c.quantidade > 0)
    .map((c) => `${c.quantidade} ${c.rotulo}`);
  return partes.length > 0 ? partes.join(", ") : "nenhum registro dependente";
}

/** Alguma coisa pende do alvo? Decide o tom do aviso na tela. */
export function temContagem(contagens: Contagem[]): boolean {
  return contagens.some((c) => c.quantidade > 0);
}
