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

    const formas = await prisma.formaPagamento.findMany({
      where: { userId: session.sub },
      orderBy: { nome: "asc" },
    });

    return NextResponse.json({ data: formas });
  } catch (error) {
    console.error("Erro ao buscar formas de pagamento:", error);
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
    const { descricao } = body;

    if (!descricao) {
      return NextResponse.json(
        { error: "Descrição/nome é obrigatório" },
        { status: 400 }
      );
    }

    const novaForma = await prisma.formaPagamento.create({
      data: {
        userId: session.sub,
        nome: descricao,
        descricao,
        ativo: true,
      },
    });

    return NextResponse.json({ data: novaForma }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar forma de pagamento:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
