import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

type HealthOkResponse = {
  status: 'ok';
  db: 'ok';
};

type HealthErrorResponse = {
  status: 'error';
  db: 'unavailable';
};

export type HealthResponse = HealthOkResponse | HealthErrorResponse;

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getHealth(): Promise<HealthOkResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'unavailable' });
    }

    return { status: 'ok', db: 'ok' };
  }
}
