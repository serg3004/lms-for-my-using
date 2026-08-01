import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private readonly redis: Redis | null;

  constructor() {
    const redisUrl = process.env['REDIS_URL'];
    this.redis = redisUrl
      ? new Redis(redisUrl, {
          lazyConnect: true,
          enableOfflineQueue: false,
          connectTimeout: 2_000,
          commandTimeout: 2_000,
          maxRetriesPerRequest: 0,
        })
      : null;
    this.redis?.on('error', () => undefined);
  }

  async checkReadiness(): Promise<'ok' | 'disabled'> {
    if (!this.redis) return 'disabled';
    if (this.redis.status === 'wait' || this.redis.status === 'end') await this.redis.connect();
    await this.redis.ping();
    return 'ok';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis && this.redis.status !== 'end') this.redis.disconnect();
  }
}
