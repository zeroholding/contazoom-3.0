/**
 * Lojas do TikTok Shop conectadas pelo usuário logado.
 *
 * GET    -> lista (array puro, como `/api/shopee/accounts`, para o seletor do
 *           dashboard consumir sem caso especial)
 * DELETE -> desconecta uma loja
 *
 * ⚠️  DIFERENÇA DELIBERADA em relação a `/api/shopee/accounts`: aqui os tokens
 * NÃO saem do servidor. A rota da Shopee devolve `access_token` e
 * `refresh_token` no corpo, e isso é problema documentado no docblock de
 * `/api/contas` — qualquer script na página, extensão do navegador ou log de
 * proxy passa a ter credencial de API de marketplace. A tela não usa esses
 * campos para nada; ela mostra nome, id e validade.
 *
 * `shop_cipher` também fica de fora: é material de assinatura.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const rows = await prisma.tiktokAccount.findMany({
      where: { userId: session.sub },
      select: {
        id: true,
        shop_id: true,
        shop_name: true,
        seller_name: true,
        region: true,
        expires_at: true,
        refresh_expires_at: true,
        refresh_token_invalid_until: true,
        created_at: true,
        updated_at: true,
        // Lido para virar booleano na linha abaixo, nunca devolvido: sem cipher
        // nenhuma chamada de loja funciona, e a tela precisa saber disso.
        shop_cipher: true,
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(
      rows.map(({ shop_cipher, ...conta }) => ({
        ...conta,
        has_shop_cipher: Boolean(shop_cipher),
      })),
    );
  } catch (error) {
    console.error("Erro ao buscar contas TikTok:", error);
    return NextResponse.json({ error: "Erro ao buscar contas" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID da conta não fornecido" }, { status: 400 });
    }

    // `deleteMany` com os dois filtros resolve posse e exclusão numa consulta:
    // id de outro usuário simplesmente não casa, e a contagem diz se apagou.
    // O par SELECT-depois-DELETE da Shopee tem janela de corrida entre os dois.
    const apagadas = await prisma.tiktokAccount.deleteMany({
      where: { id, userId: session.sub },
    });

    if (apagadas.count === 0) {
      return NextResponse.json(
        { error: "Conta não encontrada ou sem permissão" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar conta TikTok:", error);
    return NextResponse.json({ error: "Erro ao deletar conta" }, { status: 500 });
  }
}
