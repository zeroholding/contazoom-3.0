import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import { cache, createCacheKey } from "@/lib/cache";
import { parseFlexConfigValues } from "@/lib/flex-shipping";

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
    const values = parseFlexConfigValues({
      custoPorPacote,
      unidadesPorCobranca,
    });

    if (!values) {
      return NextResponse.json(
        {
          error:
            "Informe um custo maior que zero e unidades por cobrança como inteiro maior ou igual a 1",
        },
        { status: 400 }
      );
    }

    const config = await prisma.$transaction(async (tx) => {
      await tx.flexShippingConfig.updateMany({
        where: { userId: session.sub, ativo: true },
        data: { ativo: false },
      });

      return tx.flexShippingConfig.create({
        data: {
          userId: session.sub,
          custoPorPacote: values.custoPorPacote,
          unidadesPorCobranca: values.unidadesPorCobranca,
          descricao:
            typeof descricao === "string" && descricao.trim()
              ? descricao.trim()
              : null,
          ativo: true,
        },
      });
    });

    // Limpar o cache de vendas do Mercado Livre para forçar o recálculo do frete Flex
    cache.delete(createCacheKey("vendas-meli", session.sub));

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("[FLEX_CONFIG] Erro ao salvar configuração:", error);
    return NextResponse.json(
      { error: "Erro ao salvar configuração" },
      { status: 500 }
    );
  }
}
