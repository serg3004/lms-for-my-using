import type { PrismaService } from '../database/prisma.service.js';

/**
 * PR 506: the QR badge of an employee opens a kiosk session for assigned work only. The roles that may use a badge are fixed:
 * a role with management rights always needs the password, as does any custom role.
 */
export const badgeRoles = ['learner', 'mentor', 'instructor'] as const;
/** An access token lives 15 minutes and a session is renewed on use, so a shorter idle time would not be kept. */
export const badgeIdleMinutesRange = { min: 15, max: 120, default: 30 } as const;
/** A kiosk session never outlives this, however busy the tablet is. */
export const badgeSessionMaxHours = 8;
export const badgePinLength = { min: 4, max: 6 } as const;

export type BadgePolicy = { pinRequired: boolean; idleMinutes: number };

export async function loadBadgePolicy(prisma: Pick<PrismaService, 'organization'>, organizationId: string): Promise<BadgePolicy> {
  const organization = await prisma.organization.findFirst({ where: { id: organizationId }, select: { badgePinRequired: true, badgeIdleMinutes: true } });
  return { pinRequired: organization?.badgePinRequired ?? true, idleMinutes: organization?.badgeIdleMinutes ?? badgeIdleMinutesRange.default };
}
