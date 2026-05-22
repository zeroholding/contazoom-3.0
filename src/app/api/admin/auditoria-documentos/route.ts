import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const isAdmin = await checkIsAdmin(session.email, session.sub);
    if (!isAdmin) {
      return NextResponse.json({ error: "Acesso negado. Apenas administradores podem ver a auditoria global." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const documentName = searchParams.get("documentName");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    
    // Pagination
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (documentName) {
      where.document = {
        originalName: {
          contains: documentName,
          mode: "insensitive"
        }
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const d = new Date(startDate);
        d.setHours(0, 0, 0, 0);
        where.createdAt.gte = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.documentLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true }
          },
          document: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        skip,
        take: limit
      }),
      prisma.documentLog.count({ where })
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Erro ao buscar auditoria de documentos:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
