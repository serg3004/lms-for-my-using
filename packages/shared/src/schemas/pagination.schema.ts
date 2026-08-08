import { z } from 'zod';

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 200,
} as const;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(PAGINATION_DEFAULTS.page),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(PAGINATION_DEFAULTS.maxPageSize)
    .default(PAGINATION_DEFAULTS.pageSize),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
