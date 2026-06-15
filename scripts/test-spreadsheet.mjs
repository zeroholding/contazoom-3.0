import assert from "node:assert/strict";
import {
  assertSpreadsheetColumns,
  createWorkbookBuffer,
  getSpreadsheetValue,
  parseSpreadsheetBooleanStrict,
  parseSpreadsheetDate,
  parseSpreadsheetMoney,
  readSpreadsheetRecords,
  splitSpreadsheetList,
  spreadsheetDateKey,
} from "../src/lib/spreadsheet.ts";

const buffer = createWorkbookBuffer([
  {
    name: "Importação",
    rows: [
      ["Descrição", "Valor", "Data de Vencimento", "Ativo", "Tags"],
      ["Aluguel", "R$ 1.234,56", "14/06/2026", "Sim", "fixo; mensal"],
      [null, null, null, null, null],
      ["Energia", "1,234.56", "2026-06-15", "Não", "variável, mensal"],
    ],
  },
]);

const file = new File([buffer], "validacao.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
const records = await readSpreadsheetRecords(file);

assert.equal(records.length, 2);
assert.equal(records[0].rowNumber, 2);
assert.equal(records[1].rowNumber, 4);
assertSpreadsheetColumns(records, [
  { label: "Descrição", aliases: ["descricao"] },
  { label: "Valor", aliases: ["valor"] },
]);
assert.throws(
  () =>
    assertSpreadsheetColumns(records, [
      { label: "SKU", aliases: ["sku"] },
    ]),
  /Coluna\(s\) obrigatória\(s\) ausente\(s\): SKU/,
);

assert.equal(getSpreadsheetValue(records[0].values, ["descricao"]), "Aluguel");
assert.equal(parseSpreadsheetMoney(getSpreadsheetValue(records[0].values, ["valor"])), 1234.56);
assert.equal(parseSpreadsheetMoney(getSpreadsheetValue(records[1].values, ["valor"])), 1234.56);
assert.equal(parseSpreadsheetMoney("(R$ 10,50)"), -10.5);
assert.equal(parseSpreadsheetMoney("1.234"), 1234);
assert.equal(parseSpreadsheetMoney("1.234.567"), 1234567);
assert.equal(parseSpreadsheetMoney("12.34"), 12.34);
assert.equal(
  spreadsheetDateKey(
    parseSpreadsheetDate(getSpreadsheetValue(records[0].values, ["data de vencimento"])),
  ),
  "2026-06-14",
);
assert.equal(parseSpreadsheetBooleanStrict("Sim"), true);
assert.equal(parseSpreadsheetBooleanStrict("Não"), false);
assert.equal(parseSpreadsheetBooleanStrict("talvez"), null);
assert.deepEqual(splitSpreadsheetList(getSpreadsheetValue(records[0].values, ["tags"])), [
  "fixo",
  "mensal",
]);

console.log("Spreadsheet tests passed.");
