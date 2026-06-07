import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

import { ApiExceptionFilter } from '../common/filters/api-exception.filter.js';
import { createSecurityHeadersMiddleware } from '../common/middleware/api-hardening.js';
import { PrismaService } from '../database/prisma.service.js';
import { HealthController } from '../modules/health/health.controller.js';

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

function makeRequest(url: string, headers: Record<string, string> = {}): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const clientRequest = httpRequest(url, { headers }, (response) => {
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
    });
    clientRequest.on('error', reject);
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

type ExpressLikeServer = {
  disable?: (setting: string) => void;
};

describe('Security audit', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleReference = await Test.createTestingModule({
      controllers: [HealthController, ProtectedAuditController],
      providers: [
        AuditAuthGuard,
        { provide: PrismaService, useValue: { $queryRaw: () => Promise.resolve([{ '?column?': 1 }]) } },
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
});
