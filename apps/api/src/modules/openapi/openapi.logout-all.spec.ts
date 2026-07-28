import { getOpenApiDocument } from './openapi.document.js';

describe('OpenAPI logout-all route', () => {
  it('documents the authenticated logout-all endpoint', () => {
    const document = getOpenApiDocument();
    const route = document.paths['/auth/logout-all'] as {
      post?: {
        security?: Array<{ bearerAuth: unknown[] }>;
      };
    };

    expect(route.post).toBeDefined();
    expect(route.post?.security).toEqual([{ bearerAuth: [] }]);
  });
});
