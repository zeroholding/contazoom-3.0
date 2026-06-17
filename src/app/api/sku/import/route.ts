import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
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
  hasSpreadsheetValue,
  normalizeSpreadsheetKey,
  normalizeSpreadsheetText,
  parseSpreadsheetBooleanStrict,
  parseSpreadsheetInteger,
  parseSpreadsheetMoney,
  readSpreadsheetRecords,
  splitSpreadsheetList,
  type ImportResults,
  type SpreadsheetRecord,
} from "@/lib/spreadsheet";

export const runtime = "nodejs";
export const maxDuration = 300;

type SkuType = "pai" | "filho";
type PreviewAction = "create" | "update" | "skip" | "error";

type ParsedSkuRow = {
  rowNumber: number;
  sku: string;
  produto: string;
  tipo: SkuType;
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
  provided: {
    tipo: boolean;
    skuPai: boolean;
    custoUnitario: boolean;
    quantidade: boolean;
    hierarquia1: boolean;
    hierarquia2: boolean;
    ativo: boolean;
    temEstoque: boolean;
    skusFilhos: boolean;
    observacoes: boolean;
    tags: boolean;
  };
};

type ExistingSku = {
  id: string;
  sku: string;
  produto: string;
  tipo: string;
  skuPai: string | null;
  custoUnitario: unknown;
  quantidade: number;
  hierarquia1: string | null;
  hierarquia2: string | null;
  ativo: boolean;
  temEstoque: boolean;
  skusFilhos: unknown;
  observacoes: string | null;
  tags: unknown;
};

type PreviewChange = {
  field: string;
  label: string;
  current: string;
  incoming: string;
};

type PublicPreviewRow = {
  id: string;
  rowNumber: number;
  sku: string;
  produto: string;
  action: PreviewAction;
  selectable: boolean;
  selectedByDefault: boolean;
  changes: PreviewChange[];
  warnings: string[];
  errors: string[];
};

type InternalPreviewRow = PublicPreviewRow & {
  parsed?: ParsedSkuRow;
  existing?: ExistingSku;
  updateData?: Record<string, unknown>;
  replacementChildren?: string[];
};

type ImportPreview = {
  total: number;
  creates: number;
  updates: number;
  skips: number;
  errors: number;
  selectable: number;
  rows: PublicPreviewRow[];
};

type RelationWork = {
  replacements: Map<string, string[]>;
  additions: Map<string, string[]>;
  removals: Map<string, string[]>;
};

const TEXT_FIELDS = {
  hierarquia1: ["hierarquia 1", "hierarquia1"],
  hierarquia2: ["hierarquia 2", "hierarquia2"],
  observacoes: ["observacoes", "observacao"],
};

function skuComparisonKey(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function parseSkuType(value: unknown): SkuType | null {
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

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(normalizeSpreadsheetText).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(normalizeSpreadsheetText).filter(Boolean);
    } catch {
      return splitSpreadsheetList(value);
    }
  }
  return [];
}

function sameStringList(a: string[], b: string[]): boolean {
  const normalize = (items: string[]) =>
    items.map(skuComparisonKey).sort((left, right) => left.localeCompare(right));
  const left = normalize(a);
  const right = normalize(b);
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  return String(value);
}

function addUnique(map: Map<string, string[]>, key: string, values: string[]): void {
  const current = map.get(key) ?? [];
  const next = [...current];
  for (const value of values) {
    if (!next.some((item) => skuComparisonKey(item) === skuComparisonKey(value))) {
      next.push(value);
    }
  }
  map.set(key, next);
}

