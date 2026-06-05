require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.meliVenda.findMany({
    take: 10,
    orderBy: { dataVenda: 'desc' },
    select: { orderId: true, frete: true, rawData: true }
  });

  for (const o of orders) {
    const raw = o.rawData;
    const shipment = raw.shipment || {};
    const totalAmount = raw.order?.total_amount;
    const logisticType = shipment.logistic_type;
    const baseCost = shipment.base_cost;
    const optCost = shipment.shipping_option?.cost;
    const listCost = shipment.shipping_option?.list_cost;
    console.log(`Order: ${o.orderId} | Total: ${totalAmount} | LogType: ${logisticType} | Base: ${baseCost} | OptCost: ${optCost} | ListCost: ${listCost} | FreteCalc: ${o.frete}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
