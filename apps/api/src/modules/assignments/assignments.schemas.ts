import { z } from 'zod';

export const assignmentStatusSchema = z.enum(['assigned', 'completed', 'cancelled']);

export const createAssignmentSchema = z
  .object({
    organizationId: z.string().uuid(),
    courseId: z.string().uuid(),
    userId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    includeDescendants: z.boolean().default(false),
    status: assignmentStatusSchema.default('assigned'),
    dueAt: z.coerce.date().optional(),
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
