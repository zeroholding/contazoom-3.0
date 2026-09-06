/**
 * Cobertura de estoque e situação — a régua do módulo, em UM lugar só.
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 *
 * No projeto irmão a mesma fórmula está escrita três vezes: na expressão SQL de
 * ordenação, nas condições SQL do filtro, e em JavaScript para desenhar o
 * rótulo. Três cópias do mesmo número significam que mudar o limiar de "repor" de
 * 14 para 10 dias exige achar três lugares — e a consequência de esquecer um é a
 * pior possível para a confiança na tela: a linha aparece filtrada como "repor" e
 * mostra o selo "saudável".
 *
 * Aqui os limiares são constantes exportadas, e tanto o SQL quanto o TypeScript
 * as consomem. O SQL não pode importar a função, mas pode receber o NÚMERO.
 */

/**
 * Cobertura = quantos dias o estoque atual aguenta no ritmo de venda do período.
 *
 * `null` quando não houve venda: cobertura infinita não é um número, e devolver
 * um valor grande faria a linha ordenar como se fosse a mais folgada de todas,
 * quando na verdade ela é a mais parada.
 */
export function coberturaEmDias(
  disponivel: number,
  vendas30dUnidades: number,
): number | null {
  if (vendas30dUnidades <= 0) return null;
  const porDia = vendas30dUnidades / 30;
  if (porDia <= 0) return null;
  return disponivel / porDia;
}

/**
 * Limiar de "repor": 14 dias, ou duas semanas.
 *
 * Duas semanas porque é o tempo típico entre decidir repor e a mercadoria estar
 * disponível para venda no Full (envio ao centro de distribuição mais o
 * processamento de entrada). Abaixo disso, repor agora já é tarde.
 */
export const DIAS_REPOR = 14;

/**
 * Limiar de "estoque alto": 56 dias, ou oito semanas.
 *
 * Dois meses de estoque parado é capital imobilizado e custo de armazenagem no
 * Full, que o ML cobra por volume acima de certo tempo.
 */
export const DIAS_ESTOQUE_ALTO = 56;

export type SituacaoEstoque = "parado" | "repor" | "alto" | "saudavel";

/**
 * A situação da linha.
 *
 * A ORDEM DOS TESTES IMPORTA e é deliberada:
 *
 * "Parado" vem primeiro porque tem estoque e zero venda — e esse caso não tem
 * cobertura calculável, então cairia em "saudável" por omissão se testado depois.
 * Chamar de saudável um produto que não vende há um mês é o oposto do que
 * interessa.
 *
 * Item sem venda E sem estoque não é nenhum problema de estoque: não há o que
 * repor nem o que liquidar. Cai em "saudável", que aqui significa "nada a fazer".
 */
export function situacaoDoEstoque(
  cobertura: number | null,
  vendas30dUnidades: number,
  disponivel: number,
): SituacaoEstoque {
  if (vendas30dUnidades <= 0 && disponivel > 0) return "parado";
  if (cobertura !== null && cobertura <= DIAS_REPOR) return "repor";
  if (cobertura !== null && cobertura >= DIAS_ESTOQUE_ALTO) return "alto";
  return "saudavel";
}

/**
 * Rótulo da coluna "Tempo até esgotar".
 *
 * Em SEMANAS arredondadas para cima, igual ao painel do Mercado Livre. É de
 * propósito: quem usa a tela compara com o painel do ML lado a lado, e "13 dias"
 * contra "Até 2 sem." levanta a dúvida de qual dos dois está errado.
 */
export function rotuloCobertura(dias: number | null): string {
  if (dias === null) return "Sem vendas";
  if (dias <= 0) return "Esgotado";
  return `Até ${Math.ceil(dias / 7)} sem.`;
}

/**
 * A cobertura em SQL, como expressão.
 *
 * Multiplicação em vez de divisão dupla (`disponivel * 30 / unidades` em vez de
 * `disponivel / (unidades / 30)`): uma divisão a menos, e o `CASE` já garante
 * que o divisor não é zero.
 *
 * Recebe os aliases das tabelas para poder ser usada no SELECT, no WHERE e no
 * ORDER BY da mesma consulta sem repetir o texto.
 */
export function sqlCobertura(aliasFull: string, aliasVendas: string): string {
  return `CASE WHEN COALESCE(${aliasVendas}.unidades, 0) > 0
    THEN (${aliasFull}.available_quantity::numeric * 30) / ${aliasVendas}.unidades
    ELSE NULL END`;
}

/**
 * As condições SQL de cada situação, derivadas das MESMAS constantes.
 *
 * Escritas como multiplicação para não dividir por zero e para o Postgres poder
 * usar índice em `available_quantity` quando houver.
 */
export function sqlSituacao(
  situacao: Exclude<SituacaoEstoque, "saudavel">,
  aliasFull: string,
  aliasVendas: string,
): string {
  const un = `COALESCE(${aliasVendas}.unidades, 0)`;
  const disp = `${aliasFull}.available_quantity`;

  if (situacao === "parado") {
    return `(${un} = 0 AND ${disp} > 0)`;
  }
  if (situacao === "repor") {
    return `(${un} > 0 AND ${disp} * 30 <= ${un} * ${DIAS_REPOR})`;
  }
  // alto: só o que vende e tem folga. Diferente do projeto irmão, que jogava os
  // "parados" dentro de "estoque alto" — a linha aparecia no filtro de alto e
  // mostrava o selo "Parado", contradição visível na mesma tela.
  return `(${un} > 0 AND ${disp} * 30 >= ${un} * ${DIAS_ESTOQUE_ALTO})`;
}
