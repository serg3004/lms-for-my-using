import type { PrismaService } from '../database/prisma.service.js';

/** PR 493: limits of the sign-in protection; an administrator sets the three numbers, the defaults match the database. */
export const loginMaxFailuresRange = { min: 3, max: 20, default: 5 } as const;
export const loginFailureWindowRange = { min: 1, max: 120, default: 15 } as const;
export const loginLockRange = { min: 1, max: 1440, default: 15 } as const;
/** PR 494: how long sign-in events are kept; an administrator can raise the 90 days, never lower them. */
export const loginLogRetentionRange = { min: 90, max: 3650, default: 90 } as const;

export type LoginProtection = { maxFailures: number; windowMinutes: number; lockMinutes: number; logRetentionDays: number };

export const defaultLoginProtection: LoginProtection = {
  maxFailures: loginMaxFailuresRange.default,
  windowMinutes: loginFailureWindowRange.default,
  lockMinutes: loginLockRange.default,
  logRetentionDays: loginLogRetentionRange.default,
};

export async function loadLoginProtection(prisma: Pick<PrismaService, 'organization'>, organizationId: string): Promise<LoginProtection> {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { loginMaxFailures: true, loginFailureWindowMinutes: true, loginLockMinutes: true, loginLogRetentionDays: true },
  });
  if (!organization) return defaultLoginProtection;
  return { maxFailures: organization.loginMaxFailures, windowMinutes: organization.loginFailureWindowMinutes, lockMinutes: organization.loginLockMinutes, logRetentionDays: organization.loginLogRetentionDays };
}

