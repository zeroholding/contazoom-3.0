import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

async function getSessionUserId(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return null;
  const session = await verifySessionToken(sessionCookie);
  return session.sub;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.categoria.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Categoria nao encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const descricao = body.descricao || body.nome;
    if (!descricao) {
      return NextResponse.json({ error: "Descricao e obrigatoria" }, { status: 400 });
    }

    const updated = await prisma.categoria.update({
      where: { id },
      data: {
        nome: descricao,
        descricao,
        tipo: body.tipo || null,
        categoriaPaiId: body.categoriaPaiId || null,
      },
      include: {
        subCategorias: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Erro ao atualizar categoria:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.categoria.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Categoria nao encontrada" }, { status: 404 });
    }

    const [contasPagar, contasReceber] = await Promise.all([
      prisma.contaPagar.count({ where: { categoriaId: id } }),
      prisma.contaReceber.count({ where: { categoriaId: id } }),
    ]);
    const usage = contasPagar + contasReceber;
    if (usage > 0) {
      return NextResponse.json(
        { error: "Categoria em uso. Remova ou altere os lancamentos antes de excluir." },
        { status: 400 },
      );
    }

    await prisma.categoria.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
