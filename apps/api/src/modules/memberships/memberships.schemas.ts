import { z } from 'zod';

export const userRoleSchema = z.enum(['learner', 'instructor', 'manager', 'admin']);

export const createMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: userRoleSchema,
  assignedBy: z.string().uuid().optional(),
});

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;
