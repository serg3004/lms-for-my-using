import { z } from 'zod';

export const loginSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(255),
});

export const currentUserSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  middleName: z.string().nullable(),
  position: z.string().nullable(),
  shift: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.enum(['active', 'invited', 'suspended', 'archived']),
  locale: z.string(),
  timezone: z.string(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginIdentityInput = Pick<LoginInput, 'organizationId' | 'email'>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
