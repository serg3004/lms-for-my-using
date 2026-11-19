import { z } from 'zod';

export const reportsSummaryQuerySchema = z.object({
  departmentId: z.guid().optional(),
  includeDescendants: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

export type ReportsSummaryQuery = z.infer<typeof reportsSummaryQuerySchema>;

/** PR 473: filters of the course and user analytics (period is by the date an assignment was made). */
export const courseAnalyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  departmentId: z.guid().optional(),
  includeDescendants: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  groupId: z.guid().optional(),
  managerId: z.guid().optional(),
  courseIds: z.string().optional().transform((value) => (value ? value.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.guid()).max(100).optional()),
}).refine((value) => !value.from || !value.to || value.from <= value.to, { message: 'from must not be after to', path: ['to'] });

export type CourseAnalyticsQuery = z.infer<typeof courseAnalyticsQuerySchema>;
