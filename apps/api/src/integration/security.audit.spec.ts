import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
  Body,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

import { ApiExceptionFilter } from '../common/filters/api-exception.filter.js';
import { createSecurityHeadersMiddleware } from '../common/middleware/api-hardening.js';
import { DatabaseHealthService } from '../modules/health/database-health.service.js';
import { HealthController } from '../modules/health/health.controller.js';
import { RedisHealthService } from '../modules/health/redis-health.service.js';
import { UploadService } from '../modules/upload/upload.service.js';
import { AuthController } from '../modules/auth/auth.controller.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { MaterialMalwareScanController } from '../modules/course-materials/material-malware-scan.controller.js';
import { MaterialMalwareScanService } from '../modules/course-materials/material-malware-scan.service.js';
import { registerOrganizationSchema } from '../modules/organizations/organizations.schemas.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const BLOCKED_ORIGIN = 'http://evil.example.com';

type TestResponse = {
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  body: unknown;
};

function getAppUrl(app: INestApplication) {
  const address = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function makeRequest(
  url: string,
  headers: Record<string, string> = {},
  method = 'GET',
  body?: unknown,
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const clientRequest = httpRequest(
      url,
      {
        method,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload).toString(), ...headers }
          : headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: rawBody ? JSON.parse(rawBody) : null,
          });
        });
      },
    );
    clientRequest.on('error', reject);
    if (payload) clientRequest.write(payload);
    clientRequest.end();
  });
}

@Injectable()
class AuditAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const authorization = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>()
      .headers.authorization;

    if (!authorization?.startsWith('Bearer ') || authorization.slice('Bearer '.length).trim() === '') {
      throw new UnauthorizedException('Missing bearer token');
    }

    return true;
  }
}

@Controller('audit')
class ProtectedAuditController {
  @Get('private')
  @UseGuards(AuditAuthGuard)
  getPrivate() {
    return { status: 'ok' };
  }
}

@Controller('organizations')
class PublicOrganizationAuditController {
  @Post('register')
  register(@Body() body: unknown) {
    registerOrganizationSchema.parse(body);
    throw new Error('SELECT password FROM users at /srv/apps/api/src/private.ts');
  }
}

type ExpressLikeServer = {
  disable?: (setting: string) => void;
};

describe('Security audit', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleReference = await Test.createTestingModule({
      controllers: [
        HealthController,
        ProtectedAuditController,
        AuthController,
        PublicOrganizationAuditController,
        MaterialMalwareScanController,
      ],
      providers: [
        AuditAuthGuard,
        { provide: AuthService, useValue: {} },
        {
          provide: MaterialMalwareScanService,
          useValue: { verifyCallbackSecret: () => undefined, applyVerdict: () => Promise.resolve({}) },
        },
        { provide: DatabaseHealthService, useValue: { checkReadiness: () => Promise.resolve('ok') } },
        { provide: RedisHealthService, useValue: { checkReadiness: () => Promise.resolve('disabled') } },
        { provide: UploadService, useValue: { checkReadiness: () => Promise.resolve('disabled') } },
      ],
    }).compile();

    app = moduleReference.createNestApplication();

    const server = app.getHttpAdapter().getInstance() as ExpressLikeServer;
    if (server.disable) {
      server.disable('x-powered-by');
    }

    app.enableCors({ origin: ALLOWED_ORIGIN, credentials: true });
    app.use(createSecurityHeadersMiddleware());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await app.listen(0);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('CORS', () => {
    it('sends Access-Control-Allow-Origin for the configured allowed origin', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`, { Origin: ALLOWED_ORIGIN });

      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('sends Access-Control-Allow-Credentials for the configured allowed origin', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`, { Origin: ALLOWED_ORIGIN });

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not reflect a blocked origin in Access-Control-Allow-Origin', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`, { Origin: BLOCKED_ORIGIN });

      // Server must never echo back the attacker's origin nor use wildcard.
      // The browser enforces the mismatch and blocks the response.
      expect(response.headers['access-control-allow-origin']).not.toBe(BLOCKED_ORIGIN);
      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });
  });

  describe('Security headers', () => {
    it('sets X-Content-Type-Options: nosniff', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options: DENY', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`);

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('sets Referrer-Policy: no-referrer', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`);

      expect(response.headers['referrer-policy']).toBe('no-referrer');
    });

    it('sets Permissions-Policy restricting camera, microphone and geolocation', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`);

      expect(response.headers['permissions-policy']).toContain('camera=()');
      expect(response.headers['permissions-policy']).toContain('microphone=()');
      expect(response.headers['permissions-policy']).toContain('geolocation=()');
    });

    it('does not expose x-powered-by', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Public endpoint inventory', () => {
    it('GET /api/v1/health is accessible without authentication (200)', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/health`);

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({ status: 'ok' });
    });

    it('protected endpoints return 401 without a bearer token', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/audit/private`);

      expect(response.statusCode).toBe(401);
      expect(response.body).toMatchObject({
        statusCode: 401,
        error: { code: 'UNAUTHORIZED' },
      });
    });

    it('protected endpoints return 401 with a malformed bearer token', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/audit/private`, {
        Authorization: 'Bearer ',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Public endpoint input validation and error disclosure', () => {
    it.each([
      '/api/v1/auth/login',
      '/api/v1/auth/password-reset/request',
      '/api/v1/auth/password-reset/confirm',
      '/api/v1/organizations/register',
      '/api/v1/internal/material-scans/not-a-uuid/result',
    ])('POST %s rejects an invalid body with a sanitized 400 response', async (path) => {
      const response = await makeRequest(`${getAppUrl(app)}${path}`, {}, 'POST', {});
      const serializedBody = JSON.stringify(response.body);

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
      });
      expect(serializedBody).not.toMatch(/stack|SELECT|INSERT|UPDATE|DELETE FROM|node_modules|apps\/api\/src/i);
    });

    it('sanitizes unexpected errors instead of exposing internals', async () => {
      const response = await makeRequest(`${getAppUrl(app)}/api/v1/organizations/register`, {}, 'POST', {
        organization: { name: 'Audit', slug: 'audit-org' },
        admin: { email: 'admin@example.com', password: 'valid-password', firstName: 'A', lastName: 'User' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.body).toMatchObject({
        statusCode: 500,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
      });
      expect(JSON.stringify(response.body)).not.toMatch(/SELECT|password|private\.ts|stack/i);
    });
  });
});
