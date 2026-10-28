/** Contrato compartilhado do filtro múltiplo de SKU das tabelas de vendas. */
export const MAX_SKUS_FILTRO_VENDAS = 100;

/** Remove vazios/duplicados e dá ordem estável à URL e às cache keys.
 *
 * O valor persistido é preservado exatamente: vendas legadas podem conter
 * espaços nas pontas, e o filtro precisa corresponder ao SKU exibido na linha.
 */
export function normalizarSkusFiltro(valores: readonly string[]): string[] {
  return [...new Set(valores.filter((valor) => valor.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }),
  );
}

/** Normaliza e recusa excesso em vez de truncar silenciosamente a seleção. */
export function validarSkusFiltro(valores: readonly string[]): string[] {
  const normalizados = normalizarSkusFiltro(valores);
  if (normalizados.length > MAX_SKUS_FILTRO_VENDAS) {
    throw new Error(`Selecione no máximo ${MAX_SKUS_FILTRO_VENDAS} SKUs por vez.`);
  }
  if (normalizados.some((sku) => sku.length > 255)) {
    throw new Error("SKU inválido: o código deve ter no máximo 255 caracteres.");
  }
  return normalizados;
}
