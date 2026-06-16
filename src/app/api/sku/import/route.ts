import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import { invalidateSKUCache, invalidateVendasCache } from "@/lib/cache";
import { applySkuCostRetroactively } from "@/lib/sku-retroactive-cost";
import {
  addImportError,
  addImportWarning,
  assertSpreadsheetColumns,
  createImportResults,
  getSpreadsheetValue,
  normalizeSpreadsheetKey,
  normalizeSpreadsheetText,
  parseSpreadsheetBooleanStrict,
  parseSpreadsheetInteger,
  parseSpreadsheetMoney,
  readSpreadsheetRecords,
  splitSpreadsheetList,
  type SpreadsheetRecord,
} from "@/lib/spreadsheet";

export const runtime = "nodejs";
export const maxDuration = 300;

type ParsedSkuRow = {
  rowNumber: number;
  sku: string;
  produto: string;
  tipo: "pai" | "filho";
  skuPai: string | null;
  custoUnitario: number;
  quantidade: number;
  hierarquia1: string | null;
  hierarquia2: string | null;
  ativo: boolean;
  temEstoque: boolean;
  skusFilhos: string[];
  observacoes: string | null;
  tags: string[];
};

function skuComparisonKey(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function parseSkuType(value: unknown): "pai" | "filho" | null {
  const normalized = normalizeSpreadsheetKey(value);
  if (!normalized || ["individual", "filho", "produto"].includes(normalized)) return "filho";
  if (["kit", "pai"].includes(normalized)) return "pai";
  return null;
}

function parseOptionalBoolean(
  value: unknown,
  defaultValue: boolean,
  fieldName: string,
): boolean {
  const text = normalizeSpreadsheetText(value);
  if (!text) return defaultValue;

  const parsed = parseSpreadsheetBooleanStrict(value);
  if (parsed === null) {
    throw new Error(`${fieldName} inválido. Use Sim/Não, Ativo/Inativo ou 1/0.`);
  }
  return parsed;
}

function parseSkuRow(record: SpreadsheetRecord): ParsedSkuRow {
  const { values, rowNumber } = record;
  const sku = normalizeSpreadsheetText(
    getSpreadsheetValue(values, ["sku", "codigo", "codigo sku"]),
  );
  const produto = normalizeSpreadsheetText(
    getSpreadsheetValue(values, ["produto", "nome do produto", "descricao"]),
  );
  const tipo = parseSkuType(getSpreadsheetValue(values, ["tipo", "tipo sku"]));

  if (!sku) throw new Error("SKU é obrigatório.");
  if (!produto) throw new Error("Produto é obrigatório.");
  if (!tipo) throw new Error('Tipo inválido. Use "Individual" ou "Kit".');

  const custoRaw = getSpreadsheetValue(values, [
    "custo unitario",
    "custo",
    "valor de custo",
  ]);
  const custoText = normalizeSpreadsheetText(custoRaw);
  const parsedCost = parseSpreadsheetMoney(custoRaw);
  if (custoText && parsedCost === null) {
    throw new Error("Custo unitário inválido.");
  }
  const custoUnitario = parsedCost ?? 0;
  if (custoUnitario < 0) throw new Error("Custo unitário não pode ser negativo.");

  const quantidadeRaw = getSpreadsheetValue(values, ["quantidade", "qtd"]);
  const quantidadeText = normalizeSpreadsheetText(quantidadeRaw);
  const quantidadeInformada = parseSpreadsheetInteger(quantidadeRaw);
  if (quantidadeText && quantidadeInformada === null) {
    throw new Error("Quantidade deve ser um número inteiro.");
  }
  const quantidade = tipo === "pai" ? 0 : quantidadeInformada ?? 1;
  if (tipo === "filho" && quantidade <= 0) {
    throw new Error("Quantidade deve ser um número inteiro maior que zero.");
  }

  const skuPai =
    tipo === "filho"
      ? normalizeSpreadsheetText(getSpreadsheetValue(values, ["sku pai", "kit pai"])) || null
      : null;

  return {
    rowNumber,
    sku,
    produto,
    tipo,
    skuPai,
    custoUnitario: tipo === "pai" ? 0 : custoUnitario,
    quantidade,
    hierarquia1:
      normalizeSpreadsheetText(getSpreadsheetValue(values, ["hierarquia 1", "hierarquia1"])) ||
      null,
    hierarquia2:
      normalizeSpreadsheetText(getSpreadsheetValue(values, ["hierarquia 2", "hierarquia2"])) ||
      null,
    ativo: parseOptionalBoolean(
      getSpreadsheetValue(values, ["ativo", "status"]),
      true,
      "Ativo",
    ),
    temEstoque: parseOptionalBoolean(
      getSpreadsheetValue(values, ["tem estoque", "estoque"]),
      true,
      "Tem Estoque",
    ),
    skusFilhos:
      tipo === "pai"
        ? splitSpreadsheetList(getSpreadsheetValue(values, ["skus filhos", "sku filhos", "filhos"]))
        : [],
    observacoes:
      normalizeSpreadsheetText(getSpreadsheetValue(values, ["observacoes", "observacao"])) ||
      null,
    tags: splitSpreadsheetList(getSpreadsheetValue(values, ["tags", "etiquetas"])),
  };
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    }

    const records = await readSpreadsheetRecords(file);
    assertSpreadsheetColumns(records, [
      { label: "SKU", aliases: ["sku", "codigo", "codigo sku"] },
      { label: "Produto", aliases: ["produto", "nome do produto", "descricao"] },
    ]);
    const results = createImportResults(records.length);
    const existingSkus = await prisma.sKU.findMany({
      where: { userId: session.sub },
      select: { sku: true, tipo: true, skusFilhos: true },
    });
    const existingBySku = new Map(
      existingSkus.map((item) => [skuComparisonKey(item.sku), item]),
    );
    const seenInFile = new Set<string>();
    const parsedRows: ParsedSkuRow[] = [];

    for (const record of records) {
      try {
        const parsed = parseSkuRow(record);
        const normalizedSku = skuComparisonKey(parsed.sku);

        if (seenInFile.has(normalizedSku)) {
          addImportWarning(
            results,
            record.rowNumber,
            `SKU "${parsed.sku}" está duplicado na planilha e foi ignorado.`,
          );
          results.skipped += 1;
          continue;
        }
        seenInFile.add(normalizedSku);

        if (existingBySku.has(normalizedSku)) {
          addImportWarning(
            results,
            record.rowNumber,
            `SKU "${parsed.sku}" já está cadastrado no sistema e foi ignorado.`,
          );
          results.skipped += 1;
          continue;
        }

        parsedRows.push(parsed);
      } catch (error) {
        addImportError(
          results,
          record.rowNumber,
          error instanceof Error ? error.message : "Linha inválida.",
        );
      }
    }

    const knownParents = new Map(
      existingSkus
        .filter((item) => item.tipo === "pai")
        .map((item) => [skuComparisonKey(item.sku), item.sku]),
    );
    for (const row of parsedRows) {
      if (row.tipo === "pai") knownParents.set(skuComparisonKey(row.sku), row.sku);
    }

    const importableRows = parsedRows.filter((row) => {
      if (row.tipo === "filho" && row.skuPai) {
        const parentSku = knownParents.get(skuComparisonKey(row.skuPai));
        if (!parentSku) {
          addImportError(results, row.rowNumber, `SKU Pai "${row.skuPai}" não encontrado.`);
          return false;
        }
        row.skuPai = parentSku;
      }
      return true;
    });

    const orderedRows = [
      ...importableRows.filter((row) => row.tipo === "pai"),
      ...importableRows.filter((row) => row.tipo === "filho"),
    ];
    const createdSkus = new Map<string, string>();

    for (const row of orderedRows) {
      if (row.tipo === "filho" && row.skuPai) {
        const parentKey = skuComparisonKey(row.skuPai);
        const existingParent = existingBySku.get(parentKey);
        const importedParent = createdSkus.get(parentKey);
        if (existingParent?.tipo !== "pai" && !importedParent) {
          addImportError(
            results,
            row.rowNumber,
            `O kit "${row.skuPai}" não pôde ser criado; o SKU filho não foi importado.`,
          );
          continue;
        }
      }

      try {
        await prisma.$transaction(async (tx) => {
          const createdSku = await tx.sKU.create({
            data: {
              userId: session.sub,
              sku: row.sku,
              produto: row.produto,
              tipo: row.tipo,
              skuPai: row.skuPai,
              custoUnitario: row.custoUnitario,
              quantidade: row.quantidade,
              hierarquia1: row.hierarquia1,
              hierarquia2: row.hierarquia2,
              ativo: row.ativo,
              temEstoque: row.temEstoque,
              proporcao: row.tipo === "filho" ? 1 : null,
              skusFilhos: row.skusFilhos.length > 0 ? row.skusFilhos : undefined,
              observacoes: row.observacoes,
              tags: row.tags.length > 0 ? row.tags : undefined,
            },
          });

          if (row.tipo === "filho") {
            await tx.sKUCustoHistorico.create({
              data: {
                skuId: createdSku.id,
                userId: session.sub,
                custoNovo: row.custoUnitario,
                quantidade: row.quantidade,
                motivo: "Criação inicial por importação de planilha",
                tipoAlteracao: "importacao_excel",
                alteradoPor: session.sub,
              },
            });

            if (row.custoUnitario > 0) {
              await applySkuCostRetroactively(tx, {
                userId: session.sub,
                sku: row.sku,
                custoUnitario: row.custoUnitario,
              });
            }
          }
        });

        createdSkus.set(skuComparisonKey(row.sku), row.sku);
        existingBySku.set(skuComparisonKey(row.sku), {
          sku: row.sku,
          tipo: row.tipo,
          skusFilhos: row.skusFilhos,
        });
        results.success += 1;
      } catch (error) {
        const prismaCode =
          typeof error === "object" && error && "code" in error
            ? String(error.code)
            : "";
        if (prismaCode === "P2002") {
          results.skipped += 1;
        } else {
          console.error(`Erro ao importar SKU da linha ${row.rowNumber}:`, error);
          addImportError(results, row.rowNumber, "Erro ao salvar o SKU.");
        }
      }
    }

    const parentRelations = new Map<
      string,
      { parentSku: string; rowNumber: number; childCandidates: string[] }
    >();
    const addParentRelation = (
      parentSku: string,
      rowNumber: number,
      childCandidates: string[],
    ) => {
      const parentKey = skuComparisonKey(parentSku);
      const current = parentRelations.get(parentKey);
      if (current) {
        current.childCandidates.push(...childCandidates);
      } else {
        parentRelations.set(parentKey, {
          parentSku,
          rowNumber,
          childCandidates: [...childCandidates],
        });
      }
    };

    for (const parent of orderedRows) {
      if (
        parent.tipo === "pai" &&
        createdSkus.has(skuComparisonKey(parent.sku)) &&
        parent.skusFilhos.length > 0
      ) {
        addParentRelation(parent.sku, parent.rowNumber, parent.skusFilhos);
      }
    }

    for (const child of orderedRows) {
      if (
        child.tipo === "filho" &&
        child.skuPai &&
        createdSkus.has(skuComparisonKey(child.sku))
      ) {
        addParentRelation(child.skuPai, child.rowNumber, [child.sku]);
      }
    }

    for (const relation of parentRelations.values()) {
      const parentKey = skuComparisonKey(relation.parentSku);
      const parent = existingBySku.get(parentKey);
      if (parent?.tipo !== "pai") {
        addImportWarning(
          results,
          relation.rowNumber,
          `O kit "${relation.parentSku}" não foi encontrado para concluir os vínculos.`,
        );
        continue;
      }

      const existingChildren = Array.isArray(parent.skusFilhos)
        ? parent.skusFilhos.map(normalizeSpreadsheetText).filter(Boolean)
        : [];
      const validChildrenByKey = new Map<string, string>();
      const invalidChildren: string[] = [];

      for (const candidate of [...existingChildren, ...relation.childCandidates]) {
        const candidateKey = skuComparisonKey(candidate);
        const child = existingBySku.get(candidateKey);
        if (child?.tipo === "filho") {
          validChildrenByKey.set(candidateKey, child.sku);
        } else if (!invalidChildren.some((item) => skuComparisonKey(item) === candidateKey)) {
          invalidChildren.push(candidate);
        }
      }

      const validChildren = [...validChildrenByKey.values()];
      try {
        await prisma.$transaction([
          prisma.sKU.updateMany({
            where: {
              userId: session.sub,
              sku: { in: validChildren },
              tipo: "filho",
            },
            data: { skuPai: parent.sku },
          }),
          prisma.sKU.update({
            where: {
              userId_sku: {
                userId: session.sub,
                sku: parent.sku,
              },
            },
            data: { skusFilhos: validChildren },
          }),
        ]);
      } catch (error) {
        console.error(`Erro ao vincular filhos do kit ${parent.sku}:`, error);
        addImportWarning(
          results,
          relation.rowNumber,
          "Os SKUs foram criados, mas não foi possível concluir o vínculo do kit.",
        );
      }

      if (invalidChildren.length > 0) {
        addImportWarning(
          results,
          relation.rowNumber,
          `SKUs inexistentes ou que não são filhos e não foram vinculados: ${invalidChildren.join(", ")}.`,
        );
      }
    }

    if (results.success > 0) {
      invalidateSKUCache(session.sub);
      invalidateVendasCache(session.sub);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Erro na importação de SKUs:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao importar a planilha de SKUs.",
      },
      { status: 400 },
    );
  }
}
