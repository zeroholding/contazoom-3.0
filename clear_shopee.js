const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.shopeeVenda.deleteMany({});
  console.log(`Deletadas ${result.count} vendas da Shopee para forçar ressincronização correta.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
