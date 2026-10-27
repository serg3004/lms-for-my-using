/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 355 acceptance criteria, verified against real Postgres:
// - the storage key never leaves the API (only `coverUpdatedAt` does);
// - replacing a cover removes the previous object, removing it clears the checklist fields;
// - a cover is not reachable from another organization, and a learner only gets the cover of a
//   published free or an assigned checklist.
describe('checklist cover (PR 355) — database', () => {
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
      getInlinePresignedUrl: async (key: string) => `https://storage.example.test/${key}`,
    };
    service = new ChecklistsService(prisma, upload as unknown as UploadService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    deleted.length = 0;
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Cover ${runId}`, slug: `cover-${runId}` } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `Cover B ${runId}`, slug: `cover-b-${runId}` } })).id;
    const user = (email: string, org: string) => prisma.user.create({
      data: { organizationId: org, email, passwordHash: 'not-used', firstName: 'Cover', lastName: 'User' },
    });
    userId = (await user(`cover-${runId}@example.test`, organizationId)).id;
    learnerId = (await user(`cover-learner-${runId}@example.test`, organizationId)).id;
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
      data: { organizationId, title: 'With cover', status: data.status ?? 'published', accessMode: data.accessMode ?? 'free' },
    });
  const png = (key: string) => ({ objectKey: key, mimeType: 'image/png' });

  it('stores a cover, exposes only coverUpdatedAt and never the key', async () => {
    const checklist = await makeChecklist();
    await service.replaceCover(checklist.id, organizationId, userId, png('organizations/o/checklist-covers/a'));
    const fetched = await service.getChecklist(checklist.id, organizationId);
    expect(fetched.coverUpdatedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(fetched)).not.toContain('checklist-covers');
    expect(fetched).not.toHaveProperty('coverObjectKey');
    const free = await service.listFreeChecklists(organizationId, learnerId);
    expect(free[0]?.coverUpdatedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(free)).not.toContain('checklist-covers');
  });

  it('removes the previous object on replace and clears the fields on remove', async () => {
    const checklist = await makeChecklist();
    await service.replaceCover(checklist.id, organizationId, userId, png('key-1'));
    await service.replaceCover(checklist.id, organizationId, userId, png('key-2'));
    expect(deleted).toEqual(['key-1']);
    await service.removeCover(checklist.id, organizationId, userId);
    expect(deleted).toEqual(['key-1', 'key-2']);
    const row = await prisma.checklist.findUniqueOrThrow({ where: { id: checklist.id } });
    expect([row.coverObjectKey, row.coverMimeType, row.coverUpdatedAt]).toEqual([null, null, null]);
    await expect(service.removeCover(checklist.id, organizationId, userId)).resolves.toMatchObject({ coverUpdatedAt: null });
  });

  it('is not reachable from another organization', async () => {
    const checklist = await makeChecklist();
    await service.replaceCover(checklist.id, organizationId, userId, png('key-1'));
    await expect(service.getCoverDownload(checklist.id, otherOrganizationId, userId, true)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.replaceCover(checklist.id, otherOrganizationId, userId, png('key-x'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeCover(checklist.id, otherOrganizationId, userId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives a learner only the cover of a published free or an assigned checklist', async () => {
    const free = await makeChecklist();
    const draftFree = await makeChecklist({ status: 'draft' });
    const assigned = await makeChecklist({ accessMode: 'assigned' });
    for (const checklist of [free, draftFree, assigned]) {
      await service.replaceCover(checklist.id, organizationId, userId, png(`key-${checklist.id}`));
    }
    await expect(service.getCoverDownload(free.id, organizationId, learnerId, false)).resolves.toMatchObject({ expiresIn: 300 });
    await expect(service.getCoverDownload(draftFree.id, organizationId, learnerId, false)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getCoverDownload(assigned.id, organizationId, learnerId, false)).rejects.toBeInstanceOf(NotFoundException);
    await prisma.checklistInstance.create({ data: { organizationId, checklistId: assigned.id, userId: learnerId, status: 'assigned' } });
    await expect(service.getCoverDownload(assigned.id, organizationId, learnerId, false)).resolves.toMatchObject({ expiresIn: 300 });
    await expect(service.getCoverDownload(draftFree.id, organizationId, userId, true)).resolves.toMatchObject({ expiresIn: 300 });
  });
});
