import { Logger } from '@nestjs/common';

import { isMailConfigured, sendMail } from '../../common/mail/mailer.js';
import { loadLoginProtection } from '../../common/login-protection.js';
import { loginProtection } from '../../common/observability/metrics.js';
import { PrismaService } from '../../database/prisma.service.js';
import { buildLoginLockedMail } from './login-locked-mail.js';

type LockUser = { id: string; organizationId: string; firstName: string; locale: string; email: string; loginLockedUntil: Date | null };

const minuteMs = 60_000;

/**
 * PR 493: counts failed sign-ins of an existing account and locks it after a series of them.
 * Unknown emails are not counted, so nothing here can tell an outsider whether an account exists.
 */
export class LoginLockout {
  private readonly logger = new Logger(LoginLockout.name);

  constructor(private readonly prisma: PrismaService) {}

  isLocked(user: Pick<LockUser, 'loginLockedUntil'>, now = new Date()) {
    return !!user.loginLockedUntil && user.loginLockedUntil.getTime() > now.getTime();
  }

  /** Records one wrong password; returns true when this attempt locked the account. */
  async registerFailure(user: LockUser, now = new Date()): Promise<boolean> {
    const policy = await loadLoginProtection(this.prisma, user.organizationId);
    await this.prisma.loginAttempt.create({ data: { organizationId: user.organizationId, userId: user.id, createdAt: now } });
    const since = new Date(now.getTime() - policy.windowMinutes * minuteMs);
    const failures = await this.prisma.loginAttempt.count({ where: { userId: user.id, createdAt: { gt: since } } });
    if (failures < policy.maxFailures) return false;

    const lockedUntil = new Date(now.getTime() + policy.lockMinutes * minuteMs);
    // Only the attempt that finds the account unlocked sets the lock, so concurrent attempts notify once.
    const changed = await this.prisma.user.updateMany({
      where: { id: user.id, OR: [{ loginLockedUntil: null }, { loginLockedUntil: { lte: now } }] },
      data: { loginLockedUntil: lockedUntil },
    });
    if (changed.count === 0) return false;

    await this.prisma.loginAttempt.deleteMany({ where: { userId: user.id } });
    loginProtection.inc({ event: 'locked' });
    // Written straight to the audit table: the audit module depends on auth, so it cannot be imported here. Best effort, like AuditLogService.record.
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: null,
        action: 'user.login_locked',
        targetType: 'user',
        targetId: user.id,
        summary: `Sign-in to ${user.email} was locked after ${failures} failed attempts`,
        metadata: { failures, lockMinutes: policy.lockMinutes },
      },
    }).catch(() => {
      this.logger.error('Failed to record the login lock in the audit log');
    });
    if (isMailConfigured()) {
      await sendMail({ to: user.email, ...buildLoginLockedMail(user.locale, { firstName: user.firstName, minutes: policy.lockMinutes }) }).catch(() => {
        // Never log the error text or the address: provider errors can embed them.
        this.logger.warn('Login lock notification failed');
      });
    }
    return true;
  }

  /** A correct password ends the series. */
  async clear(userId: string) {
    await this.prisma.loginAttempt.deleteMany({ where: { userId } });
  }
}
