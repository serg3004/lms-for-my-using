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

  it('documents current auth and organization controller paths', () => {
    const document = getOpenApiDocument();

    expect(document.paths['/auth/login']).toBeDefined();
    expect(document.paths['/auth/logout']).toBeDefined();
    expect(document.paths['/auth/password-reset/request']).toBeDefined();
    expect(document.paths['/auth/password-reset/confirm']).toBeDefined();
    expect(document.paths['/auth/me']).toBeDefined();
    expect(document.paths['/organizations']).toBeDefined();
    expect(document.paths['/organizations/{id}']).toBeDefined();
    expect(document.paths['/organizations/register']).toBeDefined();
  });

  it('documents current learning content controller paths', () => {
    const document = getOpenApiDocument();

    expect(document.paths['/courses']).toBeDefined();
    expect(document.paths['/courses/{id}']).toBeDefined();
    expect(document.paths['/courses/{id}/completion']).toBeDefined();
    expect(document.paths['/courses/{courseId}/lessons']).toBeDefined();
    expect(document.paths['/lessons/{id}']).toBeDefined();
    expect(document.paths['/courses/{courseId}/materials']).toBeDefined();
    expect(document.paths['/materials/{id}']).toBeDefined();
    expect(document.paths['/progress']).toBeDefined();
    expect(document.paths['/progress/{id}']).toBeDefined();
  });

  it('documents current admin and assessment controller paths', () => {
    const document = getOpenApiDocument();

    expect(document.paths['/users']).toBeDefined();
    expect(document.paths['/users/{id}']).toBeDefined();
    expect(document.paths['/users/bulk']).toBeDefined();
    expect(document.paths['/users/import']).toBeDefined();
    expect(document.paths['/groups']).toBeDefined();
    expect(document.paths['/groups/{id}']).toBeDefined();
    expect(document.paths['/memberships']).toBeDefined();
    expect(document.paths['/memberships/{id}']).toBeDefined();
    expect(document.paths['/assignments']).toBeDefined();
    expect(document.paths['/assignments/{id}']).toBeDefined();
    expect(document.paths['/assessments']).toBeDefined();
    expect(document.paths['/assessments/{id}']).toBeDefined();
  });

  it('documents current assessment attempt and certificate controller paths', () => {
    const document = getOpenApiDocument();

    expect(document.paths['/assessments/{assessmentId}/questions']).toBeDefined();
    expect(document.paths['/questions/{id}']).toBeDefined();
    expect(document.paths['/questions/{questionId}/options']).toBeDefined();
    expect(document.paths['/assessments/{assessmentId}/attempts']).toBeDefined();
    expect(document.paths['/assessments/{assessmentId}/results']).toBeDefined();
    expect(document.paths['/assessments/{assessmentId}/report']).toBeDefined();
    expect(document.paths['/attempts/{id}']).toBeDefined();
    expect(document.paths['/attempts/{id}/result']).toBeDefined();
    expect(document.paths['/certificates']).toBeDefined();
    expect(document.paths['/certificates/{id}']).toBeDefined();
  });
});
