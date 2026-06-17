import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import {
  assertSpreadsheetColumns,
  getSpreadsheetValue,
  normalizeComparisonText,
  normalizeSpreadsheetKey,
  normalizeSpreadsheetText,
  parseSpreadsheetDate,
  parseSpreadsheetMoney,
  readSpreadsheetRecords,
  spreadsheetDateKey,
  type ImportErrorDetail,
  type SpreadsheetRecord,
} from "@/lib/spreadsheet";

export const runtime = "nodejs";
export const maxDuration = 300;

type FinanceImportType =
  | "contas_pagar"
  | "contas_receber"
  | "categorias"
  | "formas_pagamento";

type PreviewAction = "create" | "skip" | "error";

type CategoryRef = {
  id: string;
  nome: string;
  tipo: string | null;
};

type PaymentMethodRef = {
  id: string;
  nome: string;
};

type ParsedFinanceRow =
  | {
      kind: "categoria";
      nome: string;
      tipo: "RECEITA" | "DESPESA";
      key: string;
    }
  | {
      kind: "forma_pagamento";
      nome: string;
      key: string;
    }
  | {
      kind: "conta";
      isPayable: boolean;
      descricao: string;
      valor: number;
      dataVencimento: Date;
      settlementDate: Date | null;
      categoriaNome: string;
      formaPagamentoNome: string;
      expectedCategoryType: "RECEITA" | "DESPESA";
      key: string;
    };

type PreviewRow = {
  id: string;
  rowNumber: number;
  title: string;
  action: PreviewAction;
  selectable: boolean;
  selectedByDefault: boolean;
  details: string[];
  warnings: string[];
  errors: string[];
};

type InternalPreviewRow = PreviewRow & {
  parsed?: ParsedFinanceRow;
};

type FinanceImportPreview = {
  total: number;
  creates: number;
  skips: number;
  errors: number;
  selectable: number;
  rows: PreviewRow[];
};

type FinanceImportResults = {
  totalRows: number;
  processedRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  errorDetails: ImportErrorDetail[];
  createdCategories: number;
  createdPaymentMethods: number;
};

function financeTypeIsValid(value: string): value is FinanceImportType {
  return ["contas_pagar", "contas_receber", "categorias", "formas_pagamento"].includes(
    value,
  );
}

function parseCategoryType(value: unknown): "RECEITA" | "DESPESA" | null {
  const normalized = normalizeSpreadsheetKey(value);
  if (["receita", "receitas", "entrada", "entradas"].includes(normalized)) return "RECEITA";
  if (["despesa", "despesas", "saida", "saidas"].includes(normalized)) return "DESPESA";
  return null;
}

function buildAccountKey(params: {
  descricao: string;
  valor: number;
  dataVencimento: Date;
  settlementDate: Date | null;
  categoria: string;
  formaPagamento: string;
}): string {
  return [
    normalizeComparisonText(params.descricao),
    params.valor.toFixed(2),
    spreadsheetDateKey(params.dataVencimento),
    spreadsheetDateKey(params.settlementDate),
    normalizeComparisonText(params.categoria),
    normalizeComparisonText(params.formaPagamento),
  ].join("|");
}

function requiredText(
  record: SpreadsheetRecord,
  aliases: string[],
  fieldName: string,
): string {
  const value = normalizeSpreadsheetText(getSpreadsheetValue(record.values, aliases));
  if (!value) throw new Error(`${fieldName} é obrigatório.`);
  return value;
}

