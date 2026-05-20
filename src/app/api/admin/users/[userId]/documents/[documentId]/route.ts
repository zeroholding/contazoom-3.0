import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { unlink } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; documentId: string }> }
) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Next 15 awaits params
  const { userId, documentId } = await params;

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
    }

    // Apenas garante que pertence ao mesmo usuário (segurança extra)
    if (document.userId !== userId) {
      return NextResponse.json({ error: "Documento não pertence a este usuário" }, { status: 403 });
    }

    // Deleta o arquivo físico
    try {
      const filePath = join(UPLOAD_DIR, document.fileName);
      await unlink(filePath);
    } catch (e: any) {
      // Ignora erro se o arquivo não existir fisicamente (ENOENT), 
      // mas loga para monitoramento
      if (e.code !== 'ENOENT') {
        console.error("Erro ao apagar arquivo físico:", e);
      }
    }

    // Deleta do banco
    await prisma.document.delete({
      where: { id: documentId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar documento:", error);
    return NextResponse.json({ error: "Erro interno ao deletar documento" }, { status: 500 });
  }
}
