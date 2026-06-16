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

type ProgressPayload = {
  type: "import_start" | "import_progress" | "import_complete" | "import_error";
  totalRows: number;
  processedRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  message: string;
  errorDetails?: ImportErrorDetail[];
  createdCategories?: number;
  createdPaymentMethods?: number;
};

type CategoryRef = {
  id: string;
  nome: string;
  tipo: string | null;
};

type PaymentMethodRef = {
  id: string;
  nome: string;
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

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    }
    if (!financeTypeIsValid(rawType)) {
      return NextResponse.json({ error: "Tipo de importação inválido." }, { status: 400 });
    }

    const records = await readSpreadsheetRecords(file);
    if (rawType === "contas_pagar" || rawType === "contas_receber") {
      assertSpreadsheetColumns(records, [
        { label: "Descrição", aliases: ["descricao", "historico", "conta"] },
        { label: "Valor", aliases: ["valor", "valor total"] },
        {
          label: "Data de Vencimento",
          aliases: ["data de vencimento", "vencimento", "data vencimento"],
        },
      ]);
    } else if (rawType === "categorias") {
      assertSpreadsheetColumns(records, [
        { label: "Descrição", aliases: ["descricao", "nome", "categoria"] },
        { label: "Tipo", aliases: ["tipo"] },
      ]);
    } else {
      assertSpreadsheetColumns(records, [
        { label: "Nome", aliases: ["nome", "descricao", "forma de pagamento"] },
      ]);
    }
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let controllerOpen = true;
        const send = (payload: ProgressPayload) => {
          if (!controllerOpen) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            controllerOpen = false;
          }
        };

        let processedRows = 0;
        let importedRows = 0;
        let skippedRows = 0;
        let errorRows = 0;
        let createdCategories = 0;
        let createdPaymentMethods = 0;
        const errorDetails: ImportErrorDetail[] = [];

        const progress = (
          type: ProgressPayload["type"],
          message: string,
        ): ProgressPayload => ({
          type,
          totalRows: records.length,
          processedRows,
          importedRows,
          skippedRows,
          errorRows,
          message,
          errorDetails: type === "import_complete" || type === "import_error" ? errorDetails : undefined,
          createdCategories,
          createdPaymentMethods,
        });

        try {
          send(progress("import_start", `Preparando ${records.length} linha(s)...`));

          const categories = await prisma.categoria.findMany({
            where: { userId: session.sub },
            select: { id: true, nome: true, tipo: true },
          });
          const paymentMethods = await prisma.formaPagamento.findMany({
            where: { userId: session.sub },
            select: { id: true, nome: true },
          });

          const categoryByTypeAndName = new Map<string, CategoryRef>();
          for (const category of categories) {
            const nameKey = normalizeComparisonText(category.nome);
            categoryByTypeAndName.set(
              `${String(category.tipo ?? "").toUpperCase()}|${nameKey}`,
              category,
            );
          }

          const paymentByName = new Map<string, PaymentMethodRef>();
          for (const paymentMethod of paymentMethods) {
            paymentByName.set(normalizeComparisonText(paymentMethod.nome), paymentMethod);
          }

          const existingAccountKeys = new Set<string>();
          if (rawType === "contas_pagar") {
            const accounts = await prisma.contaPagar.findMany({
              where: { userId: session.sub, origem: "EXCEL" },
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
          } else if (rawType === "contas_receber") {
            const accounts = await prisma.contaReceber.findMany({
              where: { userId: session.sub, origem: "EXCEL" },
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

          const seenRows = new Set<string>();

          for (const record of records) {
            try {
              if (rawType === "categorias") {
                const nome = requiredText(record, ["descricao", "nome", "categoria"], "Descrição");
                const tipo = parseCategoryType(getSpreadsheetValue(record.values, ["tipo"]));
                if (!tipo) throw new Error('Tipo inválido. Use "RECEITA" ou "DESPESA".');

                const key = `${tipo}|${normalizeComparisonText(nome)}`;
                if (categoryByTypeAndName.has(key) || seenRows.has(key)) {
                  skippedRows += 1;
                } else {
                  const created = await prisma.categoria.create({
                    data: {
                      userId: session.sub,
                      nome,
                      descricao: nome,
                      tipo,
                      ativo: true,
                    },
                    select: { id: true, nome: true, tipo: true },
                  });
                  categoryByTypeAndName.set(key, created);
                  seenRows.add(key);
                  importedRows += 1;
                  createdCategories += 1;
                }
              } else if (rawType === "formas_pagamento") {
                const nome = requiredText(
                  record,
                  ["nome", "descricao", "forma de pagamento"],
                  "Nome",
                );
                const key = normalizeComparisonText(nome);
                if (paymentByName.has(key) || seenRows.has(key)) {
                  skippedRows += 1;
                } else {
                  const created = await prisma.formaPagamento.create({
                    data: {
                      userId: session.sub,
                      nome,
                      descricao: nome,
                      ativo: true,
                    },
                    select: { id: true, nome: true },
                  });
                  paymentByName.set(key, created);
                  seenRows.add(key);
                  importedRows += 1;
                  createdPaymentMethods += 1;
                }
              } else {
                const isPayable = rawType === "contas_pagar";
                const descricao = requiredText(
                  record,
                  ["descricao", "historico", "conta"],
                  "Descrição",
                );
                const valor = parseSpreadsheetMoney(
                  getSpreadsheetValue(record.values, ["valor", "valor total"]),
                );
                if (valor === null || valor <= 0) {
                  throw new Error("Valor deve ser um número maior que zero.");
                }

                const dueRaw = getSpreadsheetValue(record.values, [
                  "data de vencimento",
                  "vencimento",
                  "data vencimento",
                ]);
                const dataVencimento = parseSpreadsheetDate(dueRaw);
                if (!dataVencimento) {
                  throw new Error("Data de Vencimento é obrigatória ou está inválida.");
                }

                const settlementRaw = getSpreadsheetValue(
                  record.values,
                  isPayable
                    ? ["data de pagamento", "pagamento", "data pagamento"]
                    : ["data de recebimento", "recebimento", "data recebimento"],
                );
                const settlementText = normalizeSpreadsheetText(settlementRaw);
                const settlementDate = parseSpreadsheetDate(settlementRaw);
                if (settlementText && !settlementDate) {
                  throw new Error(
                    isPayable
                      ? "Data de Pagamento inválida."
                      : "Data de Recebimento inválida.",
                  );
                }

                const categoriaNome = normalizeSpreadsheetText(
                  getSpreadsheetValue(record.values, ["categoria"]),
                );
                const formaPagamentoNome = normalizeSpreadsheetText(
                  getSpreadsheetValue(record.values, [
                    "forma de pagamento",
                    "forma pagamento",
                    "pagamento via",
                  ]),
                );
                const expectedCategoryType = isPayable ? "DESPESA" : "RECEITA";
                const accountKey = buildAccountKey({
                  descricao,
                  valor,
                  dataVencimento,
                  settlementDate,
                  categoria: categoriaNome,
                  formaPagamento: formaPagamentoNome,
                });

                if (existingAccountKeys.has(accountKey) || seenRows.has(accountKey)) {
                  skippedRows += 1;
                } else {
                  const categoryNameKey = normalizeComparisonText(categoriaNome);
                  const categoryMapKey = `${expectedCategoryType}|${categoryNameKey}`;
                  const paymentNameKey = normalizeComparisonText(formaPagamentoNome);
                  const existingCategory = categoriaNome
                    ? categoryByTypeAndName.get(categoryMapKey) ?? null
                    : null;
                  const existingPaymentMethod = formaPagamentoNome
                    ? paymentByName.get(paymentNameKey) ?? null
                    : null;

                  const transactionResult = await prisma.$transaction(async (tx) => {
                    let category = existingCategory;
                    let paymentMethod = existingPaymentMethod;
                    let categoryCreated = false;
                    let paymentMethodCreated = false;

                    if (categoriaNome && !category) {
                      category = await tx.categoria.create({
                        data: {
                          userId: session.sub,
                          nome: categoriaNome,
                          descricao: categoriaNome,
                          tipo: expectedCategoryType,
                          ativo: true,
                        },
                        select: { id: true, nome: true, tipo: true },
                      });
                      categoryCreated = true;
                    }

                    if (formaPagamentoNome && !paymentMethod) {
                      paymentMethod = await tx.formaPagamento.create({
                        data: {
                          userId: session.sub,
                          nome: formaPagamentoNome,
                          descricao: formaPagamentoNome,
                          ativo: true,
                        },
                        select: { id: true, nome: true },
                      });
                      paymentMethodCreated = true;
                    }

                    if (isPayable) {
                      await tx.contaPagar.create({
                        data: {
                          userId: session.sub,
                          descricao,
                          valor,
                          dataVencimento,
                          dataPagamento: settlementDate,
                          dataCompetencia: dataVencimento,
                          categoriaId: category?.id ?? null,
                          formaPagamentoId: paymentMethod?.id ?? null,
                          status: settlementDate ? "pago" : "pendente",
                          origem: "EXCEL",
                        },
                      });
                    } else {
                      await tx.contaReceber.create({
                        data: {
                          userId: session.sub,
                          descricao,
                          valor,
                          dataVencimento,
                          dataRecebimento: settlementDate,
                          categoriaId: category?.id ?? null,
                          formaPagamentoId: paymentMethod?.id ?? null,
                          status: settlementDate ? "recebido" : "pendente",
                          origem: "EXCEL",
                        },
                      });
                    }

                    return {
                      category,
                      paymentMethod,
                      categoryCreated,
                      paymentMethodCreated,
                    };
                  });

                  if (transactionResult.category) {
                    categoryByTypeAndName.set(categoryMapKey, transactionResult.category);
                  }
                  if (transactionResult.paymentMethod) {
                    paymentByName.set(paymentNameKey, transactionResult.paymentMethod);
                  }
                  if (transactionResult.categoryCreated) createdCategories += 1;
                  if (transactionResult.paymentMethodCreated) createdPaymentMethods += 1;

                  seenRows.add(accountKey);
                  existingAccountKeys.add(accountKey);
                  importedRows += 1;
                }
              }
            } catch (error) {
              errorRows += 1;
              errorDetails.push({
                row: record.rowNumber,
                message: error instanceof Error ? error.message : "Erro ao processar a linha.",
              });
            } finally {
              processedRows += 1;
              if (processedRows % 10 === 0 || processedRows === records.length) {
                send(
                  progress(
                    "import_progress",
                    `Processadas ${processedRows} de ${records.length} linha(s).`,
                  ),
                );
              }
            }
          }

          send(progress("import_complete", "Importação concluída."));
        } catch (error) {
          console.error("Erro fatal na importação financeira:", error);
          send(
            progress(
              "import_error",
              error instanceof Error ? error.message : "Erro ao importar a planilha.",
            ),
          );
        } finally {
          if (controllerOpen) controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Erro ao iniciar importação financeira:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao iniciar a importação.",
      },
      { status: 400 },
    );
  }
}
