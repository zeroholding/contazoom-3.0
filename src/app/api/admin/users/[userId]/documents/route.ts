import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) return new NextResponse("Forbidden", { status: 403 });

  try {
    const { userId } = await params;
    const documents = await prisma.document.findMany({
      where: { userId },
      include: {
        folder: true,
        logs: {
          include: { user: { select: { name: true, role: true } } },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("Erro ao buscar documentos:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
