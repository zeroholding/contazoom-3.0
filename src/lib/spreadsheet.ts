import * as XLSX from "xlsx";

export const MAX_SPREADSHEET_SIZE = 10 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 5000;

const SUPPORTED_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);

export type SpreadsheetRecord = {
  rowNumber: number;
  values: Record<string, unknown>;
};

export type SpreadsheetColumnRequirement = {
  label: string;
  aliases: string[];
};

export type ImportErrorDetail = {
  row: number;
  message: string;
};

export type ImportResults = {
  total: number;
  success: number;
  skipped: number;
  errors: number;
  errorDetails: ImportErrorDetail[];
  warnings: number;
  warningDetails: ImportErrorDetail[];
};

export function normalizeSpreadsheetKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeSpreadsheetText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeComparisonText(value: unknown): string {
  return normalizeSpreadsheetKey(value).replace(/_/g, " ");
}

export function getSpreadsheetExtension(fileName: string): string {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "";
}

export function validateSpreadsheetFile(file: File): void {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Arquivo não enviado.");
  }

  if (!SUPPORTED_EXTENSIONS.has(getSpreadsheetExtension(file.name))) {
    throw new Error("Formato inválido. Envie um arquivo XLSX, XLS ou CSV.");
  }

  if (file.size <= 0) {
    throw new Error("O arquivo enviado está vazio.");
  }

  if (file.size > MAX_SPREADSHEET_SIZE) {
    throw new Error("O arquivo deve ter no máximo 10MB.");
  }
}

export async function readSpreadsheetRecords(file: File): Promise<SpreadsheetRecord[]> {
  validateSpreadsheetFile(file);

  const bytes = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(bytes, {
      type: "buffer",
      cellDates: true,
      dense: false,
    });
  } catch {
    throw new Error("Não foi possível ler a planilha. Verifique se o arquivo não está corrompido.");
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("A planilha não possui nenhuma aba.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  });

  const headerRowIndex = rawRows.findIndex((row) =>
    row.some((value) => value !== null && value !== undefined && String(value).trim() !== ""),
  );
  if (headerRowIndex < 0) {
    throw new Error("A planilha não possui linhas para importar.");
  }

  const normalizedHeaders = rawRows[headerRowIndex].map(normalizeSpreadsheetKey);
  const validHeaders = normalizedHeaders.filter(Boolean);
  if (validHeaders.length === 0) {
    throw new Error("A planilha não possui cabeçalhos válidos.");
  }
  if (new Set(validHeaders).size !== validHeaders.length) {
    throw new Error("A planilha possui cabeçalhos duplicados.");
  }

  const dataRows = rawRows.slice(headerRowIndex + 1);
  if (dataRows.length > MAX_SPREADSHEET_ROWS) {
    throw new Error(
      `A planilha possui ${dataRows.length} linhas. O limite por importação é ${MAX_SPREADSHEET_ROWS}.`,
    );
  }

  const records = dataRows
    .map((row, index) => {
      const values: Record<string, unknown> = {};

      for (let columnIndex = 0; columnIndex < normalizedHeaders.length; columnIndex += 1) {
        const normalizedKey = normalizedHeaders[columnIndex];
        if (normalizedKey) values[normalizedKey] = row[columnIndex] ?? null;
      }

      return {
        rowNumber: headerRowIndex + index + 2,
        values,
      };
    })
    .filter((row) =>
      Object.values(row.values).some(
        (value) => value !== null && value !== undefined && String(value).trim() !== "",
      ),
    );

  if (records.length === 0) {
    throw new Error("A planilha possui cabeçalhos, mas não possui dados para importar.");
  }

  return records;
}

export function getSpreadsheetValue(
  values: Record<string, unknown>,
  aliases: string[],
): unknown {
  for (const alias of aliases) {
    const normalizedAlias = normalizeSpreadsheetKey(alias);
    if (Object.prototype.hasOwnProperty.call(values, normalizedAlias)) {
      return values[normalizedAlias];
    }
  }

  return undefined;
}

export function hasSpreadsheetColumn(
  values: Record<string, unknown>,
  aliases: string[],
): boolean {
  return aliases.some((alias) =>
    Object.prototype.hasOwnProperty.call(values, normalizeSpreadsheetKey(alias)),
  );
}

export function hasSpreadsheetValue(
  values: Record<string, unknown>,
  aliases: string[],
): boolean {
  if (!hasSpreadsheetColumn(values, aliases)) return false;
  const value = getSpreadsheetValue(values, aliases);
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function assertSpreadsheetColumns(
  records: SpreadsheetRecord[],
  requirements: SpreadsheetColumnRequirement[],
): void {
  const availableColumns = new Set(
    records.flatMap((record) => Object.keys(record.values)),
  );
  const missing = requirements
    .filter(
      (requirement) =>
        !requirement.aliases.some((alias) =>
          availableColumns.has(normalizeSpreadsheetKey(alias)),
        ),
    )
    .map((requirement) => requirement.label);

  if (missing.length > 0) {
    throw new Error(
      `Coluna(s) obrigatória(s) ausente(s): ${missing.join(", ")}. Baixe e use o modelo correto.`,
    );
  }
}

export function parseSpreadsheetMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }

  let text = String(value).trim();
  if (!text) return null;

  const isNegativeByParentheses = text.startsWith("(") && text.endsWith(")");
  text = text
    .replace(/[R$\s]/gi, "")
    .replace(/[()]/g, "")
    .replace(/[^\d,.-]/g, "");

  const commaPosition = text.lastIndexOf(",");
  const dotPosition = text.lastIndexOf(".");

  if (commaPosition >= 0 && dotPosition >= 0) {
    if (commaPosition > dotPosition) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (commaPosition >= 0) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (dotPosition >= 0) {
    const dotParts = text.split(".");
    const usesThousandsSeparators =
      dotParts.length > 2 ||
      (dotParts.length === 2 && dotParts[1].length === 3);
    if (usesThousandsSeparators) {
      text = text.replace(/\./g, "");
    }
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;

  const normalized = isNegativeByParentheses ? -Math.abs(parsed) : parsed;
  return Math.round(normalized * 100) / 100;
}

export function parseSpreadsheetInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(",", "."));

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  return parsed;
}

