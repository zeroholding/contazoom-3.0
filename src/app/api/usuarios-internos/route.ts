/**
 * GET /api/usuarios-internos — lista para preencher select de responsável.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 6.
 *
 * Existe porque `/api/admin/users` exige `checkIsAdmin`: o comercial não
 * conseguiria nem montar o select de responsável ao abrir um processo, mesmo
 * tendo permissão para abrir o processo. E aquela rota devolve contas de
 * marketplace conectadas, que aqui não interessam e são dado de cliente.
 *
 * Devolve só quem pode receber tarefa (papéis internos), sem `USER`. Sem
 * paginação de propósito: é a equipe do escritório, não a base de clientes.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  PAPEIS_INTERNOS,
  PAPEL_LABEL,
  requireInterno,
} from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const url = new URL(req.url);
  const papelFiltro = url.searchParams.get("papel")?.trim();

  const papeis =
    papelFiltro && PAPEIS_INTERNOS.includes(papelFiltro)
      ? [papelFiltro]
      : PAPEIS_INTERNOS;

  try {
    const usuarios = await prisma.user.findMany({
      where: { role: { in: papeis } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return NextResponse.json({
      usuarios: usuarios.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        papelLabel: PAPEL_LABEL[u.role ?? ""] ?? u.role ?? "",
        // O nome pode estar vazio em conta antiga; o select não pode ficar em branco.
        rotulo: u.name?.trim() ? u.name : u.email,
      })),
      total: usuarios.length,
    });
  } catch (erro) {
    console.error("[GET /api/usuarios-internos]", erro);
    return NextResponse.json(
      { error: "Erro interno ao listar usuários internos." },
      { status: 500 }
    );
  }
}
