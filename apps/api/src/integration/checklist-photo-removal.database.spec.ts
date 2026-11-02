/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { jest } from '@jest/globals';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 406а: a learner can remove the photo of a criterion while the sheet is still open; the answer stays.
describe('checklist item photo removal — database', () => {
  let prisma: PrismaService;
  let service: ChecklistsService;
  let deleteObject: ReturnType<typeof jest.fn>;
  let organizationId: string;
  let learnerId: string;
  let otherId: string;
  let checklistId: string;
  let itemId: string;

  async function instance(status: 'in_progress' | 'completed', withPhoto = true) {
    const created = await prisma.checklistInstance.create({ data: { organizationId, checklistId, userId: learnerId, status } });
    await prisma.checklistItemResult.create({
      data: {
        organizationId, instanceId: created.id, itemId, checked: true,
        ...(withPhoto ? { photoObjectKey: `org/${randomUUID()}.jpg`, photoFileName: 'proof.jpg', photoMimeType: 'image/jpeg', photoSizeBytes: 10 } : {}),
      },
    });
    return created.id;
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    const run = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Photo removal ${run}`, slug: `photo-removal-${run}` } })).id;
    const mk = (label: string) => prisma.user.create({ data: { organizationId, email: `${label}-${run}@example.test`, passwordHash: 'unused', firstName: label, lastName: 'User' } });
    learnerId = (await mk('learner')).id;
    otherId = (await mk('other')).id;
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Photo sheet', status: 'published' } })).id;
    itemId = (await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 0, text: 'Shelf', points: 1, isRequired: true, photoRequired: true } })).id;
    deleteObject = jest.fn(async () => undefined);
    service = new ChecklistsService(prisma, { deleteObject } as unknown as UploadService);
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

  it('clears the photo, keeps the answer, deletes the stored object and audits it', async () => {
    const id = await instance('in_progress');
    const key = (await prisma.checklistItemResult.findFirstOrThrow({ where: { instanceId: id } })).photoObjectKey;
    await service.removeItemPhoto(id, itemId, organizationId, learnerId, false);

    const result = await prisma.checklistItemResult.findFirstOrThrow({ where: { instanceId: id } });
    expect(result).toMatchObject({ checked: true, photoObjectKey: null, photoFileName: null, photoMimeType: null, photoSizeBytes: null });
    expect(deleteObject).toHaveBeenCalledWith(key);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_evidence.removed', targetId: id } })).toBe(1);
  });

  it('answers 404 when there is no photo and refuses someone else’s sheet or a finished one', async () => {
    const empty = await instance('in_progress', false);
    await expect(service.removeItemPhoto(empty, itemId, organizationId, learnerId, false)).rejects.toThrow('No photo attached');

    const mine = await instance('in_progress');
    await expect(service.removeItemPhoto(mine, itemId, organizationId, otherId, false)).rejects.toThrow();
    expect((await prisma.checklistItemResult.findFirstOrThrow({ where: { instanceId: mine } })).photoFileName).toBe('proof.jpg');

    const done = await instance('completed');
    await expect(service.removeItemPhoto(done, itemId, organizationId, learnerId, false)).rejects.toThrow();
    expect((await prisma.checklistItemResult.findFirstOrThrow({ where: { instanceId: done } })).photoFileName).toBe('proof.jpg');

    await expect(service.removeItemPhoto(randomUUID(), itemId, organizationId, learnerId, false)).rejects.toThrow('not found');
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
