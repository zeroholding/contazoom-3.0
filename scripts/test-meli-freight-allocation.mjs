import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library.js";
import { ratearFreteMeli } from "../src/lib/meli-freight-allocation.ts";

function parcelas(total, valores) {
  return ratearFreteMeli(new Decimal(total), valores.map((valor) => new Decimal(valor)))
    .map((parcela) => parcela.toFixed(2));
}

assert.deepEqual(parcelas(-30, [50, 50]), ["-15.00", "-15.00"]);
assert.deepEqual(parcelas(-30, [60, 40]), ["-18.00", "-12.00"]);
assert.deepEqual(parcelas(-10, [50, 50, 50]), ["-3.33", "-3.34", "-3.33"]);
assert.deepEqual(parcelas(10, [0, 0, 0]), ["3.33", "3.34", "3.33"]);
assert.deepEqual(parcelas(-30, [0, 50]), ["0.00", "-30.00"]);
assert.deepEqual(parcelas(-30, [100]), ["-30.00"]);
assert.deepEqual(parcelas(0, [50, 50]), ["0.00", "0.00"]);

// Simula o banco para exercitar a gravação compartilhada pelos dois fluxos.
const linhas = new Map();
const meliVenda = {
  findMany({ where }) {
    const todas = [...linhas.values()].map((linha) => ({ ...linha }));
    if (where.orderId) return todas.filter(({ orderId }) => where.orderId.in.includes(orderId));
    return todas.filter((linha) => linha.userId === where.userId && where.OR.some(
      ({ meliAccountId, shippingId }) => linha.meliAccountId === meliAccountId && linha.shippingId === shippingId,
    )).sort((a, b) => a.orderId.localeCompare(b.orderId));
  },
  createMany({ data }) {
    for (const linha of data) linhas.set(linha.orderId, { ...linha });
    return { count: data.length };
  },
  update({ where, data }) {
    const linha = linhas.get(where.orderId);
    assert.equal(linha.userId, where.userId);
    Object.assign(linha, data);
  },
};
globalThis.prisma = {
  $transaction: (callback) => callback({ meliVenda, $queryRaw: async () => [] }),
};
const { salvarLoteVendasMeli } = await import("../src/lib/save-meli-sales.ts");

function venda(orderId, shippingId, meliAccountId = "conta", userId = "usuario") {
  const updateData = {
    shippingId,
    valorTotal: new Decimal(50),
    taxaPlataforma: new Decimal(-5),
    cmv: new Decimal(10),
    frete: new Decimal(-30),
    margemContribuicao: new Decimal(5),
    rawData: { freight: { sellerShippingCost: 30 } },
  };
  return { orderId, createData: { orderId, userId, meliAccountId, ...updateData }, updateData };
}

const primeiro = venda("1", "envio");
const segundo = venda("2", "envio");
await salvarLoteVendasMeli("usuario", [primeiro, venda("3", "outro-envio"), venda("4", "envio", "outra-conta")]);
await salvarLoteVendasMeli("outro-usuario", [venda("5", "envio", "conta", "outro-usuario")]);
assert.equal(linhas.get("1").frete.toNumber(), -30);
await salvarLoteVendasMeli("usuario", [segundo]);
await salvarLoteVendasMeli("usuario", [primeiro]); // Reprocessamento do primeiro lote.
for (const id of ["1", "2"]) {
  assert.equal(linhas.get(id).frete.toNumber(), -15);
  assert.equal(Number(linhas.get(id).margemContribuicao), 20);
}
for (const id of ["3", "4", "5"]) assert.equal(linhas.get(id).frete.toNumber(), -30);

await salvarLoteVendasMeli("usuario", [venda("2", "novo-envio")]);
assert.equal(linhas.get("1").frete.toNumber(), -30);
assert.equal(linhas.get("2").frete.toNumber(), -30);
console.log("Rateio do frete ML verificado.");
