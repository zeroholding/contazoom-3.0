import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkIsAdmin } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const isAdmin = await checkIsAdmin(session.user?.email || session.email, session.sub);
  if (!isAdmin) return new NextResponse("Forbidden", { status: 403 });

  try {
    const documents = await prisma.document.findMany({
      where: { userId: params.userId },
      include: {
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
