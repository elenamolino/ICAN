import dotenv from 'dotenv';
import { RedisClientType } from 'redis';
dotenv.config();

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

  /** Reads and deletes a key atomically, so a value can only be consumed once. */
  async take(key: string) {
    if (!this.redisClient) {
      throw new Error('ERROR: Redis client not initialized');
    }

    const value = await this.redisClient.getDel(key);
    return value ? JSON.parse(value) : null;
  }

  /** Sets a key only when it does not exist yet. Returns whether it was set. */
  async setIfAbsent(key: string, value: unknown, seconds: number): Promise<boolean> {
    if (!this.redisClient) {
      throw new Error('ERROR: Redis client not initialized');
    }

    return (await this.redisClient.set(key, JSON.stringify(value), { NX: true, EX: seconds })) === 'OK';
  }

  /**
   * Overwrites a key, unlike set(), which refuses to change an existing value.
   * With onlyIfPresent, it only writes when the key still exists.
   */
  async replace(key: string, value: unknown, seconds: number, onlyIfPresent = false): Promise<boolean> {
    if (!this.redisClient) {
      throw new Error('ERROR: Redis client not initialized');
    }

    const result = await this.redisClient.set(
      key,
      JSON.stringify(value),
      onlyIfPresent ? { EX: seconds, XX: true } : { EX: seconds }
    );
    return result === 'OK';
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
