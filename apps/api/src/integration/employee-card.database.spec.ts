/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 507: the employee card opened by scanning a badge — real HTTP stack and Postgres.
const PASSWORD = 'Invite1!Invite';

describe('Employee card by badge scan — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  let adminId: string;
  let adminHeaders: Record<string, string>;
  let learnerId: string;
  let learnerEmail: string;
  let learnerHeaders: Record<string, string>;
  let managerHeaders: Record<string, string>;
  let peerHeaders: Record<string, string>;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { ApiExceptionFilter } = await import('../common/filters/api-exception.filter.js');
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const express = testingModule.createNestApplication<NestExpressApplication>({ bodyParser: false });
    express.useBodyParser('json');
    app = express;
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Card ${runId}`, slug: `card-${runId}` } })).id;
    const person = async (label: string, role: 'admin' | 'manager' | 'learner') => {
      const email = `${label}-${runId}@example.test`;
      const user = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'Тест' } });
      await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
      return { id: user.id, email };
    };
    const admin = await person('admin', 'admin');
    const manager = await person('manager', 'manager');
    const learner = await person('learner', 'learner');
    const peer = await person('peer', 'learner');
    adminId = admin.id;
    learnerId = learner.id;
    learnerEmail = learner.email;
    adminHeaders = await signIn(admin.email);
    managerHeaders = await signIn(manager.email);
    learnerHeaders = await signIn(learner.email);
    peerHeaders = await signIn(peer.email);
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.badgeScanLog.deleteMany({ where: { organizationId } });
        await prisma.assignment.deleteMany({ where: { organizationId } });
        await prisma.course.deleteMany({ where: { organizationId } });
        await prisma.notification.deleteMany({ where: { organizationId } });
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  const unwrap = async <T>(response: Response) => {
    const body = (await response.json()) as { data?: T } & T;
    return (body.data ?? body) as T;
  };
  async function signIn(email: string) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, email, password: PASSWORD }) });
    const body = await unwrap<{ accessToken: string }>(response);
    return { authorization: `Bearer ${body.accessToken}` };
  }
  const call = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown) => fetch(`${baseUrl}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  type Issued = { userId: string; token: string; pin: string };
  const issue = async (userId: string) => (await unwrap<{ items: Issued[] }>(await call('POST', '/users/badges', adminHeaders, { userIds: [userId] }))).items[0]!;
  const open = (token: string, headers: Record<string, string>) => call('POST', '/employee-card/open', headers, { token });
  type Card = { level: string; detail: boolean; blocks: string[]; subject: Record<string, unknown>; clearance?: { ok: boolean }; courses?: Array<{ title: string; status: string }>; certificates?: unknown[] };

  it('shows the administrator everything, records the view, and tells the employee who looked', async () => {
    const badge = await issue(learnerId);
    const card = await unwrap<Card>(await open(badge.token, adminHeaders));
    expect(card).toMatchObject({ level: 'admin', detail: true, blocks: ['courses', 'certificates', 'checklists', 'clearance'], clearance: { ok: true } });
    expect(card.subject).toMatchObject({ name: 'Тест learner', email: learnerEmail });
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.card_viewed', targetId: learnerId, actorId: adminId } })).toBe(1);

    const views = await unwrap<{ items: Array<{ viewer: string | null }> }>(await call('GET', '/employee-card/views', learnerHeaders));
    expect(views.items[0]?.viewer).toBe('Тест admin');
    // The employee opening their own card is not a view.
    expect((await unwrap<Card>(await open(badge.token, learnerHeaders))).level).toBe('self');
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.card_viewed', targetId: learnerId } })).toBe(1);
  });

  it('shows a colleague only what the administrator allows and no contacts', async () => {
    const badge = await issue(learnerId);
    const policy = await call('PATCH', `/employee-card/policy/${organizationId}`, adminHeaders, { blocks: ['clearance'] });
    expect(policy.status).toBe(200);
    const card = await unwrap<Card>(await open(badge.token, peerHeaders));
    expect(card).toMatchObject({ level: 'peer', detail: false, blocks: ['clearance'] });
    expect(card.courses).toBeUndefined();
    expect(card.subject.email).toBeUndefined();
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'organization.employee_card_updated' } })).toBe(1);
    // The manager without a team sees a colleague's card too, not the detail.
    expect((await unwrap<Card>(await open(badge.token, managerHeaders))).detail).toBe(false);
    expect((await call('PATCH', `/employee-card/policy/${organizationId}`, peerHeaders, { blocks: [] })).status).toBe(403);
  });

  it('counts an overdue course against the admission and lists it', async () => {
    const badge = await issue(learnerId);
    const course = await prisma.course.create({ data: { organizationId, title: 'Охрана труда', slug: `course-${randomUUID()}`, status: 'published' } });
    await prisma.assignment.create({ data: { organizationId, courseId: course.id, userId: learnerId, dueAt: new Date(Date.now() - 86_400_000) } });
    const card = await unwrap<Card>(await open(badge.token, adminHeaders));
    expect(card.clearance?.ok).toBe(false);
    expect(card.courses).toEqual([expect.objectContaining({ title: 'Охрана труда', status: 'overdue' })]);
  });

  it('answers the same 404 for an unknown, a revoked and a foreign badge, and 401 without a session', async () => {
    const badge = await issue(learnerId);
    expect((await open('A'.repeat(43), adminHeaders)).status).toBe(404);
    expect((await open(badge.token, {})).status).toBe(401);
    const stranger = await prisma.organization.create({ data: { name: `Other ${randomUUID()}`, slug: `other-${randomUUID()}` } });
    try {
      const outsider = await prisma.user.create({ data: { organizationId: stranger.id, email: `out-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Out', lastName: 'Side' } });
      await prisma.membership.create({ data: { organizationId: stranger.id, userId: outsider.id, role: 'admin' } });
      const { hashPassword } = await import('../modules/auth/passwords.js');
      await prisma.user.update({ where: { id: outsider.id }, data: { passwordHash: await hashPassword(PASSWORD) } });
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId: stranger.id, email: (await prisma.user.findUniqueOrThrow({ where: { id: outsider.id } })).email, password: PASSWORD }) });
      const foreign = { authorization: `Bearer ${(await unwrap<{ accessToken: string }>(response)).accessToken}` };
      expect((await open(badge.token, foreign)).status).toBe(404);
    } finally {
      await prisma.session.deleteMany({ where: { organizationId: stranger.id } });
      await prisma.membership.deleteMany({ where: { organizationId: stranger.id } });
      await prisma.user.deleteMany({ where: { organizationId: stranger.id } });
      await prisma.organization.delete({ where: { id: stranger.id } });
    }
    await call('DELETE', `/users/${learnerId}/badge`, adminHeaders);
    expect((await open(badge.token, adminHeaders)).status).toBe(404);
  });

  it('keeps a journal of scans without a session and tells the administrators about a series once', async () => {
    const badge = await issue(learnerId);
    const scan = (token: string) => call('POST', '/employee-card/anonymous-scan', {}, { token });
    expect((await scan('B'.repeat(43))).status).toBe(200);
    expect(await prisma.badgeScanLog.count({ where: { organizationId } })).toBe(0);
    for (let index = 0; index < 6; index += 1) expect((await scan(badge.token)).status).toBe(200);
    expect(await prisma.badgeScanLog.count({ where: { organizationId, userId: learnerId } })).toBe(6);
    expect(await prisma.notification.count({ where: { organizationId, userId: adminId, type: 'badge_scan_series' } })).toBe(1);
  });

  it('lets an outside inspector open only the card, with only the allowed facts, until the access ends', async () => {
    const badge = await issue(learnerId);
    const email = `inspector-${randomUUID()}@example.test`;
    const accessUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const created = await call('POST', '/employee-card/inspectors', adminHeaders, { email, firstName: 'Ирина', lastName: 'Проверяющая', visible: ['photo', 'clearance'], accessUntil });
    expect(created.status).toBe(201);
    const inspector = await prisma.user.findFirstOrThrow({ where: { organizationId, email } });
    // The invitation is accepted elsewhere; here the account gets a password directly.
    const { hashPassword } = await import('../modules/auth/passwords.js');
    await prisma.user.update({ where: { id: inspector.id }, data: { status: 'active', passwordHash: await hashPassword(PASSWORD) } });
    const headers = await signIn(email);

    const card = await unwrap<Card>(await open(badge.token, headers));
    expect(card).toMatchObject({ level: 'inspector', detail: false, blocks: ['clearance'] });
    expect(card.clearance).toEqual({ ok: expect.any(Boolean) });
    expect(Object.keys(card.subject).sort()).toEqual(['hasPhoto', 'name']);
    const restricted = await call('GET', '/assignments', headers);
    expect(restricted.status).toBe(403);
    expect(JSON.stringify(await restricted.json())).toContain('INSPECTOR_SESSION_RESTRICTED');
    expect((await call('POST', '/employee-card/checked', headers, { token: badge.token })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.card_checked', actorId: inspector.id } })).toBe(1);

    const listed = await unwrap<{ items: Array<{ email: string; state: string }> }>(await call('GET', '/employee-card/inspectors', adminHeaders));
    expect(listed.items.find((item) => item.email === email)?.state).toBe('active');
    expect((await call('GET', '/employee-card/inspectors', headers)).status).toBe(403);

    await prisma.externalInspector.update({ where: { userId: inspector.id }, data: { accessUntil: new Date(Date.now() - 1000) } });
    expect((await open(badge.token, headers)).status).toBe(401);
    await prisma.externalInspector.update({ where: { userId: inspector.id }, data: { accessUntil: new Date(Date.now() + 86_400_000) } });
    expect((await open(badge.token, headers)).status).toBe(200);
    expect((await call('DELETE', `/employee-card/inspectors/${inspector.id}`, adminHeaders)).status).toBe(200);
    expect((await open(badge.token, headers)).status).toBe(401);
  });

  it('refuses an inspector term in the past or longer than 90 days', async () => {
    const make = (accessUntil: string) => call('POST', '/employee-card/inspectors', adminHeaders, { email: `late-${randomUUID()}@example.test`, firstName: 'A', lastName: 'B', accessUntil });
    expect((await make(new Date(Date.now() - 1000).toISOString())).status).toBe(409);
    expect((await make(new Date(Date.now() + 120 * 86_400_000).toISOString())).status).toBe(409);
  });
});
