/**
 * Redis Queue Manager for Sales Synchronization
 * 
 * Manages the queue of sales data between API fetch and PostgreSQL save:
 * - Enqueue sales from Mercado Livre API
 * - Dequeue sales for PostgreSQL batch processing
 * - Track queue statistics
 * - Handle TTL and cleanup
 */

import { getRedisClient, executeRedisCommand } from './redis';
import type { Redis } from 'ioredis';

export type QueuedSale = {
    accountId: string;
    accountNickname: string | null;
    mlUserId: number;
    order: any;
    shipment?: any;
    freight: any;
};

export type QueueStats = {
    totalInQueue: number;
    queueKeys: string[];
    oldestTimestamp: number | null;
    estimatedSize: number; // in bytes
};

// Queue configuration
const QUEUE_PREFIX = 'vendas:queue';
const QUEUE_TTL = parseInt(process.env.REDIS_QUEUE_TTL || '86400'); // 24 hours default
const BATCH_SIZE = 50; // Match current PostgreSQL batch size

/**
 * Generate queue key for user and account
 */
function getQueueKey(userId: string, accountId: string, timestamp?: number): string {
    const ts = timestamp || Date.now();
    return `${QUEUE_PREFIX}:${userId}:${accountId}:${ts}`;
}

/**
 * Enqueue sales data to Redis
 */
export async function enqueueSales(
    userId: string,
    accountId: string,
    sales: QueuedSale[]
): Promise<{ success: boolean; key: string | null; count: number }> {
    if (sales.length === 0) {
        return { success: true, key: null, count: 0 };
    }

    const queueKey = getQueueKey(userId, accountId);

    return executeRedisCommand(
        async (client: Redis) => {
            // Store sales as JSON array
            const data = JSON.stringify(sales);

            // Set with TTL
            await client.setex(queueKey, QUEUE_TTL, data);

            // Add to user's queue index for tracking
            const indexKey = `${QUEUE_PREFIX}:index:${userId}`;
            await client.sadd(indexKey, queueKey);
            await client.expire(indexKey, QUEUE_TTL);

            console.log(`[Redis Queue] ✅ Enqueued ${sales.length} sales to ${queueKey}`);

            return { success: true, key: queueKey, count: sales.length };
        },
        async () => {
            console.warn('[Redis Queue] ⚠️ Redis unavailable, skipping enqueue');
            return { success: false, key: null, count: 0 };
        }
    );
}

/**
 * Dequeue sales data from Redis (for background worker)
 */
export async function dequeueSales(
    userId: string,
    limit: number = BATCH_SIZE
): Promise<{ sales: QueuedSale[]; key: string | null }> {
    return executeRedisCommand(
        async (client: Redis) => {
            const indexKey = `${QUEUE_PREFIX}:index:${userId}`;

            // Get all queue keys for user
            const queueKeys = await client.smembers(indexKey);

            if (queueKeys.length === 0) {
                return { sales: [], key: null };
            }

            // Sort by timestamp (oldest first) to maintain FIFO
            const sortedKeys = queueKeys.sort();

            // Get first queue batch
            const queueKey = sortedKeys[0];
            const data = await client.get(queueKey);

            if (!data) {
                // Key expired or deleted, remove from index
                await client.srem(indexKey, queueKey);
                return { sales: [], key: null };
            }

            try {
                const allSales: QueuedSale[] = JSON.parse(data);

                // If we can dequeue all sales in one go
                if (allSales.length <= limit) {
                    // Delete the queue key and remove from index
                    await client.del(queueKey);
                    await client.srem(indexKey, queueKey);

                    console.log(`[Redis Queue] ✅ Dequeued all ${allSales.length} sales from ${queueKey}`);
                    return { sales: allSales, key: queueKey };
                }

                // Otherwise, take a batch and update the queue
                const batch = allSales.slice(0, limit);
                const remaining = allSales.slice(limit);

                // Update queue with remaining sales
                const remainingData = JSON.stringify(remaining);
                const ttl = await client.ttl(queueKey);
                await client.setex(queueKey, Math.max(ttl, 300), remainingData); // At least 5 min TTL

                console.log(`[Redis Queue] ✅ Dequeued ${batch.length} sales from ${queueKey}, ${remaining.length} remaining`);
                return { sales: batch, key: queueKey };

            } catch (error) {
                console.error('[Redis Queue] ❌ Failed to parse queue data:', error);
                // Delete corrupted data
                await client.del(queueKey);
                await client.srem(indexKey, queueKey);
                return { sales: [], key: null };
            }
        },
        async () => {
            console.warn('[Redis Queue] ⚠️ Redis unavailable, cannot dequeue');
            return { sales: [], key: null };
        }
    );
}

