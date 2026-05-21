import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { readFile, unlink } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await params;
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const action = req.nextUrl.searchParams.get("action") || "download";

    const document = await prisma.document.findFirst({
      where: { fileName }
    });

    if (!document) return new NextResponse("File not found", { status: 404 });

    const isAdmin = await checkIsAdmin(session.email, session.sub);
    if (document.userId !== session.sub && !isAdmin) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Log the action
    try {
      await prisma.documentLog.create({
        data: {
          documentId: document.id,
          userId: session.sub,
          action: action === "view" ? "VIEWED" : "DOWNLOADED"
        }
      });
    } catch (e) {
      console.error("Erro ao registrar log de acesso:", e);
    }

    const filePath = join(UPLOAD_DIR, document.fileName);
    const fileBuffer = await readFile(filePath);

    const headers = new Headers();
    headers.set("Content-Type", document.mimeType);
    
    if (action === "view") {
      headers.set("Content-Disposition", `inline; filename="${document.originalName}"`);
    } else {
      headers.set("Content-Disposition", `attachment; filename="${document.originalName}"`);
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error("Download erro:", error);
    return new NextResponse("Error reading file", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await params;
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) {
    return NextResponse.json({ error: "Apenas o administrador pode excluir arquivos." }, { status: 403 });
  }

  try {
    const document = await prisma.document.findFirst({
      where: { fileName }
    });

    if (!document) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const filePath = join(UPLOAD_DIR, document.fileName);
    try {
      await unlink(filePath);
    } catch (e) {
      console.warn("Arquivo físico não encontrado para exclusão, mas será removido do BD.");
    }

    await prisma.document.delete({
      where: { id: document.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
