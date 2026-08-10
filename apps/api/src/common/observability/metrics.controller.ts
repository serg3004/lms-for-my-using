import { Controller, Get, Headers, Res, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { metricsRegistry } from './metrics.js';
import { PrismaService } from '../../database/prisma.service.js';

type MetricsResponse = {
  setHeader(name: string, value: string): void;
  send(body: string): void;
};

function validBearerToken(authorization: string | undefined, expected: string): boolean {
  const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

@Controller('metrics')
export class MetricsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async scrape(@Headers('authorization') authorization: string | undefined, @Res() response: MetricsResponse): Promise<void> {
    const token = process.env['METRICS_BEARER_TOKEN'];
    if (token && !validBearerToken(authorization, token)) throw new UnauthorizedException('Invalid metrics token');
    response.setHeader('Content-Type', metricsRegistry.contentType);
    const [applicationMetrics, prismaMetrics] = await Promise.all([
      metricsRegistry.metrics(),
      this.prisma.$metrics.prometheus({ globalLabels: { service: 'lms-api' } }),
    ]);
    response.send(`${applicationMetrics}\n${prismaMetrics}`);
  }
}
