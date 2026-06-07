import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodError } from 'zod';

import { createApiErrorResponse, type ApiErrorDetail, type ApiErrorResponse } from '../api-response.js';

type HttpRequest = {
  url?: string;
};

type HttpResponse = {
  status(statusCode: number): {
    json(body: ApiErrorResponse): void;
  };
};

type ExceptionResponse =
  | string
  | {
      message?: string | string[];
      error?: string;
      statusCode?: number;
    };

type PrismaLikeError = {
  code?: string;
  message?: string;
};

type NormalizedApiError = {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
};

const defaultErrorMessage = 'Internal server error';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getExceptionResponse(exception: HttpException): ExceptionResponse {
  return exception.getResponse() as ExceptionResponse;
}

function getHttpErrorCode(statusCode: number) {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE_ENTITY';
    default:
      return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR';
  }
}

function normalizeHttpException(exception: HttpException): NormalizedApiError {
  const statusCode = exception.getStatus();
  const response = getExceptionResponse(exception);

  if (typeof response === 'string') {
    return {
      statusCode,
      code: getHttpErrorCode(statusCode),
      message: response,
    };
  }

  const responseMessage = response.message;
  const message = Array.isArray(responseMessage)
    ? responseMessage.join('; ')
    : responseMessage ?? exception.message;

  return {
    statusCode,
    code: getHttpErrorCode(statusCode),
    message,
  };
}

function normalizeZodError(error: ZodError): NormalizedApiError {
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}

function normalizePrismaError(error: PrismaLikeError): NormalizedApiError {
  if (error.code === 'P2002') {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message: 'Unique constraint failed',
    };
  }

  return {
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'DATABASE_ERROR',
    message: 'Database request failed',
  };
}

function isPrismaKnownRequestError(exception: unknown): exception is PrismaLikeError {
  return isRecord(exception) && typeof exception.code === 'string' && exception.code.startsWith('P');
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<HttpResponse>();
    const request = http.getRequest<HttpRequest>();
    const normalizedError = this.normalizeException(exception);

    if (normalizedError.statusCode >= 500) {
      this.logger.error(
        { err: exception instanceof Error ? { message: exception.message, name: exception.name } : String(exception) },
        `${normalizedError.code}: ${normalizedError.message}`,
      );
    }

    response.status(normalizedError.statusCode).json(
      createApiErrorResponse({
        statusCode: normalizedError.statusCode,
        code: normalizedError.code,
        message: normalizedError.message,
        details: normalizedError.details,
        path: request.url ?? '',
      }),
    );
  }

  private normalizeException(exception: unknown): NormalizedApiError {
    if (exception instanceof ZodError) {
      return normalizeZodError(exception);
    }

    if (exception instanceof HttpException) {
      return normalizeHttpException(exception);
    }

    if (isPrismaKnownRequestError(exception)) {
      return normalizePrismaError(exception);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: defaultErrorMessage,
    };
  }
}
