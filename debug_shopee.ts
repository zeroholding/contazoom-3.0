import { PrismaClient } from '@prisma/client';
import { getShopeeOrderDetail, getShopeeOrderList, refreshShopeeAccountToken } from './src/lib/shopee';

const prisma = new PrismaClient();

async function main() {
  const conta = await prisma.shopeeAccount.findFirst();
  if (!conta) {
    console.log("Nenhuma conta Shopee encontrada.");
    return;
  }
  console.log("Conta encontrada:", conta.shop_id);

  const partnerId = process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_CLIENT_ID || "";
  const partnerKey = process.env.SHOPEE_PARTNER_KEY || process.env.SHOPEE_CLIENT_SECRET || "";

  const tokenData = await refreshShopeeAccountToken(conta, partnerId, partnerKey);
  console.log("Token renovado com sucesso.");

  const orderId = "240821M9K7G7B4"; // Replace with one of their actual orderIds. Or just fetch one page of orders.
  
  const fromTime = Math.floor(new Date("2024-05-01T00:00:00Z").getTime() / 1000);
  const toTime = Math.floor(new Date("2024-06-01T00:00:00Z").getTime() / 1000);

  const list = await getShopeeOrderList({
    partnerId,
    partnerKey,
    accessToken: tokenData.access_token,
    shopId: conta.shop_id,
    createTimeFrom: fromTime,
    createTimeTo: toTime,
    pageSize: 5
  });

  if (!list.order_list || list.order_list.length === 0) {
    console.log("Nenhum pedido encontrado no mês 5 de 2024. Tentando os últimos 15 dias...");
    const fromTime2 = Math.floor(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).getTime() / 1000);
    const toTime2 = Math.floor(Date.now() / 1000);
    const list2 = await getShopeeOrderList({
      partnerId, partnerKey, accessToken: tokenData.access_token, shopId: conta.shop_id,
      createTimeFrom: fromTime2, createTimeTo: toTime2, pageSize: 5
    });
    if (!list2.order_list || list2.order_list.length === 0) {
      console.log("Nenhum pedido encontrado nos últimos 15 dias também.");
      return;
    }
    list.order_list = list2.order_list;
  }

  const orderSn = list.order_list[0].order_sn;
  console.log("Buscando detalhes do pedido:", orderSn);

  const details = await getShopeeOrderDetail({
    partnerId,
    partnerKey,
    accessToken: tokenData.access_token,
    shopId: conta.shop_id,
    orderSnList: orderSn
  });

  console.log("Detalhes brutos do pedido:");
  console.log(JSON.stringify(details.order_list[0], null, 2));

  console.log("Buscando detalhes do escrow para o pedido:", orderSn);
  try {
    const { getShopeeEscrowDetail } = require('./src/lib/shopee');
    const escrow = await getShopeeEscrowDetail({
      partnerId,
      partnerKey,
      accessToken: tokenData.access_token,
      shopId: conta.shop_id,
      orderSn: orderSn
    });
    console.log("Detalhes do escrow:");
    console.log(JSON.stringify(escrow, null, 2));
  } catch (error) {
    console.error("Erro ao buscar escrow:", error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
