import { Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createSensitiveRouteRateLimitMiddleware,
  type RateLimitStore,
} from '../common/middleware/api-hardening.js';
import type { TrustProxy } from '../config/env.js';

@Controller('auth')
class ClientIpTestController {
  @Post('login')
  login() {
    return { ok: true };
  }
}

type ExpressLikeServer = {
  set(setting: string, value: unknown): void;
};

async function startApp(trustProxy: TrustProxy, keys: string[]): Promise<INestApplication> {
  const moduleReference = await Test.createTestingModule({
    controllers: [ClientIpTestController],
  }).compile();
  const app = moduleReference.createNestApplication();
  const server = app.getHttpAdapter().getInstance() as ExpressLikeServer;
  const store: RateLimitStore = {
    async increment(key) {
      keys.push(key);
      return 1;
    },
  };

  server.set('trust proxy', trustProxy);
  app.use(createSensitiveRouteRateLimitMiddleware(store));
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');

  return app;
}

function postLogin(app: INestApplication, forwardedFor: string): Promise<void> {
  const address = app.getHttpServer().address() as AddressInfo;

  return new Promise((resolve, reject) => {
    const clientRequest = request(
      `http://127.0.0.1:${address.port}/api/v1/auth/login`,
      {
        method: 'POST',
        headers: { 'x-forwarded-for': forwardedFor },
      },
      (response) => {
        response.resume();
        response.on('end', resolve);
      },
    );

    clientRequest.on('error', reject);
    clientRequest.end();
  });
}

describe('trusted proxy client IP integration', () => {
  it('does not let an untrusted forwarded header change the rate-limit client key', async () => {
    const keys: string[] = [];
    const app = await startApp(false, keys);

    try {
      await postLogin(app, '198.51.100.10');
      await postLogin(app, '203.0.113.20');

      const ipKeys = keys.filter((key) => key.startsWith('ip:'));
      expect(ipKeys).toHaveLength(2);
      expect(ipKeys[0]).toBe(ipKeys[1]);
      expect(ipKeys[0]).not.toContain('198.51.100.10');
      expect(ipKeys[1]).not.toContain('203.0.113.20');
    } finally {
      await app.close();
    }
  });

  it('uses an IPv4 client supplied by one trusted proxy hop', async () => {
    const keys: string[] = [];
    const app = await startApp(1, keys);

    try {
      await postLogin(app, '198.51.100.10');

      expect(keys[0]).toContain('198.51.100.10');
    } finally {
      await app.close();
    }
  });

  it('walks a multi-hop chain across trusted IPv4 proxies to an IPv6 client', async () => {
    const keys: string[] = [];
    const app = await startApp(['loopback', 'uniquelocal'], keys);

    try {
      await postLogin(app, '2001:db8::1234, 10.0.0.7');

      expect(keys[0]).toContain('2001:db8::1234');
      expect(keys[0]).not.toContain('10.0.0.7');
    } finally {
      await app.close();
    }
  });
});
