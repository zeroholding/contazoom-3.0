require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
async function main() {
  const v = await prisma.meliVenda.findUnique({where: {orderId: '2000016719270888'}});
  console.log("Frete:", v.frete);
  console.log("LogisticType:", v.logisticType);
  console.log("Freight Data:", JSON.stringify(v.rawData.freight, null, 2));
}
main();
