import { createHttpMetricsMiddleware, httpRequests, normalizeHttpRoute } from './metrics.js';

describe('observability metrics', () => {
  it('removes query strings and high-cardinality identifiers from route labels', () => {
    expect(normalizeHttpRoute('/api/v1/courses/550e8400-e29b-41d4-a716-446655440000/lessons/42?token=secret'))
      .toBe('/api/v1/courses/:id/lessons/:id');
  });

  it('records completed requests without request identifiers', async () => {
    const listeners = new Map<string, () => void>();
    const response = {
      statusCode: 503,
      once: (event: string, listener: () => void) => listeners.set(event, listener),
    };
    const before = (await httpRequests.get()).values.find((value) => value.labels.status_code === '503')?.value ?? 0;
    let called = 0;
    const next = () => { called += 1; };

    createHttpMetricsMiddleware()(
      { method: 'GET', url: '/api/v1/users/123?email=private@example.com' } as never,
      response as never,
      next,
    );
    listeners.get('finish')?.();

    expect(called).toBe(1);
    const value = (await httpRequests.get()).values.find((sample) =>
      sample.labels.status_code === '503' && sample.labels.route === '/api/v1/users/:id');
    expect(value?.value).toBe(before + 1);
    expect(value?.labels).not.toHaveProperty('requestId');
  });
});
