/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { MAX_SHEET_PHOTOS } from '../modules/checklists/checklist-sheet-photos.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 421 acceptance criteria, verified against real Postgres:
// - up to 6 pictures per sheet, caption, order and removal;
// - the storage key never leaves the API (only id, caption, order, updatedAt);
// - a picture is not reachable from another organization, and a learner only gets the pictures of a
//   published free or an assigned sheet;
// - a copy of a sheet gets its own copy of every picture.
describe('checklist extra pictures (PR 421) — database', () => {
  let prisma: PrismaService;
  let service: ChecklistsService;
  let organizationId: string;
  let otherOrganizationId: string;
  let userId: string;
  let learnerId: string;
  const deleted: string[] = [];

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    const upload = {
      deleteObject: async (key: string) => { deleted.push(key); },
      getObjectBytes: async (key: string) => (key.startsWith('missing') ? null : Buffer.from(`bytes:${key}`)),
      copyChecklistSheetPhoto: async (key: string, org: string, id: string) => `organizations/${org}/checklist-photos/${id}/copy-of-${key.split('/').pop()}`,
    };
    service = new ChecklistsService(prisma, upload as unknown as UploadService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    deleted.length = 0;
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Photos ${runId}`, slug: `photos-${runId}` } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `Photos B ${runId}`, slug: `photos-b-${runId}` } })).id;
    const user = (email: string, org: string) => prisma.user.create({
      data: { organizationId: org, email, passwordHash: 'not-used', firstName: 'Photos', lastName: 'User' },
    });
    userId = (await user(`photos-${runId}@example.test`, organizationId)).id;
    learnerId = (await user(`photos-learner-${runId}@example.test`, organizationId)).id;
  });

  afterEach(async () => {
    for (const id of [organizationId, otherOrganizationId]) {
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.checklistInstance.deleteMany({ where: { organizationId: id } });
      await prisma.checklistItem.deleteMany({ where: { organizationId: id } });
      await prisma.checklist.deleteMany({ where: { organizationId: id } });
      await prisma.user.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
  });

  const makeChecklist = (data: { status?: 'draft' | 'published'; accessMode?: 'assigned' | 'free' } = {}) =>
    prisma.checklist.create({
      data: { organizationId, title: 'With pictures', status: data.status ?? 'published', accessMode: data.accessMode ?? 'free' },
    });
  const add = (checklistId: string, key: string, caption = '') =>
    service.addSheetPhoto(checklistId, organizationId, userId, { objectKey: key, mimeType: 'image/png' }, caption);

  it('adds pictures in order, exposes only id, caption, order and updatedAt, and refuses the seventh', async () => {
    const checklist = await makeChecklist();
    for (let index = 0; index < MAX_SHEET_PHOTOS; index += 1) await add(checklist.id, `organizations/o/checklist-photos/${index}`, `Схема ${index}`);
    await expect(service.assertSheetPhotoRoom(checklist.id, organizationId)).rejects.toBeInstanceOf(ConflictException);
    await expect(add(checklist.id, 'organizations/o/checklist-photos/7')).rejects.toBeInstanceOf(ConflictException);
    const fetched = await service.getChecklist(checklist.id, organizationId);
    expect(fetched.photos.map((photo) => [photo.order, photo.caption])).toEqual([0, 1, 2, 3, 4, 5].map((n) => [n, `Схема ${n}`]));
    expect(Object.keys(fetched.photos[0]!).sort()).toEqual(['caption', 'id', 'order', 'updatedAt']);
    expect(JSON.stringify(fetched)).not.toContain('checklist-photos');
  });

  it('changes a caption, reorders (every picture exactly once) and removes with gap-free order', async () => {
    const checklist = await makeChecklist();
    const a = await add(checklist.id, 'k-a', 'A');
    const b = await add(checklist.id, 'k-b', 'B');
    const c = await add(checklist.id, 'k-c', 'C');
    await expect(service.updateSheetPhoto(checklist.id, a.id, organizationId, 'Новая')).resolves.toMatchObject({ caption: 'Новая' });
    const reordered = await service.reorderSheetPhotos(checklist.id, organizationId, [c.id, a.id, b.id]);
    expect(reordered.map((photo) => photo.id)).toEqual([c.id, a.id, b.id]);
    await expect(service.reorderSheetPhotos(checklist.id, organizationId, [c.id, a.id])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorderSheetPhotos(checklist.id, organizationId, [c.id, c.id, a.id])).rejects.toBeInstanceOf(BadRequestException);
    await service.removeSheetPhoto(checklist.id, a.id, organizationId, userId);
    expect(deleted).toEqual(['k-a']);
    const rest = await prisma.checklistPhoto.findMany({ where: { checklistId: checklist.id }, orderBy: { order: 'asc' } });
    expect(rest.map((photo) => [photo.id, photo.order])).toEqual([[c.id, 0], [b.id, 1]]);
  });

  it('is not reachable or changeable from another organization', async () => {
    const checklist = await makeChecklist();
    const photo = await add(checklist.id, 'k-a');
    await expect(service.getSheetPhotoFile(checklist.id, photo.id, otherOrganizationId, userId, true)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateSheetPhoto(checklist.id, photo.id, otherOrganizationId, 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeSheetPhoto(checklist.id, photo.id, otherOrganizationId, userId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reorderSheetPhotos(checklist.id, otherOrganizationId, [photo.id])).rejects.toBeInstanceOf(NotFoundException);
    await expect(add(checklist.id, 'k-x').then(() => service.addSheetPhoto(checklist.id, otherOrganizationId, userId, { objectKey: 'k-y', mimeType: 'image/png' }, ''))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives a learner only the pictures of a published free or an assigned sheet', async () => {
    const free = await makeChecklist();
    const draftFree = await makeChecklist({ status: 'draft' });
    const assigned = await makeChecklist({ accessMode: 'assigned' });
    const photos = new Map<string, string>();
    for (const checklist of [free, draftFree, assigned]) photos.set(checklist.id, (await add(checklist.id, `key-${checklist.id}`)).id);
    const file = await service.getSheetPhotoFile(free.id, photos.get(free.id)!, organizationId, learnerId, false);
    expect(file.bytes.toString()).toBe(`bytes:key-${free.id}`);
    expect(file.mimeType).toBe('image/png');
    expect(file.version).toBeGreaterThan(0);
    await expect(service.getSheetPhotoFile(draftFree.id, photos.get(draftFree.id)!, organizationId, learnerId, false)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getSheetPhotoFile(assigned.id, photos.get(assigned.id)!, organizationId, learnerId, false)).rejects.toBeInstanceOf(NotFoundException);
    await prisma.checklistInstance.create({ data: { organizationId, checklistId: assigned.id, userId: learnerId, status: 'assigned' } });
    await expect(service.getSheetPhotoFile(assigned.id, photos.get(assigned.id)!, organizationId, learnerId, false)).resolves.toMatchObject({ mimeType: 'image/png' });
    // the observer of a session of the sheet may see it too (an observer can be any user)
    const subject = await prisma.user.create({ data: { organizationId, email: `subject-${randomUUID()}@example.test`, passwordHash: 'not-used', firstName: 'S', lastName: 'S' } });
    const other = await makeChecklist({ accessMode: 'assigned' });
    const otherPhoto = await add(other.id, 'key-other');
    const instance = await prisma.checklistInstance.create({ data: { organizationId, checklistId: other.id, userId: subject.id, status: 'in_progress' } });
    await expect(service.getSheetPhotoFile(other.id, otherPhoto.id, organizationId, learnerId, false)).rejects.toBeInstanceOf(NotFoundException);
    await prisma.checklistSession.create({ data: { organizationId, instanceId: instance.id, observerId: learnerId, status: 'in_progress' } });
    await expect(service.getSheetPhotoFile(other.id, otherPhoto.id, organizationId, learnerId, false)).resolves.toMatchObject({ mimeType: 'image/png' });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await expect(service.getSheetPhotoFile(draftFree.id, photos.get(draftFree.id)!, organizationId, userId, true)).resolves.toMatchObject({ mimeType: 'image/png' });
    // a picture asked through another sheet's id is a 404 as well
    await expect(service.getSheetPhotoFile(free.id, photos.get(assigned.id)!, organizationId, userId, true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 when the stored object is gone', async () => {
    const checklist = await makeChecklist();
    const photo = await add(checklist.id, 'missing-object');
    await expect(service.getSheetPhotoFile(checklist.id, photo.id, organizationId, userId, true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('copies the pictures with the sheet onto their own objects, keeping caption and order', async () => {
    const checklist = await makeChecklist();
    await add(checklist.id, 'organizations/o/checklist-photos/a', 'Первая');
    await add(checklist.id, 'organizations/o/checklist-photos/b', 'Вторая');
    const copy = await service.copyChecklist(checklist.id, organizationId, userId);
    const stored = await prisma.checklistPhoto.findMany({ where: { checklistId: copy.id }, orderBy: { order: 'asc' } });
    expect(stored.map((photo) => [photo.order, photo.caption])).toEqual([[0, 'Первая'], [1, 'Вторая']]);
    for (const photo of stored) {
      expect(photo.objectKey).toContain(`/checklist-photos/${copy.id}/`);
      expect(photo.objectKey).not.toMatch(/checklist-photos\/(a|b)$/);
    }
    expect(copy.photos).toHaveLength(2);
    expect(await prisma.checklistPhoto.count({ where: { checklistId: checklist.id } })).toBe(2);
  });
});
