/**
 * Background Worker for Redis → PostgreSQL Sales Sync
 * 
 * Processes queued sales from Redis and saves them to PostgreSQL:
 * - Batch processing (50 sales at a time)
 * - SSE progress updates for "saving" phase
 * - Error handling with retry queue
 * - Preserves SKU cache logic
 * - Exponential backoff for failures
 */

import prisma from './prisma';
import { dequeueSales, type QueuedSale, getQueueStats } from './redis-queue';
import { sendProgressToUser } from './sse-progress';
import { Decimal } from '@prisma/client/runtime/library';

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second

type SkuCacheEntry = {
    custoUnitario: number | null;
    tipo: string | null;
};

// In-memory SKU cache (preserved from original implementation)
const skuCache = new Map<string, SkuCacheEntry>();

/**
 * Process a single batch of sales from Redis to PostgreSQL
 */
export async function processSalesBatch(
    userId: string,
    retryCount: number = 0
): Promise<{ processed: number; remaining: number; errors: number }> {
    try {
        // Dequeue a batch
        const { sales, key } = await dequeueSales(userId, BATCH_SIZE);

        if (sales.length === 0) {
            // No more sales to process
            return { processed: 0, remaining: 0, errors: 0 };
        }

        console.log(`[Sync Worker] 📦 Processing batch of ${sales.length} sales for user ${userId}`);

        // Send progress update
        const stats = await getQueueStats(userId);
        sendProgressToUser(userId, {
            type: 'sync_save_progress',
            message: `Salvando vendas no banco de dados...`,
            current: 0,
            total: stats.totalInQueue + sales.length,
            phase: 'saving',
        });

        // Save sales to PostgreSQL
        const saveResults = await saveSalesToDatabase(userId, sales);

        const processed = saveResults.saved;
        const errors = saveResults.errors;

        // Update progress
        sendProgressToUser(userId, {
            type: 'sync_save_progress',
            message: `${processed} vendas salvas no banco de dados`,
            current: processed,
            total: stats.totalInQueue + sales.length,
            phase: 'saving',
        });

        // Get remaining count
        const remainingStats = await getQueueStats(userId);

        console.log(`[Sync Worker] ✅ Processed ${processed} sales, ${errors} errors, ${remainingStats.totalInQueue} remaining`);

        return {
            processed,
            remaining: remainingStats.totalInQueue,
            errors,
        };

    } catch (error) {
        console.error('[Sync Worker] ❌ Batch processing error:', error);

        // Retry with exponential backoff
        if (retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
            console.log(`[Sync Worker] 🔄 Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

            await new Promise(resolve => setTimeout(resolve, delay));
            return processSalesBatch(userId, retryCount + 1);
        }

        return { processed: 0, remaining: 0, errors: 1 };
    }
}

/**
 * Process all queued sales for a user
 */
export async function processAllUserSales(userId: string): Promise<{
    totalProcessed: number;
    totalErrors: number;
}> {
    let totalProcessed = 0;
    let totalErrors = 0;

    console.log(`[Sync Worker] 🚀 Starting worker for user ${userId}`);

    sendProgressToUser(userId, {
        type: 'sync_save_start',
        message: 'Iniciando salvamento no banco de dados...',
        phase: 'saving',
    });

    while (true) {
        const result = await processSalesBatch(userId);

        totalProcessed += result.processed;
        totalErrors += result.errors;

        if (result.remaining === 0) {
            // All done
            break;
        }

        // Small delay between batches to avoid overwhelming DB
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Sync Worker] ✅ Completed for user ${userId}: ${totalProcessed} processed, ${totalErrors} errors`);

    sendProgressToUser(userId, {
        type: 'sync_save_complete',
        message: `Salvamento concluído: ${totalProcessed} vendas salvas no banco de dados`,
        total: totalProcessed,
        phase: 'complete',
    });

    return { totalProcessed, totalErrors };
}

/**
 * Save sales to PostgreSQL database (adapted from original sync logic)
 */
async function saveSalesToDatabase(
    userId: string,
    sales: QueuedSale[]
): Promise<{ saved: number; errors: number }> {
    let saved = 0;
    let errors = 0;

    // Load SKU cache for this user if not already loaded
    await loadSkuCache(userId);

    // Process sales in smaller batches for better transaction management
    for (let i = 0; i < sales.length; i += BATCH_SIZE) {
        const batch = sales.slice(i, i + BATCH_SIZE);

        try {
            const savePromises = batch.map(sale => saveSingleSale(userId, sale));
            const results = await Promise.allSettled(savePromises);

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    saved++;
                } else {
                    errors++;
                    console.error('[Sync Worker] Save error:', result.reason);
                }
            });

        } catch (error) {
            console.error('[Sync Worker] Batch save error:', error);
            errors += batch.length;
        }
    }

    return { saved, errors };
}

/**
 * Save a single sale to database (adapted from original implementation)
 */
