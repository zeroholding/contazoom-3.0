require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  const start = new Date(Date.UTC(2026, 5, 1, 3, 0, 0, 0));
  const end = new Date(Date.UTC(2026, 5, 2, 2, 59, 59, 999));

  const vendas = await prisma.meliVenda.findMany({
    where: {
      conta: 'ELIDELU',
      dataVenda: {
        gte: start,
        lte: end,
      },
      OR: [
        { status: { contains: 'paid', mode: 'insensitive' } },
        { status: { contains: 'payment_approved', mode: 'insensitive' } },
        { status: { contains: 'delivered', mode: 'insensitive' } }
      ]
    },
    take: 1,
    select: {
      orderId: true,
      valorTotal: true,
      frete: true,
      rawData: true
    }
  });

  if (vendas.length > 0) {
    const rawData = vendas[0].rawData;
    console.log(JSON.stringify(rawData?.freight, null, 2));
  } else {
    console.log("No sales found");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