function parseSkuRow(record: SpreadsheetRecord): ParsedSkuRow {
  const { values, rowNumber } = record;
  const sku = normalizeSpreadsheetText(
    getSpreadsheetValue(values, ["sku", "codigo", "codigo sku"]),
  );
  const produto = normalizeSpreadsheetText(
    getSpreadsheetValue(values, ["produto", "nome do produto", "descricao"]),
  );
  const tipoProvided = hasSpreadsheetValue(values, ["tipo", "tipo sku"]);
  const tipo = parseSkuType(getSpreadsheetValue(values, ["tipo", "tipo sku"]));

  if (!sku) throw new Error("SKU é obrigatório.");
  if (!produto) throw new Error("Produto é obrigatório.");
  if (tipoProvided && !tipo) throw new Error('Tipo inválido. Use "Individual" ou "Kit".');

  const custoAliases = ["custo unitario", "custo", "valor de custo"];
  const custoProvided = hasSpreadsheetValue(values, custoAliases);
  const custoRaw = getSpreadsheetValue(values, custoAliases);
  const parsedCost = parseSpreadsheetMoney(custoRaw);
  if (custoProvided && parsedCost === null) {
    throw new Error("Custo unitário inválido.");
  }
  const custoUnitario = parsedCost ?? 0;
  if (custoUnitario < 0) throw new Error("Custo unitário não pode ser negativo.");

  const quantidadeAliases = ["quantidade", "qtd"];
  const quantidadeProvided = hasSpreadsheetValue(values, quantidadeAliases);
  const quantidadeRaw = getSpreadsheetValue(values, quantidadeAliases);
  const quantidadeInformada = parseSpreadsheetInteger(quantidadeRaw);
  if (quantidadeProvided && quantidadeInformada === null) {
    throw new Error("Quantidade deve ser um número inteiro.");
  }

  const parsedTipo = tipo ?? "filho";
  const quantidade = parsedTipo === "pai" ? 0 : quantidadeInformada ?? 1;
  if (parsedTipo === "filho" && quantidade <= 0) {
    throw new Error("Quantidade deve ser um número inteiro maior que zero.");
  }

  const skuPaiAliases = ["sku pai", "kit pai"];
  const skuPai =
    parsedTipo === "filho"
      ? normalizeSpreadsheetText(getSpreadsheetValue(values, skuPaiAliases)) || null
      : null;

  const skusFilhosAliases = ["skus filhos", "sku filhos", "filhos"];
  const skusFilhos = splitSpreadsheetList(getSpreadsheetValue(values, skusFilhosAliases));

  return {
    rowNumber,
    sku,
    produto,
    tipo: parsedTipo,
    skuPai,
    custoUnitario: parsedTipo === "pai" ? 0 : custoUnitario,
    quantidade,
    hierarquia1: normalizeSpreadsheetText(getSpreadsheetValue(values, TEXT_FIELDS.hierarquia1)) || null,
    hierarquia2: normalizeSpreadsheetText(getSpreadsheetValue(values, TEXT_FIELDS.hierarquia2)) || null,
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
    skusFilhos,
    observacoes: normalizeSpreadsheetText(getSpreadsheetValue(values, TEXT_FIELDS.observacoes)) || null,
    tags: splitSpreadsheetList(getSpreadsheetValue(values, ["tags", "etiquetas"])),
    provided: {
      tipo: tipoProvided,
      skuPai: hasSpreadsheetValue(values, skuPaiAliases),
      custoUnitario: custoProvided,
      quantidade: quantidadeProvided,
      hierarquia1: hasSpreadsheetValue(values, TEXT_FIELDS.hierarquia1),
      hierarquia2: hasSpreadsheetValue(values, TEXT_FIELDS.hierarquia2),
      ativo: hasSpreadsheetValue(values, ["ativo", "status"]),
      temEstoque: hasSpreadsheetValue(values, ["tem estoque", "estoque"]),
      skusFilhos: hasSpreadsheetValue(values, skusFilhosAliases),
      observacoes: hasSpreadsheetValue(values, TEXT_FIELDS.observacoes),
      tags: hasSpreadsheetValue(values, ["tags", "etiquetas"]),
    },
  };
}

function previewRowBase(
  record: SpreadsheetRecord,
  sku: string,
  produto: string,
): Omit<InternalPreviewRow, "action" | "selectable" | "selectedByDefault" | "changes"> {
  return {
    id: String(record.rowNumber),
    rowNumber: record.rowNumber,
    sku,
    produto,
    warnings: [],
    errors: [],
  };
}

function addChange(
  changes: PreviewChange[],
  updateData: Record<string, unknown>,
  field: string,
  label: string,
  currentValue: unknown,
  incomingValue: unknown,
): void {
  const currentDisplay = displayValue(currentValue);
  const incomingDisplay = displayValue(incomingValue);
  if (currentDisplay === incomingDisplay) return;
  changes.push({
    field,
    label,
    current: currentDisplay,
    incoming: incomingDisplay,
  });
  updateData[field] = incomingValue;
}

