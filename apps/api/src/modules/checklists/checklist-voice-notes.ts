import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { effectiveVoice, loadVoicePolicy, type EffectiveVoice } from '../../common/voice-policy.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';

/** PR 509: defaults from the owner (2026-11-22). PR 511: the organization sets its own values, never above these. */
export const VOICE_NOTE_MAX_DURATION_MS = 2 * 60 * 1000;
export const VOICE_NOTE_MIN_DURATION_MS = 300;
export const VOICE_NOTES_PER_COMMENT = 3;

/** PR 512: where in a check the comment lives. `summary` is the session's closing text, one of three fields. */
export const voiceNotePlaces = ['answer', 'reviewer_comment', 'summary'] as const;
export const voiceSummaryFields = ['strengths', 'developmentAreas', 'nextSteps'] as const;
export type VoiceKind = { place: (typeof voiceNotePlaces)[number]; field?: (typeof voiceSummaryFields)[number] | null };

const uuid = z.guid();
/** Multipart fields arrive as strings; `place` is only `answer` until PR 512 connects the other comment places. */
export const voiceNoteFieldsSchema = z.object({
  durationMs: z.coerce.number().int().min(VOICE_NOTE_MIN_DURATION_MS).max(VOICE_NOTE_MAX_DURATION_MS),
  replaceId: uuid.optional(),
  /** PR 512: the comment of an answer by default; a reviewer's comment or a summary field are the other places. */
  place: z.enum(voiceNotePlaces).default('answer'),
  field: z.enum(voiceSummaryFields).optional(),
});

