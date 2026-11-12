import { Decimal } from "@prisma/client/runtime/library";

export function ratearFreteMeli(total: Decimal, valores: readonly Decimal[]): Decimal[] {
  const pesos = valores.map((valor) => Decimal.max(valor, 0));
  const soma = pesos.reduce((acumulado, peso) => acumulado.plus(peso), new Decimal(0));
  let pesoAcumulado = new Decimal(0);
  let freteAcumulado = new Decimal(0);

  // Arredondar o acumulado garante que a soma das parcelas feche em centavos.
  return pesos.map((peso, indice) => {
    pesoAcumulado = pesoAcumulado.plus(peso);
    const proporcao = soma.isZero()
      ? new Decimal(indice + 1).div(valores.length)
      : pesoAcumulado.div(soma);
    const novoAcumulado = total.times(proporcao).toDecimalPlaces(2);
    const parcela = novoAcumulado.minus(freteAcumulado);
    freteAcumulado = novoAcumulado;
    return parcela;
  });
}
