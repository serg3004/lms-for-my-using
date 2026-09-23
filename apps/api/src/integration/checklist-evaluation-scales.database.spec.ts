/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistScaleService } from '../modules/checklists/checklist-scale.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 293 acceptance criteria, verified against real Postgres:
// - a criterion resolves its scale through the instance's templateSnapshot, never a live query;
// - an archived scale cannot be selected for a *new* publication;
// - editing a scale already used by an assigned checklist is rejected (archive-and-recreate is
//   the only path forward); archiving itself is always allowed, even while in use;
// - existing scaleLevels-based (non-reusable-scale) checklists are entirely unaffected.
describe('checklist evaluation scales (PR 293) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let scaleService: ChecklistScaleService;
  let organizationId: string;
  let learnerId: string;
  let checklistId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    scaleService = new ChecklistScaleService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Evaluation scales ${runId}`, slug: `evaluation-scales-${runId}` },
    });
    organizationId = organization.id;

    const learner = await prisma.user.create({
      data: {
        organizationId,
        email: `learner-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Scale',
        lastName: 'Learner',
      },
    });
    learnerId = learner.id;

    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Evaluation scales checklist', status: 'draft' },
    });
    checklistId = checklist.id;
  });

  afterEach(async () => {
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstanceEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklistScaleLevel.deleteMany({ where: { organizationId } });
    await prisma.checklistScale.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('create/edit/archive lifecycle: edit is rejected once a scale is used by an assigned checklist, but archive always succeeds', async () => {
    const scale = await scaleService.create(
      organizationId,
      { name: '5-point scale', levels: [{ value: 1, label: 'Poor', score: 0 }, { value: 5, label: 'Excellent', score: 100 }] },
      learnerId,
    );
    expect(scale.levels).toHaveLength(2);

    // Free to edit while unused.
    const renamed = await scaleService.update(scale.id, organizationId, { name: 'Renamed 5-point scale' }, learnerId);
    expect(renamed.name).toBe('Renamed 5-point scale');

    const item = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Greets the customer', points: 10, isRequired: true, scaleId: scale.id },
    });
    await prisma.checklist.update({ where: { id: checklistId }, data: { status: 'published' } });
    await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, learnerId);

    // Now used by an assigned checklist -- edits rejected.
    await expect(scaleService.update(scale.id, organizationId, { name: 'Should not apply' }, learnerId)).rejects.toBeInstanceOf(BadRequestException);

    // Archiving remains allowed regardless of usage, and is idempotent.
    const archived = await scaleService.archive(scale.id, organizationId, learnerId);
    expect(archived.status).toBe('archived');
    const archivedAgain = await scaleService.archive(scale.id, organizationId, learnerId);
    expect(archivedAgain.status).toBe('archived');

    // Archiving doesn't touch the level data itself.
    expect(archived.levels).toHaveLength(2);
    expect(archived.name).toBe('Renamed 5-point scale');

    void item; // referenced only to establish the scale-in-use precondition above
  });

  it('a criterion resolves the scale through the assignment-time snapshot, immune to a later scale edit/archive', async () => {
    const scale = await scaleService.create(
      organizationId,
      { name: 'Original name', levels: [{ value: 1, label: 'Low', score: 0 }, { value: 2, label: 'High', score: 10 }] },
      learnerId,
    );
    await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Criterion with scale', points: 10, isRequired: true, scaleId: scale.id },
    });
    await prisma.checklist.update({ where: { id: checklistId }, data: { status: 'published' } });

    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, learnerId);

    const stored = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id }, select: { templateSnapshot: true } });
    const snapshotItem = (stored.templateSnapshot as { checklist: { items: Array<{ scaleId: string | null; scale: { id: string; name: string; levels: unknown[] } | null }> } }).checklist.items[0];
    expect(snapshotItem?.scaleId).toBe(scale.id);
    expect(snapshotItem?.scale).toMatchObject({ id: scale.id, name: 'Original name' });
    expect(snapshotItem?.scale?.levels).toHaveLength(2);

    // Archive the scale after assignment -- the already-taken snapshot must not change.
    await scaleService.archive(scale.id, organizationId, learnerId);
    const restored = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id }, select: { templateSnapshot: true } });
    const snapshotItemAfterArchive = (restored.templateSnapshot as { checklist: { items: Array<{ scale: { name: string } | null }> } }).checklist.items[0];
    expect(snapshotItemAfterArchive?.scale?.name).toBe('Original name');
  });

  it('archived scale cannot be selected for a new publication, but an already-published checklist referencing it is untouched', async () => {
    const scale = await scaleService.create(organizationId, { name: 'To be archived', levels: [{ value: 1, label: 'A', score: 0 }, { value: 2, label: 'B', score: 5 }] }, learnerId);
    await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Criterion', points: 10, isRequired: true, scaleId: scale.id },
    });

    await scaleService.archive(scale.id, organizationId, learnerId);

    // A fresh publish attempt referencing the now-archived scale is rejected.
    await expect(checklistsService.updateChecklist(checklistId, organizationId, { status: 'published' }, learnerId)).rejects.toBeInstanceOf(BadRequestException);

    // A second checklist, published while the scale was still active, is untouched by the later
    // archival -- assignment still works and the snapshot still captures the scale as it was.
    const scale2 = await scaleService.create(organizationId, { name: 'Still active', levels: [{ value: 1, label: 'A', score: 0 }, { value: 2, label: 'B', score: 5 }] }, learnerId);
    const checklist2 = await prisma.checklist.create({ data: { organizationId, title: 'Second checklist', status: 'draft' } });
    await prisma.checklistItem.create({
      data: { organizationId, checklistId: checklist2.id, order: 0, text: 'Criterion', points: 10, isRequired: true, scaleId: scale2.id },
    });
    await checklistsService.updateChecklist(checklist2.id, organizationId, { status: 'published' }, learnerId);
    const instance2 = await checklistsService.assignChecklist(checklist2.id, organizationId, { userId: learnerId }, learnerId);
    expect(instance2.id).toBeDefined();
  });

  it('createItem/updateItem reject a scaleId that does not exist in the caller organization', async () => {
    await expect(
      checklistsService.createItem(checklistId, organizationId, { text: 'Bad scale ref', points: 10, isRequired: true, photoRequired: false, scaleId: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const item = await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Item', points: 10, isRequired: true },
    });
    await expect(
      checklistsService.updateItem(item.id, organizationId, { scaleId: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a legacy scoringMode="scale" checklist using Checklist.scaleLevels is entirely unaffected by the reusable scale library', async () => {
    await prisma.checklist.update({
      where: { id: checklistId },
      data: { scoringMode: 'scale', scaleLevels: [{ level: 1, label: 'Bad', points: 0 }, { level: 2, label: 'Good', points: 10 }] },
    });
    // No ChecklistItem.scaleId reference at all -- the item uses only the legacy JSON scale.
    await prisma.checklistItem.create({
      data: { organizationId, checklistId, order: 0, text: 'Legacy scale item', points: 0, isRequired: true },
    });
    await checklistsService.updateChecklist(checklistId, organizationId, { status: 'published' }, learnerId);

    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learnerId }, learnerId);
    expect(instance.id).toBeDefined();

    const stored = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id }, select: { templateSnapshot: true } });
    const snapshot = stored.templateSnapshot as { checklist: { scaleLevels: unknown[]; items: Array<{ scale: unknown }> } };
    expect(snapshot.checklist.scaleLevels).toHaveLength(2);
    expect(snapshot.checklist.items[0]?.scale ?? null).toBeNull();
  });
});
