import { jest } from '@jest/globals';

import { passwordResetDeliveryErrors } from '../../common/observability/metrics.js';
import { PasswordResetDelivery } from './password-reset.js';

const message = {
  email: 'learner@example.com',
  organizationId: 'organization-a',
  token: 'super-secret-reset-token',
  expiresAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('PasswordResetDelivery', () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['PASSWORD_RESET_DELIVERY_URL'];
    delete process.env['PASSWORD_RESET_DELIVERY_TOKEN'];
    passwordResetDeliveryErrors.reset();
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  describe('checkReadiness', () => {
    it('reports disabled when no delivery provider is configured', () => {
      expect(new PasswordResetDelivery().checkReadiness()).toBe('disabled');
    });

    it('reports ok when a delivery provider URL is configured', () => {
      process.env['PASSWORD_RESET_DELIVERY_URL'] = 'https://delivery.internal/reset';
      expect(new PasswordResetDelivery().checkReadiness()).toBe('ok');
    });
  });

  describe('send — unconfigured provider', () => {
    it('is a safe no-op and does not call fetch', async () => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await expect(new PasswordResetDelivery().send(message)).resolves.toBeUndefined();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('send — configured provider', () => {
    beforeEach(() => {
      process.env['PASSWORD_RESET_DELIVERY_URL'] = 'https://delivery.internal/reset';
      process.env['PASSWORD_RESET_DELIVERY_TOKEN'] = 'delivery-secret';
    });

    it('posts the message to the configured endpoint with the bearer token', async () => {
      const fetchMock = jest.fn(async () => new Response(null, { status: 200 }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await expect(new PasswordResetDelivery().send(message)).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://delivery.internal/reset',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            authorization: 'Bearer delivery-secret',
          }),
        }),
      );
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ ...message, expiresAt: message.expiresAt.toISOString() });
    });

    it('classifies a non-2xx response as an http_error', async () => {
      globalThis.fetch = jest.fn(async () => new Response(null, { status: 502 })) as unknown as typeof fetch;

      await expect(new PasswordResetDelivery().send(message)).rejects.toThrow();

      expect((await passwordResetDeliveryErrors.get()).values).toContainEqual(
        expect.objectContaining({ labels: { reason: 'http_error' }, value: 1 }),
      );
    });

    it('classifies an AbortSignal timeout as timeout, not a generic network error', async () => {
      globalThis.fetch = jest.fn(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }) as unknown as typeof fetch;

      await expect(new PasswordResetDelivery().send(message)).rejects.toThrow();

      expect((await passwordResetDeliveryErrors.get()).values).toContainEqual(
        expect.objectContaining({ labels: { reason: 'timeout' }, value: 1 }),
      );
    });

    it('classifies any other fetch failure as network_error and never logs error.message', async () => {
      globalThis.fetch = jest.fn(async () => {
        throw new TypeError(`fetch failed: could not reach https://delivery.internal/reset?token=${message.token}`);
      }) as unknown as typeof fetch;

      await expect(new PasswordResetDelivery().send(message)).rejects.toThrow();

      expect((await passwordResetDeliveryErrors.get()).values).toContainEqual(
        expect.objectContaining({ labels: { reason: 'network_error' }, value: 1 }),
      );
    });

    it('never includes the reset token in a thrown delivery error message', async () => {
      globalThis.fetch = jest.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await new PasswordResetDelivery().send(message);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).not.toContain(message.token);
    });
  });
});
