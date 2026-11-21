import { jest } from '@jest/globals';

import type { PrismaService } from '../../database/prisma.service.js';
import { LoginLockout } from './login-lockout.js';
import { buildLoginLockedMail } from './login-locked-mail.js';

const now = new Date('2026-11-21T10:00:00.000Z');
const user = { id: 'u1', organizationId: 'o1', firstName: 'Айгуль', locale: 'ru', email: 'a@example.com', loginLockedUntil: null };

function harness(options: { failures: number; policy?: { loginMaxFailures: number; loginFailureWindowMinutes: number; loginLockMinutes: number }; lockChanged?: number }) {
  const prisma = {
    organization: { findFirst: jest.fn(async () => options.policy ?? { loginMaxFailures: 5, loginFailureWindowMinutes: 15, loginLockMinutes: 15 }) },
    loginAttempt: { create: jest.fn(async () => ({})), count: jest.fn(async () => options.failures), deleteMany: jest.fn(async () => ({ count: 0 })) },
    user: { updateMany: jest.fn(async () => ({ count: options.lockChanged ?? 1 })) },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  return { prisma, lockout: new LoginLockout(prisma as unknown as PrismaService) };
}

describe('LoginLockout (PR 493)', () => {
  it('counts a failure and does not lock below the limit', async () => {
    const { prisma, lockout } = harness({ failures: 4 });

    await expect(lockout.registerFailure(user, now)).resolves.toBe(false);
    expect(prisma.loginAttempt.count).toHaveBeenCalledWith({ where: { userId: 'u1', createdAt: { gt: new Date('2026-11-21T09:45:00.000Z') } } });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('locks at the limit for the configured time, restarts the counter and writes the audit entry', async () => {
    const { prisma, lockout } = harness({ failures: 3, policy: { loginMaxFailures: 3, loginFailureWindowMinutes: 10, loginLockMinutes: 30 } });

    await expect(lockout.registerFailure(user, now)).resolves.toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { loginLockedUntil: new Date('2026-11-21T10:30:00.000Z') } }));
    expect(prisma.loginAttempt.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    const audit = prisma.auditLog.create.mock.calls[0]?.[0] as { data: { action: string; metadata: unknown } };
    expect(audit.data.action).toBe('user.login_locked');
    expect(JSON.stringify(audit.data)).not.toMatch(/password/i);
  });

  it('does not lock or notify twice when another attempt already set the lock', async () => {
    const { prisma, lockout } = harness({ failures: 6, lockChanged: 0 });

    await expect(lockout.registerFailure(user, now)).resolves.toBe(false);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('knows whether a lock is still running', () => {
    const { lockout } = harness({ failures: 0 });

    expect(lockout.isLocked({ loginLockedUntil: null }, now)).toBe(false);
    expect(lockout.isLocked({ loginLockedUntil: new Date('2026-11-21T10:00:01.000Z') }, now)).toBe(true);
    expect(lockout.isLocked({ loginLockedUntil: new Date('2026-11-21T10:00:00.000Z') }, now)).toBe(false);
  });
});

describe('buildLoginLockedMail', () => {
  it.each(['ru', 'en', 'kk', 'zh'])('has a subject and the lock time in %s, and no link', (locale) => {
    const mail = buildLoginLockedMail(locale, { firstName: 'Ann', minutes: 15 });

    expect(mail.subject.length).toBeGreaterThan(5);
    expect(mail.text).toContain('15');
    expect(mail.text).not.toMatch(/https?:\/\//);
  });
});
