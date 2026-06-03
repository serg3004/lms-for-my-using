export type ApiErrorDetail = {
  field?: string;
  message: string;
  code?: string;
};

export type ApiError = {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
};

export type ApiErrorResponse = {
  statusCode: number;
  error: ApiError;
  path: string;
  timestamp: string;
};

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