/** What the API shows of a recording: never the storage key or the MIME type. */
export const voiceNoteSelect = { id: true, itemId: true, place: true, field: true, durationMs: true, sizeBytes: true, createdBy: true, createdAt: true } as const;

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
    /** PR 512: a reviewer's comment can only be changed while the check waits for review (the rule of the review itself). */
    private readonly assertReviewable: (instanceId: string, organizationId: string) => Promise<void> = async () => undefined,
  ) {}

  private async requireInstance(instanceId: string, organizationId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({ where: { id: instanceId, organizationId, deletedAt: null }, select: { id: true, userId: true } });
    if (!instance) throw new NotFoundException('Checklist assignment not found');
    return instance;
  }

  /** PR 511: what this check may do now. Recordings already made stay listenable and removable whatever the setting says. */
  private async settings(instanceId: string, organizationId: string): Promise<EffectiveVoice> {
    const instance = await this.prisma.checklistInstance.findFirst({ where: { id: instanceId, organizationId }, select: { checklist: { select: { voiceNotesMode: true, dictationMode: true } } } });
    return effectiveVoice(await loadVoicePolicy(this.prisma, organizationId), instance?.checklist ?? {});
  }

  /** A forbidden mode is refused by the server, whatever the screen shows. */
  private assertAllowed(settings: EffectiveVoice, durationMs?: number) {
    if (!settings.voiceNotes) throw new ForbiddenException('Voice recording is turned off for this checklist');
    if (durationMs !== undefined && durationMs > settings.maxSeconds * 1000) throw new BadRequestException(`A voice recording may last at most ${settings.maxSeconds} seconds`);
  }

  /**
   * PR 510: a recording counts as the explanation of an answer, so it may come before the answer is saved (a required
   * explanation is the reason the answer waits). It only has to belong to a criterion of this very check.
   */
  private async assertItemOfCheck(db: Pick<PrismaService, 'checklistItem'>, instanceId: string, itemId: string, organizationId: string) {
    const item = await db.checklistItem.findFirst({ where: { id: itemId, organizationId, checklist: { instances: { some: { id: instanceId } } } }, select: { id: true } });
    if (!item) throw new NotFoundException('Checklist item not found');
  }

  /** PR 512: the place a recording belongs to; a summary has no criterion, an answer or a reviewer's comment always has one. */
  private target(itemId: string | null, kind?: VoiceKind) {
    const place = kind?.place ?? 'answer';
    if (place === 'summary') {
      if (itemId || !kind?.field) throw new BadRequestException('A summary recording needs a field and no criterion');
      return { place, itemId: null, field: kind.field };
    }
    if (!itemId || kind?.field) throw new BadRequestException('A recording belongs to one criterion');
    return { place, itemId, field: null };
  }

  /** Who may write: a reviewer's comment follows the review (a reviewer, the check waits for it); the rest follows the answer. */
  private async assertWriteAccess(place: VoiceKind['place'], instanceId: string, organizationId: string, requesterId: string, isPrivileged: boolean) {
    if (place === 'reviewer_comment') {
      if (!isPrivileged) throw new ForbiddenException('Only a reviewer can leave a voice comment on a review');
      await this.assertReviewable(instanceId, organizationId);
      return;
    }
    await this.assertWritable(instanceId, organizationId, requesterId, isPrivileged);
  }

  /** Which place a recording is in, so the caller can pick the right kind of actor before it deletes it. */
  async placeOf(instanceId: string, noteId: string, organizationId: string) {
    const note = await this.prisma.checklistVoiceNote.findFirst({ where: { id: noteId, instanceId, organizationId }, select: { place: true } });
    if (!note) throw new NotFoundException('Voice recording not found');
    return note.place;
  }

  /** The recordings of a check, without storage keys. The check's executor and reviewers see them. */
  async list(instanceId: string, organizationId: string, requesterId: string, isPrivileged: boolean) {
    const instance = await this.requireInstance(instanceId, organizationId);
    if (instance.userId !== requesterId && !isPrivileged) throw new ForbiddenException('You can only view your own checklist assignment');
    return this.prisma.checklistVoiceNote.findMany({ where: { instanceId, organizationId }, orderBy: { createdAt: 'asc' }, select: voiceNoteSelect });
  }

  /** Called before the file is stored, so a full comment does not leave an object behind. `replaceId` frees one place. */
  async assertHasRoom(instanceId: string, itemId: string | null, organizationId: string, requesterId: string, isPrivileged: boolean, replaceId?: string, durationMs?: number, kind?: VoiceKind) {
    const target = this.target(itemId, kind);
    await this.requireInstance(instanceId, organizationId);
    const settings = await this.settings(instanceId, organizationId);
    this.assertAllowed(settings, durationMs);
    await this.assertWriteAccess(target.place, instanceId, organizationId, requesterId, isPrivileged);
    if (target.itemId) await this.assertItemOfCheck(this.prisma, instanceId, target.itemId, organizationId);
    const count = await this.prisma.checklistVoiceNote.count({ where: { instanceId, organizationId, itemId: target.itemId, place: target.place, field: target.field, ...(replaceId ? { id: { not: replaceId } } : {}) } });
    if (count >= settings.perComment) throw new ConflictException(`At most ${settings.perComment} voice recordings per comment`);
  }

  /** Stores the row for an already uploaded file; with `replaceId` the author's earlier recording is removed in the same step. */
  async add(
    instanceId: string,
    itemId: string | null,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
    uploaded: { objectKey: string; mimeType: string; sizeBytes: number },
    durationMs: number,
    replaceId?: string,
    kind?: VoiceKind,
  ) {
    const target = this.target(itemId, kind);
    await this.assertWriteAccess(target.place, instanceId, organizationId, requesterId, isPrivileged);
    const settings = await this.settings(instanceId, organizationId);
    this.assertAllowed(settings, durationMs);
    let replacedKey: string | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      if (replaceId) {
        const old = await tx.checklistVoiceNote.findFirst({ where: { id: replaceId, instanceId, organizationId, itemId: target.itemId, place: target.place, field: target.field }, select: { id: true, objectKey: true, createdBy: true } });
        if (!old) throw new NotFoundException('Voice recording not found');
        if (old.createdBy !== requesterId) throw new ForbiddenException('Only the author can replace a voice recording');
        await tx.checklistVoiceNote.delete({ where: { id: old.id } });
        replacedKey = old.objectKey;
      }
      if (target.itemId) await this.assertItemOfCheck(tx, instanceId, target.itemId, organizationId);
      const count = await tx.checklistVoiceNote.count({ where: { instanceId, organizationId, itemId: target.itemId, place: target.place, field: target.field } });
      if (count >= settings.perComment) throw new ConflictException(`At most ${settings.perComment} voice recordings per comment`);
      return tx.checklistVoiceNote.create({
        data: { organizationId, instanceId, itemId: target.itemId, place: target.place, field: target.field, objectKey: uploaded.objectKey, mimeType: uploaded.mimeType, durationMs, sizeBytes: uploaded.sizeBytes, createdBy: requesterId },
        select: voiceNoteSelect,
      });
    });
    if (replacedKey) await this.storage.deleteObject(replacedKey).catch(() => undefined);
    await this.auditLog.record({
      organizationId, actorId: requesterId, action: 'checklist_voice_note.added', targetType: 'checklist_instance', targetId: instanceId,
      summary: 'Added a voice recording to a checklist comment', metadata: { itemId: target.itemId, place: target.place, field: target.field, voiceNoteId: created.id, durationMs },
    });
    return created;
  }

  /** Only the author removes a recording, and only while the check can still be edited. */
  async remove(instanceId: string, noteId: string, organizationId: string, requesterId: string, isPrivileged: boolean) {
    await this.requireInstance(instanceId, organizationId);
    const note = await this.prisma.checklistVoiceNote.findFirst({ where: { id: noteId, instanceId, organizationId }, select: { id: true, itemId: true, place: true, objectKey: true, createdBy: true } });
    if (!note) throw new NotFoundException('Voice recording not found');
    await this.assertWriteAccess(note.place, instanceId, organizationId, requesterId, isPrivileged);
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
