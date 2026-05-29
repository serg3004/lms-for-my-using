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

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
