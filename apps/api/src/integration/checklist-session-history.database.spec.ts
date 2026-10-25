/// <reference types="jest" />
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import type { CurrentUser } from '../modules/auth/public.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { checklistSessionQuerySchema } from '../modules/checklists/checklists.schemas.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 332: the observer's "past sessions" block reads GET /checklist-sessions with
// status=completed&learnerId&checklistId&sort=recent&excludeSessionId, inside sessionScope().
describe('observer session history (PR 332) — database', () => {
  let prisma: PrismaService;
  let sessions: ChecklistSessionService;
  let access: ChecklistReviewAccessService;
  let organizationId: string;
  let observer: CurrentUser;
  let otherObserver: CurrentUser;
  let learner: CurrentUser;
  let otherLearner: CurrentUser;
  let checklistId: string;
  let otherChecklistId: string;
  const viewer = { isLearnerOnly: false, feedbackVisibility: 'live' as const };

  async function user(roles: CurrentUser['roles']): Promise<CurrentUser> {
    const created = await prisma.user.create({ data: { organizationId, email: `${randomUUID()}@example.test`, passwordHash: 'unused', firstName: 'Test', lastName: 'User' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId, userId: created.id, role })) });
    return { ...created, roles };
  }
  async function session(opts: { learnerId: string; observerId: string; checklist?: string; status?: 'completed' | 'scheduled' | 'cancelled'; startedAt?: Date | null }) {
    const instance = await prisma.checklistInstance.create({ data: { organizationId, checklistId: opts.checklist ?? checklistId, userId: opts.learnerId } });
    return prisma.checklistSession.create({
      data: { organizationId, instanceId: instance.id, observerId: opts.observerId, status: opts.status ?? 'completed', startedAt: opts.startedAt === undefined ? new Date() : opts.startedAt },
    });
  }
  async function history(actor: CurrentUser, extra: Record<string, string> = {}) {
    const query = checklistSessionQuerySchema.parse({ status: 'completed', learnerId: learner.id, checklistId, sort: 'recent', pageSize: '5', ...extra });
    return sessions.list(organizationId, query, await access.sessionScope(actor), viewer);
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService(); await prisma.$connect();
    access = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
    sessions = new ChecklistSessionService(prisma, new ChecklistsService(prisma, {} as UploadService));
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: 'History', slug: `history-${randomUUID()}` } });
    organizationId = org.id;
    observer = await user(['instructor']);
    otherObserver = await user(['instructor']);
    learner = await user(['learner']);
    otherLearner = await user(['learner']);
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Main', status: 'published' } })).id;
    otherChecklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Other', status: 'published' } })).id;
  });
  afterEach(async () => {
    const where = { organizationId };
    await prisma.checklistSessionEvent.deleteMany({ where });
    await prisma.checklistSession.deleteMany({ where });
    await prisma.checklistInstance.deleteMany({ where });
    await prisma.checklist.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('lists the newest completed sessions of this employee and sheet, without the open session', async () => {
    const older = await session({ learnerId: learner.id, observerId: observer.id, startedAt: new Date('2026-01-01T10:00:00Z') });
    const newer = await session({ learnerId: learner.id, observerId: observer.id, startedAt: new Date('2026-03-01T10:00:00Z') });
    const current = await session({ learnerId: learner.id, observerId: observer.id, status: 'scheduled', startedAt: null });
    await session({ learnerId: learner.id, observerId: observer.id, checklist: otherChecklistId });
    await session({ learnerId: otherLearner.id, observerId: observer.id });
    await session({ learnerId: learner.id, observerId: observer.id, status: 'cancelled' });

    const result = await history(observer, { excludeSessionId: current.id });
    expect(result.items.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(result.total).toBe(2);
  });

  it('stays inside the observer scope: another observer’s sessions never appear', async () => {
    await session({ learnerId: learner.id, observerId: otherObserver.id });
    const own = await session({ learnerId: learner.id, observerId: observer.id });
    expect((await history(observer)).items.map((item) => item.id)).toEqual([own.id]);
  });

  it('returns an empty page, not an error, when there is no history', async () => {
    expect(await history(observer)).toMatchObject({ items: [], total: 0 });
  });

  it('keeps the schedule order by default', async () => {
    expect(checklistSessionQuerySchema.parse({}).sort).toBe('scheduled');
    expect(() => checklistSessionQuerySchema.parse({ sort: 'x' })).toThrow();
  });
});
