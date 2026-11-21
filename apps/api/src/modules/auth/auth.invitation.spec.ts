import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { invitationAcceptSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { verifyPassword } from './passwords.js';
import { buildInvitationMail, hashInvitationToken, resolveInvitationLocale } from './user-invitation.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const invitedUser = { id: userId, organizationId, email: 'new@example.com', firstName: 'Айгуль', locale: 'kk' };

type Record_ = { id: string; userId: string; organizationId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null; revokedAt: Date | null };

function createHarness(options: { status?: string; expired?: boolean } = {}) {
  let record: Record_ | null = null;
  let passwordHash = '';
  let status = options.status ?? 'invited';
  const audit: Array<{ action: string }> = [];

  const userInvitation = {
    updateMany: jest.fn(async ({ where, data }: { where: { id?: string; userId?: string }; data: { usedAt?: Date; revokedAt?: Date } }) => {
      if (!record || (where.id && where.id !== record.id) || (where.userId && where.userId !== record.userId) || record.usedAt || record.revokedAt) return { count: 0 };
      if (data.usedAt && record.expiresAt <= new Date()) return { count: 0 };
      Object.assign(record, data);
      return { count: 1 };
    }),
    create: jest.fn(async ({ data }: { data: Omit<Record_, 'id' | 'usedAt' | 'revokedAt'> }) => {
      record = { id: 'inv-1', ...data, usedAt: null, revokedAt: null };
      if (options.expired) record.expiresAt = new Date(0);
      return record;
    }),
    findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) =>
      record && record.tokenHash === where.tokenHash ? { ...record, user: { status, deletedAt: null } } : null),
  };
  const transaction = {
    userInvitation,
    user: { update: jest.fn(async ({ data }: { data: { passwordHash: string; status: string } }) => { passwordHash = data.passwordHash; status = data.status; }) },
    auditLog: { create: jest.fn(async ({ data }: { data: { action: string } }) => { audit.push(data); }) },
  };
  const prisma = {
    userInvitation,
    organization: { findUnique: jest.fn(async () => ({ name: 'Demo' })) },
    $transaction: jest.fn(async (input: unknown) => (typeof input === 'function' ? input(transaction) : Promise.all(input as Promise<unknown>[]))),
  } as unknown as PrismaService;
  const service = new AuthService(prisma, { send: jest.fn() } as never);
  return { service, getRecord: () => record, getPasswordHash: () => passwordHash, getStatus: () => status, audit };
}

function tokenFrom(url: string | undefined) {
  return new URL(url ?? '', 'http://x').searchParams.get('token') ?? '';
}

describe('user invitation (PR 487)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'SMTP_HOST', 'MAIL_FROM']) delete process.env[key];
    process.env['FRONTEND_URL'] = 'https://app.example.com/';
  });
  afterAll(() => { process.env = saved; });

  it('stores only the hash and hands the link over once when mail is not set up', async () => {
    const harness = createHarness();
    const issued = await harness.service.issueInvitationFor(invitedUser, null);

    expect(issued.delivered).toBe(false);
    expect(issued.inviteUrl).toMatch(/^https:\/\/app\.example\.com\/invitation\?token=/);
    const token = tokenFrom(issued.inviteUrl);
    expect(harness.getRecord()?.tokenHash).toBe(hashInvitationToken(token));
    expect(harness.getRecord()?.tokenHash).not.toContain(token);
    expect(issued.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
  });

  it('sets the password, activates the user, writes the audit entry, and works only once', async () => {
    const harness = createHarness();
    const token = tokenFrom((await harness.service.issueInvitationFor(invitedUser, null)).inviteUrl);

    await expect(harness.service.acceptInvitation({ token, password: 'NewPassword1!' })).resolves.toEqual({ accepted: true });
    expect(harness.getStatus()).toBe('active');
    expect(await verifyPassword('NewPassword1!', harness.getPasswordHash())).toBe(true);
    expect(harness.audit.map((entry) => entry.action)).toEqual(['user.invitation.accepted']);
    await expect(harness.service.acceptInvitation({ token, password: 'AnotherPass1!' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown, expired, and already-active cases with the same answer', async () => {
    const unknown = createHarness();
    await expect(unknown.service.acceptInvitation({ token: 'x'.repeat(43), password: 'NewPassword1!' })).rejects.toBeInstanceOf(BadRequestException);

    const expired = createHarness({ expired: true });
    const expiredToken = tokenFrom((await expired.service.issueInvitationFor(invitedUser, null)).inviteUrl);
    await expect(expired.service.acceptInvitation({ token: expiredToken, password: 'NewPassword1!' })).rejects.toBeInstanceOf(BadRequestException);

    const active = createHarness({ status: 'active' });
    const activeToken = tokenFrom((await active.service.issueInvitationFor(invitedUser, null)).inviteUrl);
    await expect(active.service.acceptInvitation({ token: activeToken, password: 'NewPassword1!' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies the strong password rule to the accepted password', () => {
    const token = 'x'.repeat(43);
    expect(() => invitationAcceptSchema.parse({ token, password: 'short' })).toThrow();
    expect(invitationAcceptSchema.parse({ token, password: 'NewPassword1!' }).password).toBe('NewPassword1!');
  });

  it('writes the mail in the language of the invited person, with the link and lifetime', () => {
    const params = { firstName: 'Anna', organizationName: 'Demo', link: 'https://app.example.com/invitation?token=abc', days: 7 };
    const subjects = (['ru', 'en', 'kk', 'zh'] as const).map((locale) => {
      const mail = buildInvitationMail(locale, params);
      expect(mail.text).toContain(params.link);
      expect(mail.text).toContain('Demo');
      expect(mail.text).not.toContain('\\n');
      return mail.subject;
    });
    expect(new Set(subjects).size).toBe(4);
    expect(buildInvitationMail('en', params).subject).toBe('Invitation to Demo');
    expect(resolveInvitationLocale('kk-KZ')).toBe('kk');
    expect(resolveInvitationLocale('de')).toBe('ru');
    expect(resolveInvitationLocale(null)).toBe('ru');
  });
});
