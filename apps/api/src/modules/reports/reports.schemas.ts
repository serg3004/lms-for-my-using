import { z } from 'zod';

export const reportsSummaryQuerySchema = z.object({
  departmentId: z.string().uuid().optional(),
  includeDescendants: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

export type ReportsSummaryQuery = z.infer<typeof reportsSummaryQuerySchema>;
