import type { INestApplication } from '@nestjs/common';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject, OperationObject, PathItemObject } from '@nestjs/swagger';

class ApiErrorDetailDto {
  @ApiProperty({ required: false, example: 'email' })
  field?: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiProperty({ required: false, example: 'invalid_type' })
  code?: string;
}

class ApiErrorDto {
  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiProperty({ type: () => [ApiErrorDetailDto], required: false })
  details?: ApiErrorDetailDto[];
}

class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ type: () => ApiErrorDto })
  error!: ApiErrorDto;

  @ApiProperty({ example: '/api/v1/auth/login' })
  path!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-22T00:00:00.000Z' })
  timestamp!: string;
}

const publicOperations = new Set([
  'GET /api/v1/health',
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/password-reset/request',
  'POST /api/v1/auth/reset-password-request',
  'POST /api/v1/auth/password-reset/confirm',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/organizations/register',
  'GET /api/v1/openapi',
  'POST /api/v1/internal/material-scans',
]);

const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

function operations(pathItem: PathItemObject): Array<[string, OperationObject]> {
  return httpMethods.flatMap((method) => {
    const operation = pathItem[method];
    return operation ? [[method, operation] as [string, OperationObject]] : [];
  });
}

/** Adds the security and shared error contract that cannot be inferred from zod-backed DTOs. */
export function finalizeOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!pathItem) continue;
    for (const [method, operation] of operations(pathItem)) {
      operation.security = publicOperations.has(`${method.toUpperCase()} ${path}`) ? [] : [{ bearerAuth: [] }];
      for (const status of ['400', '401', '403', '500']) {
        operation.responses[status] ??= {
          description: status === '400' ? 'Bad request' : status === '401' ? 'Unauthorized' : status === '403' ? 'Forbidden' : 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } },
        };
      }
    }
  }
  return document;
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('LMS API')
    .setDescription('Runtime-generated contract for the LMS backend.')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
    .build();

  return finalizeOpenApiDocument(
    SwaggerModule.createDocument(app, config, {
      extraModels: [ApiErrorDetailDto, ApiErrorDto, ApiErrorResponseDto],
    }),
  );
}

export function setupOpenApi(app: INestApplication): OpenAPIObject {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'api-json',
    swaggerOptions: { persistAuthorization: true },
  });
  return document;
}
