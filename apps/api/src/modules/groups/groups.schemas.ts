import { z } from 'zod';

export const groupStatusSchema = z.enum(['active', 'archived']);

const groupSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createGroupSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  slug: groupSlugSchema,
  description: z.string().trim().max(500).optional(),
  status: groupStatusSchema.default('active'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
