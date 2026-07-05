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

    // Coletar os códigos de SKU válidos (não nulos/vazios) da página atual
    const skuCodes = Array.from(
      new Set(
        skus
          .map((sku) => sku.sku)
          .filter((code): code is string => typeof code === 'string' && code.length > 0)
      )
    );

    // Agregar as contagens de vendas em lote (evita o padrão N+1):
    // uma query groupBy por plataforma em vez de duas queries por SKU.
    const [meliSalesGrouped, shopeeSalesGrouped] =
      skuCodes.length > 0
        ? await Promise.all([
            prisma.meliVenda.groupBy({
              by: ['sku'],
              where: {
                userId: session.sub,
                sku: { in: skuCodes },
              },
              _count: { _all: true },
            }),
            prisma.shopeeVenda.groupBy({
              by: ['sku'],
              where: {
                userId: session.sub,
                sku: { in: skuCodes },
              },
              _count: { _all: true },
            }),
          ])
        : [[], []];

    // Montar um Map<sku, count> somando as duas plataformas
    const salesCountBySku = new Map<string, number>();

    for (const group of meliSalesGrouped) {
      if (group.sku) {
        salesCountBySku.set(
          group.sku,
          (salesCountBySku.get(group.sku) || 0) + group._count._all
        );
      }
    }

    for (const group of shopeeSalesGrouped) {
      if (group.sku) {
        salesCountBySku.set(
          group.sku,
          (salesCountBySku.get(group.sku) || 0) + group._count._all
        );
      }
    }

    // Enriquecer cada SKU com hasSales/salesCount a partir do Map agregado
    const skusWithSalesStatus = skus.map((sku) => {
      const totalSales = (sku.sku && salesCountBySku.get(sku.sku)) || 0;

      return {
        ...sku,
        hasSales: totalSales > 0,
        salesCount: totalSales,
      };
    });

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