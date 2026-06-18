import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";

type AliquotaPayload = {
  conta?: unknown;
  aliquota?: unknown;
  dataInicio?: unknown;
  dataFim?: unknown;
  descricao?: unknown;
};

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
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return null;

  try {
    const session = await verifySessionToken(sessionCookie);
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
    const conta = typeof body.conta === "string" ? body.conta.trim() : "";
    const aliquota = parseAliquota(body.aliquota);
    const periodo = parsePeriod(body.dataInicio, body.dataFim);

    if (!conta) {
      return NextResponse.json(
        { error: "Selecione uma conta" },
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
    if (!(await accountBelongsToUser(userId, conta))) {
      return NextResponse.json(
        { error: "Conta não encontrada entre as contas autenticadas" },
        { status: 400 },
      );
    }

    const overlapping = await prisma.aliquotaImposto.findFirst({
      where: {
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

    const created = await prisma.aliquotaImposto.create({
      data: {
        userId,
        conta,
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