async function saveSingleSale(userId: string, sale: QueuedSale): Promise<void> {
    const { accountId, accountNickname, mlUserId, order, shipment, freight } = sale;

    const o = order ?? {};
    const orderId = String(o.id ?? '');

    if (!orderId) {
        throw new Error('Missing order ID');
    }

    // Extract basic order data
    const dataVenda = extractOrderDate(o) || new Date();
    const status = truncateString(o.status, 50);
    const buyerNickname = truncateString(o.buyer?.nickname, 255);
    const titulo = truncateString(o.order_items?.[0]?.item?.title, 500);
    const sku = truncateString(o.order_items?.[0]?.item?.seller_sku, 255);

    // Get SKU data from cache
    const skuData = sku ? skuCache.get(sku) : null;
    const custoUnitario = skuData?.custoUnitario ?? null;
    const tipoItem = skuData?.tipo ?? null;

    // Calculate values
    const valorTotal = toFiniteNumber(o.total_amount) ?? 0;
    const quantidade = freight.quantity ?? 1;
    const valorUnitario = freight.unitPrice ?? (valorTotal / quantidade);

    // Tax and freight calculations
    const taxaPlataforma = toFiniteNumber(o.fee_details?.find((f: any) => f.type === 'sale_fee')?.amount) ?? 0;
    const frete = freight.adjustedCost ?? freight.finalCost ?? 0;
    const cmv = custoUnitario ? custoUnitario * quantidade : null;

    // Calculate margin
    const { valor: margemContribuicao, isMargemReal } = calculateMargemContribuicao(
        valorTotal,
        -Math.abs(taxaPlataforma),
        frete,
        cmv
    );

    // Prepare data for upsert - matching Prisma schema exactly
    const vendaData = {
        orderId,
        userId,
        meliAccountId: accountId,
        dataVenda,
        status: status || 'unknown',
        conta: accountNickname || `ML ${mlUserId}`,
        titulo: titulo || 'Sem título',
        sku: sku || null,
        comprador: buyerNickname || 'Desconhecido',
        valorTotal: new Decimal(valorTotal),
        quantidade, // Int type in schema
        unitario: new Decimal(valorUnitario),
        taxaPlataforma: taxaPlataforma ? new Decimal(taxaPlataforma) : null,
        frete: new Decimal(frete),
        cmv: cmv ? new Decimal(cmv) : null,
        margemContribuicao: new Decimal(margemContribuicao),
        isMargemReal,
        logisticType: truncateString(freight.logisticType, 100),
        envioMode: truncateString(freight.shippingMode, 100),
        plataforma: 'Mercado Livre',
        rawData: truncateJsonData({ order, shipment, freight }),
    };

    // Upsert to database
    await prisma.meliVenda.upsert({
        where: { orderId },
        update: vendaData,
        create: vendaData,
    });
}

/**
 * Load SKU cache from database
 */
async function loadSkuCache(userId: string): Promise<void> {
    if (skuCache.size > 0) {
        return; // Already loaded
    }

    try {
        const produtos = await prisma.sKU.findMany({
            where: { userId },
            select: { sku: true, custoUnitario: true, tipo: true },
        });

        produtos.forEach((p: any) => {
            if (p.sku) {
                skuCache.set(p.sku, {
                    custoUnitario: p.custoUnitario ? Number(p.custoUnitario) : null,
                    tipo: p.tipo,
                });
            }
        });

        console.log(`[Sync Worker] 📦 Loaded ${skuCache.size} SKUs into cache`);
    } catch (error) {
        console.error('[Sync Worker] Failed to load SKU cache:', error);
    }
}

// Helper functions (preserved from original implementation)

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function roundCurrency(v: number): number {
    const r = Math.round((v + Number.EPSILON) * 100) / 100;
    return Object.is(r, -0) ? 0 : r;
}

function truncateString(str: string | null | undefined, maxLength: number): string {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) : str;
}

function truncateJsonData<T>(data: T): T {
    return data === undefined ? (null as T) : data;
}

function extractOrderDate(order: unknown): Date | null {
    if (!order || typeof order !== 'object') return null;
    const rawDate =
        (order as any)?.date_closed ??
        (order as any)?.date_created ??
        (order as any)?.date_last_updated ??
        null;
    if (!rawDate) return null;
    const parsed = new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateMargemContribuicao(
    valorTotal: number,
    taxaPlataforma: number | null,
    frete: number,
    cmv: number | null
): { valor: number; isMargemReal: boolean } {
    const taxa = taxaPlataforma || 0;

    if (cmv !== null && cmv !== undefined && cmv > 0) {
        const margemContribuicao = valorTotal + taxa + frete - cmv;
        return {
            valor: roundCurrency(margemContribuicao),
            isMargemReal: true,
        };
    }

    const receitaLiquida = valorTotal + taxa + frete;
    return {
        valor: roundCurrency(receitaLiquida),
        isMargemReal: false,
    };
}
