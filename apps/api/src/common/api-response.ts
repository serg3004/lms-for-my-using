import type { ApiErrorDetail, ApiErrorResponse } from '@lms/shared';

export type { ApiErrorDetail, ApiErrorResponse } from '@lms/shared';

type CreateApiErrorResponseInput = {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  details?: ApiErrorDetail[];
  timestamp?: string;
};

export function createApiErrorResponse({
  statusCode,
  code,
  message,
  path,
  details,
  timestamp = new Date().toISOString(),
}: CreateApiErrorResponseInput): ApiErrorResponse {
  return {
    statusCode,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    path,
    timestamp,
  };
}
