/**
 * Mapeia uma lista com limite de chamadas simultâneas.
 *
 * Existe porque o sync de estoque faz centenas de requisições ao Mercado Livre e
 * as duas alternativas óbvias são ruins: `Promise.all` puro dispara tudo de uma
 * vez e leva 429, e o laço `for await` sequencial transforma 400 inventários em
 * minutos de espera.
 *
 * É FILA, NÃO BLOCO. Os N trabalhadores puxam de um cursor compartilhado, em vez
 * de dividir a lista em pedaços de N. A diferença aparece quando um item demora:
 * com blocos, o bloco inteiro espera o mais lento antes de o próximo começar;
 * com fila, quem terminou já puxa o próximo.
 *
 * A ordem do resultado é a ordem de ENTRADA, não a de conclusão — `results[i]`
 * é sempre a resposta de `items[i]`.
 *
 * ⚠️  SE `fn` LANÇAR, O `pMap` INTEIRO REJEITA e os itens que ainda estavam na
 *     fila nunca são processados. Isso é deliberado (não engolir erro em
 *     silêncio), mas obriga quem chama com efeito colateral a pôr `try/catch`
 *     DENTRO do callback. No sync de estoque isso é o que impede um único 429
 *     no meio de abortar a conta inteira.
 */
export async function pMap<T, R>(
  items: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let cursor = 0;

  async function trabalhador(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      resultados[i] = await fn(items[i], i);
    }
  }

  // `Math.min` evita criar trabalhador ocioso quando a lista é menor que o limite.
  const trabalhadores = Array.from(
    { length: Math.min(Math.max(1, limite), items.length) },
    trabalhador,
  );
  await Promise.all(trabalhadores);
  return resultados;
}
