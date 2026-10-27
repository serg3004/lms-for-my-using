/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 353 acceptance criteria, verified against real Postgres:
// - the catalog lists only published `free` checklists of the caller's organization;
// - a user starts a free checklist for themselves; starting again is idempotent, also when two
//   starts race (advisory lock), and never creates a second unfinished instance;
// - a non-free, draft, deleted or foreign-organization checklist cannot be started (404);
// - `accessMode` defaults to `assigned` for existing and new checklists.
describe('checklist free access mode (PR 353) — database', () => {
  let prisma: PrismaService;
  let service: ChecklistsService;
  let organizationId: string;
  let otherOrganizationId: string;
  let userId: string;
  let otherUserId: string;
  let outsiderId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ChecklistsService(prisma, {} as UploadService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Free access ${runId}`, slug: `free-access-${runId}` } });
    const other = await prisma.organization.create({ data: { name: `Free access other ${runId}`, slug: `free-access-other-${runId}` } });
    organizationId = organization.id;
    otherOrganizationId = other.id;
    const makeUser = (orgId: string, label: string) =>
      prisma.user.create({
        data: { organizationId: orgId, email: `${label}-${runId}@example.test`, passwordHash: 'not-used', firstName: label, lastName: 'User' },
      });
    userId = (await makeUser(organizationId, 'first')).id;
    otherUserId = (await makeUser(organizationId, 'second')).id;
    outsiderId = (await makeUser(otherOrganizationId, 'outsider')).id;
  });

  afterEach(async () => {
    for (const id of [organizationId, otherOrganizationId]) {
      await prisma.checklistItemResult.deleteMany({ where: { organizationId: id } });
      await prisma.checklistInstanceEvent.deleteMany({ where: { organizationId: id } });
      await prisma.checklistInstance.deleteMany({ where: { organizationId: id } });
      await prisma.checklistItem.deleteMany({ where: { organizationId: id } });
      await prisma.checklist.deleteMany({ where: { organizationId: id } });
      await prisma.user.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
  });

  async function makeChecklist(
    orgId: string,
    data: { title: string; status?: 'draft' | 'published'; accessMode?: 'assigned' | 'free'; deletedAt?: Date },
    itemCount = 2,
  ) {
    const checklist = await prisma.checklist.create({
      data: { organizationId: orgId, status: data.status ?? 'published', ...data },
    });
    for (let order = 0; order < itemCount; order += 1) {
      await prisma.checklistItem.create({
        data: { organizationId: orgId, checklistId: checklist.id, order, text: `Criterion ${order + 1}`, points: 10, isRequired: true },
      });
    }
    return checklist;
  }

  it('defaults every checklist to the assigned mode', async () => {
    const checklist = await makeChecklist(organizationId, { title: 'Default mode' });
    expect(checklist.accessMode).toBe('assigned');
    const created = await service.createChecklist({ organizationId, title: 'Created', scoringMode: 'sum_points', passThreshold: 80, requiresReview: false, preSessionVisibility: 'structure_only', allowFinishIncomplete: false, forbidGalleryPhotos: false, accessMode: 'assigned' }, userId);
    expect(created.accessMode).toBe('assigned');
  });

  it('copies the access mode when a checklist is copied', async () => {
    const source = await makeChecklist(organizationId, { title: 'Free source', accessMode: 'free' });
    const copy = await service.copyChecklist(source.id, organizationId, userId);
    expect(copy.accessMode).toBe('free');
    expect(copy.status).toBe('draft');
  });

  it('lists only published free checklists of the caller organization, without criteria', async () => {
    const free = await makeChecklist(organizationId, { title: 'Free published' }, 3);
    await prisma.checklist.update({ where: { id: free.id }, data: { accessMode: 'free' } });
    await makeChecklist(organizationId, { title: 'Assigned published' });
    await makeChecklist(organizationId, { title: 'Free draft', status: 'draft', accessMode: 'free' });
    await makeChecklist(organizationId, { title: 'Free deleted', accessMode: 'free', deletedAt: new Date() });
    await makeChecklist(otherOrganizationId, { title: 'Foreign free', accessMode: 'free' });

    const catalog = await service.listFreeChecklists(organizationId, userId);

    expect(catalog).toEqual([
      { id: free.id, title: 'Free published', description: null, itemCount: 3, pinned: false, coverUpdatedAt: null, activeInstanceId: null, activeInstanceStatus: null },
    ]);
    expect(JSON.stringify(catalog)).not.toContain('Criterion');
  });

  it('starts a free checklist for the caller and shows the unfinished instance in the catalog', async () => {
    const free = await makeChecklist(organizationId, { title: 'Free to start', accessMode: 'free' });

    const instance = await service.startFreeChecklist(free.id, organizationId, userId);

    expect(instance.userId).toBe(userId);
    expect(instance.assignedBy).toBe(userId);
    expect(instance.status).toBe('assigned');
    expect(instance.dueAt).toBeNull();
    const catalogForUser = await service.listFreeChecklists(organizationId, userId);
    expect(catalogForUser[0]?.activeInstanceId).toBe(instance.id);
    const catalogForOther = await service.listFreeChecklists(organizationId, otherUserId);
    expect(catalogForOther[0]?.activeInstanceId).toBeNull();
  });

  it('is idempotent: a repeated start returns the same unfinished instance', async () => {
    const free = await makeChecklist(organizationId, { title: 'Idempotent', accessMode: 'free' });

    const first = await service.startFreeChecklist(free.id, organizationId, userId);
    const second = await service.startFreeChecklist(free.id, organizationId, userId);

    expect(second.id).toBe(first.id);
    expect(await prisma.checklistInstance.count({ where: { checklistId: free.id, userId } })).toBe(1);
  });

  it('creates exactly one instance when several starts race', async () => {
    const free = await makeChecklist(organizationId, { title: 'Concurrent', accessMode: 'free' });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.startFreeChecklist(free.id, organizationId, userId)),
    );

    expect(new Set(results.map((instance) => instance.id)).size).toBe(1);
    expect(await prisma.checklistInstance.count({ where: { checklistId: free.id, userId } })).toBe(1);
  });

  it('lets two different users each have their own instance', async () => {
    const free = await makeChecklist(organizationId, { title: 'Two users', accessMode: 'free' });

    const first = await service.startFreeChecklist(free.id, organizationId, userId);
    const second = await service.startFreeChecklist(free.id, organizationId, otherUserId);

    expect(second.id).not.toBe(first.id);
    expect(second.userId).toBe(otherUserId);
  });

  it('starts a new instance after the previous one is completed', async () => {
    const free = await makeChecklist(organizationId, { title: 'Repeat', accessMode: 'free' });
    const first = await service.startFreeChecklist(free.id, organizationId, userId);
    await prisma.checklistInstance.update({ where: { id: first.id }, data: { status: 'completed' } });

    const second = await service.startFreeChecklist(free.id, organizationId, userId);

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('assigned');
  });

  it('rejects starting anything that is not a published free checklist of the organization', async () => {
    const assigned = await makeChecklist(organizationId, { title: 'Assigned only' });
    const draft = await makeChecklist(organizationId, { title: 'Free draft', status: 'draft', accessMode: 'free' });
    const deleted = await makeChecklist(organizationId, { title: 'Free deleted', accessMode: 'free', deletedAt: new Date() });
    const foreign = await makeChecklist(otherOrganizationId, { title: 'Foreign free', accessMode: 'free' });

    for (const checklist of [assigned, draft, deleted, foreign]) {
      await expect(service.startFreeChecklist(checklist.id, organizationId, userId)).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(service.startFreeChecklist(randomUUID(), organizationId, userId)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.checklistInstance.count({ where: { organizationId } })).toBe(0);
    // The foreign organization's own user can start it in their own organization.
    const own = await service.startFreeChecklist(foreign.id, otherOrganizationId, outsiderId);
    expect(own.userId).toBe(outsiderId);
  });

  it('keeps a started instance when the checklist is switched back to assigned', async () => {
    const free = await makeChecklist(organizationId, { title: 'Switch back', accessMode: 'free' });
    const instance = await service.startFreeChecklist(free.id, organizationId, userId);

    await service.updateChecklist(free.id, organizationId, { accessMode: 'assigned' }, userId);

    expect(await prisma.checklistInstance.findUnique({ where: { id: instance.id }, select: { status: true, deletedAt: true } }))
      .toEqual({ status: 'assigned', deletedAt: null });
    expect(await service.listFreeChecklists(organizationId, userId)).toEqual([]);
    await expect(service.startFreeChecklist(free.id, organizationId, otherUserId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still refuses a duplicate manual assignment of an unfinished free instance', async () => {
    const free = await makeChecklist(organizationId, { title: 'Manual duplicate', accessMode: 'free' });
    await service.startFreeChecklist(free.id, organizationId, userId);

    await expect(service.assignChecklist(free.id, organizationId, { userId }, otherUserId)).rejects.toBeInstanceOf(BadRequestException);
  });
});
