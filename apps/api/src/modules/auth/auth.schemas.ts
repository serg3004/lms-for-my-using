import { z } from 'zod';
import type { UserRole } from '@lms/shared/types/api';

/** The password rules (length, letters and digits, name and e-mail, common and recent passwords) live in common/password-policy.ts and are applied by the services. */
export const newPasswordSchema = z.string().min(1).max(255);

export const userRoleSchema: z.ZodType<UserRole> = z.enum(['learner', 'instructor', 'mentor', 'manager', 'admin']);

const organizationLoginSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((organizationId) => organizationId.toLowerCase());

export const loginSchema = z.object({
  organizationId: organizationLoginSchema,
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(255),
});

export const passwordResetRequestSchema = z.object({
  // Same short name or ID as the sign-in form.
  organizationId: organizationLoginSchema,
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(512),
  password: newPasswordSchema,
});

export const invitationAcceptSchema = z.object({
  token: z.string().trim().min(32).max(512),
  password: newPasswordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(255),
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const passwordResetAcceptedSchema = z.object({
  accepted: z.literal(true),
});

export const supportedLocaleSchema = z.enum(['ru', 'en', 'kk', 'zh']);
export const updatePreferencesSchema = z.object({
  locale: supportedLocaleSchema,
}).strict();

export const currentUserSchema = z.object({
  id: z.guid(),
  organizationId: z.guid(),
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
  /** PR 489: set by a temporary password; until the user sets their own, only changing it and signing out work. */
  mustChangePassword: z.boolean(),
  roles: z.array(userRoleSchema),
});

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  csrfToken: z.string().min(1).optional(),
  user: currentUserSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginIdentityInput = Pick<LoginInput, 'organizationId' | 'email'>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type InvitationAcceptInput = z.infer<typeof invitationAcceptSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type { UserRole } from '@lms/shared/types/api';
