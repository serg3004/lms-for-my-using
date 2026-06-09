import { ArgumentsHost, BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';

import { ApiExceptionFilter } from './api-exception.filter.js';

type JsonBody = {
  statusCode: number;
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string; code?: string }>;
  };
  path: string;
  timestamp: string;
};

function createHost(exceptionUrl = '/api/v1/test') {
  let statusCode = 0;
  let jsonBody: JsonBody | null = null;
  const response = {
    status(code: number) {
      statusCode = code;
      return {
        json(body: JsonBody) {
          jsonBody = body;
        },
      };
    },
  };
  const host = {
    switchToHttp() {
      return {
        getResponse: () => response,
        getRequest: () => ({ url: exceptionUrl }),
      };
    },
  } as unknown as ArgumentsHost;

  return {
    host,
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
  };
}

describe('ApiExceptionFilter', () => {
  it('formats validation errors from Zod', () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'not-email' });
    const filter = new ApiExceptionFilter();
    const host = createHost();

    if (result.success) {
      throw new Error('Expected validation error');
    }

    filter.catch(result.error, host.host);

    expect(host.getStatusCode()).toBe(400);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'email', code: 'invalid_string' }],
      },
      path: '/api/v1/test',
    });
    expect(host.getJsonBody()?.timestamp).toEqual(expect.any(String));
  });

  it('formats Nest HTTP exceptions', () => {
    const filter = new ApiExceptionFilter();
    const host = createHost('/api/v1/conflict');

    filter.catch(new ConflictException('Already exists'), host.host);

    expect(host.getStatusCode()).toBe(409);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 409,
      error: { code: 'CONFLICT', message: 'Already exists' },
      path: '/api/v1/conflict',
    });
  });

  it.each([
    [new BadRequestException('Bad request'), 400, 'BAD_REQUEST'],
    [new UnauthorizedException('Missing bearer token'), 401, 'UNAUTHORIZED'],
    [new ForbiddenException('Forbidden resource'), 403, 'FORBIDDEN'],
    [new NotFoundException('User not found'), 404, 'NOT_FOUND'],
  ] as const)('normalizes common auth, organization, and user errors to ApiErrorResponse', (exception, expectedStatus, expectedCode) => {
    const filter = new ApiExceptionFilter();
    const host = createHost('/api/v1/users/user-1');

    filter.catch(exception, host.host);

    expect(host.getStatusCode()).toBe(expectedStatus);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: expectedStatus,
      error: { code: expectedCode, message: exception.message },
      path: '/api/v1/users/user-1',
    });
    expect(host.getJsonBody()?.timestamp).toEqual(expect.any(String));
  });

  it('preserves already normalized ApiErrorResponse payloads from HTTP exceptions', () => {
    const filter = new ApiExceptionFilter();
    const host = createHost('/api/v1/auth/me');

    filter.catch(
      new HttpException(
        {
          statusCode: 401,
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Session expired',
            details: [{ field: 'accessToken', message: 'Token is expired', code: 'expired' }],
          },
          path: '/ignored',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        HttpStatus.UNAUTHORIZED,
      ),
      host.host,
    );

    expect(host.getStatusCode()).toBe(401);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 401,
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Session expired',
        details: [{ field: 'accessToken', message: 'Token is expired', code: 'expired' }],
      },
      path: '/api/v1/auth/me',
    });
    expect(host.getJsonBody()?.timestamp).toEqual(expect.any(String));
  });

  it('formats rate limit exceptions as TOO_MANY_REQUESTS', () => {
    const filter = new ApiExceptionFilter();
    const host = createHost('/api/v1/auth/login');

    filter.catch(new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS), host.host);

    expect(host.getStatusCode()).toBe(429);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 429,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' },
      path: '/api/v1/auth/login',
    });
  });

  it('formats unknown errors without leaking details', () => {
    const filter = new ApiExceptionFilter();
    const host = createHost();

    filter.catch(new Error('secret database detail'), host.host);

    expect(host.getStatusCode()).toBe(500);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 500,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(host.getJsonBody())).not.toContain('secret database detail');
  });

  it('normalizes Prisma P2002 unique constraint errors to 409 without leaking DB message', () => {
    const filter = new ApiExceptionFilter();
    const host = createHost();
    const prismaError = {
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`email`)',
      name: 'PrismaClientKnownRequestError',
    };

    filter.catch(prismaError, host.host);

    expect(host.getStatusCode()).toBe(409);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 409,
      error: { code: 'CONFLICT', message: 'Unique constraint failed' },
    });
    expect(JSON.stringify(host.getJsonBody())).not.toContain('email');
  });

  it('normalizes unknown Prisma errors to 400 without leaking DB error message', () => {
    const filter = new ApiExceptionFilter();
    const host = createHost();
    const prismaError = {
      code: 'P2015',
      message: "A related record could not be found. {model_name='User'} {where: id = 'abc'}",
      name: 'PrismaClientKnownRequestError',
    };

    filter.catch(prismaError, host.host);

    expect(host.getStatusCode()).toBe(400);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 400,
      error: { code: 'DATABASE_ERROR', message: 'Database request failed' },
    });
    expect(JSON.stringify(host.getJsonBody())).not.toContain('User');
    expect(JSON.stringify(host.getJsonBody())).not.toContain('abc');
  });

  it('formats bad request message arrays', () => {
    const filter = new ApiExceptionFilter();
    const host = createHost();

    filter.catch(new BadRequestException(['name is required', 'email is invalid']), host.host);

    expect(host.getStatusCode()).toBe(400);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 400,
      error: { code: 'BAD_REQUEST', message: 'name is required; email is invalid' },
    });
  });
});
