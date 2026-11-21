import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { passwordResetConfirmSchema, passwordResetRequestSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { PasswordResetMessage } from './password-reset.js';
import { hashPassword, verifyPassword } from './passwords.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function createHarness(options: { userExists?: boolean; expired?: boolean } = {}) {
  let passwordHash = '';
  let resetRecord: {
    id: string;
    userId: string;
    organizationId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
  } | null = null;
  let delivered: PasswordResetMessage | undefined;
  let sessionsRevoked = false;

  const passwordResetToken = {
    updateMany: jest.fn(async ({ where, data }: { where: { id?: string }; data: { usedAt: Date } }) => {
      if (where.id && resetRecord?.id === where.id && !resetRecord.usedAt && resetRecord.expiresAt > new Date()) {
        resetRecord.usedAt = data.usedAt;
        return { count: 1 };
      }
      return { count: 0 };
    }),
    create: jest.fn(({ data }: { data: Omit<NonNullable<typeof resetRecord>, 'id' | 'usedAt'> }) => {
      resetRecord = { id: 'reset-id', ...data, usedAt: null };
      if (options.expired) resetRecord.expiresAt = new Date(0);
      return Promise.resolve(resetRecord);
    }),
    findUnique: jest.fn(async () => resetRecord),
  };
  const passwordHistory = {
    findMany: jest.fn(async () => []),
    create: jest.fn(async () => ({})),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  };
  const transaction = {
    passwordResetToken,
    user: { update: jest.fn(async ({ data }: { data: { passwordHash: string } }) => { passwordHash = data.passwordHash; }) },
    passwordHistory,
    loginAttempt: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    session: { updateMany: jest.fn(async () => { sessionsRevoked = true; return { count: 1 }; }) },
  };
  const prisma = {
    user: {
      findFirst: jest.fn(async () => options.userExists === false ? null : { id: userId, organizationId, email: 'learner@example.com' }),
      findUnique: jest.fn(async () => ({ id: userId, organizationId, email: 'learner@example.com', firstName: 'Lena', lastName: 'Learner', middleName: null, passwordHash: 'scrypt:old:00' })),
    },
    passwordHistory,
    organization: { findUnique: jest.fn(async () => ({ passwordMinLength: 10, passwordHistoryCount: 3 })), findFirst: jest.fn(async ({ where }: { where: { slug: string } }) => where.slug === 'demo-company' ? { id: organizationId } : null) },
    passwordResetToken,
    $transaction: jest.fn(async (input: unknown) => {
      if (typeof input === 'function') return input(transaction);
      return Promise.all(input as Promise<unknown>[]);
    }),
  } as unknown as PrismaService;
  const delivery = { send: jest.fn(async (message: PasswordResetMessage) => { delivered = message; }) };
  const service = new AuthService(prisma, delivery as never);

  return { service, delivery, getDelivered: () => delivered, getPasswordHash: () => passwordHash, sessionsRevoked: () => sessionsRevoked };
}

describe('password reset flow', () => {
  const request = { organizationId, email: 'learner@example.com' };

  it('normalizes request input and returns the same response for known and unknown users', async () => {
    const input = passwordResetRequestSchema.parse({ organizationId, email: ' Learner@Example.COM ' });
    const known = createHarness();
    const unknown = createHarness({ userExists: false });

    expect(input.email).toBe(request.email);
    await expect(known.service.requestPasswordReset(input)).resolves.toEqual({ accepted: true });
    await expect(unknown.service.requestPasswordReset(input)).resolves.toEqual({ accepted: true });
    expect(known.delivery.send).toHaveBeenCalledTimes(1);
    expect(unknown.delivery.send).not.toHaveBeenCalled();
  });

  it('accepts the short organization name like the sign-in form and answers the same for an unknown name', async () => {
    const byName = createHarness();
    const unknownName = createHarness();
    const input = passwordResetRequestSchema.parse({ organizationId: ' Demo-Company ', email: 'learner@example.com' });

    expect(input.organizationId).toBe('demo-company');
    await expect(byName.service.requestPasswordReset(input)).resolves.toEqual({ accepted: true });
    expect(byName.delivery.send).toHaveBeenCalledTimes(1);
    await expect(unknownName.service.requestPasswordReset({ ...input, organizationId: 'no-such-company' })).resolves.toEqual({ accepted: true });
    expect(unknownName.delivery.send).not.toHaveBeenCalled();
    expect(() => passwordResetRequestSchema.parse({ organizationId: 'bad name!', email: 'learner@example.com' })).toThrow();
  });

  it('changes the password, consumes the token, and revokes existing sessions', async () => {
    const harness = createHarness();
    const oldHash = await hashPassword('OldPassword1!');
    await harness.service.requestPasswordReset(request);
    const token = harness.getDelivered()!.token;

    await expect(harness.service.confirmPasswordReset({ token, password: 'NewPassword123' })).resolves.toEqual({ accepted: true });
    expect(await verifyPassword('NewPassword123', harness.getPasswordHash())).toBe(true);
    expect(await verifyPassword('OldPassword1!', harness.getPasswordHash() || oldHash)).toBe(false);
    expect(harness.sessionsRevoked()).toBe(true);
    await expect(harness.service.confirmPasswordReset({ token, password: 'AnotherPass123' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects expired and unknown tokens', async () => {
    const expired = createHarness({ expired: true });
    await expired.service.requestPasswordReset(request);

    await expect(expired.service.confirmPasswordReset({ token: expired.getDelivered()!.token, password: 'NewPassword123' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(createHarness().service.confirmPasswordReset({ token: 'x'.repeat(43), password: 'NewPassword123' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates token and strong password input', () => {
    expect(() => passwordResetConfirmSchema.parse({ token: 'short', password: 'weak' })).toThrow();
    expect(() => passwordResetConfirmSchema.parse({ token: 'a'.repeat(32), password: 'StrongPass1!' })).not.toThrow();
  });
});
