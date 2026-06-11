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

    const contas = await prisma.contaReceber.findMany({
      where: { userId: session.sub },
      include: {
        categoria: true,
        formaPagamento: true,
      },
      orderBy: { dataVencimento: "desc" },
    });

    return NextResponse.json({ data: contas });
  } catch (error) {
    console.error("Erro ao buscar contas a receber:", error);
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
    const { descricao, valor, dataPagamento, categoriaId, formaPagamentoId } = body;

    if (!descricao || valor === undefined || valor === "") {
      return NextResponse.json(
        { error: "Descrição e valor são obrigatórios" },
        { status: 400 }
      );
    }

    const newConta = await prisma.contaReceber.create({
      data: {
        userId: session.sub,
        descricao,
        valor: Number(valor),
        // Since the UI only provides dataPagamento right now, we will use it as vencimento and recebimento
        dataVencimento: new Date(dataPagamento),
        dataRecebimento: dataPagamento ? new Date(dataPagamento) : null,
        categoriaId: categoriaId || null,
        formaPagamentoId: formaPagamentoId || null,
        status: "recebido", // As it's being inserted manually with a date
        origem: "MANUAL",
      },
    });

    return NextResponse.json({ data: newConta }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar conta a receber:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
