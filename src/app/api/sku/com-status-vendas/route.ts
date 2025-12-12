import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySessionToken } from '@/lib/auth';

// GET /api/sku/com-status-vendas - Listar SKUs com status de vendas
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session')?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const search = searchParams.get('search') || '';
    const tipo = searchParams.get('tipo') || '';
    const ativo = searchParams.get('ativo');
    const temEstoque = searchParams.get('temEstoque');
    const hierarquia1 = searchParams.get('hierarquia1') || '';
    const hierarquia2 = searchParams.get('hierarquia2') || '';

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {
      userId: session.sub,
    };

    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { produto: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tipo) {
      where.tipo = tipo;
    }

    if (ativo !== null) {
      where.ativo = ativo === 'true';
    }

    if (temEstoque !== null) {
      where.temEstoque = temEstoque === 'true';
    }

    if (hierarquia1) {
      where.hierarquia1 = hierarquia1;
    }

    if (hierarquia2) {
      where.hierarquia2 = hierarquia2;
    }

    // Buscar SKUs
    const [skus, total] = await Promise.all([
      prisma.sKU.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { tipo: 'desc' }, // Kits primeiro
          { sku: 'asc' },
        ],
        include: {
          custoHistorico: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.sKU.count({ where }),
    ]);

    // Para cada SKU, verificar se tem vendas associadas
    const skusWithSalesStatus = await Promise.all(
      skus.map(async (sku) => {
        // Verificar se o SKU tem vendas no Mercado Livre
        const meliSalesCount = await prisma.meliVenda.count({
          where: {
            userId: session.sub,
            sku: sku.sku,
          },
        });

        // Verificar se o SKU tem vendas na Shopee
        const shopeeSalesCount = await prisma.shopeeVenda.count({
          where: {
            userId: session.sub,
            sku: sku.sku,
          },
        });

        const totalSales = meliSalesCount + shopeeSalesCount;

        return {
          ...sku,
          hasSales: totalSales > 0,
          salesCount: totalSales,
        };
      })
    );

    return NextResponse.json({
      skus: skusWithSalesStatus,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erro ao buscar SKUs com status de vendas:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}