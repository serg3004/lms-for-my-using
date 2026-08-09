import { z } from 'zod';

export type { UserRole } from '../constants/roles.js';

export const apiErrorDetailSchema = z
  .object({
    field: z.string().optional(),
    message: z.string(),
    code: z.string().optional(),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    code: z.string(),
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
