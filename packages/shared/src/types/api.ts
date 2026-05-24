export type ApiError = {
  code: string;
  message?: string;
  details?: unknown;
  id?: string;
};

export type ApiErrorResponse = {
  error: ApiError;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
