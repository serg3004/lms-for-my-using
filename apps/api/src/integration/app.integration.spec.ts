import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { get, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';

import { ApiExceptionFilter } from '../common/filters/api-exception.filter.js';
import { loginSchema } from '../modules/auth/auth.schemas.js';
import { HealthController } from '../modules/health/health.controller.js';
import { OpenApiController } from '../modules/openapi/openapi.controller.js';

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

function postJson(url: string, body: unknown): Promise<HttpTestResponse> {
  return new Promise((resolve, reject) => {
    const rawBody = JSON.stringify(body);
    const requestUrl = new URL(url);

    const clientRequest = request(
      {
        hostname: requestUrl.hostname,
        port: requestUrl.port,
        path: requestUrl.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(rawBody),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const rawResponseBody = Buffer.concat(chunks).toString('utf8');

          resolve({
            statusCode: response.statusCode,
            body: rawResponseBody ? JSON.parse(rawResponseBody) : null,
          });
        });
      },
    );

    clientRequest.on('error', reject);
    clientRequest.write(rawBody);
    clientRequest.end();
  });
}

@Controller('integration-test')
class IntegrationTestController {
  @Get('validation-error')
  getValidationError() {
    z.object({
      email: z.string().email(),
    }).parse({
      email: 'not-email',
    });
  }

  @Post('login-validation-error')
  postLoginValidationError(@Body() body: unknown) {
    loginSchema.parse(body);

    return { accepted: true };
  }
}

describe('API integration scaffold', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleReference = await Test.createTestingModule({
      controllers: [HealthController, OpenApiController, IntegrationTestController],
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

  it('GET /api/v1/health returns smoke status', async () => {
    const response = await requestJson(`${getAppUrl(app)}/api/v1/health`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
    });
  });

  it('GET /api/v1/openapi returns the OpenAPI skeleton', async () => {
    const response = await requestJson(`${getAppUrl(app)}/api/v1/openapi`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      openapi: '3.0.3',
      info: {
        title: 'LMS API',
      },
    });
  });

  it('normalizes validation errors through the global filter', async () => {
    const response = await requestJson(`${getAppUrl(app)}/api/v1/integration-test/validation-error`);

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
      },
      path: '/api/v1/integration-test/validation-error',
    });
  });

  it('returns 400 for schema.parse(body) validation errors', async () => {
    const response = await postJson(`${getAppUrl(app)}/api/v1/integration-test/login-validation-error`, {
      email: 'not-email',
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
      },
      path: '/api/v1/integration-test/login-validation-error',
    });
  });
});
