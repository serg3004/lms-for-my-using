/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { jest } from '@jest/globals';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { VOICE_NOTES_PER_COMMENT } from '../modules/checklists/checklist-voice-notes.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 509: voice recordings of the comment of an answer. Who may write, read and remove them, against a real database.
describe('checklist voice notes — database', () => {
  let prisma: PrismaService;
  let service: ChecklistsService;
  let deleteObject: ReturnType<typeof jest.fn>;
  let getObjectBytes: ReturnType<typeof jest.fn>;
  let organizationId: string;
  let learnerId: string;
  let otherId: string;
  let observerId: string;
  let checklistId: string;
  let itemId: string;
  let secondOrganizationId: string;

  const file = () => ({ objectKey: `organizations/x/checklist-voice/${randomUUID()}`, mimeType: 'audio/webm', sizeBytes: 1200 });

  async function instance(status: 'in_progress' | 'completed' = 'in_progress', withResult = true) {
    const created = await prisma.checklistInstance.create({ data: { organizationId, checklistId, userId: learnerId, status } });
    if (withResult) await prisma.checklistItemResult.create({ data: { organizationId, instanceId: created.id, itemId, checked: true } });
    return created.id;
  }

  async function session(instanceId: string) {
    return prisma.checklistSession.create({ data: { organizationId, instanceId, observerId, status: 'in_progress' } });
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    const run = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Voice ${run}`, slug: `voice-${run}` } })).id;
    secondOrganizationId = (await prisma.organization.create({ data: { name: `Voice two ${run}`, slug: `voice-two-${run}` } })).id;
    const mk = (label: string) => prisma.user.create({ data: { organizationId, email: `${label}-${run}@example.test`, passwordHash: 'unused', firstName: label, lastName: 'User' } });
    learnerId = (await mk('learner')).id;
    otherId = (await mk('other')).id;
    observerId = (await mk('observer')).id;
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Voice sheet', status: 'published' } })).id;
    itemId = (await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 0, text: 'Shelf', points: 1, isRequired: true } })).id;
    deleteObject = jest.fn(async () => undefined);
    getObjectBytes = jest.fn(async () => Buffer.from('audio'));
    service = new ChecklistsService(prisma, { deleteObject, getObjectBytes } as unknown as UploadService);
  });
  afterEach(async () => {
    for (const id of [organizationId, secondOrganizationId]) {
      const where = { organizationId: id };
      await prisma.auditLog.deleteMany({ where });
      await prisma.checklistVoiceNote.deleteMany({ where });
      await prisma.checklistSessionEvent.deleteMany({ where });
      await prisma.checklistSession.deleteMany({ where });
      await prisma.checklistInstanceEvent.deleteMany({ where });
      await prisma.checklistItemResult.deleteMany({ where });
      await prisma.checklistInstance.deleteMany({ where });
      await prisma.checklistItem.deleteMany({ where });
      await prisma.checklist.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.organization.delete({ where: { id } });
    }
  });

  it('adds a recording for the executor, lists it without storage fields and serves the bytes', async () => {
    const id = await instance();
    const created = await service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 4200);
    expect(created).toMatchObject({ itemId, place: 'answer', durationMs: 4200, createdBy: learnerId });
    expect(created).not.toHaveProperty('objectKey');

    const list = await service.listVoiceNotes(id, organizationId, learnerId, false);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('mimeType');
    expect((await service.getVoiceNoteFile(id, created.id, organizationId, learnerId, false)).mimeType).toBe('audio/webm');
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_voice_note.added', targetId: id } })).toBe(1);
  });

  it('holds at most three recordings per comment, and a replacement does not count against the limit', async () => {
    const id = await instance();
    const ids: string[] = [];
    for (let n = 0; n < VOICE_NOTES_PER_COMMENT; n += 1) ids.push((await service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 1000)).id);
    await expect(service.assertVoiceNoteRoom(id, itemId, organizationId, learnerId, false)).rejects.toThrow('At most 3');
    await expect(service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 1000)).rejects.toThrow('At most 3');

    await service.assertVoiceNoteRoom(id, itemId, organizationId, learnerId, false, ids[0]);
    const old = await prisma.checklistVoiceNote.findUniqueOrThrow({ where: { id: ids[0]! } });
    await service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 2000, ids[0]);
    expect(await prisma.checklistVoiceNote.count({ where: { instanceId: id } })).toBe(VOICE_NOTES_PER_COMMENT);
    expect(deleteObject).toHaveBeenCalledWith(old.objectKey);
  });

  it('needs the answer to exist first', async () => {
    const id = await instance('in_progress', false);
    await expect(service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 1000)).rejects.toThrow('Mark this item');
  });

  it('removes only the author’s own recording, deletes the object and audits it', async () => {
    const id = await instance();
    const note = await service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 1000);
    await expect(service.removeVoiceNote(id, note.id, organizationId, otherId, false)).rejects.toThrow();
    expect(await prisma.checklistVoiceNote.count({ where: { instanceId: id } })).toBe(1);

    await service.removeVoiceNote(id, note.id, organizationId, learnerId, false);
    expect(await prisma.checklistVoiceNote.count({ where: { instanceId: id } })).toBe(0);
    expect(deleteObject).toHaveBeenCalled();
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_voice_note.removed', targetId: id } })).toBe(1);
  });

  it('refuses another employee’s check, but lets a reviewer read it', async () => {
    const id = await instance();
    const note = await service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 1000);
    await expect(service.getVoiceNoteFile(id, note.id, organizationId, otherId, false)).rejects.toThrow('only view your own');
    await expect(service.listVoiceNotes(id, organizationId, otherId, false)).rejects.toThrow('only view your own');
    await expect(service.getVoiceNoteFile(id, note.id, organizationId, otherId, true)).resolves.toBeDefined();
    await expect(service.addVoiceNote(id, itemId, organizationId, otherId, false, file(), 1000)).rejects.toThrow();
  });

  it('is invisible from another organization', async () => {
    const id = await instance();
    const note = await service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 1000);
    await expect(service.getVoiceNoteFile(id, note.id, secondOrganizationId, learnerId, true)).rejects.toThrow('not found');
    await expect(service.listVoiceNotes(id, secondOrganizationId, learnerId, true)).rejects.toThrow('not found');
    await expect(service.removeVoiceNote(id, note.id, secondOrganizationId, learnerId, false)).rejects.toThrow('not found');
    await expect(service.assertVoiceNoteRoom(id, itemId, secondOrganizationId, learnerId, false)).rejects.toThrow('not found');
  });

  it('lets only the session’s observer record into a session check; the executor’s own write is refused', async () => {
    const id = await instance();
    await session(id);
    await expect(service.assertVoiceNoteRoom(id, itemId, organizationId, learnerId, false)).rejects.toThrow('session');
    const note = await service.addVoiceNote(id, itemId, organizationId, observerId, true, file(), 1000);
    expect(note.createdBy).toBe(observerId);
    await expect(service.getVoiceNoteFile(id, note.id, organizationId, learnerId, false)).resolves.toBeDefined();
  });

  it('accepts nothing once the check is finished, and the recordings stay readable', async () => {
    const id = await instance();
    const note = await service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 1000);
    await prisma.checklistInstance.update({ where: { id }, data: { status: 'completed' } });
    await expect(service.assertVoiceNoteRoom(id, itemId, organizationId, learnerId, false)).rejects.toThrow('no longer editable');
    await expect(service.removeVoiceNote(id, note.id, organizationId, learnerId, false)).rejects.toThrow('no longer editable');
    expect(await prisma.checklistVoiceNote.count({ where: { instanceId: id } })).toBe(1);
    await expect(service.getVoiceNoteFile(id, note.id, organizationId, learnerId, false)).resolves.toBeDefined();
  });

  it('hides the recordings of a result an administrator deleted, and removes the rows with the check', async () => {
    const id = await instance();
    const note = await service.addVoiceNote(id, itemId, organizationId, learnerId, false, file(), 1000);
    await prisma.checklistInstance.update({ where: { id }, data: { deletedAt: new Date() } });
    await expect(service.getVoiceNoteFile(id, note.id, organizationId, learnerId, true)).rejects.toThrow('not found');
    await prisma.checklistInstance.delete({ where: { id } });
    expect(await prisma.checklistVoiceNote.count({ where: { id: note.id } })).toBe(0);
  });
});
