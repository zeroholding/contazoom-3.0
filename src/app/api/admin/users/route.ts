import { NextRequest, NextResponse } from "next/server";
import { tryVerifySessionToken, checkIsAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        meliAccounts: { select: { id: true } },
        shopeeAccounts: { select: { id: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedUsers = users.map(user => {
      const connectedAccounts = [];
      if (user.meliAccounts && user.meliAccounts.length > 0) connectedAccounts.push("mercado-livre");
      if (user.shopeeAccounts && user.shopeeAccounts.length > 0) connectedAccounts.push("shopee");

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        connectedAccounts
      };
    });

    return NextResponse.json(formattedUsers);
  } catch (error) {
    console.error("Erro ao buscar usuários admin:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { name, email, password, role } = await req.json();
    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "Preencha todos os campos obrigatórios." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 400 });
    }

    // Hash the password (using bcryptjs as done in the register route)
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role
      }
    });

    return NextResponse.json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
