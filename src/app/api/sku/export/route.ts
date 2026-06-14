import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import { createWorkbookBuffer, spreadsheetDownloadHeaders } from "@/lib/spreadsheet";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo");
    const ativo = searchParams.get("ativo");

    const where = {
      userId: session.sub,
      ...(tipo === "pai" || tipo === "filho" ? { tipo } : {}),
      ...(ativo === "true" || ativo === "false" ? { ativo: ativo === "true" } : {}),
    };

    const skus = await prisma.sKU.findMany({
      where,
      orderBy: [{ tipo: "desc" }, { sku: "asc" }],
    });

    const rows: unknown[][] = [
      [
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
        "Criado em",
        "Atualizado em",
      ],
      ...skus.map((sku) => [
        sku.sku,
        sku.produto,
        sku.tipo === "pai" ? "Kit" : "Individual",
        sku.skuPai ?? "",
        Number(sku.custoUnitario),
        sku.quantidade,
        sku.hierarquia1 ?? "",
        sku.hierarquia2 ?? "",
        sku.ativo ? "Sim" : "Não",
        sku.temEstoque ? "Sim" : "Não",
        Array.isArray(sku.skusFilhos) ? sku.skusFilhos.join(", ") : "",
        sku.observacoes ?? "",
        Array.isArray(sku.tags) ? sku.tags.join(", ") : "",
        sku.createdAt,
        sku.updatedAt,
      ]),
    ];

    const buffer = createWorkbookBuffer([
      {
        name: "SKUs",
        rows,
        columnWidths: [24, 42, 14, 24, 18, 14, 24, 24, 12, 15, 42, 42, 30, 20, 20],
        autoFilter: `A1:O${Math.max(rows.length, 1)}`,
      },
    ]);

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: spreadsheetDownloadHeaders(`skus_${date}.xlsx`),
    });
  } catch (error) {
    console.error("Erro ao exportar SKUs:", error);
    return NextResponse.json({ error: "Erro ao exportar SKUs" }, { status: 500 });
  }
}
