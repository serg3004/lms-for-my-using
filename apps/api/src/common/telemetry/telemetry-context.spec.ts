import { jest } from '@jest/globals';

import { createTelemetryContextMiddleware, getTelemetryContext, resolveRequestId } from './telemetry-context';

describe('telemetry context', () => {
  it('accepts a valid request ID and rejects malformed or ambiguous values', () => {
    expect(resolveRequestId('A8098C1A-F86E-11DA-BD1A-00112444BE1E')).toBe('a8098c1a-f86e-11da-bd1a-00112444be1e');
    expect(resolveRequestId('not-safe\nvalue')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(['a8098c1a-f86e-11da-bd1a-00112444be1e'])).not.toBe('a8098c1a-f86e-11da-bd1a-00112444be1e');
  });

  it('sets the response header and exposes the ID for the complete async request chain', async () => {
    const setHeader = jest.fn();
    let observed: string | undefined;
    await new Promise<void>((resolve) => {
      createTelemetryContextMiddleware()(
        { headers: { 'x-request-id': 'a8098c1a-f86e-11da-bd1a-00112444be1e' } } as never,
        { setHeader } as never,
        () => void Promise.resolve().then(() => {
          observed = getTelemetryContext()?.requestId;
          resolve();
        }),
      );
    });
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'a8098c1a-f86e-11da-bd1a-00112444be1e');
    expect(observed).toBe('a8098c1a-f86e-11da-bd1a-00112444be1e');
  });
});
