import { z } from 'zod';

export const assignmentStatusSchema = z.enum(['assigned', 'completed', 'cancelled']);

export const createAssignmentSchema = z
  .object({
    organizationId: z.string().uuid(),
    courseId: z.string().uuid(),
    userId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    status: assignmentStatusSchema.default('assigned'),
    dueAt: z.coerce.date().optional(),
  })
  .refine((input) => Boolean(input.userId) !== Boolean(input.groupId), {
    message: 'Assignment must target either userId or groupId',
    path: ['userId'],
  });

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentStatusSchema = z.object({
  status: assignmentStatusSchema,
});
export type UpdateAssignmentStatusInput = z.infer<typeof updateAssignmentStatusSchema>;
