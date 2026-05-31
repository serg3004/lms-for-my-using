import { z } from 'zod';

const strongPasswordSchema = z
  .string()
  .min(12)
  .max(255)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

export const loginSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(255),
});

export const passwordResetRequestSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(512),
  password: strongPasswordSchema,
});

export const passwordResetAcceptedSchema = z.object({
  accepted: z.literal(true),
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

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  csrfToken: z.string().min(1),
  user: currentUserSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginIdentityInput = Pick<LoginInput, 'organizationId' | 'email'>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
