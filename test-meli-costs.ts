import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

// Load env vars
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

const MELI_API_BASE = "https://api.mercadolibre.com";

async function fetchWithToken(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    console.log(`[HTTP ${response.status}] GET ${url}`);
    try {
      const errorJson = await response.json();
      return { error: true, status: response.status, data: errorJson };
    } catch {
      return { error: true, status: response.status, data: await response.text() };
    }
  }
  return await response.json();
}

async function main() {
  console.log("Iniciando teste de shipments do Mercado Livre...");

  // Pegar a primeira conta do banco
  const account = await prisma.meliAccount.findFirst({
    orderBy: { updated_at: "desc" },
  });

  if (!account) {
    console.error("Nenhuma conta Mercado Livre encontrada no banco de dados.");
    return;
  }

  console.log(`Conta encontrada: ${account.nickname || account.ml_user_id}`);

  // Pegar uma venda recente dessa conta que tenha envio
  console.log("Buscando vendas recentes...");
  const ordersResponse = await fetchWithToken(
    `${MELI_API_BASE}/orders/search?seller=${account.ml_user_id}&limit=5`,
    account.access_token
  );

  if (ordersResponse.error) {
    console.error("Erro ao buscar orders:", ordersResponse.data);
    return;
  }

  const orders = ordersResponse.results || [];
  const orderWithShipping = orders.find((o: any) => o.shipping && o.shipping.id);

  if (!orderWithShipping) {
    console.log("Nenhuma venda recente com envio encontrada nas 5 primeiras.");
    return;
  }

  const shippingId = orderWithShipping.shipping.id;
  const orderId = orderWithShipping.id;
  const logisticType = orderWithShipping.shipping.logistic_type || "N/A";

  console.log(`\n========= VENDA SELECIONADA =========`);
  console.log(`Order ID: ${orderId}`);
  console.log(`Shipping ID: ${shippingId}`);
  console.log(`Total Amount: ${orderWithShipping.total_amount}`);
  console.log(`=====================================\n`);

  console.log("1. Buscando GET /shipments/{id}");
  const shipment = await fetchWithToken(`${MELI_API_BASE}/shipments/${shippingId}`, account.access_token);
  console.log("Dados relevantes de custo em /shipments:");
  console.log({
    logistic_type: shipment.logistic_type || "N/A",
    base_cost: shipment.base_cost,
    cost: shipment.cost,
    shipping_option_list_cost: shipment.shipping_option?.list_cost,
    shipping_option_cost: shipment.shipping_option?.cost,
  });

  console.log("\n-------------------------------------");
  console.log("2. Buscando GET /shipments/{id}/costs");
  const costs = await fetchWithToken(`${MELI_API_BASE}/shipments/${shippingId}/costs`, account.access_token);
  console.dir(costs, { depth: null });

  console.log("\n-------------------------------------");
  console.log("3. Buscando GET /shipments/{id}/billing_info");
  const billing = await fetchWithToken(`${MELI_API_BASE}/shipments/${shippingId}/billing_info`, account.access_token);
  console.dir(billing, { depth: null });

}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