/**
 * Get queue statistics for a user
 */
export async function getQueueStats(userId: string): Promise<QueueStats> {
    return executeRedisCommand(
        async (client: Redis) => {
            const indexKey = `${QUEUE_PREFIX}:index:${userId}`;
            const queueKeys = await client.smembers(indexKey);

            if (queueKeys.length === 0) {
                return {
                    totalInQueue: 0,
                    queueKeys: [],
                    oldestTimestamp: null,
                    estimatedSize: 0,
                };
            }

            // Count total sales and estimate size
            let totalInQueue = 0;
            let estimatedSize = 0;
            const timestamps: number[] = [];

            for (const key of queueKeys) {
                const data = await client.get(key);
                if (data) {
                    try {
                        const sales: QueuedSale[] = JSON.parse(data);
                        totalInQueue += sales.length;
                        estimatedSize += data.length;

                        // Extract timestamp from key
                        const parts = key.split(':');
                        const ts = parseInt(parts[parts.length - 1]);
                        if (!isNaN(ts)) {
                            timestamps.push(ts);
                        }
                    } catch (error) {
                        console.error('[Redis Queue] Failed to parse queue data for stats:', error);
                    }
                }
            }

            const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;

            return {
                totalInQueue,
                queueKeys,
                oldestTimestamp,
                estimatedSize,
            };
        },
        async () => {
            return {
                totalInQueue: 0,
                queueKeys: [],
                oldestTimestamp: null,
                estimatedSize: 0,
            };
        }
    );
}

/**
 * Clear all queued sales for a user (useful for cleanup or reset)
 */
export async function clearUserQueue(userId: string): Promise<number> {
    return executeRedisCommand(
        async (client: Redis) => {
            const indexKey = `${QUEUE_PREFIX}:index:${userId}`;
            const queueKeys = await client.smembers(indexKey);

            if (queueKeys.length === 0) {
                return 0;
            }

            // Delete all queue keys
            const pipeline = client.pipeline();
            queueKeys.forEach(key => pipeline.del(key));
            await pipeline.exec();

            // Clear index
            await client.del(indexKey);

            console.log(`[Redis Queue] 🗑️ Cleared ${queueKeys.length} queue(s) for user ${userId}`);
            return queueKeys.length;
        },
        async () => {
            return 0;
        }
    );
}

/**
 * Get total queued sales count for a specific account
 */
export async function getAccountQueueCount(userId: string, accountId: string): Promise<number> {
    return executeRedisCommand(
        async (client: Redis) => {
            const indexKey = `${QUEUE_PREFIX}:index:${userId}`;
            const queueKeys = await client.smembers(indexKey);

            let totalCount = 0;

            for (const key of queueKeys) {
                // Check if key belongs to this account
                if (key.includes(`:${accountId}:`)) {
                    const data = await client.get(key);
                    if (data) {
                        try {
                            const sales: QueuedSale[] = JSON.parse(data);
                            totalCount += sales.length;
                        } catch (error) {
                            console.error('[Redis Queue] Failed to parse queue data:', error);
                        }
                    }
                }
            }

            return totalCount;
        },
        async () => {
            return 0;
        }
    );
}
