export type FlexShippingConfigValues = {
  id?: string;
  custoPorPacote: number;
  unidadesPorCobranca: number;
  descricao?: string | null;
  updatedAt?: Date | string | null;
};

export type FlexShippingCalculation = {
  isFlex: boolean;
  configApplied: boolean;
  receitaFlex: number;
  custoFlex: number;
  freteLiquidoFlex: number;
  cobrancasFlex: number;
};

export function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isMeliFlex(logisticType: unknown): boolean {
  if (typeof logisticType !== "string") return false;
  const normalized = logisticType.trim().toLowerCase();
  return normalized === "flex" || normalized === "self_service";
}

export function calculateMeliFlexShipping(input: {
  frete: unknown;
  quantidade: unknown;
  logisticType: unknown;
  config: FlexShippingConfigValues | null | undefined;
}): FlexShippingCalculation {
  const receitaFlex = roundCurrency(finiteNumber(input.frete));
  const isFlex = isMeliFlex(input.logisticType);
  const custoPorPacote = finiteNumber(input.config?.custoPorPacote);
  const unidadesConfiguradas = finiteNumber(input.config?.unidadesPorCobranca, 1);
  const unidadesPorCobranca =
    Number.isInteger(unidadesConfiguradas) && unidadesConfiguradas >= 1
      ? unidadesConfiguradas
      : 1;

  if (!isFlex || custoPorPacote <= 0) {
    return {
      isFlex,
      configApplied: false,
      receitaFlex,
      custoFlex: 0,
      freteLiquidoFlex: receitaFlex,
      cobrancasFlex: 0,
    };
  }

  const quantidadeInformada = finiteNumber(input.quantidade, 1);
  const quantidade = Math.max(1, Math.ceil(quantidadeInformada));
  const cobrancasFlex = Math.max(1, Math.ceil(quantidade / unidadesPorCobranca));
  const custoFlex = roundCurrency(cobrancasFlex * custoPorPacote);

  return {
    isFlex: true,
    configApplied: true,
    receitaFlex,
    custoFlex,
    freteLiquidoFlex: roundCurrency(receitaFlex - custoFlex),
    cobrancasFlex,
  };
}

export function flexConfigVersion(
  config: FlexShippingConfigValues | null | undefined,
): string {
  if (!config) return "sem-config";
  const updatedAt = config.updatedAt
    ? new Date(config.updatedAt).getTime()
    : 0;
  return [
    config.id || "config",
    updatedAt,
    roundCurrency(config.custoPorPacote),
    config.unidadesPorCobranca,
  ].join(":");
}

export function parseFlexConfigValues(input: {
  custoPorPacote: unknown;
  unidadesPorCobranca: unknown;
}): { custoPorPacote: number; unidadesPorCobranca: number } | null {
  const custoPorPacote = finiteNumber(input.custoPorPacote, Number.NaN);
  const unidadesPorCobranca = finiteNumber(
    input.unidadesPorCobranca,
    Number.NaN,
  );

  if (!Number.isFinite(custoPorPacote) || custoPorPacote <= 0) return null;
  if (
    !Number.isInteger(unidadesPorCobranca) ||
    unidadesPorCobranca < 1
  ) {
    return null;
  }

  return {
    custoPorPacote: roundCurrency(custoPorPacote),
    unidadesPorCobranca,
  };
}
