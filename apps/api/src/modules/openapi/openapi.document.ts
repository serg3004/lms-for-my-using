type OpenApiDocument = {
  openapi: '3.0.3';
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: Array<{ url: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, unknown>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
};

const apiErrorDetailSchema = {
  type: 'object',
  properties: {
    field: { type: 'string' },
    message: { type: 'string' },
    code: { type: 'string' },
  },
  required: ['message'],
} as const;

const apiErrorResponseSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer', example: 400 },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string', example: 'Validation failed' },
        details: {
          type: 'array',
          items: { $ref: '#/components/schemas/ApiErrorDetail' },
        },
      },
      required: ['code', 'message'],
    },
    path: { type: 'string', example: '/api/v1/example' },
    timestamp: { type: 'string', example: '2026-05-27T00:00:00.000Z' },
  },
  required: ['statusCode', 'error', 'path', 'timestamp'],
} as const;

const defaultErrorResponses = {
  '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
  '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
  '403': { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
  '500': { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
} as const;

function operation(summary: string, tags: string[], secured = false) {
  return {
    summary,
    tags,
    ...(secured ? { security: [{ bearerAuth: [] }] } : {}),
    responses: {
      '200': { description: 'Successful response' },
      ...defaultErrorResponses,
    },
  };
}

export function getOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.0.3',
    info: {
      title: 'LMS API',
      description: 'Manual MVP API documentation skeleton for the LMS project.',
      version: '0.0.0',
    },
    servers: [{
      url: '/api/v1',
    }],
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Organizations', description: 'Organization and tenant bootstrap endpoints' },
      { name: 'Users', description: 'User management endpoints' },
      { name: 'Groups', description: 'Group management endpoints' },
      { name: 'Memberships', description: 'User membership endpoints' },
      { name: 'Courses', description: 'Course endpoints' },
      { name: 'Lessons', description: 'Lesson endpoints' },
      { name: 'Materials', description: 'Course material endpoints' },
      { name: 'Progress', description: 'Learning progress endpoints' },
      { name: 'Assignments', description: 'Assignment endpoints' },
      { name: 'Assessments', description: 'Assessment endpoints' },
      { name: 'AssessmentQuestions', description: 'Assessment question and answer option endpoints' },
      { name: 'AssessmentAttempts', description: 'Assessment attempt, result, and report endpoints' },
      { name: 'Certificates', description: 'Certificate endpoints' },
      { name: 'OpenAPI', description: 'Manual OpenAPI document endpoint' },
    ],
    paths: {
      '/health': {
        get: operation('Health check', ['Health']),
      },
      '/openapi.json': {
        get: operation('Get manual OpenAPI document', ['OpenAPI']),
      },
      '/auth/login': {
        post: operation('Login', ['Auth']),
      },
      '/auth/logout': {
        post: operation('Logout and clear auth cookies', ['Auth'], true),
      },
      '/auth/password-reset/request': {
        post: operation('Request password reset', ['Auth']),
      },
      '/auth/password-reset/confirm': {
        post: operation('Confirm password reset', ['Auth']),
      },
      '/auth/me': {
        get: operation('Get current user', ['Auth'], true),
      },
      '/organizations': {
        get: operation('List organizations', ['Organizations'], true),
        post: operation('Create organization', ['Organizations'], true),
      },
      '/organizations/register': {
        post: operation('Register organization with first admin', ['Organizations']),
      },
      '/organizations/{id}': {
        get: operation('Get organization', ['Organizations'], true),
      },
      '/users': {
        get: operation('List users', ['Users'], true),
        post: operation('Create user', ['Users'], true),
      },
      '/users/{id}': {
        get: operation('Get user', ['Users'], true),
      },
      '/users/bulk': {
        post: operation('Create users in bulk', ['Users'], true),
      },
      '/users/import': {
        post: operation('Import users', ['Users'], true),
      },
      '/groups': {
        get: operation('List groups', ['Groups'], true),
        post: operation('Create group', ['Groups'], true),
      },
      '/groups/{id}': {
        get: operation('Get group', ['Groups'], true),
      },
      '/memberships': {
        get: operation('List memberships', ['Memberships'], true),
        post: operation('Create membership', ['Memberships'], true),
      },
      '/memberships/{id}': {
        get: operation('Get membership', ['Memberships'], true),
      },
      '/courses': {
        get: operation('List courses', ['Courses'], true),
        post: operation('Create course', ['Courses'], true),
      },
      '/courses/{id}': {
        get: operation('Get course', ['Courses'], true),
      },
      '/courses/{id}/completion': {
        get: operation('Get course completion', ['Courses'], true),
      },
      '/courses/{courseId}/lessons': {
        get: operation('List lessons for course', ['Lessons'], true),
        post: operation('Create lesson for course', ['Lessons'], true),
      },
      '/lessons/{id}': {
        get: operation('Get lesson', ['Lessons'], true),
      },
      '/courses/{courseId}/materials': {
        get: operation('List course materials', ['Materials'], true),
        post: operation('Create course material', ['Materials'], true),
      },
      '/materials/{id}': {
        get: operation('Get course material', ['Materials'], true),
      },
      '/progress': {
        get: operation('List progress records', ['Progress'], true),
        post: operation('Create progress record', ['Progress'], true),
      },
      '/progress/{id}': {
        get: operation('Get progress record', ['Progress'], true),
      },
      '/assignments': {
        get: operation('List assignments', ['Assignments'], true),
        post: operation('Create assignment', ['Assignments'], true),
      },
      '/assignments/{id}': {
        get: operation('Get assignment', ['Assignments'], true),
      },
      '/assessments': {
        get: operation('List assessments', ['Assessments'], true),
        post: operation('Create assessment', ['Assessments'], true),
      },
      '/assessments/{id}': {
        get: operation('Get assessment', ['Assessments'], true),
      },
      '/assessments/{assessmentId}/questions': {
        get: operation('List assessment questions', ['AssessmentQuestions'], true),
        post: operation('Create assessment question', ['AssessmentQuestions'], true),
      },
      '/questions/{id}': {
        get: operation('Get assessment question', ['AssessmentQuestions'], true),
      },
      '/questions/{questionId}/options': {
        get: operation('List answer options', ['AssessmentQuestions'], true),
        post: operation('Create answer option', ['AssessmentQuestions'], true),
      },
      '/assessments/{assessmentId}/attempts': {
        get: operation('List assessment attempts', ['AssessmentAttempts'], true),
        post: operation('Create assessment attempt', ['AssessmentAttempts'], true),
      },
      '/assessments/{assessmentId}/results': {
        get: operation('List assessment results', ['AssessmentAttempts'], true),
      },
      '/assessments/{assessmentId}/report': {
        get: operation('Get assessment report', ['AssessmentAttempts'], true),
      },
      '/attempts/{id}': {
        get: operation('Get assessment attempt', ['AssessmentAttempts'], true),
      },
      '/attempts/{id}/result': {
        get: operation('Get assessment attempt result', ['AssessmentAttempts'], true),
      },
      '/certificates': {
        get: operation('List certificates', ['Certificates'], true),
        post: operation('Issue certificate', ['Certificates'], true),
      },
      '/certificates/{id}': {
        get: operation('Get certificate', ['Certificates'], true),
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ApiErrorDetail: apiErrorDetailSchema,
        ApiErrorResponse: apiErrorResponseSchema,
      },
    },
  };
}
