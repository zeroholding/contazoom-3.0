import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";

function parseAliquota(value: unknown): number | null {
  const normalized =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : null;
}

function parsePeriod(dataInicio: unknown, dataFim: unknown) {
  if (typeof dataInicio !== "string" || typeof dataFim !== "string") {
    return null;
  }

  const inicioInformado = new Date(dataInicio);
  const fimInformado = new Date(dataFim);
  if (
    Number.isNaN(inicioInformado.getTime()) ||
    Number.isNaN(fimInformado.getTime())
  ) {
    return null;
  }

  const inicio = new Date(
    Date.UTC(
      inicioInformado.getUTCFullYear(),
      inicioInformado.getUTCMonth(),
      1,
    ),
  );
  const fim = new Date(
    Date.UTC(
      fimInformado.getUTCFullYear(),
      fimInformado.getUTCMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );

  return inicio <= fim ? { inicio, fim } : null;
}

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

async function accountBelongsToUser(userId: string, conta: string) {
  const [meliAccounts, shopeeAccounts] = await Promise.all([
    prisma.meliAccount.findMany({
      where: { userId },
      select: { nickname: true, ml_user_id: true },
    }),
    prisma.shopeeAccount.findMany({
      where: { userId },
      select: { shop_name: true, shop_id: true },
    }),
  ]);

  const normalizedConta = conta.toLocaleLowerCase("pt-BR");
  return (
    meliAccounts.some(
      (account) =>
        (account.nickname?.trim() || account.ml_user_id.toString())
          .toLocaleLowerCase("pt-BR") === normalizedConta,
    ) ||
    shopeeAccounts.some(
      (account) =>
        (account.shop_name?.trim() || account.shop_id)
          .toLocaleLowerCase("pt-BR") === normalizedConta,
    )
  );
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
    const conta = typeof body.conta === "string" ? body.conta.trim() : "";
    const aliquota = parseAliquota(body.aliquota);
    const periodo = parsePeriod(body.dataInicio, body.dataFim);

    if (!conta || aliquota === null || !periodo) {
      return NextResponse.json(
        { error: "Conta, alíquota e período válidos são obrigatórios" },
        { status: 400 },
      );
    }
    if (!(await accountBelongsToUser(userId, conta))) {
      return NextResponse.json(
        { error: "Conta não encontrada entre as contas autenticadas" },
        { status: 400 },
      );
    }

    const overlapping = await prisma.aliquotaImposto.findFirst({
      where: {
        id: { not: id },
        userId,
        conta: { equals: conta, mode: "insensitive" },
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
        conta,
        aliquota,
        dataInicio: periodo.inicio,
        dataFim: periodo.fim,
        descricao:
          typeof body.descricao === "string" && body.descricao.trim()
            ? body.descricao.trim()
            : null,
      },
    });

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir alíquota:", error);
    return NextResponse.json(
      { error: "Erro ao excluir alíquota" },
      { status: 500 },
    );
  }
}
