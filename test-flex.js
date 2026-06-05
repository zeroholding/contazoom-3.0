const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const flexOrders = await prisma.meliVenda.findMany({
    where: { rawData: { not: null } },
    take: 1000
  });

  for (const v of flexOrders) {
    let order;
    if (typeof v.rawData === 'string') {
      try { order = JSON.parse(v.rawData); } catch (e) { continue; }
    } else {
      order = v.rawData;
    }
    const shipment = order.shipment || {};
    const logisticTypeRaw = shipment.logistic_type;
    const orderShipping = order.shipping || {};
    const logisticTypeFallback = orderShipping.mode;
    const logisticType = logisticTypeRaw ?? logisticTypeFallback;

    if (logisticType === 'self_service') {
      const costs = shipment.costs || {};
      const baseCost = shipment.base_cost;
      const shipOpt = shipment.shipping_option || {};
      const optCost = shipOpt.cost;
      const listCost = shipOpt.list_cost;

      console.log('Order: ' + v.orderId + ' | Total: ' + v.valorTotal);
      console.log('- BaseCost: ' + baseCost);
      console.log('- OptCost: ' + optCost);
      console.log('- ListCost: ' + listCost);
      console.log('- Raw Costs: ' + JSON.stringify(costs));
      console.log('---');
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
