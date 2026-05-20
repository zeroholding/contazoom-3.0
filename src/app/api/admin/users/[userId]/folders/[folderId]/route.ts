import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; folderId: string }> }
) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, folderId } = await params;

  try {
    const body = await req.json();
    const folder = await prisma.documentFolder.findUnique({ where: { id: folderId } });

    if (!folder || folder.userId !== userId) {
      return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 });
    }

    const updatedFolder = await prisma.documentFolder.update({
      where: { id: folderId },
      data: {
        name: body.name !== undefined ? body.name : folder.name,
        icon: body.icon !== undefined ? body.icon : folder.icon
      }
    });

    return NextResponse.json(updatedFolder);
  } catch (error) {
    console.error("Erro ao atualizar pasta:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; folderId: string }> }
) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, folderId } = await params;

  try {
    const folder = await prisma.documentFolder.findUnique({
      where: { id: folderId },
      include: {
        _count: {
          select: { documents: true }
        }
      }
    });

    if (!folder || folder.userId !== userId) {
      return NextResponse.json({ error: "Pasta não encontrada" }, { status: 404 });
    }

    if (folder._count.documents > 0) {
      return NextResponse.json({ 
        error: "Não é possível excluir esta pasta pois ela contém documentos. Mova ou exclua os documentos primeiro." 
      }, { status: 400 });
    }

    await prisma.documentFolder.delete({
      where: { id: folderId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir pasta:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
