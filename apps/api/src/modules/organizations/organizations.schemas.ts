import { z } from 'zod';

import { voicePerCommentRange, voiceSecondsRange } from '../../common/voice-policy.js';
import { badgeIdleMinutesRange } from '../../common/badge.js';
import { qrLoginRoleValues, qrLoginSessionHoursRange } from '../../common/qr-login.js';
import { loginFailureWindowRange, loginLockRange, loginLogRetentionRange, loginMaxFailuresRange } from '../../common/login-protection.js';
import { passwordHistoryRange, passwordMinLengthRange } from '../../common/password-policy.js';

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
    password: z.string().min(1).max(255),
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

export const themeSettingsSchema = z.object({
  colorPrimary: z.string().trim().min(1).max(64),
  colorPrimaryHover: z.string().trim().min(1).max(64),
  colorBackground: z.string().trim().min(1).max(64),
  colorSurface: z.string().trim().min(1).max(64),
  colorSurfaceMuted: z.string().trim().min(1).max(64),
  colorBorder: z.string().trim().min(1).max(64),
  colorText: z.string().trim().min(1).max(64),
  colorTextMuted: z.string().trim().min(1).max(64),
  shadowCard: z.string().trim().min(1).max(160),
  radiusSm: z.string().trim().min(1).max(32),
  radiusMd: z.string().trim().min(1).max(32),
  radiusLg: z.string().trim().min(1).max(32),
  spacePage: z.string().trim().min(1).max(160),
  adminSidebarBackground: z.string().trim().min(1).max(64),
  adminSidebarText: z.string().trim().min(1).max(64),
  adminSidebarTextMuted: z.string().trim().min(1).max(64),
  platformName: z.string().trim().min(1).max(120),
  logoObjectKey: z.string().trim().max(512).optional(),
});

export type ThemeSettingsInput = z.infer<typeof themeSettingsSchema>;

/** PR 488: the organization's password policy; an administrator sets it, the rules themselves live in common/password-policy.ts. */
export const passwordPolicySchema = z.object({
  minLength: z.number().int().min(passwordMinLengthRange.min).max(passwordMinLengthRange.max),
  historyCount: z.number().int().min(passwordHistoryRange.min).max(passwordHistoryRange.max),
}).strict();
export type PasswordPolicyInput = z.infer<typeof passwordPolicySchema>;

/** PR 493: thresholds of the sign-in protection; the ranges live in common/login-protection.ts. */
export const loginProtectionSchema = z.object({
  maxFailures: z.number().int().min(loginMaxFailuresRange.min).max(loginMaxFailuresRange.max),
  windowMinutes: z.number().int().min(loginFailureWindowRange.min).max(loginFailureWindowRange.max),
  lockMinutes: z.number().int().min(loginLockRange.min).max(loginLockRange.max),
  logRetentionDays: z.number().int().min(loginLogRetentionRange.min).max(loginLogRetentionRange.max).optional(),
}).strict();
export type LoginProtectionInput = z.infer<typeof loginProtectionSchema>;

/** PR 505: sign-in by QR confirmed on a phone: the switch, the term of the session and the roles that may use it. */
export const qrLoginPolicySchema = z.object({
  enabled: z.boolean(),
  sessionHours: z.number().int().min(qrLoginSessionHoursRange.min).max(qrLoginSessionHoursRange.max),
  roles: z.array(z.enum(qrLoginRoleValues)).max(qrLoginRoleValues.length).transform((roles) => [...new Set(roles)]),
}).strict();
export type QrLoginPolicyInput = z.infer<typeof qrLoginPolicySchema>;

/** PR 506: the PIN asked after a badge scan and how long a kiosk session may stay idle. */
export const badgePolicySchema = z.object({
  pinRequired: z.boolean(),
  idleMinutes: z.number().int().min(badgeIdleMinutesRange.min).max(badgeIdleMinutesRange.max),
}).strict();
export type BadgePolicyInput = z.infer<typeof badgePolicySchema>;

/** PR 511: what the organization allows in checklist comments. `version` is the one the administrator saw (409 when it is stale). */
export const voicePolicySchema = z.object({
  dictationEnabled: z.boolean(),
  voiceNotesEnabled: z.boolean(),
  maxSeconds: z.number().int().min(voiceSecondsRange.min).max(voiceSecondsRange.max),
  perComment: z.number().int().min(voicePerCommentRange.min).max(voicePerCommentRange.max),
  version: z.number().int().min(1),
}).strict();
export type VoicePolicyInput = z.infer<typeof voicePolicySchema>;

/** PR 381: organization feature switches; each one defaults to off and is changed only by an admin. */
export const organizationFeaturesSchema = z.object({
  longreadEnabled: z.boolean(),
  customRolesEnabled: z.boolean().optional(),
  telegramDeliveryEnabled: z.boolean().optional(),
}).strict();
export type OrganizationFeaturesInput = z.infer<typeof organizationFeaturesSchema>;
