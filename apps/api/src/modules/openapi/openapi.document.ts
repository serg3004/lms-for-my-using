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
      description: 'Early MVP API documentation skeleton for the LMS project.',
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
      { name: 'Certificates', description: 'Certificate endpoints' },
    ],
    paths: {
      '/health': {
        get: operation('Health check', ['Health']),
      },
      '/auth/login': {
        post: operation('Login', ['Auth']),
      },
      '/auth/me': {
        get: operation('Get current user', ['Auth'], true),
      },
      '/organizations/register': {
        post: operation('Register organization with first admin', ['Organizations']),
      },
      '/users': {
        get: operation('List users', ['Users'], true),
        post: operation('Create user', ['Users'], true),
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
