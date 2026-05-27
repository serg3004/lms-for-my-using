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

export const registerOrganizationSchema = z.object({
  organization: createOrganizationSchema,
  admin: z.object({
    email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
    password: z.string().min(8).max(255),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    middleName: z.string().trim().min(1).max(80).optional(),
    position: z.string().trim().min(1).max(120).optional(),
    shift: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    locale: z.string().trim().min(2).max(12).default('ru'),
    timezone: z.string().trim().min(1).max(64).default('Asia/Almaty'),
  }),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;
