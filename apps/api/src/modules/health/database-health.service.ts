import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

/** Infrastructure adapter that keeps database access outside HTTP controllers. */
@Injectable()
export class DatabaseHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async checkReadiness(): Promise<'ok'> {
    await this.prisma.$queryRaw`SELECT 1`;
    return 'ok';
  }
}
