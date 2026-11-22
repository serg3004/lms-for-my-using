import { createHash, randomBytes, randomInt } from 'node:crypto';
import { ConflictException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { badgePinLength, badgeRoles, loadBadgePolicy } from '../../common/badge.js';
import { loadLoginProtection } from '../../common/login-protection.js';
import { PrismaService } from '../../database/prisma.service.js';
import { EMPLOYEE_NUMBER_KEY } from './employee-identity.js';
import { hashPassword, verifyPassword } from './passwords.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenShape = /^[A-Za-z0-9_-]{43}$/;
const pinShape = new RegExp(`^\\d{${badgePinLength.min},${badgePinLength.max}}$`);
const invalid = () => new UnauthorizedException({ error: { code: 'BADGE_INVALID', message: 'The badge or the PIN is not valid' } });

type Person = { id: string; organizationId: string; status: string; mustChangePassword: boolean };
type Action = 'user.badge_issued' | 'user.badge_revoked' | 'user.badge_lost' | 'user.badge_pin_reset' | 'user.badge_pin_changed' | 'user.badge_locked';

export type BadgeLoginResult = { status: 'pinRequired' } | { status: 'ok'; userId: string };

/**
 * PR 506: the QR badge of an employee. The token printed on the badge and the PIN are stored only as hashes; an administrator
 * sees the token once, when the badge is issued. A scan opens a kiosk session (see `kiosk-routes.ts`), never a full one.
 */
export class Badges {
  private readonly logger = new Logger(Badges.name);

  constructor(private readonly prisma: PrismaService) {}

  /** A person may carry a badge only with ordinary roles and without custom roles: those need the password. */
  async mayUse(person: Person): Promise<boolean> {
    if (person.status !== 'active' || person.mustChangePassword) return false;
    const [memberships, customRoles] = await Promise.all([
      this.prisma.membership.findMany({ where: { userId: person.id, organizationId: person.organizationId }, select: { role: true } }),
      this.prisma.userCustomRoleAssignment.count({ where: { userId: person.id, organizationId: person.organizationId, state: 'active' } }),
    ]);
    if (customRoles > 0 || memberships.length === 0) return false;
    return memberships.every(({ role }) => (badgeRoles as readonly string[]).includes(role));
  }

  /** Issues a new badge and revokes the previous one; the token and the PIN are returned this once. */
  async issue(userId: string, organizationId: string, actorId: string, scope?: Prisma.UserWhereInput) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, status: 'active', deletedAt: null, ...(scope ? { AND: [scope] } : {}) },
      select: { id: true, organizationId: true, status: true, mustChangePassword: true, firstName: true, lastName: true, middleName: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!(await this.mayUse(user))) throw new ConflictException('This person cannot use a badge');
    const token = randomBytes(32).toString('base64url');
    const pin = String(randomInt(10 ** badgePinLength.min)).padStart(badgePinLength.min, '0');
    const pinHash = await hashPassword(pin);
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userBadge.updateMany({ where: { userId, organizationId, state: 'active' }, data: { state: 'revoked', revokedAt: now, revokedById: actorId } });
        await tx.userBadge.create({ data: { userId, organizationId, tokenHash: hash(token), pinHash, issuedById: actorId } });
        await tx.session.updateMany({ where: { userId, organizationId, viaBadge: true, revokedAt: null }, data: { revokedAt: now } });
        await this.record(tx, organizationId, actorId, userId, 'user.badge_issued', 'A badge was issued');
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A badge is being issued for this person');
      throw error;
    }
    const employeeNumber = await this.prisma.userFieldValue.findFirst({
      where: { userId, organizationId, field: { key: EMPLOYEE_NUMBER_KEY, archivedAt: null } },
      select: { value: true },
    });
    return { userId, token, pin, firstName: user.firstName, lastName: user.lastName, middleName: user.middleName, employeeNumber: employeeNumber?.value ?? null };
  }

  /** The administrator cancels the badge of a person (lost or no longer needed). */
  async revoke(userId: string, organizationId: string, actorId: string, scope?: Prisma.UserWhereInput) {
    await this.assertInScope(userId, organizationId, scope);
    return this.close(userId, organizationId, actorId, 'revoked', 'user.badge_revoked', 'The badge was revoked');
  }

  /** The employee reports a lost badge: it stops working at once and the administrators are told. */
  async markLost(userId: string, organizationId: string) {
    const closed = await this.close(userId, organizationId, userId, 'lost', 'user.badge_lost', 'The employee reported the badge as lost');
    if (!closed.closed) throw new NotFoundException('No active badge');
    const [user, admins] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { firstName: true, lastName: true } }),
      this.prisma.user.findMany({ where: { organizationId, status: 'active', deletedAt: null, memberships: { some: { organizationId, role: 'admin' } } }, select: { id: true } }),
    ]);
    if (admins.length > 0) {
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({
          organizationId, userId: admin.id, type: 'badge_lost', data: { name: [user?.lastName, user?.firstName].filter(Boolean).join(' ') }, link: '/admin/users',
        })),
      }).catch(() => this.logger.warn('Badge lost notification was not stored'));
    }
    return { lost: true };
  }

  /** A new PIN for a person who forgot theirs; the old one stops working and a lock is lifted. */
  async resetPin(userId: string, organizationId: string, actorId: string, scope?: Prisma.UserWhereInput) {
    await this.assertInScope(userId, organizationId, scope);
    const pin = String(randomInt(10 ** badgePinLength.min)).padStart(badgePinLength.min, '0');
    const result = await this.prisma.userBadge.updateMany({
      where: { userId, organizationId, state: 'active' },
      data: { pinHash: await hashPassword(pin), pinFailures: 0, pinLockedUntil: null },
    });
    if (result.count === 0) throw new NotFoundException('No active badge');
    await this.record(this.prisma, organizationId, actorId, userId, 'user.badge_pin_reset', 'The badge PIN was reset');
    return { pin };
  }

  /** The employee chooses their own PIN, signed in with their password. */
  async changeOwnPin(userId: string, organizationId: string, pin: string) {
    if (!pinShape.test(pin)) throw new ConflictException('The PIN must have 4 to 6 digits');
    const result = await this.prisma.userBadge.updateMany({
      where: { userId, organizationId, state: 'active' },
      data: { pinHash: await hashPassword(pin), pinFailures: 0, pinLockedUntil: null },
    });
    if (result.count === 0) throw new NotFoundException('No active badge');
    await this.record(this.prisma, organizationId, userId, userId, 'user.badge_pin_changed', 'The employee changed the badge PIN');
    return { changed: true };
  }

  /** What the employee sees in the profile; no token, no hash. */
  async ownState(userId: string, organizationId: string) {
    const [badge, policy] = await Promise.all([
      this.prisma.userBadge.findFirst({ where: { userId, organizationId, state: 'active' }, select: { issuedAt: true, lastUsedAt: true } }),
      loadBadgePolicy(this.prisma, organizationId),
    ]);
    return { badge: badge ?? null, pinRequired: policy.pinRequired };
  }

  /** The state of a person's badge for an administrator. */
  async stateFor(userId: string, organizationId: string, scope?: Prisma.UserWhereInput) {
    await this.assertInScope(userId, organizationId, scope);
    const latest = await this.prisma.userBadge.findFirst({
      where: { userId, organizationId }, orderBy: { issuedAt: 'desc' }, select: { state: true, issuedAt: true, revokedAt: true, lastUsedAt: true, pinLockedUntil: true },
    });
    return { badge: latest ?? null };
  }

  /**
   * One scan. A token nobody knows answers like a real one that wants a PIN, and every refusal after that is the same, so the
   * answer does not tell which part was wrong. Failed PINs are counted per badge and lock it for the organization's lock time.
   */
  async login(token: string, pin: string | undefined, context: { record: (user: { id: string; organizationId: string }, outcome: 'failed' | 'locked') => Promise<void> }): Promise<BadgeLoginResult> {
    const badge = tokenShape.test(token)
      ? await this.prisma.userBadge.findFirst({
          where: { tokenHash: hash(token), state: 'active' },
          include: { user: { select: { id: true, organizationId: true, status: true, mustChangePassword: true, deletedAt: true } } },
        })
      : null;
    if (!badge) {
      if (pin === undefined) return { status: 'pinRequired' };
      throw invalid();
    }
    const person = badge.user;
    const policy = await loadBadgePolicy(this.prisma, person.organizationId);
    if (policy.pinRequired && pin === undefined) return { status: 'pinRequired' };
    if (person.deletedAt || !(await this.mayUse(person))) throw invalid();
    if (!policy.pinRequired) return this.succeed(badge.id, person.id);

    const now = new Date();
    if (badge.pinLockedUntil && badge.pinLockedUntil > now) {
      await context.record(person, 'locked');
      throw invalid();
    }
    // The PIN is always compared when the badge has one, so the time does not tell whether its shape was right.
    const candidate = pin !== undefined && pinShape.test(pin) ? pin : '';
    const matches = badge.pinHash ? await verifyPassword(candidate, badge.pinHash) : false;
    if (!matches) {
      const protection = await loadLoginProtection(this.prisma, person.organizationId);
      const updated = await this.prisma.userBadge.update({ where: { id: badge.id }, data: { pinFailures: { increment: 1 } }, select: { pinFailures: true } });
      if (updated.pinFailures >= protection.maxFailures) {
        await this.prisma.userBadge.update({
          where: { id: badge.id }, data: { pinFailures: 0, pinLockedUntil: new Date(now.getTime() + protection.lockMinutes * 60_000) },
        });
        await this.record(this.prisma, person.organizationId, null, person.id, 'user.badge_locked', 'The badge was locked after wrong PINs');
        await context.record(person, 'locked');
      } else {
        await context.record(person, 'failed');
      }
      throw invalid();
    }
    return this.succeed(badge.id, person.id);
  }

  private async succeed(badgeId: string, userId: string): Promise<BadgeLoginResult> {
    await this.prisma.userBadge.update({ where: { id: badgeId }, data: { pinFailures: 0, pinLockedUntil: null, lastUsedAt: new Date() } });
    return { status: 'ok', userId };
  }

  private async close(userId: string, organizationId: string, actorId: string, state: 'revoked' | 'lost', action: Action, summary: string) {
    const now = new Date();
    const closed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.userBadge.updateMany({ where: { userId, organizationId, state: 'active' }, data: { state, revokedAt: now, revokedById: actorId } });
      if (result.count === 0) return false;
      // A kiosk session of the lost badge ends with it.
      await tx.session.updateMany({ where: { userId, organizationId, viaBadge: true, revokedAt: null }, data: { revokedAt: now } });
      await this.record(tx, organizationId, actorId, userId, action, summary);
      return true;
    });
    return { closed };
  }

  private async assertInScope(userId: string, organizationId: string, scope?: Prisma.UserWhereInput) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null, ...(scope ? { AND: [scope] } : {}) }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

  private async record(client: Pick<PrismaService, 'auditLog'>, organizationId: string, actorId: string | null, userId: string, action: Action, summary: string) {
    // The token, the PIN and their hashes are never written to the audit log.
    await client.auditLog.create({ data: { organizationId, actorId, action, targetType: 'user', targetId: userId, summary } });
  }
}
