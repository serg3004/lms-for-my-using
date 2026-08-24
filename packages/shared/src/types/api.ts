import { z } from 'zod';

export type { UserRole } from '../constants/roles.js';

export const API_ERROR_CODES = [
  'AUTH_INVALID_CREDENTIALS',
  'BAD_REQUEST',
  'CONFLICT',
  'DATABASE_ERROR',
  'FORBIDDEN',
  'HEALTH_CHECK_FAILED',
  'HTTP_ERROR',
  'INTERNAL_SERVER_ERROR',
  'NOT_FOUND',
  'RATE_LIMIT_UNAVAILABLE',
  'SESSION_EXPIRED',
  'TOO_MANY_REQUESTS',
  'UNAUTHORIZED',
  'UNPROCESSABLE_ENTITY',
  'VALIDATION_ERROR',
] as const;

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorDetailSchema = z
  .object({
    field: z.string().optional(),
    message: z.string(),
    code: z.string().optional(),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.array(apiErrorDetailSchema).optional(),
  })
  .strict();

export const apiErrorResponseSchema = z
  .object({
    statusCode: z.number().int(),
    error: apiErrorSchema,
    path: z.string(),
    timestamp: z.string(),
  })
  .strict();

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .object({
      items: z.array(itemSchema),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      total: z.number().int().nonnegative(),
    })
    .strict();
}

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
