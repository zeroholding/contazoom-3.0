import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

// PUT - Atualizar configuração
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await assertSessionToken(req.cookies.get("session")?.value);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { custoPorPacote, unidadesPorCobranca, descricao } = body;

    // Verificar se pertence ao usuário
    const existing = await prisma.flexShippingConfig.findFirst({
      where: { id, userId: session.sub },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Configuração não encontrada" },
        { status: 404 }
      );
    }

    const updated = await prisma.flexShippingConfig.update({
      where: { id },
      data: {
        ...(custoPorPacote !== undefined && { custoPorPacote }),
        ...(unidadesPorCobranca !== undefined && { unidadesPorCobranca }),
        ...(descricao !== undefined && { descricao: descricao || null }),
      },
    });

    return NextResponse.json({ success: true, config: updated });
  } catch (error) {
    console.error("[FLEX_CONFIG] Erro ao atualizar:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar configuração" },
      { status: 500 }
    );
  }
}

// DELETE - Remover configuração
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await assertSessionToken(req.cookies.get("session")?.value);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;

    const existing = await prisma.flexShippingConfig.findFirst({
      where: { id, userId: session.sub },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Configuração não encontrada" },
        { status: 404 }
      );
    }

    await prisma.flexShippingConfig.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FLEX_CONFIG] Erro ao deletar:", error);
    return NextResponse.json(
      { error: "Erro ao deletar configuração" },
      { status: 500 }
    );
  }
}
