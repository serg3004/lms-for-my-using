import { z } from 'zod';

export const organizationStatusSchema = z.enum(['active', 'suspended', 'archived']);
export const organizationPlanSchema = z.enum(['trial', 'standard', 'enterprise']);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: organizationStatusSchema.default('active'),
  plan: organizationPlanSchema.default('trial'),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
