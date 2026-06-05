require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

function roundCurrency(value) {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

async function main() {
  const start = new Date(Date.UTC(2026, 5, 1, 3, 0, 0, 0));
  const end = new Date(Date.UTC(2026, 5, 2, 2, 59, 59, 999));

  // The exact same WHERE as Dashboard/Debug
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
    select: {
      orderId: true,
      valorTotal: true,
      frete: true,
      rawData: true
    }
  });

  let log = 'RECALCULATION TEST\\n\\n';
  let totalDb = 0;
  let totalRecalculated = 0;

  for (const venda of vendas) {
    const rawData = venda.rawData;
    const freightData = rawData?.freight || {};
    
    const toNum = (val) => {
      if (typeof val === "number") return val;
      if (typeof val === "string") {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : parsed;
      }
      return null;
    };

    const logisticType = typeof freightData.logisticType === "string" ? freightData.logisticType : null;
    const optCost = toNum(freightData.shippingOptionCost);
    const baseCost = toNum(freightData.baseCost);
    const shipCost = toNum(freightData.shipmentCost);
    const listCost = toNum(freightData.listCost);
    const orderCost = toNum(freightData.orderCostFallback);

    let chargedCost = toNum(freightData.chargedCost);
    if (chargedCost === null) {
      chargedCost = optCost !== null ? optCost : shipCost !== null ? shipCost : orderCost !== null ? orderCost : null;
    }
    if (chargedCost !== null) chargedCost = roundCurrency(chargedCost);

    let calculated = 0;

    if (logisticType === "self_service" || logisticType === "FLEX") {
      const valorTotalNum = Number(venda.valorTotal);
      if (valorTotalNum >= 79) {
        if (chargedCost !== null && chargedCost > 0) calculated = chargedCost; // Note: Table returns positive here? We might want to fix it to negative if it's a debit!
      } else {
        if (optCost !== null && optCost > 0) calculated = optCost;
        else if (baseCost !== null && baseCost > 0) calculated = baseCost;
        else if (shipCost !== null && shipCost > 0) calculated = shipCost;
      }
    } else if (["fulfillment", "cross_docking", "xd_drop_off", "drop_off"].includes(logisticType ?? "")) {
      if (listCost !== null && chargedCost !== null) {
        const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
        calculated = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
      } else if (baseCost !== null && baseCost > 0) {
        calculated = -baseCost;
      }
    } else {
      if (listCost !== null && chargedCost !== null) {
        const sellerFreightCost = Math.max(roundCurrency(listCost - chargedCost), 0);
        calculated = sellerFreightCost > 0 ? -roundCurrency(sellerFreightCost) : 0;
      } else if (orderCost !== null && orderCost > 0) {
        calculated = -orderCost;
      }
    }

    log += `ID: ${venda.orderId} | Valor: ${venda.valorTotal} | DB Frete: ${venda.frete} | Recalculated Frete: ${calculated}\\n`;
    
    totalDb += Number(venda.frete);
    totalRecalculated += calculated !== 0 ? calculated : Number(venda.frete);
  }

  log += `\\nTotal DB Frete: ${totalDb.toFixed(2)}`;
  log += `\\nTotal Recalculated: ${totalRecalculated.toFixed(2)}`;

  fs.writeFileSync('recalc.txt', log);
  console.log("Done");
}

main().catch(console.error).finally(() => prisma.$disconnect());
