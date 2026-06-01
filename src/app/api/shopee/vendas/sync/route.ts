import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { assertSessionToken } from "@/lib/auth";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getShopeeOrderList,
  getShopeeOrderDetail,
  getShopeeEscrowDetail,
  refreshShopeeAccountToken
} from "@/lib/shopee";
import { sendProgressToUser, closeUserConnections } from "@/lib/sse-progress";
import { invalidateVendasCache } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_VENDAS_POR_CONTA = 10000;

// Tipos auxiliares
type SyncError = { accountId: string; shopId: string; message: string; };
type AccountSummary = { id: string; shop_id: string; };
type ShopeeOrderPayload = { accountId: string; shopId: string; order: any; };

// Funções utilitárias
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function roundCurrency(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function truncateString(str: string | null | undefined, maxLength: number): string {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength) : str;
}

function epochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function getPartnerCredentials() {
  return {
    partnerId: process.env.SHOPEE_PARTNER_ID || process.env.SHOPEE_CLIENT_ID || "",
    partnerKey: process.env.SHOPEE_PARTNER_KEY || process.env.SHOPEE_CLIENT_SECRET || "",
  };
}

// Retry com renovação automática de token
async function executeWithTokenRetry<T>(
  accountRef: { id: string; shop_id: string; access_token: string; refresh_token: string; expires_at: Date },
  operation: (accessToken: string) => Promise<T>,
  maxRetries: number = 1
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(accountRef.access_token);
    } catch (error) {
      lastError = error as Error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('invalid_access_token') || errorMessage.includes('invalid_acceess_token')) {
        if (attempt < maxRetries) {
          console.log(`[Shopee Sync] Token inválido. Renovando (tentativa ${attempt + 1}/${maxRetries})...`);
          try {
            const { partnerId, partnerKey } = getPartnerCredentials();
            const refreshed = await refreshShopeeAccountToken(accountRef, partnerId, partnerKey);
            accountRef.access_token = refreshed.access_token;
            accountRef.refresh_token = refreshed.refresh_token;
            accountRef.expires_at = refreshed.expires_at;
            console.log(`[Shopee Sync] Token renovado com sucesso.`);
          } catch (refreshError) {
            console.error(`[Shopee Sync] Falha ao renovar token:`, refreshError);
            throw new Error(`Falha ao renovar token: ${refreshError instanceof Error ? refreshError.message : 'Erro desconhecido'}`);
          }
        } else {
          throw new Error(`Token inválido após ${maxRetries} tentativas de renovação`);
        }
      } else {
        throw error;
      }
    }
  }
  
  throw lastError || new Error('Operação falhou após tentativas');
}

// ==========================================
// OTIMIZAÇÃO #1: Escrow com alta concorrência
// ==========================================
async function fetchAndEnrichShopeeOrders(
  account: { id: string; shop_id: string; access_token: string; refresh_token: string; expires_at: Date },
  from: Date,
  to: Date,
) {
  const { partnerId, partnerKey } = getPartnerCredentials();

  // 1. Buscar lista de pedidos (paginado)
  const orderSnList: string[] = [];
  let cursor: string | undefined = undefined;
  do {
    const listResult = await executeWithTokenRetry(account, async (accessToken) => {
      return await getShopeeOrderList({
        partnerId, partnerKey, accessToken,
        shopId: account.shop_id,
        createTimeFrom: epochSeconds(from),
        createTimeTo: epochSeconds(to),
        pageSize: 100,
        cursor,
      });
    });
    if (listResult?.order_list) {
      listResult.order_list.forEach((order: any) => orderSnList.push(order.order_sn));
    }
    cursor = listResult?.more ? listResult.next_cursor : undefined;
  } while (cursor);

  if (orderSnList.length === 0) return [];

  // 2. Buscar detalhes em lotes de 50 (API Shopee suporta batch)
  const detailedOrders: any[] = [];
  const detailPromises: Promise<void>[] = [];
  
  for (let i = 0; i < orderSnList.length; i += 50) {
    const batchSnList = orderSnList.slice(i, i + 50);
    detailPromises.push(
      executeWithTokenRetry(account, async (accessToken) => {
        return await getShopeeOrderDetail({
          partnerId, partnerKey, accessToken,
          shopId: account.shop_id,
          orderSnList: batchSnList.join(','),
        });
      }).then(result => {
        if (result?.order_list) {
          detailedOrders.push(...result.order_list);
        }
      })
    );
  }
  // Buscar todos os detalhes em paralelo
  await Promise.allSettled(detailPromises);

  // 3. Buscar escrow com alta concorrência (10 simultâneos)
  const ESCROW_CONCURRENCY = 10;
  const enrichedOrders: any[] = [];

  for (let i = 0; i < detailedOrders.length; i += ESCROW_CONCURRENCY) {
    const batch = detailedOrders.slice(i, i + ESCROW_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (order) => {
        try {
          const escrowResult = await executeWithTokenRetry(account, async (accessToken) => {
            return await getShopeeEscrowDetail({
              partnerId, partnerKey, accessToken,
              shopId: account.shop_id,
              orderSn: order.order_sn,
            });
          });
          order.escrow_details = escrowResult || {};
        } catch {
          order.escrow_details = {};
        }
        return order;
      })
    );
    results.forEach(res => {
      if (res.status === 'fulfilled') enrichedOrders.push(res.value);
    });
  }

  return enrichedOrders;
}

