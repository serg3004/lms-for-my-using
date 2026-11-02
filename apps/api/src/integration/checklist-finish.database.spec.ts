/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 406б: a self-filled sheet is finished by the person, not by the last answer.
describe('checklist explicit finish — database', () => {
  let prisma: PrismaService;
  let service: ChecklistsService;
  let organizationId: string;
  let learnerId: string;
  let otherId: string;
  let itemA: string;
  let itemB: string;
  let checklistId: string;

  async function assign() {
    return service.assignChecklist(checklistId, organizationId, { userId: learnerId }, learnerId);
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    const run = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Finish ${run}`, slug: `finish-${run}` } })).id;
    const mk = (label: string) => prisma.user.create({ data: { organizationId, email: `${label}-${run}@example.test`, passwordHash: 'unused', firstName: label, lastName: 'User' } });
    learnerId = (await mk('learner')).id;
    otherId = (await mk('other')).id;
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Finish sheet', status: 'published' } })).id;
    itemA = (await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 0, text: 'A', points: 5, isRequired: true, photoRequired: false } })).id;
    itemB = (await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 1, text: 'B', points: 5, isRequired: true, photoRequired: false } })).id;
    service = new ChecklistsService(prisma, {} as unknown as UploadService);
  });
  afterEach(async () => {
    const where = { organizationId };
    await prisma.auditLog.deleteMany({ where });
    await prisma.checklistInstanceEvent.deleteMany({ where });
    await prisma.checklistItemResult.deleteMany({ where });
    await prisma.checklistInstance.deleteMany({ where });
    await prisma.checklistItem.deleteMany({ where });
    await prisma.checklist.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('keeps the sheet open after the last answer and completes it only on finish', async () => {
    const instance = await assign();
    await service.submitItemResult(instance.id, itemA, organizationId, learnerId, false, { checked: true });
    const last = await service.submitItemResult(instance.id, itemB, organizationId, learnerId, false, { checked: true });
    expect(last.status).toBe('in_progress');

    const finished = await service.finishInstance(instance.id, organizationId, learnerId, false);
    expect(finished).toMatchObject({ status: 'completed', percentage: 100 });
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_instance.finished', targetId: instance.id } })).toBe(1);
    await expect(service.finishInstance(instance.id, organizationId, learnerId, false)).rejects.toThrow('already finished');
  });

  it('lists the missing required criteria and refuses someone else or another tenant', async () => {
    const instance = await assign();
    await service.submitItemResult(instance.id, itemA, organizationId, learnerId, false, { checked: true });
    await expect(service.finishInstance(instance.id, organizationId, learnerId, false)).rejects.toMatchObject({ response: { missingItemIds: [itemB] } });
    await expect(service.finishInstance(instance.id, organizationId, otherId, false)).rejects.toThrow('executor');
    await expect(service.finishInstance(instance.id, randomUUID(), learnerId, false)).rejects.toThrow('not found');
    expect((await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } })).status).toBe('in_progress');
  });

  it('sends a sheet that requires review to review instead of completing it', async () => {
    await prisma.checklist.update({ where: { id: checklistId }, data: { requiresReview: true } });
    const instance = await assign();
    await service.submitItemResult(instance.id, itemA, organizationId, learnerId, false, { checked: true });
    await service.submitItemResult(instance.id, itemB, organizationId, learnerId, false, { checked: true });
    expect((await service.finishInstance(instance.id, organizationId, learnerId, false)).status).toBe('submitted');
  });
});
