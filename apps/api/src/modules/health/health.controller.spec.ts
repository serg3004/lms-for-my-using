import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma.service';
import { HealthController } from './health.controller';

async function buildController(queryRawImpl: () => Promise<unknown>) {
  const prismaStub = { $queryRaw: queryRawImpl };

  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: prismaStub }],
  }).compile();

  return module.get(HealthController);
}

describe('HealthController', () => {
  it('returns status ok and db ok when database is reachable', async () => {
    const controller = await buildController(() => Promise.resolve([{ '?column?': 1 }]));

    const result = await controller.getHealth();

    expect(result).toEqual({ status: 'ok', db: 'ok' });
  });

  it('throws ServiceUnavailableException when database is unreachable', async () => {
    const controller = await buildController(() =>
      Promise.reject(new Error('Connection refused')),
    );

    await expect(controller.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not expose database error details in the 503 response', async () => {
    const controller = await buildController(() =>
      Promise.reject(new Error('password authentication failed for user "postgres"')),
    );

    let thrownError: unknown;
    try {
      await controller.getHealth();
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError).toBeInstanceOf(ServiceUnavailableException);
    const response = (thrownError as ServiceUnavailableException).getResponse();
    const body = JSON.stringify(response);
    expect(body).not.toContain('password');
    expect(body).not.toContain('postgres');
    expect(body).toContain('unavailable');
  });
});
