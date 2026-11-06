import { richTextSchema } from '@lms/shared/rich-text';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';

/** PR 421: at most this many extra pictures per sheet. */
export const MAX_SHEET_PHOTOS = 6;
export const SHEET_PHOTO_CAPTION_MAX_LENGTH = 200;

export const sheetPhotoCaptionSchema = z.object({ caption: richTextSchema(SHEET_PHOTO_CAPTION_MAX_LENGTH).default('') });
export const updateSheetPhotoSchema = z.object({ caption: richTextSchema(SHEET_PHOTO_CAPTION_MAX_LENGTH) });
export const reorderSheetPhotosSchema = z.object({ ids: z.array(z.string().uuid()).max(MAX_SHEET_PHOTOS) });

/** What the API shows of a picture: never the storage key or the MIME type. */
export const sheetPhotoSelect = { id: true, caption: true, order: true, updatedAt: true } as const;
export const sheetPhotosInclude = { orderBy: { order: 'asc' as const }, select: sheetPhotoSelect } as const;

type Storage = {
  deleteObject(key: string): Promise<void>;
  getObjectBytes(key: string, maxBytes: number): Promise<Buffer | null>;
  copyChecklistSheetPhoto(sourceKey: string, organizationId: string, checklistId: string): Promise<string>;
};

/**
 * PR 421: extra pictures of a checklist. The same visibility rules as the cover (`assertVisible` is the
 * service's cover rule: staff see any sheet of their organization, a learner only a published free sheet or
 * one assigned to them, everything else is a plain 404). Storage failures after the database change are
 * best-effort: an orphaned object never breaks a sheet.
 */
