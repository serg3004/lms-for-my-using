import { z } from 'zod';

export const reportingLineTypeSchema = z.enum(['DIRECT', 'FUNCTIONAL', 'PROJECT']);

export const createReportingLineSchema = z
  .object({
    organizationId: z.string().uuid(),
    employeeId: z.string().uuid(),
    managerId: z.string().uuid(),
    type: reportingLineTypeSchema,
    isPrimary: z.boolean().default(false),
  })
  .refine((data) => data.employeeId !== data.managerId, {
    message: 'An employee cannot report to themselves',
    path: ['managerId'],
  });
export type CreateReportingLineInput = z.infer<typeof createReportingLineSchema>;

// Changing employeeId/managerId/type is modeled as close + create a new line, not an update --
// only isPrimary (promoting/demoting which relation is the primary one of its type) is mutable
// in place, so a PATCH never needs to re-run cycle detection.
export const updateReportingLineSchema = z.object({
  isPrimary: z.boolean(),
});
export type UpdateReportingLineInput = z.infer<typeof updateReportingLineSchema>;
