import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { UploadService } from '../upload/public';
import { DatabaseHealthService } from './database-health.service';
import { HealthController } from './health.controller';
import { RedisHealthService } from './redis-health.service';
import { BACKGROUND_JOB_BACKEND } from '../background-jobs/public';

type Check = () => Promise<'ok' | 'disabled'>;

async function buildController({
  database = () => Promise.resolve([{ '?column?': 1 }]),
  redis = () => Promise.resolve('disabled' as const),
  storage = () => Promise.resolve('disabled' as const),
  queues = () => Promise.resolve({ status: 'disabled' as const, waiting: 0, active: 0, delayed: 0, failed: 0, deadLetter: 0 }),
}: { database?: () => Promise<unknown>; redis?: Check; storage?: Check; queues?: () => Promise<unknown> } = {}) {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: DatabaseHealthService, useValue: { checkReadiness: database } },
      { provide: RedisHealthService, useValue: { checkReadiness: redis } },
      { provide: UploadService, useValue: { checkReadiness: storage } },
      { provide: BACKGROUND_JOB_BACKEND, useValue: { getOperationalStatus: queues } },
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
      queues: () => Promise.reject(new Error('queue down')),
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
      queues: { status: 'disabled', waiting: 0, active: 0, delayed: 0, failed: 0, deadLetter: 0 },
    });
    await expect(controller.getHealth()).resolves.toEqual({
      status: 'ok', db: 'ok', redis: 'ok', storage: 'ok',
      queues: { status: 'disabled', waiting: 0, active: 0, delayed: 0, failed: 0, deadLetter: 0 },
    });
  });

  it.each([
    ['database', { database: () => Promise.reject(new Error('database secret')) }],
    ['redis', { redis: () => Promise.reject(new Error('redis secret')) }],
    ['storage', { storage: () => Promise.reject(new Error('storage secret')) }],
    ['queues', { queues: () => Promise.reject(new Error('queue secret')) }],
  ])('returns canonical 503 payload without leaking %s errors', async (_name, dependencies) => {
    const controller = await buildController(dependencies);

    let thrown: unknown;
    try { await controller.getReadiness(); } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect((thrown as ServiceUnavailableException).getResponse()).toMatchObject({
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Readiness check failed',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'db', code: 'DEPENDENCY_STATUS' }),
          expect.objectContaining({ field: 'redis', code: 'DEPENDENCY_STATUS' }),
          expect.objectContaining({ field: 'storage', code: 'DEPENDENCY_STATUS' }),
        ]),
      },
    });
    expect(JSON.stringify((thrown as ServiceUnavailableException).getResponse())).not.toContain('secret');
  });
});
