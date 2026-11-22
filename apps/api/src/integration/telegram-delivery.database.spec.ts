/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 503: sending an invitation or a temporary password through the Telegram bot — real HTTP stack and Postgres,
// the Bot API itself is replaced by a recording gateway.
const PASSWORD = 'Invite1!Invite';
const SECRET = 'webhook-secret-for-tests-123';

describe('Telegram delivery — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  let adminHeaders: Record<string, string>;
  let adminId: string;
  const sent: Array<{ chatId: string; text: string }> = [];
  let failNext: Error | null = null;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_BOT_USERNAME = 'lms_test_bot';
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    process.env.FRONTEND_URL = 'https://app.example.test';
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { ApiExceptionFilter } = await import('../common/filters/api-exception.filter.js');
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const { telegramGateway } = await import('../common/telegram/telegram.js');
    telegramGateway.send = async (chatId: string, text: string) => {
      if (failNext) { const error = failNext; failNext = null; throw error; }
      sent.push({ chatId, text });
    };
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Telegram ${runId}`, slug: `tg-${runId}` } })).id;
    const email = `admin-${runId}@example.test`;
    const admin = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: 'Admin', lastName: 'User' } });
    adminId = admin.id;
    await prisma.membership.create({ data: { organizationId, userId: admin.id, role: 'admin' } });
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, email, password: PASSWORD }) });
    const body = (await response.json()) as { accessToken?: string; data?: { accessToken: string } };
    adminHeaders = { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = adminHeaders) => fetch(`${baseUrl}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const unwrap = async <T>(response: Response) => {
    const body = (await response.json()) as { data?: T } & T;
    return (body.data ?? body) as T;
  };
  const enable = (value: boolean) => call('PATCH', `/organizations/${organizationId}/features`, { longreadEnabled: false, telegramDeliveryEnabled: value });
  const webhook = (text: string, chatId: number, secret: string | null = SECRET) => fetch(`${baseUrl}/api/v1/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
    body: JSON.stringify({ update_id: 1, message: { chat: { id: chatId, type: 'private' }, text } }),
  });
  const codeOf = (botLink: string) => new URL(botLink).searchParams.get('start')!;
  const createInvited = async (extra: Record<string, unknown> = {}) => {
    const created = await call('POST', '/users', { organizationId, email: `p-${randomUUID()}@example.test`, firstName: 'Айгуль', lastName: 'Каримова', ...extra });
    expect(created.status).toBe(201);
    return (await unwrap<{ id: string }>(created)).id;
  };
  const forgetRecentSends = (userId: string) => prisma.messageDelivery.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) } });

  it('stays closed until an administrator switches the channel on', async () => {
    const userId = await createInvited();
    const status = await unwrap<{ configured: boolean; enabled: boolean; botUsername: string }>(await call('GET', '/users/telegram-delivery'));
    expect(status).toEqual({ configured: true, enabled: false, botUsername: 'lms_test_bot' });
    expect((await call('POST', `/users/${userId}/telegram/invitation`)).status).toBe(409);
    expect((await enable(true)).status).toBe(200);
    expect((await unwrap<{ enabled: boolean }>(await call('GET', '/users/telegram-delivery'))).enabled).toBe(true);
  });

  it('gives a bot link first, then sends the invitation only after the person pressed Start', async () => {
    await enable(true);
    const userId = await createInvited();
    const invitationsBefore = await prisma.userInvitation.count({ where: { userId } });
    const first = await call('POST', `/users/${userId}/telegram/invitation`);
    expect(first.status).toBe(201);
    const waiting = await unwrap<{ status: string; botLink: string }>(first);
    expect(waiting.status).toBe('awaiting_start');
    expect(waiting.botLink.startsWith('https://t.me/lms_test_bot?start=')).toBe(true);
    // Nothing secret was created or sent yet.
    expect(await prisma.userInvitation.count({ where: { userId } })).toBe(invitationsBefore);
    expect(sent).toHaveLength(0);
    // Repeating at once is refused.
    expect((await call('POST', `/users/${userId}/telegram/invitation`)).status).toBe(429);

    const code = codeOf(waiting.botLink);
    sent.length = 0;
    expect((await webhook(`/start ${code}`, 555001)).status).toBe(200);
    expect(sent.map((message) => message.chatId)).toEqual(['555001', '555001']);
    expect(sent[0]!.text).toContain('Telegram подключён');
    expect(sent[1]!.text).toMatch(/https:\/\/app\.example\.test\/invitation\?token=[\w-]{20,}/);
    expect(await prisma.userTelegramLink.count({ where: { userId } })).toBe(1);
    expect(await prisma.userInvitation.count({ where: { userId } })).toBe(invitationsBefore + 1);

    // The code works once.
    sent.length = 0;
    await webhook(`/start ${code}`, 555001);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('недействительна');

    // The journal and the audit log carry no link and no password.
    const journal = JSON.stringify(await prisma.messageDelivery.findMany({ where: { userId } }));
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { organizationId, targetId: userId, action: { startsWith: 'user.telegram_' } } }));
    expect(journal + audit).not.toMatch(/token=|555001|temporary/i);
    expect((await prisma.messageDelivery.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map((row) => row.status)).toEqual(['awaiting_start', 'sent']);
    const history = await unwrap<{ linked: boolean; items: Array<{ status: string }> }>(await call('GET', `/users/${userId}/deliveries`));
    expect(history.linked).toBe(true);
    expect(history.items).toHaveLength(2);
  });

  it('sends straight away to a bound person, reports a delivery failure and sends a password only on the explicit action', async () => {
    await enable(true);
    const userId = await createInvited();
    const waiting = await unwrap<{ botLink: string }>(await call('POST', `/users/${userId}/telegram/invitation`));
    await webhook(`/start ${codeOf(waiting.botLink)}`, 555002);
    await forgetRecentSends(userId);

    sent.length = 0;
    const direct = await unwrap<{ status: string }>(await call('POST', `/users/${userId}/telegram/invitation`));
    expect(direct.status).toBe('sent');
    expect(sent).toHaveLength(1);

    await forgetRecentSends(userId);
    const { TelegramSendError } = await import('../common/telegram/telegram.js');
    failNext = new TelegramSendError('blocked');
    const failed = await unwrap<{ status: string; reason: string }>(await call('POST', `/users/${userId}/telegram/invitation`));
    expect(failed).toEqual({ status: 'failed', reason: 'blocked' });
    expect((await prisma.messageDelivery.findFirst({ where: { userId, status: 'failed' } }))?.errorCode).toBe('blocked');

    // A temporary password: only for an active person, and it reaches only their bound chat.
    expect((await call('POST', `/users/${userId}/telegram/temporary-password`)).status).toBe(409);
    const activeId = await createInvited({ password: 'Chosen7!Chosen-Pass' });
    const activeWaiting = await unwrap<{ botLink: string }>(await call('POST', `/users/${activeId}/telegram/temporary-password`));
    sent.length = 0;
    await webhook(`/start ${codeOf(activeWaiting.botLink)}`, 555003);
    expect(sent).toHaveLength(2);
    const password = /: (\S+)\n/.exec(sent[1]!.text)?.[1];
    expect(password).toBeTruthy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: activeId } })).mustChangePassword).toBe(true);
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { organizationId, targetId: activeId } }));
    expect(audit).not.toContain(password!);
  });

  it('answers the same way to a wrong code, an old code and another person\'s chat, and checks the webhook secret', async () => {
    await enable(true);
    const first = await createInvited();
    const second = await createInvited();
    const waiting = await unwrap<{ botLink: string }>(await call('POST', `/users/${first}/telegram/invitation`));
    await webhook(`/start ${codeOf(waiting.botLink)}`, 555004);
    const other = await unwrap<{ botLink: string }>(await call('POST', `/users/${second}/telegram/invitation`));

    sent.length = 0;
    // The chat of the first person cannot be bound to the second one.
    await webhook(`/start ${codeOf(other.botLink)}`, 555004);
    await webhook('/start nonexistent-code-1234567890', 555009);
    await webhook('/start', 555009);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((message) => message.text)).size).toBe(1);
    expect(await prisma.userTelegramLink.count({ where: { userId: second } })).toBe(0);

    expect((await webhook('/start x', 555009, 'wrong-secret')).status).toBe(403);
    expect((await webhook('/start x', 555009, null)).status).toBe(403);
    // Other text is ignored.
    sent.length = 0;
    await webhook('hello', 555009);
    expect(sent).toHaveLength(0);
  });

  it('refuses people the sender may not reach, people who cannot be invited and a spent daily limit', async () => {
    await enable(true);
    expect((await call('POST', `/users/${randomUUID()}/telegram/invitation`)).status).toBe(404);
    expect((await call('POST', `/users/${adminId}/telegram/invitation`)).status).toBe(409);
    expect((await call('POST', `/users/${adminId}/telegram/temporary-password`)).status).toBe(409);
    expect((await call('POST', `/users/${await createInvited()}/telegram/invitation`, undefined, {})).status).toBe(401);

    const alreadySent = await prisma.messageDelivery.count({ where: { organizationId, status: 'sent' } });
    process.env.TELEGRAM_DAILY_LIMIT = String(alreadySent + 1);
    try {
      const userId = await createInvited();
      expect((await call('POST', `/users/${userId}/telegram/invitation`)).status).toBe(201);
      await prisma.messageDelivery.create({ data: { organizationId, userId, channel: 'telegram', kind: 'invitation', status: 'sent' } });
      await prisma.messageDelivery.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });
      expect((await call('POST', `/users/${userId}/telegram/invitation`)).status).toBe(429);
    } finally {
      delete process.env.TELEGRAM_DAILY_LIMIT;
    }
  });

  it('sends the activation page, not a link with a secret, to a person without a mailbox', async () => {
    await enable(true);
    const employeeNumber = `T-${randomUUID().slice(0, 8)}`;
    const created = await call('POST', '/users', { organizationId, firstName: 'Олег', lastName: 'Петров', activateByIdentity: true, customFields: { employee_number: employeeNumber } });
    expect(created.status).toBe(201);
    const userId = (await unwrap<{ id: string }>(created)).id;
    const waiting = await unwrap<{ botLink: string }>(await call('POST', `/users/${userId}/telegram/invitation`));
    sent.length = 0;
    await webhook(`/start ${codeOf(waiting.botLink)}`, 555005);
    expect(sent[1]!.text).toContain('https://app.example.test/activate');
    expect(sent[1]!.text).not.toContain('token=');
    expect(await prisma.userInvitation.count({ where: { userId } })).toBe(0);
  });
});