export function parseSpreadsheetBoolean(
  value: unknown,
  defaultValue: boolean,
): boolean {
  if (value === null || value === undefined || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = normalizeSpreadsheetKey(value);
  if (["sim", "s", "true", "verdadeiro", "ativo", "1"].includes(normalized)) {
    return true;
  }
  if (["nao", "n", "false", "falso", "inativo", "0"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export function parseSpreadsheetBooleanStrict(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  const normalized = normalizeSpreadsheetKey(value);
  if (["sim", "s", "true", "verdadeiro", "ativo", "1"].includes(normalized)) {
    return true;
  }
  if (["nao", "n", "false", "falso", "inativo", "0"].includes(normalized)) {
    return false;
  }

  return null;
}

function buildUtcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function parseSpreadsheetDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return buildUtcDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? buildUtcDate(parsed.y, parsed.m, parsed.d) : null;
  }

  const text = String(value).trim();
  if (!text) return null;

  const brazilianMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brazilianMatch) {
    return buildUtcDate(
      Number(brazilianMatch[3]),
      Number(brazilianMatch[2]),
      Number(brazilianMatch[1]),
    );
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return buildUtcDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return buildUtcDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

export function spreadsheetDateKey(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

export function splitSpreadsheetList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(normalizeSpreadsheetText).filter(Boolean);
  }

  const text = normalizeSpreadsheetText(value);
  if (!text) return [];

  return [...new Set(text.split(/[,;\n|]+/).map((item) => item.trim()).filter(Boolean))];
}

export function createImportResults(total: number): ImportResults {
  return {
    total,
    success: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    warnings: 0,
    warningDetails: [],
  };
}

export function addImportWarning(
  results: ImportResults,
  row: number,
  message: string,
): void {
  results.warnings += 1;
  results.warningDetails.push({ row, message });
}

export function addImportError(
  results: ImportResults,
  row: number,
  message: string,
): void {
  results.errors += 1;
  results.errorDetails.push({ row, message });
}

export function createWorkbookBuffer(
  sheets: Array<{
    name: string;
    rows: unknown[][];
    columnWidths?: number[];
    autoFilter?: string;
  }>,
): Buffer {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    if (sheet.columnWidths) {
      worksheet["!cols"] = sheet.columnWidths.map((wch) => ({ wch }));
    }
    if (sheet.autoFilter) {
      worksheet["!autofilter"] = { ref: sheet.autoFilter };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  }) as Buffer;
}

export function spreadsheetDownloadHeaders(fileName: string): HeadersInit {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  };
}
