import { BadRequestException, ConflictException, NotFoundException, type ArgumentsHost } from '@nestjs/common';
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

function createHost(requestUrl: string) {
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
        getRequest: () => ({ url: requestUrl }),
      };
    },
  } as unknown as ArgumentsHost;

  return {
    host,
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
  };
}

describe('learning content API error contract', () => {
  it.each([
    ['/api/v1/courses/course-1', 'Course not found'],
    ['/api/v1/lessons/lesson-1', 'Lesson not found'],
    ['/api/v1/materials/material-1', 'Course material not found'],
    ['/api/v1/assignments/assignment-1', 'Assignment not found'],
    ['/api/v1/progress/progress-1', 'Progress not found'],
  ] as const)('normalizes not found errors for %s', (path, message) => {
    const filter = new ApiExceptionFilter();
    const host = createHost(path);

    filter.catch(new NotFoundException(message), host.host);

    expect(host.getStatusCode()).toBe(404);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 404,
      error: {
        code: 'NOT_FOUND',
        message,
      },
      path,
    });
    expect(host.getJsonBody()?.timestamp).toEqual(expect.any(String));
  });

  it('normalizes learning content conflict errors', () => {
    const filter = new ApiExceptionFilter();
    const host = createHost('/api/v1/courses');

    filter.catch(new ConflictException('Course slug already exists in organization'), host.host);

    expect(host.getStatusCode()).toBe(409);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 409,
      error: {
        code: 'CONFLICT',
        message: 'Course slug already exists in organization',
      },
      path: '/api/v1/courses',
    });
  });

  it('normalizes learning content validation errors from Zod', () => {
    const createCourseSchema = z.object({
      title: z.string().min(1),
      slug: z.string().min(1),
    });
    const result = createCourseSchema.safeParse({ title: '', slug: '' });
    const filter = new ApiExceptionFilter();
    const host = createHost('/api/v1/courses');

    if (result.success) {
      throw new BadRequestException('Expected validation error');
    }

    filter.catch(result.error, host.host);

    expect(host.getStatusCode()).toBe(400);
    expect(host.getJsonBody()).toMatchObject({
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          { field: 'title', code: 'too_small' },
          { field: 'slug', code: 'too_small' },
        ],
      },
      path: '/api/v1/courses',
    });
  });
});
