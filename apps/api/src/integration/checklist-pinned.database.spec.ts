/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService, MAX_PINNED_CHECKLISTS } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 354 acceptance criteria, verified against real Postgres:
// - only a published `free` checklist can be pinned; unpinning is always allowed;
// - the limit is enforced (409), also when requests race;
// - a checklist that stops being free or published is unpinned automatically;
// - the free catalog returns the pinned flag with pinned checklists first;
// - a copy is never pinned.
describe('checklist pinned (PR 354) — database', () => {
  let prisma: PrismaService;
  let service: ChecklistsService;
  let organizationId: string;
  let userId: string;

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
    organizationId = (await prisma.organization.create({ data: { name: `Pinned ${runId}`, slug: `pinned-${runId}` } })).id;
    userId = (await prisma.user.create({
      data: { organizationId, email: `pinned-${runId}@example.test`, passwordHash: 'not-used', firstName: 'Pin', lastName: 'User' },
    })).id;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  async function makeChecklist(title: string, data: { status?: 'draft' | 'published'; accessMode?: 'assigned' | 'free'; pinned?: boolean } = {}) {
    const checklist = await prisma.checklist.create({
      data: { organizationId, title, status: data.status ?? 'published', accessMode: data.accessMode ?? 'free', pinned: data.pinned ?? false },
    });
    await prisma.checklistItem.create({ data: { organizationId, checklistId: checklist.id, order: 0, text: 'Criterion', points: 10, isRequired: true } });
    return checklist;
  }
  const pinnedOf = async (id: string) => (await prisma.checklist.findUniqueOrThrow({ where: { id } })).pinned;

  it('pins a published free checklist and unpins it again', async () => {
    const checklist = await makeChecklist('Free one');
    const pinned = await service.updateChecklist(checklist.id, organizationId, { pinned: true }, userId);
    expect(pinned.pinned).toBe(true);
    const unpinned = await service.updateChecklist(checklist.id, organizationId, { pinned: false }, userId);
    expect(unpinned.pinned).toBe(false);
  });

  it('rejects pinning an assigned or a draft checklist, but never rejects unpinning', async () => {
    const assigned = await makeChecklist('Assigned', { accessMode: 'assigned' });
    const draft = await makeChecklist('Draft', { status: 'draft' });
    await expect(service.updateChecklist(assigned.id, organizationId, { pinned: true }, userId)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateChecklist(draft.id, organizationId, { pinned: true }, userId)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateChecklist(assigned.id, organizationId, { pinned: false }, userId)).resolves.toMatchObject({ pinned: false });
    expect(await pinnedOf(assigned.id)).toBe(false);
  });

  it('rejects a pin in the same request that makes the checklist assigned', async () => {
    const checklist = await makeChecklist('Switching');
    await expect(service.updateChecklist(checklist.id, organizationId, { accessMode: 'assigned', pinned: true }, userId)).rejects.toBeInstanceOf(BadRequestException);
    expect(await pinnedOf(checklist.id)).toBe(false);
  });

  it('enforces the limit with 409 and frees a slot when one is unpinned', async () => {
    const pinnedIds: string[] = [];
    for (let index = 0; index < MAX_PINNED_CHECKLISTS; index += 1) {
      const checklist = await makeChecklist(`Pinned ${index}`, { pinned: true });
      pinnedIds.push(checklist.id);
    }
    const extra = await makeChecklist('One too many');
    await expect(service.updateChecklist(extra.id, organizationId, { pinned: true }, userId)).rejects.toBeInstanceOf(ConflictException);
    expect(await pinnedOf(extra.id)).toBe(false);

    await service.updateChecklist(pinnedIds[0]!, organizationId, { pinned: false }, userId);
    await expect(service.updateChecklist(extra.id, organizationId, { pinned: true }, userId)).resolves.toMatchObject({ pinned: true });
  });

  it('keeps the limit when pin requests race', async () => {
    for (let index = 0; index < MAX_PINNED_CHECKLISTS - 1; index += 1) await makeChecklist(`Pinned ${index}`, { pinned: true });
    const a = await makeChecklist('Racer A');
    const b = await makeChecklist('Racer B');
    const results = await Promise.allSettled([
      service.updateChecklist(a.id, organizationId, { pinned: true }, userId),
      service.updateChecklist(b.id, organizationId, { pinned: true }, userId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.checklist.count({ where: { organizationId, pinned: true } })).toBe(MAX_PINNED_CHECKLISTS);
  });

  it('unpins automatically when the checklist stops being free or published', async () => {
    const toAssigned = await makeChecklist('To assigned', { pinned: true });
    const toDraft = await makeChecklist('To draft', { pinned: true });
    await service.updateChecklist(toAssigned.id, organizationId, { accessMode: 'assigned' }, userId);
    await service.updateChecklist(toDraft.id, organizationId, { status: 'draft' }, userId);
    expect(await pinnedOf(toAssigned.id)).toBe(false);
    expect(await pinnedOf(toDraft.id)).toBe(false);
  });

  it('does not copy the pin, and leaves the pin alone on unrelated edits', async () => {
    const checklist = await makeChecklist('Pinned source', { pinned: true });
    const copy = await service.copyChecklist(checklist.id, organizationId, userId);
    expect(copy.pinned).toBe(false);
    await service.updateChecklist(checklist.id, organizationId, { title: 'Renamed' }, userId);
    expect(await pinnedOf(checklist.id)).toBe(true);
  });

  it('puts pinned checklists first in the free catalog and exposes the flag', async () => {
    await makeChecklist('Aaa plain');
    await makeChecklist('Zzz pinned', { pinned: true });
    const catalog = await service.listFreeChecklists(organizationId, userId);
    expect(catalog.map((entry) => [entry.title, entry.pinned])).toEqual([['Zzz pinned', true], ['Aaa plain', false]]);
  });
});
