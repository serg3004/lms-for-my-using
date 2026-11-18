import { z } from 'zod';

export const userRoleSchema = z.enum(['learner', 'instructor', 'mentor', 'manager', 'admin']);

export const createMembershipSchema = z.object({
  organizationId: z.guid(),
  userId: z.guid(),
  role: userRoleSchema,
  assignedBy: z.guid().optional(),
});

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;
