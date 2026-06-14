import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { createWorkbookBuffer, spreadsheetDownloadHeaders } from "@/lib/spreadsheet";

export const runtime = "nodejs";

type FinanceImportType =
  | "contas_pagar"
  | "contas_receber"
  | "categorias"
  | "formas_pagamento";

const TEMPLATES: Record<
  FinanceImportType,
  { fileName: string; headers: string[]; instructions: unknown[][]; widths: number[] }
> = {
  contas_pagar: {
    fileName: "modelo_contas_pagar.xlsx",
    headers: [
      "Descrição",
      "Valor",
      "Data de Vencimento",
      "Data de Pagamento",
      "Categoria",
      "Forma de Pagamento",
    ],
    widths: [46, 18, 22, 22, 30, 30],
    instructions: [
      ["Campo", "Obrigatório", "Regra", "Exemplo"],
      ["Descrição", "Sim", "Texto que identifica a despesa", "Aluguel do depósito"],
      ["Valor", "Sim", "Maior que zero; aceita 1234,56 e 1234.56", "2500,00"],
      ["Data de Vencimento", "Sim", "DD/MM/AAAA, ISO ou data nativa do Excel", "10/06/2026"],
      ["Data de Pagamento", "Não", "Preenchida define o status como Pago", "08/06/2026"],
      ["Categoria", "Não", "Se não existir, será criada como DESPESA", "Custos operacionais"],
      ["Forma de Pagamento", "Não", "Se não existir, será criada automaticamente", "PIX"],
    ],
  },
  contas_receber: {
    fileName: "modelo_contas_receber.xlsx",
    headers: [
      "Descrição",
      "Valor",
      "Data de Vencimento",
      "Data de Recebimento",
      "Categoria",
      "Forma de Pagamento",
    ],
    widths: [46, 18, 22, 22, 30, 30],
    instructions: [
      ["Campo", "Obrigatório", "Regra", "Exemplo"],
      ["Descrição", "Sim", "Texto que identifica a receita", "Venda corporativa"],
      ["Valor", "Sim", "Maior que zero; aceita 1234,56 e 1234.56", "3200,00"],
      ["Data de Vencimento", "Sim", "DD/MM/AAAA, ISO ou data nativa do Excel", "15/06/2026"],
      ["Data de Recebimento", "Não", "Preenchida define o status como Recebido", "14/06/2026"],
      ["Categoria", "Não", "Se não existir, será criada como RECEITA", "Vendas diretas"],
      ["Forma de Pagamento", "Não", "Se não existir, será criada automaticamente", "PIX"],
    ],
  },
  categorias: {
    fileName: "modelo_categorias.xlsx",
    headers: ["Descrição", "Tipo"],
    widths: [46, 20],
    instructions: [
      ["Campo", "Obrigatório", "Regra", "Exemplo"],
      ["Descrição", "Sim", "Nome da categoria", "Marketing"],
      ["Tipo", "Sim", "RECEITA ou DESPESA", "DESPESA"],
    ],
  },
  formas_pagamento: {
    fileName: "modelo_formas_pagamento.xlsx",
    headers: ["Nome"],
    widths: [46],
    instructions: [
      ["Campo", "Obrigatório", "Regra", "Exemplo"],
      ["Nome", "Sim", "Nome único da forma de pagamento", "Cartão empresarial"],
    ],
  },
};

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    await verifySessionToken(sessionCookie);

    const type = new URL(request.url).searchParams.get("type") as FinanceImportType | null;
    const template = type ? TEMPLATES[type] : null;
    if (!template) {
      return NextResponse.json({ error: "Tipo de modelo inválido." }, { status: 400 });
    }

    const buffer = createWorkbookBuffer([
      {
        name: "Importação",
        rows: [template.headers],
        columnWidths: template.widths,
        autoFilter: `A1:${String.fromCharCode(64 + template.headers.length)}1`,
      },
      {
        name: "Instruções",
        rows: template.instructions,
        columnWidths: [28, 16, 72, 34],
        autoFilter: `A1:D${template.instructions.length}`,
      },
    ]);

    return new NextResponse(new Uint8Array(buffer), {
      headers: spreadsheetDownloadHeaders(template.fileName),
    });
  } catch (error) {
    console.error("Erro ao gerar modelo financeiro:", error);
    return NextResponse.json(
      { error: "Erro ao gerar o modelo financeiro." },
      { status: 500 },
    );
  }
}
