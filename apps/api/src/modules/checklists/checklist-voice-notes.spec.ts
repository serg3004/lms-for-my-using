import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';
import { ChecklistVoiceNotes, VOICE_NOTE_MAX_DURATION_MS, VOICE_NOTES_PER_COMMENT, voiceNoteFieldsSchema } from './checklist-voice-notes.js';

const org = '11111111-1111-1111-1111-111111111111';
const instanceId = '22222222-2222-2222-2222-222222222222';
const itemId = '33333333-3333-3333-3333-333333333333';
const author = '44444444-4444-4444-4444-444444444444';
const other = '55555555-5555-5555-5555-555555555555';
const noteId = '66666666-6666-6666-6666-666666666666';
const uploaded = { objectKey: 'organizations/o/checklist-voice/i/k', mimeType: 'audio/webm', sizeBytes: 100 };

function setup(over: { count?: number; result?: unknown; note?: unknown; instance?: unknown; writable?: () => Promise<void> } = {}) {
  const note = over.note === undefined ? { id: noteId, itemId, objectKey: 'old-key', createdBy: author, mimeType: 'audio/webm', createdAt: new Date(5) } : over.note;
  const tx = {
    checklistVoiceNote: {
      findFirst: jest.fn(async () => note),
      delete: jest.fn(async () => undefined),
      count: jest.fn(async () => over.count ?? 0),
      create: jest.fn(async () => ({ id: 'new', itemId, place: 'answer', durationMs: 1000, sizeBytes: 100, createdBy: author, createdAt: new Date() })),
    },
    checklistItemResult: { findUnique: jest.fn(async () => (over.result === undefined ? { id: 'r1' } : over.result)) },
  };
  const prisma = {
    ...tx,
    checklistInstance: { findFirst: jest.fn(async () => (over.instance === undefined ? { id: instanceId, userId: author } : over.instance)) },
    checklistVoiceNote: { ...tx.checklistVoiceNote, findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  const storage = { deleteObject: jest.fn(async () => undefined), getObjectBytes: jest.fn(async () => Buffer.from('audio')) };
  const auditLog = { record: jest.fn(async () => undefined) };
  const assertWritable = jest.fn(over.writable ?? (async () => undefined));
  const notes = new ChecklistVoiceNotes(prisma as unknown as PrismaService, storage, auditLog as unknown as AuditLogService, assertWritable, 4 * 1024 * 1024);
  return { notes, prisma, tx, storage, auditLog, assertWritable };
}

describe('voiceNoteFieldsSchema', () => {
  it('reads the multipart strings, keeps the default limit of two minutes and rejects the rest', () => {
    expect(voiceNoteFieldsSchema.parse({ durationMs: '1500' })).toEqual({ durationMs: 1500 });
    expect(voiceNoteFieldsSchema.parse({ durationMs: String(VOICE_NOTE_MAX_DURATION_MS) }).durationMs).toBe(120000);
    expect(() => voiceNoteFieldsSchema.parse({ durationMs: String(VOICE_NOTE_MAX_DURATION_MS + 1) })).toThrow();
    expect(() => voiceNoteFieldsSchema.parse({ durationMs: '0' })).toThrow();
    expect(() => voiceNoteFieldsSchema.parse({ durationMs: '12.5' })).toThrow();
    expect(() => voiceNoteFieldsSchema.parse({})).toThrow();
    expect(() => voiceNoteFieldsSchema.parse({ durationMs: '1000', replaceId: 'nope' })).toThrow();
  });
});

describe('ChecklistVoiceNotes.add', () => {
  it('stores the row, audits it and never exposes the storage key', async () => {
    const { notes, tx, auditLog } = setup();
    const created = await notes.add(instanceId, itemId, org, author, false, uploaded, 1000);
    expect(tx.checklistVoiceNote.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: org, instanceId, itemId, place: 'answer', objectKey: uploaded.objectKey, durationMs: 1000, createdBy: author }) }));
    expect(created).not.toHaveProperty('objectKey');
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_voice_note.added', targetId: instanceId }));
  });

  it('refuses a fourth recording for one comment', async () => {
    const { notes } = setup({ count: VOICE_NOTES_PER_COMMENT });
    await expect(notes.add(instanceId, itemId, org, author, false, uploaded, 1000)).rejects.toBeInstanceOf(ConflictException);
  });

  it('wants the answer marked first', async () => {
    const { notes } = setup({ result: null });
    await expect(notes.add(instanceId, itemId, org, author, false, uploaded, 1000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces the author’s own recording and deletes the old object after the swap', async () => {
    const { notes, tx, storage } = setup({ count: 0 });
    await notes.add(instanceId, itemId, org, author, false, uploaded, 1000, noteId);
    expect(tx.checklistVoiceNote.delete).toHaveBeenCalledWith({ where: { id: noteId } });
    expect(storage.deleteObject).toHaveBeenCalledWith('old-key');
  });

  it('does not let someone else replace a recording', async () => {
    const { notes, storage } = setup();
    await expect(notes.add(instanceId, itemId, org, other, false, uploaded, 1000, noteId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('stops before anything is written when the check is no longer editable', async () => {
    const { notes, tx } = setup({ writable: async () => { throw new BadRequestException('This checklist assignment is no longer editable'); } });
    await expect(notes.add(instanceId, itemId, org, author, false, uploaded, 1000)).rejects.toThrow('no longer editable');
    expect(tx.checklistVoiceNote.create).not.toHaveBeenCalled();
  });
});

describe('ChecklistVoiceNotes.assertHasRoom', () => {
  it('counts the other recordings only when one is being replaced', async () => {
    const { notes, tx } = setup({ count: VOICE_NOTES_PER_COMMENT - 1 });
    await notes.assertHasRoom(instanceId, itemId, org, author, false, noteId);
    expect(tx.checklistVoiceNote.count).toHaveBeenCalledWith({ where: expect.objectContaining({ id: { not: noteId } }) });
  });

  it('answers 404 for another organization’s or a deleted check', async () => {
    const { notes } = setup({ instance: null });
    await expect(notes.assertHasRoom(instanceId, itemId, org, author, false)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ChecklistVoiceNotes.remove', () => {
  it('deletes the row and the object and audits it', async () => {
    const { notes, prisma, storage, auditLog } = setup();
    await notes.remove(instanceId, noteId, org, author, false);
    expect(prisma.checklistVoiceNote.delete).toHaveBeenCalledWith({ where: { id: noteId } });
    expect(storage.deleteObject).toHaveBeenCalledWith('old-key');
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_voice_note.removed' }));
  });

  it('is only for the author, and a missing recording is 404', async () => {
    await expect(setup().notes.remove(instanceId, noteId, org, other, false)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup({ note: null }).notes.remove(instanceId, noteId, org, author, false)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ChecklistVoiceNotes reading', () => {
  it('serves the bytes to the executor or a reviewer, and refuses another employee', async () => {
    const { notes, storage } = setup();
    const file = await notes.getFile(instanceId, noteId, org, author, false);
    expect(file).toEqual({ bytes: Buffer.from('audio'), mimeType: 'audio/webm', version: 5 });
    expect(storage.getObjectBytes).toHaveBeenCalledWith('old-key', 4 * 1024 * 1024);
    await expect(notes.getFile(instanceId, noteId, org, other, false)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(notes.getFile(instanceId, noteId, org, other, true)).resolves.toBeDefined();
  });

  it('answers 404 when the object is gone and refuses the list to a stranger', async () => {
    const gone = setup();
    gone.storage.getObjectBytes.mockResolvedValueOnce(null as never);
    await expect(gone.notes.getFile(instanceId, noteId, org, author, false)).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup().notes.list(instanceId, org, other, false)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup().notes.list(instanceId, org, author, false)).resolves.toEqual([]);
  });
});
