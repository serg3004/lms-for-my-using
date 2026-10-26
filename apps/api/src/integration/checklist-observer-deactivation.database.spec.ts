/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import type { CurrentUser } from '../modules/auth/public.js';
import { CHECKLIST_OBSERVER_DEACTIVATED_NOTIFY_JOB } from '../modules/checklists/public.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { UsersService } from '../modules/users/users.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('observer deactivation notices (PR 346) — database', () => {
  let prisma: PrismaService;
  let users: UsersService;
  let sessions: ChecklistSessionService;
  let checklists: ChecklistsService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let admin: CurrentUser;
  let secondAdmin: CurrentUser;
  let observer: CurrentUser;
  let learner: CurrentUser;
  let foreignAdmin: CurrentUser;
  let checklistId: string;
  async function user(org: string, roles: CurrentUser['roles']): Promise<CurrentUser> {
    const row = await prisma.user.create({ data: { organizationId: org, email: `${randomUUID()}@example.test`, firstName: 'Private', lastName: 'Person', passwordHash: 'unused' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId: org, userId: row.id, role })) });
    return { ...row, roles };
  }
  async function openSession() {
    const instance = await checklists.assignChecklist(checklistId, organizationId, { userId: learner.id }, admin.id);
    return sessions.create(organizationId, { instanceId: instance.id, observerId: observer.id }, admin.id);
  }
  const actor = () => ({ ...admin, organizationId, roles: ['admin' as const] }) as never;
  function notices() { return prisma.notification.findMany({ where: { organizationId, type: 'checklist_session_observer_deactivated' }, orderBy: { userId: 'asc' } }); }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService(); await prisma.$connect();
    users = new UsersService(prisma);
    checklists = new ChecklistsService(prisma, {} as UploadService);
    sessions = new ChecklistSessionService(prisma, checklists);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    organizationId = (await prisma.organization.create({ data: { name: 'Deactivation', slug: `deactivation-${randomUUID()}` } })).id;
    foreignOrganizationId = (await prisma.organization.create({ data: { name: 'Foreign', slug: `foreign-${randomUUID()}` } })).id;
    admin = await user(organizationId, ['admin']); secondAdmin = await user(organizationId, ['admin']);
    observer = await user(organizationId, ['instructor']); learner = await user(organizationId, ['learner']);
    foreignAdmin = await user(foreignOrganizationId, ['admin']);
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Opening shift', status: 'published' } })).id;
  });
  afterEach(async () => {
    const where = { organizationId: { in: [organizationId, foreignOrganizationId] } };
    for (const org of [organizationId, foreignOrganizationId]) await prisma.outboxEvent.deleteMany({ where: { payload: { path: ['organizationId'], equals: org } } });
    await prisma.notification.deleteMany({ where }); await prisma.checklistIdempotencyKey.deleteMany({ where });
    await prisma.checklistSessionReminder.deleteMany({ where }); await prisma.checklistSessionEvent.deleteMany({ where });
    await prisma.checklistSession.deleteMany({ where }); await prisma.checklistInstance.deleteMany({ where });
    await prisma.checklist.deleteMany({ where }); await prisma.auditLog.deleteMany({ where });
    await prisma.membership.deleteMany({ where }); await prisma.user.deleteMany({ where });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, foreignOrganizationId] } } });
  });

  it('notifies every active admin of the organization once, and only admins of that organization', async () => {
    await openSession();
    await expect(users.getObserverSessionImpact(observer.id, actor())).resolves.toEqual({ observerSessions: 1 });
    await expect(users.updateUserStatus(observer.id, actor(), 'suspended')).resolves.toMatchObject({ status: 'suspended', observerSessions: 1 });
    const rows = await notices();
    expect(rows.map((row) => row.userId).sort()).toEqual([admin.id, secondAdmin.id].sort());
    expect(rows.some((row) => row.userId === foreignAdmin.id)).toBe(false);
    expect(rows.every((row) => row.link === `/admin/checklists/sessions?observerId=${observer.id}`)).toBe(true);
    const outbox = await prisma.outboxEvent.findMany({ where: { topic: CHECKLIST_OBSERVER_DEACTIVATED_NOTIFY_JOB, payload: { path: ['organizationId'], equals: organizationId } } });
    expect(outbox).toHaveLength(2);
    expect(JSON.stringify({ rows, outbox })).not.toMatch(/Private|@|Opening shift/);
  });

  it('does not repeat the notices for the same status, and creates none without open sessions', async () => {
    await users.updateUserStatus(observer.id, actor(), 'suspended');
    expect(await notices()).toHaveLength(0);
    await users.updateUserStatus(observer.id, actor(), 'active');
    await openSession();
    await users.updateUserStatus(observer.id, actor(), 'suspended');
    await users.updateUserStatus(observer.id, actor(), 'suspended');
    expect(await notices()).toHaveLength(2);
  });

  it('ignores sessions of other observers and completed or deleted sessions', async () => {
    const created = await openSession();
    await prisma.checklistSession.update({ where: { id: created.id }, data: { status: 'completed' } });
    await expect(users.getObserverSessionImpact(observer.id, actor())).resolves.toEqual({ observerSessions: 0 });
    await prisma.checklistSession.update({ where: { id: created.id }, data: { status: 'scheduled', deletedAt: new Date() } });
    await expect(users.getObserverSessionImpact(observer.id, actor())).resolves.toEqual({ observerSessions: 0 });
    await expect(users.getObserverSessionImpact(learner.id, actor())).resolves.toEqual({ observerSessions: 0 });
  });

  it('answers 404 for a user of another organization', async () => {
    await expect(users.getObserverSessionImpact(foreignAdmin.id, actor())).rejects.toThrow('User not found');
    await expect(users.updateUserStatus(foreignAdmin.id, actor(), 'suspended')).rejects.toThrow('User not found');
  });
});
