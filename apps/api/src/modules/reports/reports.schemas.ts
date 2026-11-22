import { z } from 'zod';

import { analyticsFieldFiltersSchema, fieldKeySchema } from '../user-fields/public.js';

export const reportsSummaryQuerySchema = z.object({
  groupByField: fieldKeySchema.optional(),
  fieldFilters: analyticsFieldFiltersSchema,
  departmentId: z.guid().optional(),
  includeDescendants: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

export type ReportsSummaryQuery = z.infer<typeof reportsSummaryQuerySchema>;

const analyticsFilterShape = {
  groupByField: fieldKeySchema.optional(),
  fieldFilters: analyticsFieldFiltersSchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  departmentId: z.guid().optional(),
  includeDescendants: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  groupId: z.guid().optional(),
  managerId: z.guid().optional(),
  courseIds: z.string().optional().transform((value) => (value ? value.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.guid()).max(100).optional()),
};
const periodOrder = (value: { from?: Date; to?: Date }) => !value.from || !value.to || value.from <= value.to;
const periodOrderIssue = { message: 'from must not be after to', path: ['to'] };

/** PR 473: filters of the course and user analytics (period is by the date an assignment was made). */
export const courseAnalyticsQuerySchema = z.object(analyticsFilterShape).refine(periodOrder, periodOrderIssue);

export type CourseAnalyticsQuery = z.infer<typeof courseAnalyticsQuerySchema>;

/** PR 475: the export of one of the three views, with the same filters as the screen. */
export const courseAnalyticsExportQuerySchema = z.object({
  ...analyticsFilterShape,
  view: z.enum(['courses', 'course', 'user']),
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
  courseId: z.guid().optional(),
  userId: z.guid().optional(),
}).refine(periodOrder, periodOrderIssue)
  .refine((value) => (value.view !== 'course' || value.courseId) && (value.view !== 'user' || value.userId), { message: 'courseId or userId is required for this view', path: ['view'] });

export type CourseAnalyticsExportQuery = z.infer<typeof courseAnalyticsExportQuerySchema>;
