import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function analyze() {
  const types = ['FLEX', 'self_service', 'cross_docking', 'fulfillment', 'xd_drop_off', 'drop_off'];
  
  for (const t of types) {
    const vendas = await prisma.meliVenda.findMany({
      where: { logisticType: t },
      take: 3,
      orderBy: { dataVenda: 'desc' }
    });
    
    console.log('\n--- TIPO: ' + t + ' ---');
    if (vendas.length === 0) {
        console.log('Nenhuma venda encontrada.');
        continue;
    }
    for (const v of vendas) {
        let rawData = typeof v.rawData === 'string' ? JSON.parse(v.rawData) : v.rawData;
        let freight = rawData?.freight || {};
        
        let optCost = freight.shippingOptionCost;
        let baseCost = freight.baseCost;
        let shipCost = freight.shipmentCost;
        let listCost = freight.listCost;
        let chargedCost = freight.chargedCost;
        if (chargedCost === undefined || chargedCost === null) {
            chargedCost = optCost !== null ? optCost : shipCost !== null ? shipCost : null;
        }
        
        let expectedFrete = 0;
        let calcSource = '';
        
        if (t === 'FLEX' || t === 'self_service') {
            if (Number(v.valorTotal) >= 79) {
                expectedFrete = chargedCost > 0 ? chargedCost : 0;
                calcSource = 'chargedCost (FLEX >= 79)';
            } else {
                expectedFrete = 0;
                calcSource = '0 (FLEX < 79)';
            }
        } else if (['fulfillment', 'cross_docking', 'xd_drop_off', 'drop_off'].includes(t)) {
            const sellerShippingCost = rawData?.shipment?._seller_shipping_cost;
            if (sellerShippingCost !== undefined && sellerShippingCost !== null) {
                expectedFrete = -sellerShippingCost;
                calcSource = '-sellerShippingCost (from API)';
            } else if (listCost !== null && chargedCost !== null) {
                const sellerFreightCost = Math.max(listCost - chargedCost, 0);
                expectedFrete = sellerFreightCost > 0 ? -sellerFreightCost : 0;
                calcSource = '-(listCost - chargedCost)';
            } else if (baseCost !== null && baseCost > 0) {
                expectedFrete = -baseCost;
                calcSource = '-baseCost';
            }
        }
        
        console.log('ID: ' + v.orderId);
        console.log('  Valor Venda : R$ ' + v.valorTotal);
        console.log('  Frete Atual DB : R$ ' + v.frete);
        console.log('  Frete Correto  : R$ ' + expectedFrete + ' (via ' + calcSource + ')');
        console.log('  RawData Info : listCost=' + listCost + ' | chargedCost=' + chargedCost + ' | sellerShippingCost=' + rawData?.shipment?._seller_shipping_cost);
    }
  }
}

analyze().catch(console.error).finally(() => prisma.$disconnect());
