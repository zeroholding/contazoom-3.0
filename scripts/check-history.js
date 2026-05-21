const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const history = await prisma.sKUCustoHistorico.findMany({
    where: { 
      sku: {
        sku: 'PROTPRETOGA'
      }
    },
    include: {
      sku: true
    }
  });
  console.log("History for PROTPRETOGA:");
  console.log(JSON.stringify(history, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
