import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import { invalidateVendasCache } from "@/lib/cache";
import {
  parseTaxPeriod,
  parseTaxRate,
  resolveTaxAccount,
} from "@/lib/aliquota-imposto";

export const runtime = "nodejs";

async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const session = await verifySessionToken(
      request.cookies.get("session")?.value,
    );
    return session.sub;
  } catch {
    return null;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.aliquotaImposto.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Alíquota não encontrada" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const account = await resolveTaxAccount(userId, body);
    const aliquota = parseTaxRate(body.aliquota);
    const periodo = parseTaxPeriod(body.dataInicio, body.dataFim);

    if (!account || aliquota === null || !periodo) {
      return NextResponse.json(
        { error: "Conta, alíquota e período válidos são obrigatórios" },
        { status: 400 },
      );
    }
    const overlapping = await prisma.aliquotaImposto.findFirst({
      where: {
        id: { not: id },
        userId,
        OR: [
          { accountId: account.id, plataforma: account.tipo },
          {
            accountId: null,
            conta: { equals: account.nome, mode: "insensitive" },
          },
        ],
        ativo: true,
        dataInicio: { lte: periodo.fim },
        dataFim: { gte: periodo.inicio },
      },
      select: { id: true },
    });
    if (overlapping) {
      return NextResponse.json(
        { error: "Já existe uma alíquota ativa para esta conta e período" },
        { status: 409 },
      );
    }

    const updated = await prisma.aliquotaImposto.update({
      where: { id },
      data: {
        conta: account.nome,
        accountId: account.id,
        plataforma: account.tipo,
        aliquota,
        dataInicio: periodo.inicio,
        dataFim: periodo.fim,
        descricao:
          typeof body.descricao === "string" && body.descricao.trim()
            ? body.descricao.trim()
            : null,
      },
    });

    invalidateVendasCache(userId);

    return NextResponse.json({
      data: { ...updated, aliquota: Number(updated.aliquota) },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    console.error("Erro ao atualizar alíquota:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar alíquota" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await prisma.aliquotaImposto.deleteMany({
      where: { id, userId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Alíquota não encontrada" },
        { status: 404 },
      );
    }

    invalidateVendasCache(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir alíquota:", error);
    return NextResponse.json(
      { error: "Erro ao excluir alíquota" },
      { status: 500 },
    );
  }
}
