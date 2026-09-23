/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import type { CurrentUser } from '../modules/auth/public.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 292 acceptance criteria, verified against real Postgres: bulk create's partial-success
// semantics, repeat's fresh-instance/session pair, result projection joining ChecklistInstance
// data onto ChecklistSession, participant lookup's manager-team scoping, and the published-only
// checklist lookup.
describe('checklist session admin API (PR 292) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let sessionService: ChecklistSessionService;
  let reviewAccess: ChecklistReviewAccessService;
  let organizationId: string;
  let observerId: string;
  let checklistId: string;

  function currentUser(id: string, roles: CurrentUser['roles']): CurrentUser {
    return {
      id,
      organizationId,
      email: `${id}@example.test`,
      firstName: 'Test',
      lastName: 'User',
      middleName: null,
      position: null,
      shift: null,
      phone: null,
      status: 'active',
      locale: 'en',
      timezone: 'UTC',
      roles,
    };
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    sessionService = new ChecklistSessionService(prisma, checklistsService);
    reviewAccess = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Admin API ${runId}`, slug: `admin-api-${runId}` },
    });
    organizationId = organization.id;

    const observer = await prisma.user.create({
      data: {
        organizationId,
        email: `observer-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Admin',
        lastName: 'Observer',
      },
    });
    observerId = observer.id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });

    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Admin API checklist', status: 'published' },
    });
    checklistId = checklist.id;
  });

  afterEach(async () => {
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.managerGroup.deleteMany({ where: { organizationId } });
    await prisma.groupMember.deleteMany({ where: { organizationId } });
    await prisma.group.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('bulk create: independent sessions per learner, one already-active recipient is skipped without failing the batch', async () => {
    const [learnerA, learnerB] = await Promise.all([
      prisma.user.create({ data: { organizationId, email: `a-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'A', lastName: 'Learner' } }),
      prisma.user.create({ data: { organizationId, email: `b-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'B', lastName: 'Learner' } }),
    ]);
    // Give learnerA a pre-existing active assignment for this checklist so bulk create must skip them.
    await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerA.id }, observerId);

    const result = await sessionService.bulkCreate(
      organizationId,
      { checklistId, learnerIds: [learnerA.id, learnerB.id], observerId },
      observerId,
    );

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ learnerId: learnerA.id, status: 'skipped' }),
        expect.objectContaining({ learnerId: learnerB.id, status: 'created' }),
      ]),
    );

    const sessions = await prisma.checklistSession.findMany({ where: { organizationId } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.instanceId).not.toBeNull();

    const auditEntries = await prisma.auditLog.findMany({ where: { organizationId, action: 'checklist_session.bulk_created' } });
    expect(auditEntries).toHaveLength(1);
  });

  it('repeat: creates a fresh instance/session pair from a completed session, copying observer/policy/timezone; rejects an active session', async () => {
    const learner = await prisma.user.create({ data: { organizationId, email: `learner-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'C', lastName: 'Learner' } });
    const item = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Item', points: 10, isRequired: true },
    });
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learner.id }, observerId);
    const session = await sessionService.create(
      organizationId,
      { instanceId: instance.id, observerId, locationCapturePolicy: 'required', timezone: 'Europe/Moscow' },
      observerId,
    );
    await sessionService.transition(session.id, organizationId, 'start', 1, observerId, {});

    // Can't repeat while the session itself is active.
    await expect(sessionService.repeat(session.id, organizationId, observerId, {})).rejects.toBeInstanceOf(BadRequestException);

    await sessionService.transition(session.id, organizationId, 'complete', 2, observerId, {});
    // Completing the *session* doesn't complete the underlying *instance* (they're decoupled per
    // the ADR) -- the learner must actually submit the checklist before it can be repeated,
    // exactly like a real assignment would need to finish before a fresh one can be created.
    await checklistsService.submitItemResult(instance.id, item.id, organizationId, learner.id, false, { checked: true });

    const repeated = await sessionService.repeat(session.id, organizationId, observerId, {});

    expect(repeated.instanceId).not.toBe(instance.id);
    expect(repeated.observerId).toBe(observerId);
    expect(repeated.locationCapturePolicy).toBe('required');
    expect(repeated.timezone).toBe('Europe/Moscow');
    expect(repeated.status).toBe('scheduled');

    const newInstance = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: repeated.instanceId } });
    expect(newInstance.userId).toBe(learner.id);
    expect(newInstance.checklistId).toBe(checklistId);
  });

  it('list/get project checklist/learner/observer/result from the underlying ChecklistInstance', async () => {
    const learner = await prisma.user.create({ data: { organizationId, email: `learner-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Ivan', lastName: 'Petrov' } });
    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learner.id }, observerId);
    const created = await sessionService.create(organizationId, { instanceId: instance.id, observerId }, observerId);

    const fetched = await sessionService.get(created.id, organizationId, {});
    expect(fetched.checklist).toMatchObject({ id: checklistId, title: 'Admin API checklist' });
    expect(fetched.learner).toMatchObject({ id: learner.id, firstName: 'Ivan', lastName: 'Petrov' });
    expect(fetched.observer).toMatchObject({ id: observerId });
    expect(fetched.result).toMatchObject({ instanceStatus: 'assigned', percentage: 0, passed: false, scored: true });

    const listed = await sessionService.list(organizationId, { page: 1, pageSize: 25 }, {});
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({ checklist: { title: 'Admin API checklist' } });
  });

  it('participant lookup: observer role returns instructor-role users; learner role is scoped to the manager\'s effective team', async () => {
    const manager = await prisma.user.create({ data: { organizationId, email: `manager-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Manager', lastName: 'User' } });
    await prisma.membership.create({ data: { organizationId, userId: manager.id, role: 'manager' } });

    const group = await prisma.group.create({ data: { organizationId, name: `Team ${randomUUID()}`, slug: `team-${randomUUID()}` } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: manager.id } });

    const inTeam = await prisma.user.create({ data: { organizationId, email: `in-team-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'InTeam', lastName: 'Learner' } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: inTeam.id } });
    const outsideTeam = await prisma.user.create({ data: { organizationId, email: `outside-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'Outside', lastName: 'Learner' } });

    // Observer lookup: instructor-role users only, regardless of caller.
    const observerResults = await sessionService.listParticipants(organizationId, { role: 'observer', page: 1, pageSize: 25 }, {});
    expect(observerResults.items.map((u) => u.id)).toContain(observerId);
    expect(observerResults.items.map((u) => u.id)).not.toContain(inTeam.id);

    // Learner lookup for a manager: only their effective team.
    const managerScope = await reviewAccess.participantLearnerScope(currentUser(manager.id, ['manager']));
    const managerLearners = await sessionService.listParticipants(organizationId, { role: 'learner', page: 1, pageSize: 25 }, managerScope);
    const managerLearnerIds = managerLearners.items.map((u) => u.id);
    expect(managerLearnerIds).toContain(inTeam.id);
    expect(managerLearnerIds).not.toContain(outsideTeam.id);

    // Learner lookup for admin: tenant-wide.
    const adminScope = await reviewAccess.participantLearnerScope(currentUser('admin-actor', ['admin']));
    const adminLearners = await sessionService.listParticipants(organizationId, { role: 'learner', page: 1, pageSize: 25 }, adminScope);
    const adminLearnerIds = adminLearners.items.map((u) => u.id);
    expect(adminLearnerIds).toContain(inTeam.id);
    expect(adminLearnerIds).toContain(outsideTeam.id);
  });

  it('published checklist lookup: GET-equivalent filter excludes drafts', async () => {
    await prisma.checklist.create({ data: { organizationId, title: 'Draft checklist', status: 'draft' } });

    const published = await checklistsService.listChecklists(organizationId, 'published');
    expect(published.map((c) => c.title)).toEqual(['Admin API checklist']);

    const all = await checklistsService.listChecklists(organizationId);
    expect(all).toHaveLength(2);
  });
});
