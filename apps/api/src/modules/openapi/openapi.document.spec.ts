import { getOpenApiDocument } from './openapi.document.js';

describe('getOpenApiDocument', () => {
  it('returns a valid OpenAPI skeleton', () => {
    const document = getOpenApiDocument();

    expect(document.openapi).toBe('3.0.3');
    expect(document.info.title).toBe('LMS API');
    expect(document.servers).toEqual([{ url: '/api/v1' }]);
    expect(document.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('documents the centralized API error response shape', () => {
    const document = getOpenApiDocument();
    const apiErrorResponse = document.components.schemas.ApiErrorResponse;

    expect(apiErrorResponse).toMatchObject({
      type: 'object',
      required: ['statusCode', 'error', 'path', 'timestamp'],
    });
  });

  it('documents key API paths', () => {
    const document = getOpenApiDocument();

    expect(document.paths['/health']).toBeDefined();
    expect(document.paths['/auth/login']).toBeDefined();
    expect(document.paths['/organizations/register']).toBeDefined();
    expect(document.paths['/certificates']).toBeDefined();
  });
});
