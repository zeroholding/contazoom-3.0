/**
 * Redis Client Configuration
 * 
 * Provides Redis connection with:
 * - Connection pooling
 * - Auto-reconnection
 * - Graceful fallback when unavailable
 * - Health checks
 */

import Redis, { RedisOptions } from 'ioredis';

// Singleton instance
let redisClient: Redis | null = null;
let isRedisAvailable = true;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Get Redis configuration from environment
 */
function getRedisConfig(): RedisOptions {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    // Parse Redis URL (redis://user:password@host:port/db)
    return {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: false,
    };
  }

  // Fallback to individual env vars
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: false,
  };
}

/**
 * Initialize Redis client
 */
function initRedis(): Redis {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    // Use URL directly
    return new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  // Use individual config options
  const config = getRedisConfig();
  const client = new Redis(config);

  client.on('connect', () => {
    console.log('[Redis] ✅ Connected successfully');
    isRedisAvailable = true;
  });

  client.on('ready', () => {
    console.log('[Redis] ✅ Ready to accept commands');
    isRedisAvailable = true;
  });

  client.on('error', (error) => {
    console.error('[Redis] ❌ Connection error:', error.message);
    isRedisAvailable = false;
  });

  client.on('close', () => {
    console.warn('[Redis] ⚠️ Connection closed');
    isRedisAvailable = false;
  });

  client.on('reconnecting', () => {
    console.log('[Redis] 🔄 Reconnecting...');
  });

  return client;
}

/**
 * Get Redis client instance (singleton)
 */
export function getRedisClient(): Redis | null {
  // Check if Redis is disabled
  if (process.env.REDIS_ENABLED === 'false') {
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = initRedis();
    } catch (error) {
      console.error('[Redis] Failed to initialize:', error);
      isRedisAvailable = false;
      return null;
    }
  }

  return redisClient;
}

/**
 * Check Redis health status
 */
export async function checkRedisHealth(): Promise<boolean> {
  const now = Date.now();

  // Cache health check result for 30 seconds
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return isRedisAvailable;
  }

  lastHealthCheck = now;

  const client = getRedisClient();
  if (!client) {
    isRedisAvailable = false;
    return false;
  }

  try {
    await client.ping();
    isRedisAvailable = true;
    return true;
  } catch (error) {
    console.error('[Redis] Health check failed:', error);
    isRedisAvailable = false;
    return false;
  }
}

/**
 * Check if Redis is currently available
 */
export function isRedisHealthy(): boolean {
  return isRedisAvailable;
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Redis] Connection closed gracefully');
    } catch (error) {
      console.error('[Redis] Error closing connection:', error);
      redisClient.disconnect();
    }
    redisClient = null;
    isRedisAvailable = false;
  }
}

/**
 * Execute Redis command with automatic fallback
 */
export async function executeRedisCommand<T>(
  command: (client: Redis) => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  const client = getRedisClient();

  if (!client || !isRedisAvailable) {
    console.warn('[Redis] Not available, using fallback');
    return fallback();
  }

  try {
    return await command(client);
  } catch (error) {
    console.error('[Redis] Command failed, using fallback:', error);
    isRedisAvailable = false;
    return fallback();
  }
}

export default getRedisClient;
