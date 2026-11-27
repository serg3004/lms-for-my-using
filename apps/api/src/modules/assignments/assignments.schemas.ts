import { z } from 'zod';

export const assignmentStatusSchema = z.enum(['assigned', 'completed', 'cancelled']);

export const createAssignmentSchema = z
  .object({
    organizationId: z.guid(),
    courseId: z.guid(),
    userId: z.guid().optional(),
    groupId: z.guid().optional(),
    departmentId: z.guid().optional(),
    includeDescendants: z.boolean().default(false),
    status: assignmentStatusSchema.default('assigned'),
    dueAt: z.coerce.date().optional(),
    /** PR 581: the folder of the assignment list the assignment is created in. */
    folderId: z.guid().nullable().optional(),
  })
  .refine((input) => [input.userId, input.groupId, input.departmentId].filter(Boolean).length === 1, {
    message: 'Assignment must target exactly one of userId, groupId, or departmentId',
    path: ['userId'],
  })
  .refine((input) => input.departmentId !== undefined || !input.includeDescendants, {
    message: 'includeDescendants requires a departmentId target',
    path: ['includeDescendants'],
  });

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentStatusSchema = z.object({
  status: assignmentStatusSchema,
});
export type UpdateAssignmentStatusInput = z.infer<typeof updateAssignmentStatusSchema>;