function formatDate(value: Date | null): string {
  if (!value) return "-";
  const [year, month, day] = spreadsheetDateKey(value).split("-");
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function validateRequiredColumns(records: SpreadsheetRecord[], type: FinanceImportType): void {
  if (type === "contas_pagar" || type === "contas_receber") {
    assertSpreadsheetColumns(records, [
      { label: "Descrição", aliases: ["descricao", "historico", "conta"] },
      { label: "Valor", aliases: ["valor", "valor total"] },
      {
        label: "Data de Vencimento",
        aliases: ["data de vencimento", "vencimento", "data vencimento"],
      },
    ]);
  } else if (type === "categorias") {
    assertSpreadsheetColumns(records, [
      { label: "Descrição", aliases: ["descricao", "nome", "categoria"] },
      { label: "Tipo", aliases: ["tipo"] },
    ]);
  } else {
    assertSpreadsheetColumns(records, [
      { label: "Nome", aliases: ["nome", "descricao", "forma de pagamento"] },
    ]);
  }
}

function parseFinanceRow(record: SpreadsheetRecord, type: FinanceImportType): ParsedFinanceRow {
  if (type === "categorias") {
    const nome = requiredText(record, ["descricao", "nome", "categoria"], "Descrição");
    const tipo = parseCategoryType(getSpreadsheetValue(record.values, ["tipo"]));
    if (!tipo) throw new Error('Tipo inválido. Use "RECEITA" ou "DESPESA".');
    return {
      kind: "categoria",
      nome,
      tipo,
      key: `${tipo}|${normalizeComparisonText(nome)}`,
    };
  }

  if (type === "formas_pagamento") {
    const nome = requiredText(record, ["nome", "descricao", "forma de pagamento"], "Nome");
    return {
      kind: "forma_pagamento",
      nome,
      key: normalizeComparisonText(nome),
    };
  }

  const isPayable = type === "contas_pagar";
  const descricao = requiredText(record, ["descricao", "historico", "conta"], "Descrição");
  const valor = parseSpreadsheetMoney(getSpreadsheetValue(record.values, ["valor", "valor total"]));
  if (valor === null || valor <= 0) throw new Error("Valor deve ser um número maior que zero.");

  const dataVencimento = parseSpreadsheetDate(
    getSpreadsheetValue(record.values, ["data de vencimento", "vencimento", "data vencimento"]),
  );
  if (!dataVencimento) throw new Error("Data de Vencimento é obrigatória ou está inválida.");

  const settlementRaw = getSpreadsheetValue(
    record.values,
    isPayable
      ? ["data de pagamento", "pagamento", "data pagamento"]
      : ["data de recebimento", "recebimento", "data recebimento"],
  );
  const settlementText = normalizeSpreadsheetText(settlementRaw);
  const settlementDate = parseSpreadsheetDate(settlementRaw);
  if (settlementText && !settlementDate) {
    throw new Error(isPayable ? "Data de Pagamento inválida." : "Data de Recebimento inválida.");
  }

  const categoriaNome = normalizeSpreadsheetText(getSpreadsheetValue(record.values, ["categoria"]));
  const formaPagamentoNome = normalizeSpreadsheetText(
    getSpreadsheetValue(record.values, ["forma de pagamento", "forma pagamento", "pagamento via"]),
  );
  const expectedCategoryType = isPayable ? "DESPESA" : "RECEITA";

  return {
    kind: "conta",
    isPayable,
    descricao,
    valor,
    dataVencimento,
    settlementDate,
    categoriaNome,
    formaPagamentoNome,
    expectedCategoryType,
    key: buildAccountKey({
      descricao,
      valor,
      dataVencimento,
      settlementDate,
      categoria: categoriaNome,
      formaPagamento: formaPagamentoNome,
    }),
  };
}

async function loadFinanceRefs(userId: string, type: FinanceImportType) {
  const [categories, paymentMethods] = await Promise.all([
    prisma.categoria.findMany({
      where: { userId },
      select: { id: true, nome: true, tipo: true },
    }),
    prisma.formaPagamento.findMany({
      where: { userId },
      select: { id: true, nome: true },
    }),
  ]);

  const categoryByTypeAndName = new Map<string, CategoryRef>();
  for (const category of categories) {
    categoryByTypeAndName.set(
      `${String(category.tipo ?? "").toUpperCase()}|${normalizeComparisonText(category.nome)}`,
      category,
    );
  }

  const paymentByName = new Map<string, PaymentMethodRef>();
  for (const paymentMethod of paymentMethods) {
    paymentByName.set(normalizeComparisonText(paymentMethod.nome), paymentMethod);
  }

  const existingAccountKeys = new Set<string>();
  if (type === "contas_pagar") {
    const accounts = await prisma.contaPagar.findMany({
      where: { userId },
      select: {
        descricao: true,
        valor: true,
        dataVencimento: true,
        dataPagamento: true,
        categoria: { select: { nome: true } },
        formaPagamento: { select: { nome: true } },
      },
    });
    for (const account of accounts) {
      existingAccountKeys.add(
        buildAccountKey({
          descricao: account.descricao,
          valor: Number(account.valor),
          dataVencimento: account.dataVencimento,
          settlementDate: account.dataPagamento,
          categoria: account.categoria?.nome ?? "",
          formaPagamento: account.formaPagamento?.nome ?? "",
        }),
      );
    }
  } else if (type === "contas_receber") {
    const accounts = await prisma.contaReceber.findMany({
      where: { userId },
      select: {
        descricao: true,
        valor: true,
        dataVencimento: true,
        dataRecebimento: true,
        categoria: { select: { nome: true } },
        formaPagamento: { select: { nome: true } },
      },
    });
    for (const account of accounts) {
      existingAccountKeys.add(
        buildAccountKey({
          descricao: account.descricao,
          valor: Number(account.valor),
          dataVencimento: account.dataVencimento,
          settlementDate: account.dataRecebimento,
          categoria: account.categoria?.nome ?? "",
          formaPagamento: account.formaPagamento?.nome ?? "",
        }),
      );
    }
  }

  return { categoryByTypeAndName, paymentByName, existingAccountKeys };
}

async function buildFinanceImportAnalysis(userId: string, file: File, type: FinanceImportType) {
  const records = await readSpreadsheetRecords(file);
  validateRequiredColumns(records, type);
  const refs = await loadFinanceRefs(userId, type);
  const rows: InternalPreviewRow[] = [];
  const seenRows = new Set<string>();

  for (const record of records) {
    try {
      const parsed = parseFinanceRow(record, type);
      const warnings: string[] = [];
      const details: string[] = [];
      let title = "";
      let alreadyExists = false;

      if (parsed.kind === "categoria") {
        title = parsed.nome;
        alreadyExists = refs.categoryByTypeAndName.has(parsed.key) || seenRows.has(parsed.key);
        details.push(`Tipo: ${parsed.tipo}`);
      } else if (parsed.kind === "forma_pagamento") {
        title = parsed.nome;
        alreadyExists = refs.paymentByName.has(parsed.key) || seenRows.has(parsed.key);
      } else {
        title = parsed.descricao;
        alreadyExists = refs.existingAccountKeys.has(parsed.key) || seenRows.has(parsed.key);
        details.push(`Valor: ${formatMoney(parsed.valor)}`);
        details.push(`Vencimento: ${formatDate(parsed.dataVencimento)}`);
        details.push(
          `${parsed.isPayable ? "Pagamento" : "Recebimento"}: ${formatDate(parsed.settlementDate)}`,
        );
        details.push(
          `Status: ${parsed.settlementDate ? (parsed.isPayable ? "pago" : "recebido") : "pendente"}`,
        );

        if (parsed.categoriaNome) {
          const categoryKey = `${parsed.expectedCategoryType}|${normalizeComparisonText(parsed.categoriaNome)}`;
          details.push(`Categoria: ${parsed.categoriaNome}`);
          if (!refs.categoryByTypeAndName.has(categoryKey)) {
            warnings.push(`Categoria "${parsed.categoriaNome}" será criada como ${parsed.expectedCategoryType}.`);
          }
        }
        if (parsed.formaPagamentoNome) {
          details.push(`Forma de pagamento: ${parsed.formaPagamentoNome}`);
          if (!refs.paymentByName.has(normalizeComparisonText(parsed.formaPagamentoNome))) {
            warnings.push(`Forma de pagamento "${parsed.formaPagamentoNome}" será criada.`);
          }
        }
      }

      if (alreadyExists) {
        rows.push({
          id: String(record.rowNumber),
          rowNumber: record.rowNumber,
          title,
          action: "skip",
          selectable: false,
          selectedByDefault: false,
          details,
          warnings: ["Registro equivalente já existe ou está duplicado na planilha."],
          errors: [],
          parsed,
        });
        continue;
      }

      seenRows.add(parsed.key);
      rows.push({
        id: String(record.rowNumber),
        rowNumber: record.rowNumber,
        title,
        action: "create",
        selectable: true,
        selectedByDefault: true,
        details,
        warnings,
        errors: [],
        parsed,
      });
    } catch (error) {
      rows.push({
        id: String(record.rowNumber),
        rowNumber: record.rowNumber,
        title: "-",
        action: "error",
        selectable: false,
        selectedByDefault: false,
        details: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : "Erro ao processar a linha."],
      });
    }
  }

  const publicRows: PreviewRow[] = rows.map((row) => ({
    id: row.id,
    rowNumber: row.rowNumber,
    title: row.title,
    action: row.action,
    selectable: row.selectable,
    selectedByDefault: row.selectedByDefault,
    details: row.details,
    warnings: row.warnings,
    errors: row.errors,
  }));

  return {
    internalRows: rows,
    refs,
    preview: {
      total: rows.length,
      creates: rows.filter((row) => row.action === "create").length,
      skips: rows.filter((row) => row.action === "skip").length,
      errors: rows.filter((row) => row.action === "error").length,
      selectable: rows.filter((row) => row.selectable).length,
      rows: publicRows,
    } satisfies FinanceImportPreview,
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

async function applyFinanceImport(
  userId: string,
  type: FinanceImportType,
  rows: InternalPreviewRow[],
  selectedRows: Set<string>,
): Promise<FinanceImportResults> {
  const refs = await loadFinanceRefs(userId, type);
  const results: FinanceImportResults = {
    totalRows: rows.length,
    processedRows: 0,
    importedRows: 0,
    skippedRows: 0,
    errorRows: 0,
    errorDetails: [],
    createdCategories: 0,
    createdPaymentMethods: 0,
  };
  const seenRows = new Set<string>();

  for (const row of rows) {
    results.processedRows += 1;
    if (row.action === "error") {
      results.errorRows += 1;
      results.errorDetails.push({
        row: row.rowNumber,
        message: row.errors.join(" ") || "Linha inválida.",
      });
      continue;
    }

    if (!row.selectable || !selectedRows.has(row.id)) {
      results.skippedRows += 1;
      continue;
    }
    if (!row.parsed) {
      results.errorRows += 1;
      results.errorDetails.push({
        row: row.rowNumber,
        message: "Linha inválida.",
      });
      continue;
    }

    try {
      const parsed = row.parsed;
      if (seenRows.has(parsed.key)) {
        results.skippedRows += 1;
        continue;
      }

      if (parsed.kind === "categoria") {
        if (refs.categoryByTypeAndName.has(parsed.key)) {
          results.skippedRows += 1;
        } else {
          const created = await prisma.categoria.create({
            data: {
              userId,
              nome: parsed.nome,
              descricao: parsed.nome,
              tipo: parsed.tipo,
              ativo: true,
            },
            select: { id: true, nome: true, tipo: true },
          });
          refs.categoryByTypeAndName.set(parsed.key, created);
          results.importedRows += 1;
          results.createdCategories += 1;
        }
      } else if (parsed.kind === "forma_pagamento") {
        if (refs.paymentByName.has(parsed.key)) {
          results.skippedRows += 1;
        } else {
          const created = await prisma.formaPagamento.create({
            data: {
              userId,
              nome: parsed.nome,
              descricao: parsed.nome,
              ativo: true,
            },
            select: { id: true, nome: true },
          });
          refs.paymentByName.set(parsed.key, created);
          results.importedRows += 1;
          results.createdPaymentMethods += 1;
        }
      } else {
        if (refs.existingAccountKeys.has(parsed.key)) {
          results.skippedRows += 1;
        } else {
          const categoryKey = `${parsed.expectedCategoryType}|${normalizeComparisonText(parsed.categoriaNome)}`;
          const paymentKey = normalizeComparisonText(parsed.formaPagamentoNome);
          const existingCategory = parsed.categoriaNome
            ? refs.categoryByTypeAndName.get(categoryKey) ?? null
            : null;
          const existingPaymentMethod = parsed.formaPagamentoNome
            ? refs.paymentByName.get(paymentKey) ?? null
            : null;

          const transactionResult = await prisma.$transaction(async (tx) => {
            let category = existingCategory;
            let paymentMethod = existingPaymentMethod;
            let categoryCreated = false;
            let paymentMethodCreated = false;

            if (parsed.categoriaNome && !category) {
              category = await tx.categoria.create({
                data: {
                  userId,
                  nome: parsed.categoriaNome,
                  descricao: parsed.categoriaNome,
                  tipo: parsed.expectedCategoryType,
                  ativo: true,
                },
                select: { id: true, nome: true, tipo: true },
              });
              categoryCreated = true;
            }

            if (parsed.formaPagamentoNome && !paymentMethod) {
              paymentMethod = await tx.formaPagamento.create({
                data: {
                  userId,
                  nome: parsed.formaPagamentoNome,
                  descricao: parsed.formaPagamentoNome,
                  ativo: true,
                },
                select: { id: true, nome: true },
              });
              paymentMethodCreated = true;
            }

            if (parsed.isPayable) {
              await tx.contaPagar.create({
                data: {
                  userId,
                  descricao: parsed.descricao,
                  valor: parsed.valor,
                  dataVencimento: parsed.dataVencimento,
                  dataPagamento: parsed.settlementDate,
                  dataCompetencia: parsed.dataVencimento,
                  categoriaId: category?.id ?? null,
                  formaPagamentoId: paymentMethod?.id ?? null,
                  status: parsed.settlementDate ? "pago" : "pendente",
                  origem: "EXCEL",
                },
              });
            } else {
              await tx.contaReceber.create({
                data: {
                  userId,
                  descricao: parsed.descricao,
                  valor: parsed.valor,
                  dataVencimento: parsed.dataVencimento,
                  dataRecebimento: parsed.settlementDate,
                  categoriaId: category?.id ?? null,
                  formaPagamentoId: paymentMethod?.id ?? null,
                  status: parsed.settlementDate ? "recebido" : "pendente",
                  origem: "EXCEL",
                },
              });
            }

            return { category, paymentMethod, categoryCreated, paymentMethodCreated };
          });

          if (transactionResult.category) refs.categoryByTypeAndName.set(categoryKey, transactionResult.category);
          if (transactionResult.paymentMethod) refs.paymentByName.set(paymentKey, transactionResult.paymentMethod);
          if (transactionResult.categoryCreated) results.createdCategories += 1;
          if (transactionResult.paymentMethodCreated) results.createdPaymentMethods += 1;
          refs.existingAccountKeys.add(parsed.key);
          results.importedRows += 1;
        }
      }
      seenRows.add(parsed.key);
    } catch (error) {
      results.errorRows += 1;
      results.errorDetails.push({
        row: row.rowNumber,
        message: error instanceof Error ? error.message : "Erro ao gravar a linha.",
      });
    }
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
    const rawType = String(formData.get("type") ?? "");
    const mode = String(formData.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    }
    if (!financeTypeIsValid(rawType)) {
      return NextResponse.json({ error: "Tipo de importação inválido." }, { status: 400 });
    }
    if (mode !== "preview" && mode !== "commit") {
      return NextResponse.json({ error: "Modo de importação inválido." }, { status: 400 });
    }

    const analysis = await buildFinanceImportAnalysis(session.sub, file, rawType);
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
    const results = await applyFinanceImport(
      session.sub,
      rawType,
      analysis.internalRows,
      selectedRows,
    );

    return NextResponse.json({ results, preview: analysis.preview });
  } catch (error) {
    console.error("Erro na importação financeira:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao importar a planilha.",
      },
      { status: 400 },
    );
  }
}