function sanitizeChildren(
  candidates: string[],
  knownSkus: Map<string, ExistingSku | { sku: string; tipo: string }>,
): { validChildren: string[]; invalidChildren: string[] } {
  const validByKey = new Map<string, string>();
  const invalidChildren: string[] = [];

  for (const candidate of candidates) {
    const key = skuComparisonKey(candidate);
    const child = knownSkus.get(key);
    if (child?.tipo === "filho") {
      validByKey.set(key, child.sku);
    } else if (!invalidChildren.some((item) => skuComparisonKey(item) === key)) {
      invalidChildren.push(candidate);
    }
  }

  return {
    validChildren: [...validByKey.values()],
    invalidChildren,
  };
}

async function buildSkuImportAnalysis(userId: string, file: File) {
  const records = await readSpreadsheetRecords(file);
  assertSpreadsheetColumns(records, [
    { label: "SKU", aliases: ["sku", "codigo", "codigo sku"] },
    { label: "Produto", aliases: ["produto", "nome do produto", "descricao"] },
  ]);

  const existingSkus = await prisma.sKU.findMany({
    where: { userId },
    select: {
      id: true,
      sku: true,
      produto: true,
      tipo: true,
      skuPai: true,
      custoUnitario: true,
      quantidade: true,
      hierarquia1: true,
      hierarquia2: true,
      ativo: true,
      temEstoque: true,
      skusFilhos: true,
      observacoes: true,
      tags: true,
    },
  });
  const existingBySku = new Map(
    existingSkus.map((item) => [skuComparisonKey(item.sku), item as ExistingSku]),
  );
  const knownForValidation = new Map<string, ExistingSku | { sku: string; tipo: string }>(
    existingSkus.map((item) => [skuComparisonKey(item.sku), item as ExistingSku]),
  );
  const parsedRows: ParsedSkuRow[] = [];
  const rows: InternalPreviewRow[] = [];
  const seenInFile = new Set<string>();

  for (const record of records) {
    try {
      const parsed = parseSkuRow(record);
      const normalizedSku = skuComparisonKey(parsed.sku);

      if (seenInFile.has(normalizedSku)) {
        rows.push({
          ...previewRowBase(record, parsed.sku, parsed.produto),
          action: "skip",
          selectable: false,
          selectedByDefault: false,
          changes: [],
          warnings: [`SKU "${parsed.sku}" está duplicado na planilha.`],
          parsed,
        });
        continue;
      }

      seenInFile.add(normalizedSku);
      parsedRows.push(parsed);
      if (!existingBySku.has(normalizedSku)) {
        knownForValidation.set(normalizedSku, { sku: parsed.sku, tipo: parsed.tipo });
      }
    } catch (error) {
      rows.push({
        ...previewRowBase(record, "-", "-"),
        action: "error",
        selectable: false,
        selectedByDefault: false,
        changes: [],
        errors: [error instanceof Error ? error.message : "Linha inválida."],
      });
    }
  }

  const knownParents = new Map(
    [...knownForValidation.values()]
      .filter((item) => item.tipo === "pai")
      .map((item) => [skuComparisonKey(item.sku), item.sku]),
  );

  for (const parsed of parsedRows) {
    const record = { rowNumber: parsed.rowNumber, values: {} };
    const existing = existingBySku.get(skuComparisonKey(parsed.sku));
    const base = previewRowBase(record, parsed.sku, parsed.produto);
    const warnings: string[] = [];
    const errors: string[] = [];

    if (parsed.tipo === "filho" && parsed.skuPai) {
      const parentSku = knownParents.get(skuComparisonKey(parsed.skuPai));
      if (!parentSku) {
        errors.push(`SKU Pai "${parsed.skuPai}" não encontrado no sistema nem na planilha.`);
      } else {
        parsed.skuPai = parentSku;
      }
    }

    if (!existing) {
      let replacementChildren: string[] | undefined;
      if (parsed.tipo === "pai" && parsed.skusFilhos.length > 0) {
        const { validChildren, invalidChildren } = sanitizeChildren(
          parsed.skusFilhos,
          knownForValidation,
        );
        replacementChildren = validChildren;
        if (invalidChildren.length > 0) {
          warnings.push(
            `Filhos inexistentes ou que não são individuais serão ignorados: ${invalidChildren.join(", ")}.`,
          );
        }
      } else if (parsed.provided.skusFilhos) {
        warnings.push("Lista de filhos só é aplicada em SKUs do tipo kit.");
      }

      rows.push({
        ...base,
        action: errors.length > 0 ? "error" : "create",
        selectable: errors.length === 0,
        selectedByDefault: errors.length === 0,
        changes: [
          { field: "produto", label: "Produto", current: "-", incoming: parsed.produto },
          { field: "tipo", label: "Tipo", current: "-", incoming: parsed.tipo === "pai" ? "Kit" : "Individual" },
          ...(parsed.tipo === "filho"
            ? [
                {
                  field: "custoUnitario",
                  label: "Custo unitário",
                  current: "-",
                  incoming: displayValue(parsed.custoUnitario),
                },
                {
                  field: "quantidade",
                  label: "Quantidade",
                  current: "-",
                  incoming: displayValue(parsed.quantidade),
                },
              ]
            : []),
        ],
        warnings,
        errors,
        parsed,
        replacementChildren,
      });
      continue;
    }

    const changes: PreviewChange[] = [];
    const updateData: Record<string, unknown> = {};

    if (parsed.provided.tipo && parsed.tipo !== existing.tipo) {
      errors.push("Tipo de SKU existente não pode ser alterado por planilha.");
    }

    addChange(changes, updateData, "produto", "Produto", existing.produto, parsed.produto);

    if (existing.tipo === "filho") {
      if (parsed.provided.custoUnitario) {
        addChange(
          changes,
          updateData,
          "custoUnitario",
          "Custo unitário",
          Number(existing.custoUnitario ?? 0),
          parsed.custoUnitario,
        );
      }
      if (parsed.provided.quantidade) {
        addChange(
          changes,
          updateData,
          "quantidade",
          "Quantidade",
          existing.quantidade,
          parsed.quantidade,
        );
      }
      if (parsed.provided.skuPai) {
        addChange(changes, updateData, "skuPai", "SKU Pai", existing.skuPai, parsed.skuPai);
      }
    } else {
      if (parsed.provided.custoUnitario) {
        warnings.push("Custo unitário de kit não é atualizado; o custo do kit vem dos filhos.");
      }
      if (parsed.provided.quantidade) {
        warnings.push("Quantidade de kit não é atualizada; kits ficam com quantidade 0.");
      }
    }

    for (const field of Object.keys(TEXT_FIELDS)) {
      if (parsed.provided[field as keyof ParsedSkuRow["provided"]]) {
        addChange(
          changes,
          updateData,
          field,
          field === "hierarquia1"
            ? "Hierarquia 1"
            : field === "hierarquia2"
              ? "Hierarquia 2"
              : "Observações",
          existing[field as keyof ExistingSku],
          parsed[field as keyof ParsedSkuRow],
        );
      }
    }

    if (parsed.provided.ativo) {
      addChange(changes, updateData, "ativo", "Ativo", existing.ativo, parsed.ativo);
    }
    if (parsed.provided.temEstoque) {
      addChange(
        changes,
        updateData,
        "temEstoque",
        "Tem estoque",
        existing.temEstoque,
        parsed.temEstoque,
      );
    }
    if (parsed.provided.tags) {
      const currentTags = asStringArray(existing.tags);
      if (!sameStringList(currentTags, parsed.tags)) {
        changes.push({
          field: "tags",
          label: "Tags",
          current: displayValue(currentTags),
          incoming: displayValue(parsed.tags),
        });
        updateData.tags = parsed.tags;
      }
    }

    let replacementChildren: string[] | undefined;
    if (existing.tipo === "pai" && parsed.provided.skusFilhos) {
      const { validChildren, invalidChildren } = sanitizeChildren(
        parsed.skusFilhos,
        knownForValidation,
      );
      replacementChildren = validChildren;
      const currentChildren = asStringArray(existing.skusFilhos);
      if (!sameStringList(currentChildren, validChildren)) {
        changes.push({
          field: "skusFilhos",
          label: "SKUs filhos",
          current: displayValue(currentChildren),
          incoming: displayValue(validChildren),
        });
        updateData.skusFilhos = validChildren;
      }
      if (invalidChildren.length > 0) {
        warnings.push(
          `Filhos inexistentes ou que não são individuais serão ignorados: ${invalidChildren.join(", ")}.`,
        );
      }
    } else if (parsed.provided.skusFilhos) {
      warnings.push("Lista de filhos só é aplicada em SKUs do tipo kit.");
    }

    const action: PreviewAction =
      errors.length > 0 ? "error" : changes.length > 0 ? "update" : "skip";

    rows.push({
      ...base,
      action,
      selectable: action === "update",
      selectedByDefault: action === "update",
      changes,
      warnings,
      errors,
      parsed,
      existing,
      updateData,
      replacementChildren,
    });
  }

  const publicRows: PublicPreviewRow[] = rows.map((row) => ({
    id: row.id,
    rowNumber: row.rowNumber,
    sku: row.sku,
    produto: row.produto,
    action: row.action,
    selectable: row.selectable,
    selectedByDefault: row.selectedByDefault,
    changes: row.changes,
    warnings: row.warnings,
    errors: row.errors,
  }));
  return {
    internalRows: rows,
    preview: {
      total: rows.length,
      creates: rows.filter((row) => row.action === "create").length,
      updates: rows.filter((row) => row.action === "update").length,
      skips: rows.filter((row) => row.action === "skip").length,
      errors: rows.filter((row) => row.action === "error").length,
      selectable: rows.filter((row) => row.selectable).length,
      rows: publicRows,
    } satisfies ImportPreview,
  };
}

