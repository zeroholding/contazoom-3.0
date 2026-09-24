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

    const user = await prisma.user.findUnique({
      where: { id: session.sub }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Uma contagem por canal, em paralelo: as três são independentes e o
    // encadeamento anterior somava a latência de cada uma sem motivo.
    const [meliSalesCount, shopeeSalesCount, tiktokSalesCount] = await Promise.all([
      prisma.meliVenda.count({ where: { userId: user.id } }),
      prisma.shopeeVenda.count({ where: { userId: user.id } }),
      prisma.tiktokVenda.count({ where: { userId: user.id } }),
    ]);

    const totalSales = meliSalesCount + shopeeSalesCount + tiktokSalesCount;

    return NextResponse.json({
      hasSales: totalSales > 0,
      meliSales: meliSalesCount,
      shopeeSales: shopeeSalesCount,
      tiktokSales: tiktokSalesCount,
      totalSales
    });
  } catch (error) {
    console.error('Erro ao verificar vendas:', error);
    return NextResponse.json({ error: 'Erro ao verificar vendas' }, { status: 500 });
  }
}
