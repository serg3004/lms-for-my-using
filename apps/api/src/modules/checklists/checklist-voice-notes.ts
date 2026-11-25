import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';

/** PR 509: defaults from the owner (2026-11-22); PR 511 makes them a setting of the organization. */
export const VOICE_NOTE_MAX_DURATION_MS = 2 * 60 * 1000;
export const VOICE_NOTE_MIN_DURATION_MS = 300;
export const VOICE_NOTES_PER_COMMENT = 3;

const uuid = z.guid();
/** Multipart fields arrive as strings; `place` is only `answer` until PR 512 connects the other comment places. */
export const voiceNoteFieldsSchema = z.object({
  durationMs: z.coerce.number().int().min(VOICE_NOTE_MIN_DURATION_MS).max(VOICE_NOTE_MAX_DURATION_MS),
  replaceId: uuid.optional(),
});

/** What the API shows of a recording: never the storage key or the MIME type. */
export const voiceNoteSelect = { id: true, itemId: true, place: true, durationMs: true, sizeBytes: true, createdBy: true, createdAt: true } as const;

type Storage = {
  deleteObject(key: string): Promise<void>;
  getObjectBytes(key: string, maxBytes: number): Promise<Buffer | null>;
};

type WritableCheck = (instanceId: string, organizationId: string, requesterId: string, isPrivileged: boolean) => Promise<void>;

/**
 * PR 509: voice recordings of the comment of one answer. Writing follows the answer photo exactly (`assertWritable` is
 * the service's own writable-instance rule: an observer for a session, the executor for a self-filled check, nothing
 * after the check is finished or expired). Since PR 510 a recording may precede the answer: it counts as the answer's
 * explanation. Reading follows the photo too: the executor or a reviewer, only through the
 * API. A check deleted by an administrator is "not found" here as everywhere. Storage failures after the database
 * change are best-effort: an orphaned object never breaks a check.
 */
