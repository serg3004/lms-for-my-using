import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { PublicAccess } from '../auth/roles.js';
import { UploadService } from '../upload/upload.service.js';
import { RedisHealthService } from './redis-health.service.js';

type HealthOkResponse = {
  status: 'ok';
  db: 'ok';
  redis: 'ok' | 'disabled';
  storage: 'ok' | 'disabled';
};

type HealthErrorResponse = {
  status: 'error';
  db: 'ok' | 'unavailable';
  redis: 'ok' | 'disabled' | 'unavailable';
  storage: 'ok' | 'disabled' | 'unavailable';
};

export type HealthResponse = HealthOkResponse | HealthErrorResponse;

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisHealthService,
    private readonly upload: UploadService,
  ) {}

  @Get('live')
  @PublicAccess()
  @HttpCode(HttpStatus.OK)
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get()
  @PublicAccess()
  @HttpCode(HttpStatus.OK)
  getHealth(): Promise<HealthOkResponse> {
    return this.getReadiness();
  }

  @Get('ready')
  @PublicAccess()
  @HttpCode(HttpStatus.OK)
  async getReadiness(): Promise<HealthOkResponse> {
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.checkReadiness(),
      this.upload.checkReadiness(),
    ]);
    const response: HealthErrorResponse = {
      status: 'error',
      db: checks[0].status === 'fulfilled' ? 'ok' : 'unavailable',
      redis: checks[1].status === 'fulfilled' ? checks[1].value : 'unavailable',
      storage: checks[2].status === 'fulfilled' ? checks[2].value : 'unavailable',
    };

    if (checks.some((check) => check.status === 'rejected')) {
      throw new ServiceUnavailableException(response);
    }

    return {
      status: 'ok',
      db: 'ok',
      redis: checks[1].status === 'fulfilled' ? checks[1].value : 'disabled',
      storage: checks[2].status === 'fulfilled' ? checks[2].value : 'disabled',
    };
  }
}
