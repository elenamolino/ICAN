import dotenv from 'dotenv';
import { RedisClientType } from 'redis';
dotenv.config();

/**
 * Prefixes of the entries the server keeps for itself (sign-in state, tickets and codes).
 * The public /cache endpoint must never read or write them.
 */
export const SERVER_CACHE_PREFIXES = ['sso:'] as const;

/** Whether a key belongs to the server's own entries. */
export function isServerCacheKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return SERVER_CACHE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

class CacheService {
  private redisClient: RedisClientType | null = null;

  constructor() {}

  setRedisClient(client: RedisClientType) {
    this.redisClient = client;
  }

  async get(key: string) {
    if (!this.redisClient) {
      throw new Error('ERROR: Redis client not initialized');
    }

    const value = await this.redisClient?.get(key);

    return value ? JSON.parse(value) : null;
  }

  async del(key: string) {
    if (!this.redisClient) {
      throw new Error('ERROR: Redis client not initialized');
    }

    await this.redisClient.del(key);
  }

  /** Reads and deletes a key in one step, so a single-use value can only be taken once. */
  async take(key: string) {
    if (!this.redisClient) {
      throw new Error('ERROR: Redis client not initialized');
    }

    const value = await this.redisClient.getDel(key);

    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, expirationInSeconds?: number) {
    if (!this.redisClient) {
      throw new Error('ERROR: Redis client not initialized');
    }

    const previousValue = await this.redisClient?.get(key);
    if (previousValue && previousValue !== JSON.stringify(value)) {
      throw new Error('CONFLICT: Value already exists in cache, please use a different key.');
    }

    await this.redisClient?.set(key, JSON.stringify(value), {
      EX: expirationInSeconds ?? 300,
    });
  }
}

export default CacheService;
