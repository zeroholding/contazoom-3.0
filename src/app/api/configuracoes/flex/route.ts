import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

// GET - Buscar configuração de frete Flex do usuário
export async function GET(req: NextRequest) {
  try {
    const session = await assertSessionToken(req.cookies.get("session")?.value);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const configs = await prisma.flexShippingConfig.findMany({
      where: { userId: session.sub, ativo: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ configs });
  } catch (error) {
    console.error("[FLEX_CONFIG] Erro ao buscar configuração:", error);
    return NextResponse.json(
      { error: "Erro ao buscar configuração" },
      { status: 500 }
    );
  }
}

// POST - Criar ou atualizar configuração de frete Flex
export async function POST(req: NextRequest) {
  try {
    const session = await assertSessionToken(req.cookies.get("session")?.value);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const { custoPorPacote, unidadesPorCobranca = 1, descricao } = body;

    if (!custoPorPacote || custoPorPacote <= 0) {
      return NextResponse.json(
        { error: "Custo por pacote é obrigatório e deve ser maior que zero" },
        { status: 400 }
      );
    }

    if (unidadesPorCobranca < 1) {
      return NextResponse.json(
        { error: "Unidades por cobrança deve ser pelo menos 1" },
        { status: 400 }
      );
    }

    // Desativar configs anteriores (global - só 1 ativa por vez)
    await prisma.flexShippingConfig.updateMany({
      where: { userId: session.sub, ativo: true },
      data: { ativo: false },
    });

    // Criar nova config
    const config = await prisma.flexShippingConfig.create({
      data: {
        userId: session.sub,
        custoPorPacote,
        unidadesPorCobranca,
        descricao: descricao || null,
        ativo: true,
      },
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("[FLEX_CONFIG] Erro ao salvar configuração:", error);
    return NextResponse.json(
      { error: "Erro ao salvar configuração" },
      { status: 500 }
    );
  }
}