function parseSelectedRows(value: FormDataEntryValue | null): Set<string> {
  if (!value) return new Set();
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return new Set(parsed.map(String));
  } catch {}
  return new Set();
}

async function replaceKitChildren(
  tx: Prisma.TransactionClient,
  userId: string,
  parentSku: string,
  children: string[],
): Promise<void> {
  const validChildren = children.length > 0
    ? (
        await tx.sKU.findMany({
          where: {
            userId,
            sku: { in: children },
            tipo: "filho",
          },
          select: { sku: true },
        })
      ).map((child) => child.sku)
    : [];

  await tx.sKU.updateMany({
    where: {
      userId,
      skuPai: parentSku,
      sku: { notIn: validChildren },
    },
    data: { skuPai: null },
  });
  if (validChildren.length > 0) {
    await tx.sKU.updateMany({
      where: {
        userId,
        sku: { in: validChildren },
        tipo: "filho",
      },
      data: { skuPai: parentSku },
    });
  }
  await tx.sKU.update({
    where: {
      userId_sku: {
        userId,
        sku: parentSku,
      },
    },
    data: { skusFilhos: validChildren },
  });
}

async function mergeKitChildren(
  tx: Prisma.TransactionClient,
  userId: string,
  parentSku: string,
  children: string[],
): Promise<void> {
  const validChildren = children.length > 0
    ? (
        await tx.sKU.findMany({
          where: {
            userId,
            sku: { in: children },
            tipo: "filho",
          },
          select: { sku: true },
        })
      ).map((child) => child.sku)
    : [];
  if (validChildren.length === 0) return;

  const parent = await tx.sKU.findUnique({
    where: {
      userId_sku: {
        userId,
        sku: parentSku,
      },
    },
    select: { skusFilhos: true },
  });
  if (!parent) return;

  const merged = asStringArray(parent.skusFilhos);
  for (const child of validChildren) {
    if (!merged.some((item) => skuComparisonKey(item) === skuComparisonKey(child))) {
      merged.push(child);
    }
  }

  await tx.sKU.updateMany({
    where: {
      userId,
      sku: { in: validChildren },
      tipo: "filho",
    },
    data: { skuPai: parentSku },
  });
  await tx.sKU.update({
    where: {
      userId_sku: {
        userId,
        sku: parentSku,
      },
    },
    data: { skusFilhos: merged },
  });
}

