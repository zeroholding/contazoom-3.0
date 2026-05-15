import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

function isSuperAdmin(email?: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  return adminEmail && email && adminEmail.toLowerCase() === email.toLowerCase();
}

export async function GET(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSuperAdmin(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" }
    });

    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao listar usuários" }, { status: 500 });
  }
}
