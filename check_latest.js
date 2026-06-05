require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sale = await prisma.shopeeVenda.findFirst({ where: { orderId: '260526EH8X8MNW' } });
  if (!sale) {
    console.log("Not found");
    return;
  }
  console.log(JSON.stringify(sale.rawData, null, 2));
  console.log('================');
  console.log(JSON.stringify(sale.paymentDetails, null, 2));
  console.log('================');
  console.log(JSON.stringify(sale.shipmentDetails, null, 2));
}
main().finally(() => prisma.$disconnect());