export class ChecklistVoiceNotes {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: Storage,
    private readonly auditLog: AuditLogService,
    private readonly assertWritable: WritableCheck,
    private readonly maxBytes: number,
  ) {}

  private async requireInstance(instanceId: string, organizationId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({ where: { id: instanceId, organizationId, deletedAt: null }, select: { id: true, userId: true } });
    if (!instance) throw new NotFoundException('Checklist assignment not found');
    return instance;
  }

  /**
   * PR 510: a recording counts as the explanation of an answer, so it may come before the answer is saved (a required
   * explanation is the reason the answer waits). It only has to belong to a criterion of this very check.
   */
  private async assertItemOfCheck(db: Pick<PrismaService, 'checklistItem'>, instanceId: string, itemId: string, organizationId: string) {
    const item = await db.checklistItem.findFirst({ where: { id: itemId, organizationId, checklist: { instances: { some: { id: instanceId } } } }, select: { id: true } });
    if (!item) throw new NotFoundException('Checklist item not found');
  }

  /** The recordings of a check, without storage keys. The check's executor and reviewers see them. */
  async list(instanceId: string, organizationId: string, requesterId: string, isPrivileged: boolean) {
    const instance = await this.requireInstance(instanceId, organizationId);
    if (instance.userId !== requesterId && !isPrivileged) throw new ForbiddenException('You can only view your own checklist assignment');
    return this.prisma.checklistVoiceNote.findMany({ where: { instanceId, organizationId }, orderBy: { createdAt: 'asc' }, select: voiceNoteSelect });
  }

  /** Called before the file is stored, so a full comment does not leave an object behind. `replaceId` frees one place. */
  async assertHasRoom(instanceId: string, itemId: string, organizationId: string, requesterId: string, isPrivileged: boolean, replaceId?: string) {
    await this.requireInstance(instanceId, organizationId);
    await this.assertWritable(instanceId, organizationId, requesterId, isPrivileged);
    await this.assertItemOfCheck(this.prisma, instanceId, itemId, organizationId);
    const count = await this.prisma.checklistVoiceNote.count({ where: { instanceId, organizationId, itemId, place: 'answer', ...(replaceId ? { id: { not: replaceId } } : {}) } });
    if (count >= VOICE_NOTES_PER_COMMENT) throw new ConflictException(`At most ${VOICE_NOTES_PER_COMMENT} voice recordings per comment`);
  }

  /** Stores the row for an already uploaded file; with `replaceId` the author's earlier recording is removed in the same step. */
  async add(
    instanceId: string,
    itemId: string,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
    uploaded: { objectKey: string; mimeType: string; sizeBytes: number },
    durationMs: number,
    replaceId?: string,
  ) {
    await this.assertWritable(instanceId, organizationId, requesterId, isPrivileged);
    let replacedKey: string | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      if (replaceId) {
        const old = await tx.checklistVoiceNote.findFirst({ where: { id: replaceId, instanceId, organizationId, itemId, place: 'answer' }, select: { id: true, objectKey: true, createdBy: true } });
        if (!old) throw new NotFoundException('Voice recording not found');
        if (old.createdBy !== requesterId) throw new ForbiddenException('Only the author can replace a voice recording');
        await tx.checklistVoiceNote.delete({ where: { id: old.id } });
        replacedKey = old.objectKey;
      }
      await this.assertItemOfCheck(tx, instanceId, itemId, organizationId);
      const count = await tx.checklistVoiceNote.count({ where: { instanceId, organizationId, itemId, place: 'answer' } });
      if (count >= VOICE_NOTES_PER_COMMENT) throw new ConflictException(`At most ${VOICE_NOTES_PER_COMMENT} voice recordings per comment`);
      return tx.checklistVoiceNote.create({
        data: { organizationId, instanceId, itemId, place: 'answer', objectKey: uploaded.objectKey, mimeType: uploaded.mimeType, durationMs, sizeBytes: uploaded.sizeBytes, createdBy: requesterId },
        select: voiceNoteSelect,
      });
    });
    if (replacedKey) await this.storage.deleteObject(replacedKey).catch(() => undefined);
    await this.auditLog.record({
      organizationId, actorId: requesterId, action: 'checklist_voice_note.added', targetType: 'checklist_instance', targetId: instanceId,
      summary: 'Added a voice recording to a checklist comment', metadata: { itemId, voiceNoteId: created.id, durationMs },
    });
    return created;
  }

  /** Only the author removes a recording, and only while the check can still be edited. */
  async remove(instanceId: string, noteId: string, organizationId: string, requesterId: string, isPrivileged: boolean) {
    await this.requireInstance(instanceId, organizationId);
    await this.assertWritable(instanceId, organizationId, requesterId, isPrivileged);
    const note = await this.prisma.checklistVoiceNote.findFirst({ where: { id: noteId, instanceId, organizationId }, select: { id: true, itemId: true, objectKey: true, createdBy: true } });
    if (!note) throw new NotFoundException('Voice recording not found');
    if (note.createdBy !== requesterId) throw new ForbiddenException('Only the author can remove a voice recording');
    await this.prisma.checklistVoiceNote.delete({ where: { id: note.id } });
    await this.storage.deleteObject(note.objectKey).catch(() => undefined);
    await this.auditLog.record({
      organizationId, actorId: requesterId, action: 'checklist_voice_note.removed', targetType: 'checklist_instance', targetId: instanceId,
      summary: 'Removed a voice recording of a checklist comment', metadata: { itemId: note.itemId, voiceNoteId: note.id },
    });
  }

  /** The recording bytes for `<audio>`; read by the server, never a stored public link. Listening is not logged (owner decision 3). */
  async getFile(instanceId: string, noteId: string, organizationId: string, requesterId: string, isPrivileged: boolean) {
    const instance = await this.requireInstance(instanceId, organizationId);
    if (instance.userId !== requesterId && !isPrivileged) throw new ForbiddenException('You can only view your own checklist assignment');
    const note = await this.prisma.checklistVoiceNote.findFirst({ where: { id: noteId, instanceId, organizationId }, select: { objectKey: true, mimeType: true, createdAt: true } });
    if (!note) throw new NotFoundException('Voice recording not found');
    const bytes = await this.storage.getObjectBytes(note.objectKey, this.maxBytes);
    if (!bytes) throw new NotFoundException('Voice recording not found');
    return { bytes, mimeType: note.mimeType, version: note.createdAt.getTime() };
  }
}
