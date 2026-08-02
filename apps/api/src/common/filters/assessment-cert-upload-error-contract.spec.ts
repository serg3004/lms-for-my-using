import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';

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

describe('assessments, certificates and upload API error contract', () => {
  describe('not found errors', () => {
    it.each([
      ['/api/v1/assessments/assessment-1', 'Assessment not found'],
      ['/api/v1/assessments/assessment-1/questions/question-1', 'Assessment question not found'],
      ['/api/v1/assessment-attempts/attempt-1', 'Assessment attempt not found'],
      ['/api/v1/certificates/certificate-1', 'Certificate not found'],
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
  });

  describe('forbidden errors', () => {
    it('normalizes certificate access forbidden error', () => {
      const filter = new ApiExceptionFilter();
      const host = createHost('/api/v1/certificates/certificate-1');
      const message = 'Certificate is not available for current user';

      filter.catch(new ForbiddenException(message), host.host);

      expect(host.getStatusCode()).toBe(403);
      expect(host.getJsonBody()).toMatchObject({
        statusCode: 403,
        error: {
          code: 'FORBIDDEN',
          message,
        },
        path: '/api/v1/certificates/certificate-1',
      });
    });

    it('normalizes certificate not available before course completion', () => {
      const filter = new ApiExceptionFilter();
      const host = createHost('/api/v1/certificates');
      const message = 'Certificate is not available before course completion or passed assessment';

      filter.catch(new ForbiddenException(message), host.host);

      expect(host.getStatusCode()).toBe(403);
      expect(host.getJsonBody()).toMatchObject({
        statusCode: 403,
        error: { code: 'FORBIDDEN', message },
        path: '/api/v1/certificates',
      });
    });
  });

  describe('bad request errors for assessment attempts', () => {
    it.each([
      ['Assessment must be published before attempting', '/api/v1/assessment-attempts'],
      ['Assessment attempts limit reached', '/api/v1/assessment-attempts'],
      ['Course must be completed before assessment attempt', '/api/v1/assessment-attempts'],
      ['Assessment has no questions', '/api/v1/assessment-attempts/attempt-1/submit'],
      ['All assessment questions must be answered', '/api/v1/assessment-attempts/attempt-1/submit'],
    ] as const)('normalizes bad request: %s', (message, path) => {
      const filter = new ApiExceptionFilter();
      const host = createHost(path);

      filter.catch(new BadRequestException(message), host.host);

      expect(host.getStatusCode()).toBe(400);
      expect(host.getJsonBody()).toMatchObject({
        statusCode: 400,
        error: {
          code: 'BAD_REQUEST',
          message,
        },
        path,
      });
    });
  });

  describe('upload errors', () => {
    it('normalizes service unavailable when storage is not configured', () => {
      const filter = new ApiExceptionFilter();
      const host = createHost('/api/v1/upload');
      const message = 'File storage is not configured';

      filter.catch(new ServiceUnavailableException(message), host.host);

      expect(host.getStatusCode()).toBe(503);
      expect(host.getJsonBody()).toMatchObject({
        statusCode: 503,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message,
        },
        path: '/api/v1/upload',
      });
      expect(host.getJsonBody()?.timestamp).toEqual(expect.any(String));
    });

    it('normalizes bad request when file type is not allowed', () => {
      const filter = new ApiExceptionFilter();
      const host = createHost('/api/v1/upload');
      const message = 'File type "application/x-executable" is not allowed';

      filter.catch(new BadRequestException(message), host.host);

      expect(host.getStatusCode()).toBe(400);
      expect(host.getJsonBody()).toMatchObject({
        statusCode: 400,
        error: {
          code: 'BAD_REQUEST',
          message,
        },
        path: '/api/v1/upload',
      });
    });

    it('normalizes bad request when file name contains path traversal characters', () => {
      const filter = new ApiExceptionFilter();
      const host = createHost('/api/v1/upload');
      const message = 'File name contains path traversal characters';

      filter.catch(new BadRequestException(message), host.host);

      expect(host.getStatusCode()).toBe(400);
      expect(host.getJsonBody()).toMatchObject({
        statusCode: 400,
        error: { code: 'BAD_REQUEST', message },
        path: '/api/v1/upload',
      });
    });
  });
});
