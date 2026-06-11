import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

async function getSessionUserId(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return null;
  const session = await verifySessionToken(sessionCookie);
  return session.sub;
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
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
    const existing = await prisma.contaReceber.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Receita nao encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const dataRecebimento = parseDate(body.dataRecebimento || body.dataPagamento);
    const valor = body.valor === undefined || body.valor === "" ? undefined : Number(body.valor);

    if (valor !== undefined && !Number.isFinite(valor)) {
      return NextResponse.json({ error: "Valor invalido" }, { status: 400 });
    }

    const updated = await prisma.contaReceber.update({
      where: { id },
      data: {
        descricao: body.descricao ?? existing.descricao,
        valor: valor ?? existing.valor,
        dataVencimento: dataRecebimento ?? existing.dataVencimento,
        dataRecebimento,
        categoriaId: body.categoriaId || null,
        formaPagamentoId: body.formaPagamentoId || null,
        status: dataRecebimento ? "recebido" : existing.status,
      },
      include: {
        categoria: true,
        formaPagamento: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Erro ao atualizar receita:", error);
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
    const existing = await prisma.contaReceber.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Receita nao encontrada" }, { status: 404 });
    }

    await prisma.contaReceber.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir receita:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
