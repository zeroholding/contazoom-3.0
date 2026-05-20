import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");

export async function GET(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId");

  try {
    let documents;
    const isAdmin = await checkIsAdmin(session.email, session.sub);

    if (isAdmin) {
      if (targetUserId) {
        documents = await prisma.document.findMany({
          where: { userId: targetUserId },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true, email: true } }, folder: true }
        });
      } else {
        documents = await prisma.document.findMany({
          where: { userId: session.sub },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true, email: true } }, folder: true }
        });
      }
    } else {
      documents = await prisma.document.findMany({
        where: { userId: session.sub },
        orderBy: { createdAt: "desc" },
        include: { folder: true }
      });
    }

    const targetId = isAdmin && targetUserId ? targetUserId : session.sub;
    const folders = await prisma.documentFolder.findMany({
      where: { userId: targetId },
      orderBy: { createdAt: "asc" }
    });

    return NextResponse.json({
      isAdmin,
      documents,
      folders
    });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar documentos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) {
    return NextResponse.json({ error: "Apenas o administrador pode enviar arquivos." }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string;
    const category = formData.get("category") as string;
    const subFolder = formData.get("subFolder") as string | null;
    const folderId = formData.get("folderId") as string | null;

    if (!file || !userId || !category) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = join(UPLOAD_DIR, uniqueFileName);
    
    await writeFile(filePath, buffer);

    const document = await prisma.document.create({
      data: {
        userId,
        fileName: uniqueFileName,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        fileUrl: `/api/documents/download/${uniqueFileName}`,
        category,
        subFolder,
        folderId,
      },
      include: { user: { select: { name: true, email: true } } }
    });

    try {
      await prisma.documentLog.create({
        data: {
          documentId: document.id,
          userId: session.sub,
          action: "CREATED"
        }
      });
    } catch (e) {
      console.error("Erro ao registrar log de criação:", e);
    }

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Erro no upload:", error);
    return NextResponse.json({ error: "Erro interno no upload" }, { status: 500 });
  }
}