export class ChecklistSheetPhotos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: Storage,
    private readonly auditLog: AuditLogService,
    private readonly assertVisible: (checklistId: string, organizationId: string, userId: string, isPrivileged: boolean) => Promise<void>,
    private readonly maxBytes: number,
  ) {}

  private async requireSheet(checklistId: string, organizationId: string) {
    const sheet = await this.prisma.checklist.findFirst({ where: { id: checklistId, organizationId, deletedAt: null }, select: { id: true, title: true } });
    if (!sheet) throw new NotFoundException('Checklist not found');
    return sheet;
  }

  async count(checklistId: string, organizationId: string) {
    return this.prisma.checklistPhoto.count({ where: { checklistId, organizationId } });
  }

  /** Called before the file is stored, so a full sheet does not leave an object behind. */
  async assertHasRoom(checklistId: string, organizationId: string) {
    await this.requireSheet(checklistId, organizationId);
    if ((await this.count(checklistId, organizationId)) >= MAX_SHEET_PHOTOS) {
      throw new ConflictException(`At most ${MAX_SHEET_PHOTOS} extra pictures per checklist`);
    }
  }

  async add(checklistId: string, organizationId: string, actorId: string, uploaded: { objectKey: string; mimeType: string }, caption: string) {
    const sheet = await this.requireSheet(checklistId, organizationId);
    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.checklistPhoto.findMany({ where: { checklistId, organizationId }, select: { order: true } });
      if (existing.length >= MAX_SHEET_PHOTOS) throw new ConflictException(`At most ${MAX_SHEET_PHOTOS} extra pictures per checklist`);
      const order = existing.reduce((max, row) => Math.max(max, row.order), -1) + 1;
      return tx.checklistPhoto.create({
        data: { organizationId, checklistId, order, caption, objectKey: uploaded.objectKey, mimeType: uploaded.mimeType },
        select: sheetPhotoSelect,
      });
    });
    await this.auditLog.record({ organizationId, actorId, action: 'checklist.photo_added', targetType: 'checklist', targetId: checklistId, summary: `Added a picture to checklist ${sheet.title}` });
    return created;
  }

  async setCaption(checklistId: string, photoId: string, organizationId: string, caption: string) {
    await this.requireSheet(checklistId, organizationId);
    const found = await this.prisma.checklistPhoto.findFirst({ where: { id: photoId, checklistId, organizationId }, select: { id: true } });
    if (!found) throw new NotFoundException('Picture not found');
    return this.prisma.checklistPhoto.update({ where: { id: photoId }, data: { caption }, select: sheetPhotoSelect });
  }

  /** The new order must list exactly the pictures the sheet has now. */
  async reorder(checklistId: string, organizationId: string, ids: readonly string[]) {
    await this.requireSheet(checklistId, organizationId);
    const current = await this.prisma.checklistPhoto.findMany({ where: { checklistId, organizationId }, select: { id: true } });
    if (new Set(ids).size !== ids.length || ids.length !== current.length || !current.every((row) => ids.includes(row.id))) {
      throw new BadRequestException('The list must contain every picture of the checklist exactly once');
    }
    await this.prisma.$transaction(ids.map((id, order) => this.prisma.checklistPhoto.update({ where: { id }, data: { order } })));
    return this.prisma.checklistPhoto.findMany({ where: { checklistId, organizationId }, ...sheetPhotosInclude });
  }

  async remove(checklistId: string, photoId: string, organizationId: string, actorId: string) {
    const sheet = await this.requireSheet(checklistId, organizationId);
    const found = await this.prisma.checklistPhoto.findFirst({ where: { id: photoId, checklistId, organizationId }, select: { id: true, objectKey: true } });
    if (!found) throw new NotFoundException('Picture not found');
    await this.prisma.checklistPhoto.delete({ where: { id: photoId } });
    // keep "order" gap-free for the remaining pictures
    const rest = await this.prisma.checklistPhoto.findMany({ where: { checklistId, organizationId }, orderBy: { order: 'asc' }, select: { id: true } });
    await this.prisma.$transaction(rest.map((row, order) => this.prisma.checklistPhoto.update({ where: { id: row.id }, data: { order } })));
    await this.storage.deleteObject(found.objectKey).catch(() => undefined);
    await this.auditLog.record({ organizationId, actorId, action: 'checklist.photo_removed', targetType: 'checklist', targetId: checklistId, summary: `Removed a picture of checklist ${sheet.title}` });
  }

  /** The picture bytes for `<img>`; `updatedAt` is the cache key. */
  async getFile(checklistId: string, photoId: string, organizationId: string, userId: string, isPrivileged: boolean) {
    const photo = await this.prisma.checklistPhoto.findFirst({
      where: { id: photoId, checklistId, organizationId, checklist: { deletedAt: null } },
      select: { objectKey: true, mimeType: true, updatedAt: true },
    });
    if (!photo) throw new NotFoundException('Picture not found');
    await this.assertVisible(checklistId, organizationId, userId, isPrivileged);
    const bytes = await this.storage.getObjectBytes(photo.objectKey, this.maxBytes);
    if (!bytes) throw new NotFoundException('Picture not found');
    return { bytes, mimeType: photo.mimeType, version: photo.updatedAt.getTime() };
  }

  /** A copied sheet gets its own objects (best effort: a storage failure must not undo the copy). */
  async copyAll(sourceChecklistId: string, copyChecklistId: string, organizationId: string) {
    const source = await this.prisma.checklistPhoto.findMany({ where: { checklistId: sourceChecklistId, organizationId }, orderBy: { order: 'asc' }, select: { caption: true, objectKey: true, mimeType: true } });
    let order = 0;
    for (const photo of source) {
      try {
        const objectKey = await this.storage.copyChecklistSheetPhoto(photo.objectKey, organizationId, copyChecklistId);
        await this.prisma.checklistPhoto.create({ data: { organizationId, checklistId: copyChecklistId, order, caption: photo.caption, objectKey, mimeType: photo.mimeType } });
        order += 1;
      } catch {
        // this picture is simply missing in the copy
      }
    }
  }
}
