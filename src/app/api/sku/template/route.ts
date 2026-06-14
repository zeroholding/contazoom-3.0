import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { createWorkbookBuffer, spreadsheetDownloadHeaders } from "@/lib/spreadsheet";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    await verifySessionToken(sessionCookie);

    const headers = [
      "SKU",
      "Produto",
      "Tipo",
      "SKU Pai",
      "Custo Unitário",
      "Quantidade",
      "Hierarquia 1",
      "Hierarquia 2",
      "Ativo",
      "Tem Estoque",
      "SKUs Filhos",
      "Observações",
      "Tags",
    ];

    const buffer = createWorkbookBuffer([
      {
        name: "SKUs",
        rows: [headers],
        columnWidths: [24, 42, 14, 24, 18, 14, 24, 24, 12, 15, 42, 42, 30],
        autoFilter: "A1:M1",
      },
      {
        name: "Instruções",
        rows: [
          ["Campo", "Obrigatório", "Formato e regra", "Exemplo"],
          ["SKU", "Sim", "Código único por usuário", "SKU-123"],
          ["Produto", "Sim", "Nome ou descrição do produto", "Tênis esportivo preto"],
          ["Tipo", "Não", "Individual/Filho ou Kit/Pai. Padrão: Individual", "Individual"],
          ["SKU Pai", "Não", "SKU de um kit já existente ou presente no arquivo", "KIT-001"],
          ["Custo Unitário", "Individual", "Número positivo ou zero; aceita 1234,56 e 1234.56", "49,90"],
          ["Quantidade", "Individual", "Número inteiro maior que zero. Padrão: 1", "1"],
          ["Ativo", "Não", "Sim/Não, Ativo/Inativo ou 1/0. Padrão: Sim", "Sim"],
          ["Tem Estoque", "Não", "Sim/Não ou 1/0. Padrão: Sim", "Sim"],
          ["SKUs Filhos", "Kit", "Códigos separados por vírgula ou ponto e vírgula", "SKU-1, SKU-2"],
          ["Tags", "Não", "Valores separados por vírgula ou ponto e vírgula", "calçados, verão"],
          ["Observações", "Não", "Texto livre", "Custo revisado em junho"],
          ["Duplicados", "-", "SKUs já cadastrados são ignorados e informados no resultado", "-"],
        ],
        columnWidths: [22, 16, 72, 34],
        autoFilter: "A1:D13",
      },
    ]);

    return new NextResponse(new Uint8Array(buffer), {
      headers: spreadsheetDownloadHeaders("template_skus.xlsx"),
    });
  } catch (error) {
    console.error("Erro ao gerar template de SKUs:", error);
    return NextResponse.json(
      { error: "Erro ao gerar o template de SKUs" },
      { status: 500 },
    );
  }
}
