import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import { resolveSkuImageForRecord } from "@/lib/sku-image";

// POST /api/sku/[id]/imagem - Busca e salva a miniatura do anúncio deste SKU
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const session = await verifySessionToken(sessionCookie);

    const { id } = await params;

    const skuObj = await prisma.sKU.findUnique({ where: { id } });
    if (!skuObj || skuObj.userId !== session.sub) {
      return NextResponse.json({ error: "SKU não encontrado" }, { status: 404 });
    }

    // Registros a tentar: o próprio SKU e, se for kit sem imagem, os filhos.
    const candidatos: Array<{ userId: string; sku: string; observacoes?: string | null }> = [
      skuObj,
    ];

    if (skuObj.tipo === "pai") {
      const rawFilhos = skuObj.skusFilhos as unknown;
      let listaFilhos: string[] = [];
      if (Array.isArray(rawFilhos)) {
        listaFilhos = rawFilhos.map((f) => String(f));
      } else if (typeof rawFilhos === "string") {
        try {
          const parsed = JSON.parse(rawFilhos);
          if (Array.isArray(parsed)) listaFilhos = parsed.map((f) => String(f));
        } catch {
          // ignora
        }
      }
      if (listaFilhos.length > 0) {
        const filhos = await prisma.sKU.findMany({
          where: { userId: session.sub, sku: { in: listaFilhos } },
          select: { userId: true, sku: true, observacoes: true },
        });
        candidatos.push(...filhos);
      }
    }

    let imagemUrl: string | null = null;
    for (const candidato of candidatos) {
      imagemUrl = await resolveSkuImageForRecord(candidato);
      if (imagemUrl) break;
    }

    if (!imagemUrl) {
      return NextResponse.json(
        {
          error:
            "Não foi possível encontrar a imagem deste SKU. Verifique se há venda recente vinculada ao anúncio.",
        },
        { status: 404 },
      );
    }

    const updated = await prisma.sKU.update({
      where: { id },
      data: { imagemUrl },
      select: { id: true, imagemUrl: true },
    });

    return NextResponse.json({ success: true, imagemUrl: updated.imagemUrl });
  } catch (error) {
    console.error("Erro ao buscar imagem do SKU:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}
