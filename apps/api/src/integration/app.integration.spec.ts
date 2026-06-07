import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  INestApplication,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { get, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';

import { ApiExceptionFilter } from '../common/filters/api-exception.filter.js';
import { PrismaService } from '../database/prisma.service.js';
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

function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<HttpTestResponse> {
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const clientRequest = request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload).toString(),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');

          resolve({
            statusCode: response.statusCode,
            body: rawBody ? JSON.parse(rawBody) : null,
          });
        });
      },
    );

    clientRequest.on('error', reject);
    clientRequest.write(payload);
    clientRequest.end();
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

@Injectable()
class IntegrationAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const authorizationHeader = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()
      .headers.authorization;

    if (!authorizationHeader?.startsWith('Bearer ') || authorizationHeader.slice('Bearer '.length).trim() === '') {
      throw new UnauthorizedException('Missing bearer token');
    }

    return true;
  }
}

@Injectable()
class IntegrationOrganizationScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ body?: Record<string, unknown>; headers: Record<string, string | undefined> }>();
    const scopedOrganizationId = typeof request.body?.organizationId === 'string' ? request.body.organizationId : undefined;
    const currentOrganizationId = request.headers['x-current-organization-id'];

    if (!currentOrganizationId || !scopedOrganizationId || currentOrganizationId !== scopedOrganizationId) {
      throw new ForbiddenException('Organization scope mismatch');
    }

    return true;
  }
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
}

@Controller('auth')
class IntegrationAuthTestController {
  @Post('login')
  login(@Body() body: unknown) {
    loginSchema.parse(body);

    return {
      accessToken: 'smoke-token',
      tokenType: 'Bearer',
      user: {
        email: (body as { email: string }).email,
      },
    };
  }
}

@Controller('smoke')
class SmokeTestController {
  @Get('protected')
  @UseGuards(IntegrationAuthGuard)
  getProtected() {
    return {
      status: 'ok',
    };
  }

  @Post('tenant-scope')
  @UseGuards(IntegrationOrganizationScopeGuard)
  checkTenantScope() {
    return {
      status: 'ok',
    };
  }
}

describe('API integration scaffold', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleReference = await Test.createTestingModule({
      controllers: [
        HealthController,
        OpenApiController,
        IntegrationTestController,
        IntegrationAuthTestController,
        SmokeTestController,
      ],
      providers: [
        IntegrationAuthGuard,
        IntegrationOrganizationScopeGuard,
        { provide: PrismaService, useValue: { $queryRaw: () => Promise.resolve([{ '?column?': 1 }]) } },
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

  it('returns auth login smoke response for a valid body', async () => {
    const response = await postJson(`${getAppUrl(app)}/api/v1/auth/login`, {
      email: 'user@example.com',
      password: 'password123',
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({
      accessToken: 'smoke-token',
      tokenType: 'Bearer',
      user: {
        email: 'user@example.com',
      },
    });
  });

  it('returns 400 Bad Request for invalid auth login body', async () => {
    const response = await postJson(`${getAppUrl(app)}/api/v1/auth/login`, {
      email: 'not-email',
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
      },
      path: '/api/v1/auth/login',
    });
  });

  it('returns 401 for a protected endpoint without a bearer token', async () => {
    const response = await requestJson(`${getAppUrl(app)}/api/v1/smoke/protected`);

    expect(response.statusCode).toBe(401);
    expect(response.body).toMatchObject({
      statusCode: 401,
      error: {
        code: 'UNAUTHORIZED',
      },
      path: '/api/v1/smoke/protected',
    });
  });

  it('returns 403 for tenant scope mismatch', async () => {
    const response = await postJson(
      `${getAppUrl(app)}/api/v1/smoke/tenant-scope`,
      {
        organizationId: 'org-b',
      },
      {
        'x-current-organization-id': 'org-a',
      },
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toMatchObject({
      statusCode: 403,
      error: {
        code: 'FORBIDDEN',
      },
      path: '/api/v1/smoke/tenant-scope',
    });
  });
});