// ==========================================
// OTIMIZAÇÃO #2: Janelas de tempo com paralelismo limitado
// ==========================================
async function fetchAllShopeeOrdersSince(
  account: { id: string; shop_id: string; access_token: string; refresh_token: string; expires_at: Date },
  since: Date,
  userId: string
) {
  const allOrders: any[] = [];
  const now = new Date();
  const MAX_WINDOW_DAYS = 15;
  const PARALLEL_WINDOWS = 2; // 2 janelas simultâneas

  // Preparar todas as janelas de tempo
  const windows: { start: Date; end: Date }[] = [];
  let windowStart = since;
  while (windowStart < now) {
    const windowEnd = new Date(Math.min(
      windowStart.getTime() + MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      now.getTime()
    ));
    windows.push({ start: new Date(windowStart), end: windowEnd });
    windowStart = new Date(windowEnd.getTime() + 1);
  }

  console.log(`[Shopee Sync] ${windows.length} janelas de tempo para processar`);

  // Processar janelas em paralelo (2 por vez)
  for (let i = 0; i < windows.length; i += PARALLEL_WINDOWS) {
    if (allOrders.length >= MAX_VENDAS_POR_CONTA) {
      console.log(`[Shopee Sync] Limite de ${MAX_VENDAS_POR_CONTA} vendas atingido.`);
      sendProgressToUser(userId, {
        type: "sync_warning",
        message: `Limite de 10.000 vendas atingido para loja ${account.shop_id}.`,
        errorCode: "MAX_VENDAS_REACHED"
      });
      break;
    }

    const batch = windows.slice(i, i + PARALLEL_WINDOWS);
    
    sendProgressToUser(userId, {
      type: "sync_progress",
      message: `Buscando vendas: janela ${i + 1}-${Math.min(i + PARALLEL_WINDOWS, windows.length)} de ${windows.length}`,
      current: i,
      total: windows.length,
      fetched: allOrders.length,
      expected: 0,
      accountId: account.id,
      accountNickname: `Loja ${account.shop_id}`
    });

    const results = await Promise.allSettled(
      batch.map(w => {
        console.log(`[Shopee Sync] Buscando janela: ${w.start.toISOString()} -> ${w.end.toISOString()}`);
        return fetchAndEnrichShopeeOrders(account, w.start, w.end);
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const remaining = MAX_VENDAS_POR_CONTA - allOrders.length;
        const ordersToAdd = result.value.slice(0, remaining);
        allOrders.push(...ordersToAdd);
      }
    }

    console.log(`[Shopee Sync] Total acumulado: ${allOrders.length} pedidos`);
  }

  return allOrders;
}

// ==========================================
// OTIMIZAÇÃO #3: Batch SQL insert com ON CONFLICT
// ==========================================
async function batchUpsertVendas(vendaRecords: any[], userId: string, accountId: string, accountNickname: string): Promise<number> {
  if (vendaRecords.length === 0) return 0;

  const BATCH_SIZE = 200; // Lotes maiores para menos queries
  let totalSaved = 0;

  for (let i = 0; i < vendaRecords.length; i += BATCH_SIZE) {
    const batch = vendaRecords.slice(i, i + BATCH_SIZE);
    
    try {
      // Usar transação com createMany + fallback para upsert
      const result = await prisma.$transaction(async (tx) => {
        // Usar upsert individual em paralelo para garantir que vendas existentes sejam atualizadas (auto-cura)
        const results = await Promise.allSettled(
          batch.map(record =>
            tx.shopeeVenda.upsert({
              where: { orderId: record.orderId },
              update: {
                dataVenda: record.dataVenda,
                status: record.status,
                conta: record.conta,
                valorTotal: record.valorTotal,
                quantidade: record.quantidade,
                unitario: record.unitario,
                taxaPlataforma: record.taxaPlataforma,
                frete: record.frete,
                margemContribuicao: record.margemContribuicao,
                isMargemReal: record.isMargemReal,
                titulo: record.titulo,
                sku: record.sku,
                comprador: record.comprador,
                shippingId: record.shippingId,
                shippingStatus: record.shippingStatus,
                plataforma: record.plataforma,
                canal: record.canal,
                rawData: record.rawData,
                paymentDetails: record.paymentDetails,
                shipmentDetails: record.shipmentDetails,
                atualizadoEm: record.atualizadoEm,
              },
              create: record,
            })
          )
        );
        let saved = results.filter(r => r.status === 'fulfilled').length;
        
        // Log errors if any
        results.forEach((r, idx) => {
          if (r.status === 'rejected') {
            console.error(`[Shopee Sync] Erro upsert ${batch[idx].orderId}:`, r.reason);
          }
        });
        
        return saved;
      });

      totalSaved += result;
    } catch (error) {
      console.error(`[Shopee Sync] Erro no lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
    }

    // SSE a cada lote (não a cada registro) - muito menos overhead
    sendProgressToUser(userId, {
      type: "sync_progress",
      message: `Salvando: ${Math.min(i + BATCH_SIZE, vendaRecords.length)} de ${vendaRecords.length} vendas`,
      current: Math.min(i + BATCH_SIZE, vendaRecords.length),
      total: vendaRecords.length,
      fetched: totalSaved,
      expected: vendaRecords.length,
      accountId,
      accountNickname
    });
  }

  return totalSaved;
}

// ==========================================
// ROTA PRINCIPAL
// ==========================================
export async function POST(req: NextRequest) {
  const session = await assertSessionToken(req.cookies.get("session")?.value);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const userId = session.sub;

  let accountIds: string[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    accountIds = body.accountIds;
  } catch {
    // continuar sem filtro
  }

  try {
    console.log(`[Shopee Sync] Iniciando sincronização para usuário ${userId}`);

    // Enviar evento de início (sem delay desnecessário)
    sendProgressToUser(userId, {
      type: "sync_start",
      message: "Conectando ao Shopee...",
      current: 0, total: 0, fetched: 0, expected: 0
    });

    // Filtrar por contas específicas se fornecido
    const whereClause: any = { userId: session.sub };
    if (accountIds && accountIds.length > 0) {
      whereClause.id = { in: accountIds };
    }

    const contasAtivas = await prisma.shopeeAccount.findMany({
      where: whereClause,
    });

    console.log(`[Shopee Sync] Encontradas ${contasAtivas.length} conta(s)`);

    if (contasAtivas.length === 0) {
      sendProgressToUser(userId, {
        type: "sync_complete",
        message: "Nenhuma conta encontrada",
        current: 0, total: 0, fetched: 0, expected: 0
      });
      return NextResponse.json({ message: "Nenhuma conta Shopee ativa." }, { status: 404 });
    }

    // OTIMIZAÇÃO #4: Renovar tokens em PARALELO
    sendProgressToUser(userId, {
      type: "sync_progress",
      message: "Verificando tokens de acesso...",
      current: 0, total: 0, fetched: 0, expected: 0
    });

    const { partnerId, partnerKey } = getPartnerCredentials();
    const refreshResults = await Promise.allSettled(
      contasAtivas.map(async (conta) => {
        // Só renova se estiver expirado ou expirar em menos de 10 minutos
        const isExpiringSoon = conta.expires_at.getTime() - Date.now() < 10 * 60 * 1000;
        
        if (!isExpiringSoon) {
          return conta;
        }
        
        const refreshed = await refreshShopeeAccountToken(conta, partnerId, partnerKey);
        return {
          ...conta,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: refreshed.expires_at,
        };
      })
    );

    const contasAtualizadas = refreshResults
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    // Reportar falhas
    refreshResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[Shopee Sync] Falha token conta ${contasAtivas[i].shop_id}:`, r.reason);
        sendProgressToUser(userId, {
          type: "sync_error",
          message: `Falha ao renovar token da conta ${contasAtivas[i].shop_id}. Reconecte a conta.`,
          errorCode: "TOKEN_REFRESH_FAILED"
        });
      }
    });

    if (contasAtualizadas.length === 0) {
      sendProgressToUser(userId, {
        type: "sync_error",
        message: "Nenhuma conta com token válido. Reconecte suas contas.",
        errorCode: "NO_VALID_ACCOUNTS"
      });
      return NextResponse.json({ 
        message: "Nenhuma conta Shopee com token válido. Reconecte suas contas." 
      }, { status: 400 });
    }

    const summaries: AccountSummary[] = contasAtualizadas.map(c => ({ id: c.id, shop_id: c.shop_id }));
    const allOrdersPayload: ShopeeOrderPayload[] = [];
    const errors: SyncError[] = [];
    let totalSaved = 0;

    for (let accountIndex = 0; accountIndex < contasAtualizadas.length; accountIndex++) {
      const conta = contasAtualizadas[accountIndex];
      
      sendProgressToUser(userId, {
        type: "sync_progress",
        message: `Processando conta ${accountIndex + 1}/${contasAtualizadas.length}: Loja ${conta.shop_id}`,
        current: accountIndex, total: contasAtualizadas.length,
        fetched: totalSaved, expected: allOrdersPayload.length,
        accountId: conta.id, accountNickname: `Loja ${conta.shop_id}`
      });

      try {
        // Buscar IDs existentes de forma otimizada (só consideramos como válidas as vendas com valor > 0)
        const existingOrderIds = await prisma.shopeeVenda.findMany({
          where: { 
            shopeeAccountId: conta.id,
            valorTotal: { gt: 0 } 
          },
          select: { orderId: true }
        });
        const existingIds = new Set(existingOrderIds.map(v => v.orderId));

        // Auto-cura: Verifica se há pedidos COMPLETED com taxa >= 0 (sinal antigo era positivo, agora deve ser negativo)
        const corruptOrders = await prisma.shopeeVenda.count({
          where: {
            shopeeAccountId: conta.id,
            status: "COMPLETED",
            taxaPlataforma: { gte: 0 }
          }
        });
        const needsHeal = corruptOrders > 0;

        if (needsHeal) {
          console.log(`[Shopee Sync] 🚑 AUTO-CURA ATIVADA - Conta ${conta.shop_id}: Encontrados ${corruptOrders} pedidos corrompidos.`);
        }

        const ultimaVenda = await prisma.shopeeVenda.findFirst({
          where: { 
            shopeeAccountId: conta.id,
            valorTotal: { gt: 0 }
          },
          orderBy: { dataVenda: "desc" },
          select: { dataVenda: true },
        });

        let since: Date;
        const isFirstSync = !ultimaVenda;
        
        if (isFirstSync || needsHeal) {
          since = new Date("2024-01-01T00:00:00.000Z");
          console.log(`[Shopee Sync] 🚀 PRIMEIRA SYNC / CURA - Conta ${conta.shop_id}: desde ${since.toISOString()}`);
        } else {
          since = new Date(ultimaVenda.dataVenda.getTime() - 24 * 60 * 60 * 1000);
          console.log(`[Shopee Sync] 📊 Sync incremental - Conta ${conta.shop_id}: desde ${since.toISOString()}`);
        }

        const ordersFromAccount = await fetchAllShopeeOrdersSince(
          { id: conta.id, shop_id: conta.shop_id, access_token: conta.access_token, refresh_token: conta.refresh_token, expires_at: conta.expires_at },
          since, userId
        );

        // Passar todos os pedidos para o batchUpsertVendas, para que pedidos existentes sejam ATUALIZADOS com novos status (READY_TO_SHIP -> COMPLETED, etc)
        const newOrders = ordersFromAccount;
        
        console.log(`[Shopee Sync] Conta ${conta.shop_id}: ${newOrders.length} novas de ${ordersFromAccount.length}`);

        if (newOrders.length === 0) {
          sendProgressToUser(userId, {
            type: "sync_progress",
            message: `Conta ${conta.shop_id}: todas as vendas já sincronizadas ✓`,
            current: accountIndex + 1, total: contasAtualizadas.length,
            fetched: totalSaved, expected: 0
          });
          continue;
        }

        // Preparar registros para batch insert
        const vendaRecords = newOrders.map((order: any) => {
          allOrdersPayload.push({ accountId: conta.id, shopId: conta.shop_id, order });

          const orderSn = String(order.order_sn);
          const dataVenda = new Date((toFiniteNumber(order.create_time) ?? 0) * 1000);
          const status = String(order.order_status ?? "DESCONHECIDO");
          const itemList: any[] = Array.isArray(order.item_list) ? order.item_list : [];
          const quantidade = itemList.reduce((acc: number, it: any) => acc + (toFiniteNumber(it?.model_quantity_purchased) ?? 0), 0);
          const incomeDetails = order.escrow_details?.order_income || {};
          // === VALOR TOTAL E UNITÁRIO (Apenas Produto, SEM frete) ===
          // Prioridade: cost_of_goods_sold > order_discounted_price > order_selling_price > soma dos itens > total_amount (fallback)
          let productSubtotal = toFiniteNumber(incomeDetails.cost_of_goods_sold)
            || toFiniteNumber(incomeDetails.order_discounted_price)
            || toFiniteNumber(incomeDetails.order_selling_price)
            || 0;
          if (!productSubtotal) {
            productSubtotal = itemList.reduce((acc: number, it: any) => {
              const price = toFiniteNumber(it?.model_discounted_price) || toFiniteNumber(it?.model_original_price) || 0;
              const qty = toFiniteNumber(it?.model_quantity_purchased) || 1;
              return acc + (price * qty);
            }, 0);
          }
          
          // Fallback para total_amount caso o pedido ainda não tenha escrow (recém-criado) e os itens não tenham valor
          if (productSubtotal === 0 && toFiniteNumber(order.total_amount)) {
            productSubtotal = toFiniteNumber(order.total_amount) ?? 0;
          }

          const totalAmount = productSubtotal;
          const unitario = quantidade > 0 ? roundCurrency(totalAmount / quantidade) : roundCurrency(totalAmount);

          // === TAXA DA PLATAFORMA (negativo = custo, igual ML) ===
          const commissionFee = toFiniteNumber(incomeDetails.commission_fee) ?? 0;
          const serviceFee = toFiniteNumber(incomeDetails.service_fee) ?? 0;
          // "Taxa de Devolução Fácil Shopee" = shipping_seller_protection_fee_amount
          const shippingSellerProtectionFee = toFiniteNumber(incomeDetails.shipping_seller_protection_fee_amount) ?? 0;
          const sellerTransactionFee = toFiniteNumber(incomeDetails.seller_transaction_fee) ?? 0;
          const drcAdjustableRefund = toFiniteNumber(incomeDetails.drc_adjustable_refund) ?? 0;
          
          const devolucaoFacilOuOutros = shippingSellerProtectionFee + sellerTransactionFee + drcAdjustableRefund;
          const taxaPlataformaRaw = commissionFee + serviceFee + devolucaoFacilOuOutros;
          const taxaPlataforma = taxaPlataformaRaw > 0 ? -roundCurrency(taxaPlataformaRaw) : null;
          
          // === FRETE (negativo = custo do vendedor, igual ML) ===
          const actualShippingFee = toFiniteNumber(incomeDetails.actual_shipping_fee) ?? 0;
          const reverseShippingFee = toFiniteNumber(incomeDetails.reverse_shipping_fee) ?? 0;
          const shopeeShippingRebate = toFiniteNumber(incomeDetails.shopee_shipping_rebate) ?? 0;
          const buyerPaidShippingFee = toFiniteNumber(incomeDetails.buyer_paid_shipping_fee) ?? 0;
          const shippingFeeDiscountFrom3pl = toFiniteNumber(incomeDetails.shipping_fee_discount_from_3pl) ?? 0;
          
          // Custo do vendedor = frete real - o que o comprador pagou - subsídios
          const custoVendedorFrete = actualShippingFee - buyerPaidShippingFee - shopeeShippingRebate - shippingFeeDiscountFrom3pl + reverseShippingFee;
          // Se positivo → vendedor pagou → armazena como NEGATIVO (custo)
          const frete = custoVendedorFrete > 0.005 ? -roundCurrency(custoVendedorFrete) : 0;
          
          // === MARGEM (igual ML: valorTotal + taxa(neg) + frete(neg)) ===
          const margem = roundCurrency(totalAmount + (taxaPlataforma ?? 0) + frete);

          const titulo = truncateString(itemList?.[0]?.item_name, 500) || "Pedido";
          
          let skuRaw = null;
          if (itemList && itemList.length > 0) {
            const firstItem = itemList[0];
            skuRaw = firstItem.item_sku || firstItem.model_sku || firstItem.variation_sku || null;
          }
          const sku = skuRaw ? truncateString(String(skuRaw), 255) : null;
          
          const comprador = truncateString(order.buyer_username, 255) || "Comprador";
          const trackingNumber = truncateString(order.package_list?.[0]?.tracking_number, 255) || null;
          const packageInfo = order.package_list?.[0] || {};
          const parcelWeight = toFiniteNumber(packageInfo.parcel_chargeable_weight_gram) || 0;
          const shippingCarrier = truncateString(packageInfo.shipping_carrier || order.shipping_carrier, 100) || null;
          const logisticsStatus = truncateString(packageInfo.logistics_status, 100) || null;

          // Construir detalhes para Tooltips
          const paymentDetailsExtended = {
            ...(order.escrow_details || {}),
            platformFeeBreakdown: {
              commission_fee: commissionFee,
              service_fee: serviceFee,
              outros_encargos: devolucaoFacilOuOutros
            }
          };

          const shipmentDetailsExtended = {
            parcel_chargeable_weight_gram: parcelWeight,
            shipping_carrier: shippingCarrier,
            logistics_status: logisticsStatus,
            actual_shipping_fee: actualShippingFee,
            reverse_shipping_fee: reverseShippingFee,
            shopee_shipping_rebate: shopeeShippingRebate,
            buyer_paid_shipping_fee: buyerPaidShippingFee,
            shipping_fee_discount_from_3pl: shippingFeeDiscountFrom3pl,
            custo_vendedor_frete: custoVendedorFrete,
            subsidio_automatico_aplicado: shopeeShippingRebate > 0 && incomeDetails.shopee_shipping_rebate === 0,
            ...packageInfo
          };

          return {
            orderId: orderSn,
            userId: session.sub,
            shopeeAccountId: conta.id,
            dataVenda,
            status,
            conta: conta.shop_name ?? conta.shop_id,
            valorTotal: new Decimal(totalAmount),
            quantidade: quantidade || 1,
            unitario: new Decimal(unitario),
            taxaPlataforma: taxaPlataforma !== null ? new Decimal(taxaPlataforma) : null,
            frete: new Decimal(frete),
            margemContribuicao: new Decimal(margem),
            isMargemReal: true,
            titulo,
            sku,
            comprador,
            shippingId: trackingNumber,
            shippingStatus: shippingCarrier,
            plataforma: "Shopee",
            canal: "SP",
            rawData: order,
            paymentDetails: paymentDetailsExtended,
            shipmentDetails: shipmentDetailsExtended,
            atualizadoEm: new Date(),
          };
        });

        // OTIMIZAÇÃO #3: Batch upsert otimizado
        const saved = await batchUpsertVendas(vendaRecords, userId, conta.id, `Loja ${conta.shop_id}`);
        totalSaved += saved;
        console.log(`[Shopee Sync] Conta ${conta.shop_id}: ${saved} vendas salvas com sucesso`);

      } catch (error) {
        console.error(`[shopee][sync] Erro na conta ${conta.id}:`, error);
        errors.push({ accountId: conta.id, shopId: conta.shop_id, message: error instanceof Error ? error.message : "Erro desconhecido" });
        
        sendProgressToUser(userId, {
          type: "sync_error",
          message: `Erro ao processar conta ${conta.shop_id}: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
          errorCode: "SHOPEE_SYNC_ERROR"
        });
      }
    }

    // Conclusão
    sendProgressToUser(userId, {
      type: "sync_complete",
      message: `Sincronização concluída! ${totalSaved} vendas processadas`,
      current: totalSaved,
      total: allOrdersPayload.length,
      fetched: totalSaved,
      expected: allOrdersPayload.length
    });

    invalidateVendasCache(userId);
    console.log(`[Cache] Cache invalidado para usuário ${userId}`);

    setTimeout(() => closeUserConnections(userId), 2000);

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      accounts: summaries,
      orders: allOrdersPayload.length,
      saved: totalSaved,
      errors,
      totals: {
        expected: allOrdersPayload.length,
        fetched: allOrdersPayload.length,
        saved: totalSaved
      }
    });

  } catch (error) {
    console.error("Erro fatal ao sincronizar vendas Shopee:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Erro interno no servidor." },
      { status: 500 },
    );
  }
}
