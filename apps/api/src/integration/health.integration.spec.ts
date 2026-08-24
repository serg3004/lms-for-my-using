import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { get } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ApiExceptionFilter } from '../common/filters/api-exception.filter.js';
import { DatabaseHealthService } from '../modules/health/database-health.service.js';
import { HealthController } from '../modules/health/health.controller.js';
import { RedisHealthService } from '../modules/health/redis-health.service.js';
import { UploadService } from '../modules/upload/upload.service.js';
import { BACKGROUND_JOB_BACKEND } from '../modules/background-jobs/public.js';

type HttpTestResponse = {
  statusCode?: number;
  body: unknown;
};

function getAppUrl(app: INestApplication) {
  const address = app.getHttpServer().address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

function requestJson(url: string): Promise<HttpTestResponse> {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');

        resolve({
          statusCode: response.statusCode,
          body: rawBody ? JSON.parse(rawBody) : null,
        });
      });
    }).on('error', reject);
  });
}

describe('Health readiness HTTP contract', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleReference = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseHealthService,
          useValue: { checkReadiness: () => Promise.reject(new Error('database secret')) },
        },
        {
          provide: RedisHealthService,
          useValue: { checkReadiness: () => Promise.resolve('ok') },
        },
        {
          provide: UploadService,
          useValue: { checkReadiness: () => Promise.resolve('disabled') },
        },
        {
          provide: BACKGROUND_JOB_BACKEND,
          useValue: { getOperationalStatus: () => Promise.resolve({ status: 'disabled', waiting: 0, active: 0, delayed: 0, failed: 0, deadLetter: 0 }) },
        },
      ],
    }).compile();

    app = moduleReference.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await app.listen(0);
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['/api/v1/health/ready', '/api/v1/health'])(
    'preserves dependency statuses in the canonical 503 envelope for %s',
    async (path) => {
      const response = await requestJson(`${getAppUrl(app)}${path}`);

      expect(response.statusCode).toBe(503);
      expect(response.body).toMatchObject({
        statusCode: 503,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Readiness check failed',
          details: [
            { field: 'db', code: 'DEPENDENCY_STATUS', message: 'unavailable' },
            { field: 'redis', code: 'DEPENDENCY_STATUS', message: 'ok' },
            { field: 'storage', code: 'DEPENDENCY_STATUS', message: 'disabled' },
          ],
        },
        path,
      });
      expect(JSON.stringify(response.body)).not.toContain('database secret');
    },
  );

  it('keeps the liveness endpoint independent from readiness failures', async () => {
    const response = await requestJson(`${getAppUrl(app)}/api/v1/health/live`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