async function applySkuImport(
  userId: string,
  rows: InternalPreviewRow[],
  selectedRows: Set<string>,
  alteredBy: string,
): Promise<ImportResults & { created: number; updated: number }> {
  const results = {
    ...createImportResults(rows.length),
    created: 0,
    updated: 0,
  };
  const relationWork: RelationWork = {
    replacements: new Map(),
    additions: new Map(),
    removals: new Map(),
  };
  const selectedParentKeys = new Set(
    rows
      .filter(
        (row) =>
          selectedRows.has(row.id) &&
          row.selectable &&
          row.parsed?.tipo === "pai" &&
          (row.action === "create" || row.action === "update"),
      )
      .map((row) => skuComparisonKey(row.parsed!.sku)),
  );
  const existingParentKeys = new Set(
    (
      await prisma.sKU.findMany({
        where: { userId, tipo: "pai" },
        select: { sku: true },
      })
    ).map((parent) => skuComparisonKey(parent.sku)),
  );
  const rowsToProcess = [...rows].sort((left, right) => {
    const leftType = left.parsed?.tipo === "pai" ? 0 : 1;
    const rightType = right.parsed?.tipo === "pai" ? 0 : 1;
    return leftType - rightType;
  });

  for (const row of rowsToProcess) {
    if (row.action === "error") {
      addImportError(results, row.rowNumber, row.errors.join(" ") || "Linha inválida.");
      continue;
    }

    if (!row.selectable || !selectedRows.has(row.id)) {
      results.skipped += 1;
      continue;
    }
    if (!row.parsed) {
      addImportError(results, row.rowNumber, "Linha inválida.");
      continue;
    }

    try {
      if (
        row.parsed.tipo === "filho" &&
        row.parsed.skuPai &&
        !existingParentKeys.has(skuComparisonKey(row.parsed.skuPai)) &&
        !selectedParentKeys.has(skuComparisonKey(row.parsed.skuPai))
      ) {
        addImportError(
          results,
          row.rowNumber,
          `SKU Pai "${row.parsed.skuPai}" não foi aplicado; selecione também o kit ou cadastre-o antes.`,
        );
        continue;
      }

      if (row.action === "create") {
        const parsed = row.parsed;
        await prisma.$transaction(async (tx) => {
          const createdSku = await tx.sKU.create({
            data: {
              userId,
              sku: parsed.sku,
              produto: parsed.produto,
              tipo: parsed.tipo,
              skuPai: parsed.skuPai,
              custoUnitario: parsed.tipo === "pai" ? 0 : parsed.custoUnitario,
              quantidade: parsed.tipo === "pai" ? 0 : parsed.quantidade,
              hierarquia1: parsed.hierarquia1,
              hierarquia2: parsed.hierarquia2,
              ativo: parsed.ativo,
              temEstoque: parsed.temEstoque,
              proporcao: parsed.tipo === "filho" ? 1 : null,
              skusFilhos: parsed.tipo === "pai" ? row.replacementChildren ?? parsed.skusFilhos : undefined,
              observacoes: parsed.observacoes,
              tags: parsed.tags.length > 0 ? parsed.tags : undefined,
            },
          });

          if (parsed.tipo === "filho") {
            await tx.sKUCustoHistorico.create({
              data: {
                skuId: createdSku.id,
                userId,
                custoNovo: parsed.custoUnitario,
                quantidade: parsed.quantidade,
                motivo: "Criação inicial por importação de planilha",
                tipoAlteracao: "importacao_excel",
                alteradoPor: alteredBy,
              },
            });

            if (parsed.custoUnitario > 0) {
              await applySkuCostRetroactively(tx, {
                userId,
                sku: parsed.sku,
                custoUnitario: parsed.custoUnitario,
              });
            }
          }
        });

        if (parsed.tipo === "pai") {
          relationWork.replacements.set(parsed.sku, row.replacementChildren ?? []);
          existingParentKeys.add(skuComparisonKey(parsed.sku));
        } else if (parsed.skuPai) {
          addUnique(relationWork.additions, parsed.skuPai, [parsed.sku]);
        }
        results.created += 1;
        results.success += 1;
        continue;
      }

      if (row.action === "update" && row.existing && row.updateData) {
        const parsed = row.parsed;
        const existing = row.existing;
        const updateData = { ...row.updateData };
        await prisma.$transaction(async (tx) => {
          const oldCusto = Number(existing.custoUnitario ?? 0);
          const newCusto =
            updateData.custoUnitario !== undefined ? Number(updateData.custoUnitario) : oldCusto;
          const custoChanged =
            updateData.custoUnitario !== undefined &&
            Number.isFinite(newCusto) &&
            Number.isFinite(oldCusto) &&
            newCusto !== oldCusto;

          const updated = await tx.sKU.update({
            where: { id: existing.id },
            data: updateData,
          });

          if (custoChanged) {
            await tx.sKUCustoHistorico.create({
              data: {
                skuId: existing.id,
                userId,
                custoAnterior: oldCusto,
                custoNovo: newCusto,
                quantidade: updated.quantidade,
                motivo: "Atualização por importação de planilha",
                tipoAlteracao: "importacao_excel",
                alteradoPor: alteredBy,
              },
            });
          }

          if (custoChanged && oldCusto <= 0 && newCusto > 0 && updated.tipo === "filho") {
            await applySkuCostRetroactively(tx, {
              userId,
              sku: updated.sku,
              custoUnitario: newCusto,
            });
          }
        });

        if (existing.tipo === "pai" && row.replacementChildren !== undefined) {
          relationWork.replacements.set(existing.sku, row.replacementChildren);
        }
        if (existing.tipo === "filho" && parsed.skuPai && parsed.provided.skuPai) {
          addUnique(relationWork.additions, parsed.skuPai, [existing.sku]);
          if (existing.skuPai && skuComparisonKey(existing.skuPai) !== skuComparisonKey(parsed.skuPai)) {
            addUnique(relationWork.removals, existing.skuPai, [existing.sku]);
          }
        }
        results.updated += 1;
        results.success += 1;
      }
    } catch (error) {
      const prismaCode =
        typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (prismaCode === "P2002") {
        results.skipped += 1;
        addImportWarning(results, row.rowNumber, `SKU "${row.sku}" já existe e não foi gravado.`);
      } else {
        console.error(`Erro ao aplicar importação de SKU da linha ${row.rowNumber}:`, error);
        addImportError(results, row.rowNumber, "Erro ao salvar o SKU.");
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const [parentSku, children] of relationWork.replacements.entries()) {
        await replaceKitChildren(tx, userId, parentSku, children);
      }
      for (const [parentSku, children] of relationWork.additions.entries()) {
        if (relationWork.replacements.has(parentSku)) continue;
        await mergeKitChildren(tx, userId, parentSku, children);
      }
      for (const [parentSku, children] of relationWork.removals.entries()) {
        if (relationWork.replacements.has(parentSku)) continue;
        const parent = await tx.sKU.findUnique({
          where: { userId_sku: { userId, sku: parentSku } },
          select: { skusFilhos: true },
        });
        if (!parent) continue;
        const removedKeys = new Set(children.map(skuComparisonKey));
        const nextChildren = asStringArray(parent.skusFilhos).filter(
          (child) => !removedKeys.has(skuComparisonKey(child)),
        );
        await tx.sKU.update({
          where: { userId_sku: { userId, sku: parentSku } },
          data: { skusFilhos: nextChildren },
        });
      }
    });
  } catch (error) {
    console.error("Erro ao sincronizar relações de kit na importação:", error);
    addImportWarning(
      results,
      0,
      "Os SKUs foram salvos, mas houve falha ao sincronizar todas as relações de kit.",
    );
  }

  return results;
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
    const mode = String(formData.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    }
    if (mode !== "preview" && mode !== "commit") {
      return NextResponse.json({ error: "Modo de importação inválido." }, { status: 400 });
    }

    const analysis = await buildSkuImportAnalysis(session.sub, file);
    if (mode === "preview") {
      return NextResponse.json({ preview: analysis.preview });
    }

    const selectedRowsPayload = formData.get("selectedRows");
    if (!selectedRowsPayload) {
      return NextResponse.json(
        { error: "Selecione as linhas que devem ser aplicadas antes de importar." },
        { status: 400 },
      );
    }

    const selectedRows = parseSelectedRows(selectedRowsPayload);
    const results = await applySkuImport(
      session.sub,
      analysis.internalRows,
      selectedRows,
      session.sub,
    );

    if (results.success > 0) {
      invalidateSKUCache(session.sub);
      invalidateVendasCache(session.sub);
    }

    return NextResponse.json({ results, preview: analysis.preview });
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
