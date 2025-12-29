import { roundCurrency } from "./string-utils";

/**
 * Calcula a margem de contribuição seguindo a fórmula:
 * Margem = Valor Total + Taxa Plataforma + Frete - CMV
 *
 * @param valorTotal - Valor total da venda (POSITIVO)
 * @param taxaPlataforma - Taxa da plataforma (JÁ DEVE VIR NEGATIVA)
 * @param frete - Valor do frete (pode ser + ou -)
 * @param cmv - Custo da Mercadoria Vendida (POSITIVO)
 * @returns Margem de contribuição e se é margem real ou receita líquida
 */
export function calculateMargemContribuicao(
  valorTotal: number,
  taxaPlataforma: number | null,
  frete: number,
  cmv: number | null
): { valor: number; isMargemReal: boolean } {
  // Valores base (taxa já vem negativa, frete pode ser + ou -)
  const taxa = taxaPlataforma || 0;

  // Se temos CMV, calculamos a margem de contribuição real
  // Fórmula: Margem = Valor Total + Taxa Plataforma + Frete - CMV
  if (cmv !== null && cmv !== undefined && cmv > 0) {
    const margemContribuicao = valorTotal + taxa + frete - cmv;
    return {
      valor: roundCurrency(margemContribuicao),
      isMargemReal: true,
    };
  }

  // Se não temos CMV, retornamos a receita líquida
  // Receita Líquida = Valor Total + Taxa Plataforma + Frete
  const receitaLiquida = valorTotal + taxa + frete;
  return {
    valor: roundCurrency(receitaLiquida),
    isMargemReal: false,
  };
}