import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";
import {
  parseTaxPeriod,
  parseTaxRate,
  resolveTaxAccount,
} from "@/lib/aliquota-imposto";

export const runtime = "nodejs";

type AliquotaPayload = {
  conta?: unknown;
  accountId?: unknown;
  plataforma?: unknown;
  aliquota?: unknown;
  dataInicio?: unknown;
  dataFim?: unknown;
  descricao?: unknown;
};

async function getUserId(request: NextRequest): Promise<string | null> {
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return null;

  try {
    const session = await verifySessionToken(sessionCookie);
    return session.sub;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const aliquotas = await prisma.aliquotaImposto.findMany({
      where: { userId },
      orderBy: [{ dataInicio: "desc" }, { conta: "asc" }],
    });

    return NextResponse.json({
      data: aliquotas.map((item) => ({
        ...item,
        aliquota: Number(item.aliquota),
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar alíquotas:", error);
    return NextResponse.json(
      { error: "Erro ao buscar alíquotas" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as AliquotaPayload;
    const account = await resolveTaxAccount(userId, body);
    const aliquota = parseTaxRate(body.aliquota);
    const periodo = parseTaxPeriod(body.dataInicio, body.dataFim);

    if (!account) {
      return NextResponse.json(
        { error: "Selecione uma conta autenticada válida" },
        { status: 400 },
      );
    }
    if (aliquota === null) {
      return NextResponse.json(
        { error: "A alíquota deve estar entre 0 e 100" },
        { status: 400 },
      );
    }
    if (!periodo) {
      return NextResponse.json(
        { error: "Período inválido" },
        { status: 400 },
      );
    }
    const overlapping = await prisma.aliquotaImposto.findFirst({
      where: {
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

    const created = await prisma.aliquotaImposto.create({
      data: {
        userId,
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
        ativo: true,
      },
    });

    return NextResponse.json(
      { data: { ...created, aliquota: Number(created.aliquota) } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    console.error("Erro ao criar alíquota:", error);
    return NextResponse.json(
      { error: "Erro ao criar alíquota" },
      { status: 500 },
    );
  }
}
