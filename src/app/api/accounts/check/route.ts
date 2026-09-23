import { NextRequest, NextResponse } from 'next/server';
import { tryVerifySessionToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('session')?.value;
    const session = await tryVerifySessionToken(sessionToken);

    if (!session?.sub) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // `_count` em vez de `include`: a rota só usa `.length`, e o `include`
    // carregava a linha INTEIRA de cada conta — access_token e refresh_token
    // incluídos — para contar quantas são. Contar no banco é mais barato e
    // nenhum token sai da tabela.
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        _count: {
          select: {
            meliAccounts: true,
            shopeeAccounts: true,
            tiktokAccounts: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const meliAccounts = user._count.meliAccounts;
    const shopeeAccounts = user._count.shopeeAccounts;
    const tiktokAccounts = user._count.tiktokAccounts;

    return NextResponse.json({
      hasAccounts: meliAccounts > 0 || shopeeAccounts > 0 || tiktokAccounts > 0,
      meliAccounts,
      shopeeAccounts,
      tiktokAccounts
    });
  } catch (error) {
    console.error('Erro ao verificar contas:', error);
    return NextResponse.json({ error: 'Erro ao verificar contas' }, { status: 500 });
  }
}
