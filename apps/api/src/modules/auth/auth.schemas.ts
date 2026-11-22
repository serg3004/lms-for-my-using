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

/** PR 501: sign-in without email: the number and the last name select the account, the password decides. */
export const employeeLoginSchema = z.object({
  organizationId: organizationLoginSchema,
  employeeNumber: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(255),
}).strict();

export const activationQrSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  kind: z.enum(['personal', 'shared']),
}).strict();

/** PR 505: the code shown as a QR and the secret the device keeps are 32 random bytes in base64url. */
export const qrCodeSchema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const qrPollSchema = z.object({ pollToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

/** PR 501: a person without a mailbox confirms who they are and sets the first password. */
export const identityActivationSchema = z.object({
  organizationId: organizationLoginSchema,
  employeeNumber: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional(),
  password: newPasswordSchema,
  qr: activationQrSchema.optional(),
}).strict();

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
export type EmployeeLoginInput = z.infer<typeof employeeLoginSchema>;
export type IdentityActivationInput = z.infer<typeof identityActivationSchema>;
export type LoginIdentityInput = Pick<LoginInput, 'organizationId' | 'email'>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type InvitationAcceptInput = z.infer<typeof invitationAcceptSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type { UserRole } from '@lms/shared/types/api';
