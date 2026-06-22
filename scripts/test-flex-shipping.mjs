import assert from "node:assert/strict";
import {
  calculateMeliFlexShipping,
  flexConfigVersion,
  isMeliFlex,
  parseFlexConfigValues,
} from "../src/lib/flex-shipping.ts";

const config = {
  id: "cfg-1",
  custoPorPacote: 11.9,
  unidadesPorCobranca: 1,
  updatedAt: "2026-06-22T12:00:00.000Z",
};

assert.equal(isMeliFlex("FLEX"), true);
assert.equal(isMeliFlex("self_service"), true);
assert.equal(isMeliFlex("Agencia"), false);

assert.deepEqual(
  calculateMeliFlexShipping({
    frete: 1.1,
    quantidade: 1,
    logisticType: "FLEX",
    config,
  }),
  {
    isFlex: true,
    configApplied: true,
    receitaFlex: 1.1,
    custoFlex: 11.9,
    freteLiquidoFlex: -10.8,
    cobrancasFlex: 1,
  },
);

assert.equal(
  calculateMeliFlexShipping({
    frete: 0.89,
    quantidade: 1,
    logisticType: "self_service",
    config,
  }).freteLiquidoFlex,
  -11.01,
);

assert.equal(
  calculateMeliFlexShipping({
    frete: 2,
    quantidade: 3,
    logisticType: "FLEX",
    config: { ...config, unidadesPorCobranca: 2 },
  }).custoFlex,
  23.8,
);

assert.equal(
  calculateMeliFlexShipping({
    frete: -18.85,
    quantidade: 1,
    logisticType: "Agencia",
    config,
  }).freteLiquidoFlex,
  -18.85,
);

assert.equal(
  calculateMeliFlexShipping({
    frete: 1.1,
    quantidade: 1,
    logisticType: "FLEX",
    config: null,
  }).freteLiquidoFlex,
  1.1,
);

assert.deepEqual(
  parseFlexConfigValues({ custoPorPacote: "11.90", unidadesPorCobranca: "1" }),
  { custoPorPacote: 11.9, unidadesPorCobranca: 1 },
);
assert.equal(
  parseFlexConfigValues({ custoPorPacote: -1, unidadesPorCobranca: 1 }),
  null,
);
assert.equal(
  parseFlexConfigValues({ custoPorPacote: 11.9, unidadesPorCobranca: 1.5 }),
  null,
);

assert.notEqual(flexConfigVersion(config), flexConfigVersion({ ...config, custoPorPacote: 12 }));

console.log("Flex shipping tests passed.");
