import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const session = await verifySessionToken(sessionCookie);

    const categorias = await prisma.categoria.findMany({
      where: { userId: session.sub },
      include: {
        subCategorias: true,
      },
      orderBy: { nome: "asc" },
    });

    return NextResponse.json({ data: categorias });
  } catch (error) {
    console.error("Erro ao buscar categorias:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const session = await verifySessionToken(sessionCookie);

    const body = await request.json();
    const { descricao, tipo, categoriaPaiId } = body;

    if (!descricao) {
      return NextResponse.json(
        { error: "Descrição/nome é obrigatório" },
        { status: 400 }
      );
    }

    const novaCategoria = await prisma.categoria.create({
      data: {
        userId: session.sub,
        nome: descricao,
        descricao,
        tipo: tipo || null,
        categoriaPaiId: categoriaPaiId || null,
        ativo: true,
      },
    });

    return NextResponse.json({ data: novaCategoria }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
