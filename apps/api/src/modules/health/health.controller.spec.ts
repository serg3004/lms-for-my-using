import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../database/prisma.service';
import { UploadService } from '../upload/upload.service';
import { HealthController } from './health.controller';
import { RedisHealthService } from './redis-health.service';

type Check = () => Promise<'ok' | 'disabled'>;

async function buildController({
  database = () => Promise.resolve([{ '?column?': 1 }]),
  redis = () => Promise.resolve('disabled' as const),
  storage = () => Promise.resolve('disabled' as const),
}: { database?: () => Promise<unknown>; redis?: Check; storage?: Check } = {}) {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: PrismaService, useValue: { $queryRaw: database } },
      { provide: RedisHealthService, useValue: { checkReadiness: redis } },
      { provide: UploadService, useValue: { checkReadiness: storage } },
    ],
  }).compile();

  return module.get(HealthController);
}

describe('HealthController', () => {
  it('keeps liveness independent from failed dependencies', async () => {
    const controller = await buildController({
      database: () => Promise.reject(new Error('db down')),
      redis: () => Promise.reject(new Error('redis down')),
      storage: () => Promise.reject(new Error('storage down')),
    });

    expect(controller.getLiveness()).toEqual({ status: 'ok' });
  });

  it('returns dependency status when the instance is ready', async () => {
    const controller = await buildController({
      redis: () => Promise.resolve('ok'),
      storage: () => Promise.resolve('ok'),
    });

    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ok', db: 'ok', redis: 'ok', storage: 'ok',
    });
    await expect(controller.getHealth()).resolves.toEqual({
      status: 'ok', db: 'ok', redis: 'ok', storage: 'ok',
    });
  });

  it.each([
    ['database', { database: () => Promise.reject(new Error('database secret')) }],
    ['redis', { redis: () => Promise.reject(new Error('redis secret')) }],
    ['storage', { storage: () => Promise.reject(new Error('storage secret')) }],
  ])('returns 503 without leaking %s errors', async (_name, dependencies) => {
    const controller = await buildController(dependencies);

    let thrown: unknown;
    try { await controller.getReadiness(); } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    const body = JSON.stringify((thrown as ServiceUnavailableException).getResponse());
    expect(body).toContain('unavailable');
    expect(body).not.toContain('secret');
  });
});
