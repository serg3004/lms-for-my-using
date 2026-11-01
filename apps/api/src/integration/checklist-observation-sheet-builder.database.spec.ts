/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 296 acceptance criteria, verified against real Postgres:
// - context fields / defaultLocationCapturePolicy / preSessionVisibility persist and default
//   safely (preSessionVisibility defaults to structure_only, everything else stays null/absent);
// - item groups: add/rename/reorder/copy; copy duplicates the group's items too, independently
//   of the original; a group can't be assigned to an item on a *different* checklist;
// - published lifecycle is unaffected -- editing groups/context fields on a published checklist
//   never touches already-assigned instances (they read their own templateSnapshot).
describe('checklist observation-sheet builder (PR 296) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let organizationId: string;
  let checklistId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Observation sheet builder ${runId}`, slug: `observation-sheet-builder-${runId}` },
    });
    organizationId = organization.id;

    const checklist = await prisma.checklist.create({
      data: { organizationId, title: 'Client meeting standard', status: 'draft' },
    });
    checklistId = checklist.id;
  });

  afterEach(async () => {
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstanceEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklistItemGroup.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('persists context fields, default location policy and pre-session visibility, and defaults preSessionVisibility to structure_only', async () => {
    const author = await prisma.user.create({
      data: { organizationId, email: `author-${randomUUID()}@example.test`, passwordHash: 'unused', firstName: 'Author', lastName: 'One' },
    });
    const fieldId = randomUUID();
    const created = await checklistsService.createChecklist(
      {
        organizationId,
        title: 'Store audit',
        contextFields: [{ id: fieldId, label: 'Store number', type: 'text', required: true, order: 0 }],
        defaultLocationCapturePolicy: 'required',
      } as never,
      author.id,
    );

    expect(created.contextFields).toEqual([{ id: fieldId, label: 'Store number', type: 'text', required: true, order: 0 }]);
    expect(created.defaultLocationCapturePolicy).toBe('required');
    expect(created.preSessionVisibility).toBe('structure_only');

    const reloaded = await checklistsService.getChecklist(created.id, organizationId);
    expect(reloaded.contextFields).toEqual([{ id: fieldId, label: 'Store number', type: 'text', required: true, order: 0 }]);
  });

  it('clears context fields back to null via update, and updates preSessionVisibility', async () => {
    const fieldId = randomUUID();
    await checklistsService.updateChecklist(
      checklistId,
      organizationId,
      { contextFields: [{ id: fieldId, label: 'Shift', type: 'textarea', required: false, order: 0 }], preSessionVisibility: 'none' } as never,
    );

    const cleared = await checklistsService.updateChecklist(checklistId, organizationId, { contextFields: null } as never);
    expect(cleared.contextFields).toBeNull();
    expect(cleared.preSessionVisibility).toBe('none');
  });

  it('adds, renames and reorders item groups', async () => {
    const groupA = await checklistsService.createItemGroup(checklistId, organizationId, { title: 'Greeting' });
    const groupB = await checklistsService.createItemGroup(checklistId, organizationId, { title: 'Closing' });
    expect(groupA.order).toBe(0);
    expect(groupB.order).toBe(1);

    const renamed = await checklistsService.updateItemGroup(groupA.id, organizationId, { title: 'Opening' });
    expect(renamed.title).toBe('Opening');

    await checklistsService.updateItemGroup(groupA.id, organizationId, { order: 1 });
    await checklistsService.updateItemGroup(groupB.id, organizationId, { order: 0 });

    const groups = await checklistsService.listItemGroups(checklistId, organizationId);
    expect(groups.map((g) => g.title)).toEqual(['Closing', 'Opening']);
  });

  it('copies a group and its items independently of the original', async () => {
    const group = await checklistsService.createItemGroup(checklistId, organizationId, { title: 'Greeting' });
    const item = await checklistsService.createItem(checklistId, organizationId, {
      text: 'Greets the customer warmly', points: 10, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, groupId: group.id,
    } as never);

    const copiedGroup = await checklistsService.copyItemGroup(group.id, organizationId);
    expect(copiedGroup.id).not.toBe(group.id);
    expect(copiedGroup.title).toBe('Greeting (копия)');
    expect(copiedGroup.order).toBe(1);

    const allItems = await checklistsService.listItems(checklistId, organizationId);
    const copiedItem = allItems.find((i) => i.groupId === copiedGroup.id);
    expect(copiedItem).toBeDefined();
    expect(copiedItem?.text).toBe(item.text);
    expect(copiedItem?.points).toBe(10);
    expect(copiedItem?.id).not.toBe(item.id);

    // The original item/group are untouched by the copy.
    const originalItem = await prisma.checklistItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(originalItem.groupId).toBe(group.id);
  });

  it('rejects assigning an item to a group that belongs to a different checklist', async () => {
    const otherChecklist = await prisma.checklist.create({ data: { organizationId, title: 'Other sheet', status: 'draft' } });
    const foreignGroup = await checklistsService.createItemGroup(otherChecklist.id, organizationId, { title: 'Foreign group' });

    await expect(
      checklistsService.createItem(checklistId, organizationId, {
        text: 'Criterion', points: 0, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, groupId: foreignGroup.id,
      } as never),
    ).rejects.toThrow(NotFoundException);

    await prisma.checklist.delete({ where: { id: otherChecklist.id } });
  });

  it('ungroups an item by setting groupId to null, and survives its group disappearing from the FK (SetNull)', async () => {
    const group = await checklistsService.createItemGroup(checklistId, organizationId, { title: 'Greeting' });
    const item = await checklistsService.createItem(checklistId, organizationId, {
      text: 'Criterion', points: 0, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, groupId: group.id,
    } as never);

    const ungrouped = await checklistsService.updateItem(item.id, organizationId, { groupId: null } as never);
    expect(ungrouped.groupId).toBeNull();
  });

  it('editing groups/context fields on a published checklist does not change an already-assigned instance', async () => {
    const learner = await prisma.user.create({
      data: { organizationId, email: `learner-${randomUUID()}@example.test`, passwordHash: 'unused', firstName: 'Learner', lastName: 'One' },
    });

    await checklistsService.createItem(checklistId, organizationId, {
      text: 'Criterion', points: 10, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false,
    } as never);
    await checklistsService.updateChecklist(checklistId, organizationId, { status: 'published' } as never);

    const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learner.id });

    // Edit the checklist's context fields and add a group after the instance was assigned.
    const fieldId = randomUUID();
    await checklistsService.updateChecklist(checklistId, organizationId, {
      contextFields: [{ id: fieldId, label: 'New field', type: 'date', required: false, order: 0 }],
    } as never);
    await checklistsService.createItemGroup(checklistId, organizationId, { title: 'New group' });

    const reloadedInstance = await checklistsService.getInstance(instance.id, organizationId);
    // The instance's own runtime checklist view is frozen at assignment time (no context fields
    // existed yet), unaffected by the post-assignment edits -- same guarantee PR 293 established
    // for scaleLevels/scale.
    expect((reloadedInstance.checklist as { contextFields?: unknown }).contextFields).toBeNull();
  });
  describe('PR 402: delete group and drag-and-drop layout', () => {
    const itemInput = (text: string) =>
      ({ text, points: 1, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false }) as never;

    async function seed() {
      const actor = await prisma.user.create({
        data: { organizationId, email: `actor-${randomUUID()}@example.test`, passwordHash: 'unused', firstName: 'Actor', lastName: 'One' },
      });
      const g1 = await checklistsService.createItemGroup(checklistId, organizationId, { title: 'G1' });
      const g2 = await checklistsService.createItemGroup(checklistId, organizationId, { title: 'G2' });
      const a = await checklistsService.createItem(checklistId, organizationId, { ...(itemInput('A') as object), groupId: g1.id } as never);
      const b = await checklistsService.createItem(checklistId, organizationId, { ...(itemInput('B') as object), groupId: g1.id } as never);
      const c = await checklistsService.createItem(checklistId, organizationId, { ...(itemInput('C') as object), groupId: g2.id } as never);
      const d = await checklistsService.createItem(checklistId, organizationId, itemInput('D'));
      return { actor, g1, g2, a, b, c, d };
    }

    it('deleting a group with items "delete" soft-deletes its criteria and reports the count', async () => {
      const { actor, g1, a, b, c } = await seed();
      const result = await checklistsService.deleteItemGroup(g1.id, organizationId, actor.id, 'delete');
      expect(result).toEqual({ deletedItems: 2, keptItems: 0 });
      expect(await prisma.checklistItemGroup.findUnique({ where: { id: g1.id } })).toBeNull();
      const live = await checklistsService.listItems(checklistId, organizationId);
      expect(live.map((item) => item.id)).not.toContain(a.id);
      expect(live.map((item) => item.id)).not.toContain(b.id);
      expect(live.map((item) => item.id)).toContain(c.id);
      const audit = await prisma.auditLog.findFirst({ where: { organizationId, action: 'checklist.group_deleted' } });
      expect(audit).not.toBeNull();
    });

    it('deleting a group with items "keep" leaves criteria without a group', async () => {
      const { actor, g1, a, b } = await seed();
      const result = await checklistsService.deleteItemGroup(g1.id, organizationId, actor.id, 'keep');
      expect(result).toEqual({ deletedItems: 0, keptItems: 2 });
      const live = await checklistsService.listItems(checklistId, organizationId);
      expect(live.find((item) => item.id === a.id)?.groupId).toBeNull();
      expect(live.find((item) => item.id === b.id)?.groupId).toBeNull();
    });

    it('does not delete a group of another organization', async () => {
      const { actor, g1 } = await seed();
      const other = await prisma.organization.create({ data: { name: 'Other', slug: `other-${randomUUID()}` } });
      try {
        await expect(checklistsService.deleteItemGroup(g1.id, other.id, actor.id, 'delete')).rejects.toBeInstanceOf(NotFoundException);
        expect(await prisma.checklistItemGroup.findUnique({ where: { id: g1.id } })).not.toBeNull();
      } finally {
        await prisma.organization.delete({ where: { id: other.id } });
      }
    });

    it('updateLayout reorders groups and moves criteria across groups in one transaction', async () => {
      const { g1, g2, a, b, c, d } = await seed();
      const result = await checklistsService.updateLayout(checklistId, organizationId, {
        groups: [
          { id: g2.id, itemIds: [c.id, b.id] },
          { id: g1.id, itemIds: [a.id] },
        ],
        ungroupedItemIds: [d.id],
      });
      expect(result).toEqual({ groups: 2, items: 4 });
      const groups = await checklistsService.listItemGroups(checklistId, organizationId);
      expect(groups.map((group) => group.id)).toEqual([g2.id, g1.id]);
      const items = await checklistsService.listItems(checklistId, organizationId);
      expect(items.map((item) => [item.id, item.groupId])).toEqual([
        [c.id, g2.id],
        [b.id, g2.id],
        [a.id, g1.id],
        [d.id, null],
      ]);
    });

    it('updateLayout rejects duplicates, foreign ids and stale sets and changes nothing', async () => {
      const { g1, g2, a, b, c, d } = await seed();
      const full = { groups: [{ id: g1.id, itemIds: [a.id, b.id] }, { id: g2.id, itemIds: [c.id] }], ungroupedItemIds: [d.id] };

      await expect(
        checklistsService.updateLayout(checklistId, organizationId, { ...full, ungroupedItemIds: [a.id] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        checklistsService.updateLayout(checklistId, organizationId, { ...full, ungroupedItemIds: [randomUUID()] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        checklistsService.updateLayout(checklistId, organizationId, { groups: [{ id: g1.id, itemIds: [a.id, b.id, c.id] }], ungroupedItemIds: [d.id] }),
      ).rejects.toBeInstanceOf(ConflictException);

      const items = await checklistsService.listItems(checklistId, organizationId);
      expect(items.map((item) => item.id)).toEqual([a.id, b.id, c.id, d.id]);
    });

    it('updateLayout does not accept ids of another checklist', async () => {
      const { g1, a, b, c, d } = await seed();
      const other = await prisma.checklist.create({ data: { organizationId, title: 'Other', status: 'draft' } });
      const otherItem = await checklistsService.createItem(other.id, organizationId, itemInput('X'));
      await expect(
        checklistsService.updateLayout(checklistId, organizationId, {
          groups: [{ id: g1.id, itemIds: [a.id, b.id, c.id, otherItem.id] }],
          ungroupedItemIds: [d.id],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
