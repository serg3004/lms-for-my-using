import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { DatabaseHealthService } from './database-health.service.js';

describe('DatabaseHealthService', () => {
  it('reports readiness after the database probe succeeds', async () => {
    const queryRaw = jest.fn(async () => [{ '?column?': 1 }]);
    const service = new DatabaseHealthService({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(service.checkReadiness()).resolves.toBe('ok');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('propagates database probe failures to the readiness controller', async () => {
    const service = new DatabaseHealthService({
      $queryRaw: jest.fn(async () => { throw new Error('database unavailable'); }),
    } as unknown as PrismaService);

    await expect(service.checkReadiness()).rejects.toThrow('database unavailable');
  });
});
