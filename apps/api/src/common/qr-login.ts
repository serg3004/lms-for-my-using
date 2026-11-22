import type { PrismaService } from '../database/prisma.service.js';

/** PR 505: sign-in by QR confirmed on a phone. A request lives two minutes; the administrator chooses the roles and the session term. */
export const qrLoginRequestLifetimeMs = 2 * 60 * 1000;
export const qrLoginSessionHoursRange = { min: 1, max: 24, default: 8 } as const;
export const qrLoginRoleValues = ['learner', 'mentor', 'instructor', 'manager', 'admin'] as const;
export const defaultQrLoginRoles: string[] = ['learner', 'mentor', 'instructor'];

export type QrLoginPolicy = { enabled: boolean; sessionHours: number; roles: string[] };

export async function loadQrLoginPolicy(prisma: Pick<PrismaService, 'organization'>, organizationId: string): Promise<QrLoginPolicy> {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { qrLoginEnabled: true, qrLoginSessionHours: true, qrLoginRoles: true },
  });
  if (!organization) return { enabled: false, sessionHours: qrLoginSessionHoursRange.default, roles: defaultQrLoginRoles };
  return { enabled: organization.qrLoginEnabled, sessionHours: organization.qrLoginSessionHours, roles: organization.qrLoginRoles };
}
