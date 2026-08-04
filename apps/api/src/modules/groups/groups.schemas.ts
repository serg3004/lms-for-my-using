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
  location: z.string().trim().max(120).optional(),
  status: groupStatusSchema.default('active'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable(),
    location: z.string().trim().max(120).nullable(),
    status: groupStatusSchema,
  })
  .partial();

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
