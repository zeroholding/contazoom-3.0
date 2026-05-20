import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  const { userId } = await params;

  // Permite acesso se for admin ou o próprio usuário
  if (!isAdmin && session.sub !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    let folders = await prisma.documentFolder.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });

    // Bootstrapping: Auto-criação das 4 pastas padrões caso o cliente não tenha nenhuma pasta
    if (folders.length === 0) {
      for (const cat of DOCUMENT_CATEGORIES) {
        const folder = await prisma.documentFolder.create({
          data: {
            userId,
            name: cat.name,
            icon: 'Folder'
          }
        });
        folders.push(folder);
      }
    }

    return NextResponse.json(folders);
  } catch (error) {
    console.error("Erro ao buscar pastas:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem criar pastas." }, { status: 403 });
  }

  const { userId } = await params;

  try {
    const body = await req.json();
    if (!body.name) {
      return NextResponse.json({ error: "Nome da pasta é obrigatório." }, { status: 400 });
    }

    const newFolder = await prisma.documentFolder.create({
      data: {
        userId,
        name: body.name,
        icon: body.icon || 'Folder',
        parentId: body.parentId || null
      }
    });

    return NextResponse.json(newFolder, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar pasta:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
