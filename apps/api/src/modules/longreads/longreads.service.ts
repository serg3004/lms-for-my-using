import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { collectContentIds, COMPOSITE_BLOCK_TYPES, isKnownBlockType, LONGREAD_SCHEMA_VERSION, validateBlockContent } from './longread-blocks.js';
import {
  MAX_BLOCKS_PER_DOCUMENT,
  MAX_CHAPTERS,
  longreadSettingsSchema,
  type LongreadSettings,
  type SaveLongreadInput,
} from './longreads.schemas.js';

type Tx = Prisma.TransactionClient;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Autosave fires every few seconds; one audit record per document per this window is enough. */
const AUDIT_THROTTLE_MS = 5 * 60 * 1000;

function newAnchor() {
  return `ch-${randomUUID().slice(0, 8)}`;
}

/** Copies JSON content giving every `id` that looks like a UUID a fresh value, so a copy never shares ids with its source. */
export function remapContentIds(value: unknown, idMap: Map<string, string> = new Map()): unknown {
  if (Array.isArray(value)) return value.map((item) => remapContentIds(item, idMap));
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'id' && typeof item === 'string' && UUID_PATTERN.test(item)) {
        if (!idMap.has(item)) idMap.set(item, randomUUID());
        result[key] = idMap.get(item);
      } else {
        result[key] = remapContentIds(item, idMap);
      }
    }
    return result;
  }
  return value;
}

@Injectable()
export class LongreadsService {
  private readonly lastAudit = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  /** Longread lessons can be created and opened only in organizations where the admin switched the feature on. */
  async isEnabled(organizationId: string, db: Pick<PrismaService, 'organization'> | Tx = this.prisma) {
    const org = await db.organization.findFirst({ where: { id: organizationId }, select: { longreadEnabled: true } });
    return org?.longreadEnabled === true;
  }

  async ensureEnabled(organizationId: string, db: Pick<PrismaService, 'organization'> | Tx = this.prisma) {
    if (!(await this.isEnabled(organizationId, db))) throw new NotFoundException('Not found');
  }

  /** Called by the lessons service inside its transaction: every longread lesson starts with one empty chapter. */
  async createForLesson(tx: Tx, organizationId: string, lessonId: string) {
    await this.ensureEnabled(organizationId, tx);
    const document = await tx.longreadDocument.create({
      data: { organizationId, lessonId, schemaVersion: LONGREAD_SCHEMA_VERSION, settings: longreadSettingsSchema.parse({}) },
      select: { id: true },
    });
    await tx.longreadChapter.create({
      data: { organizationId, documentId: document.id, order: 0, title: 'Глава 1', anchor: newAnchor() },
    });
  }

  async getDraft(lessonId: string, organizationId: string) {
    await this.ensureEnabled(organizationId);
    const document = await this.prisma.longreadDocument.findFirst({
      where: { lessonId, organizationId, lesson: { deletedAt: null } },
      include: {
        chapters: { orderBy: { order: 'asc' }, include: { blocks: { orderBy: { order: 'asc' } } } },
      },
    });
    if (!document) throw new NotFoundException('Longread not found');

    return {
      lessonId,
      revision: document.draftRevision,
      schemaVersion: document.schemaVersion,
      settings: { ...longreadSettingsSchema.parse({}), ...(document.settings as object) } as LongreadSettings,
      chapters: document.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        anchor: chapter.anchor,
        hidden: chapter.hidden,
        blocks: chapter.blocks.map((block) => ({
          id: block.id,
          type: block.type,
          title: block.title,
          hidden: block.hidden,
          schemaVersion: block.schemaVersion,
          known: isKnownBlockType(block.type),
          content: block.content,
        })),
      })),
    };
  }

  async saveDraft(lessonId: string, organizationId: string, input: SaveLongreadInput, actorId: string | null) {
    await this.ensureEnabled(organizationId);

    const blockCount = input.chapters.reduce((sum, chapter) => sum + chapter.blocks.length, 0);
    if (blockCount > MAX_BLOCKS_PER_DOCUMENT) throw new BadRequestException(`A longread can hold at most ${MAX_BLOCKS_PER_DOCUMENT} blocks`);

    // Validate every block before touching the database.
    const validated = input.chapters.map((chapter) =>
      chapter.blocks.map((block) => {
        const result = validateBlockContent(block.type, block.content, block.id);
        if (!result.ok) throw new BadRequestException(result.message);
        return result.content;
      }),
    );

    // Every id in the draft (blocks, tabs, columns, nested blocks) is unique: a copy that kept ids would make edits ambiguous.
    const seenIds = new Set<string>();
    for (const chapter of input.chapters) {
      for (const block of chapter.blocks) {
        const nested = (COMPOSITE_BLOCK_TYPES as readonly string[]).includes(block.type) ? collectContentIds(block.content) : [];
        for (const id of [...(block.id ? [block.id] : []), ...nested]) {
          if (seenIds.has(id)) throw new BadRequestException(`Duplicate block id ${id}`);
          seenIds.add(id);
        }
      }
    }

    const revision = await this.prisma.$transaction(async (tx) => {
      const document = await tx.longreadDocument.findFirst({
        where: { lessonId, organizationId, lesson: { deletedAt: null } },
        select: { id: true, draftRevision: true },
      });
      if (!document) throw new NotFoundException('Longread not found');

      // Atomic compare-and-swap: of two concurrent saves of the same revision only one updates the row.
      const swapped = await tx.longreadDocument.updateMany({
        where: { id: document.id, draftRevision: input.revision },
        data: {
          draftRevision: { increment: 1 },
          ...(input.settings ? { settings: input.settings } : {}),
        },
      });
      if (swapped.count === 0) {
        const current = await tx.longreadDocument.findUnique({ where: { id: document.id }, select: { draftRevision: true } });
        throw new ConflictException({ message: 'Longread was changed by someone else', currentRevision: current?.draftRevision ?? null });
      }

      const existingChapters = await tx.longreadChapter.findMany({ where: { documentId: document.id }, select: { id: true, anchor: true } });
      const existingBlocks = await tx.longreadBlock.findMany({ where: { organizationId, chapter: { documentId: document.id } }, select: { id: true } });
      const chapterAnchors = new Map(existingChapters.map((chapter) => [chapter.id, chapter.anchor]));
      const blockIds = new Set(existingBlocks.map((block) => block.id));

      const keepChapterIds = new Set<string>();
      const keepBlockIds = new Set<string>();
      for (const chapter of input.chapters) {
        if (chapter.id) {
          if (!chapterAnchors.has(chapter.id)) throw new BadRequestException('Chapter does not belong to this longread');
          if (keepChapterIds.has(chapter.id)) throw new BadRequestException('Duplicate chapter id');
          keepChapterIds.add(chapter.id);
        }
        for (const block of chapter.blocks) {
          if (!block.id) continue;
          if (!blockIds.has(block.id)) throw new BadRequestException('Block does not belong to this longread');
          if (keepBlockIds.has(block.id)) throw new BadRequestException('Duplicate block id');
          keepBlockIds.add(block.id);
        }
      }

      // Blocks go first: a block can move between chapters, so drop what is gone before chapters are removed.
      const dropBlocks = [...blockIds].filter((id) => !keepBlockIds.has(id));
      if (dropBlocks.length) await tx.longreadBlock.deleteMany({ where: { id: { in: dropBlocks }, organizationId } });
      const dropChapters = [...chapterAnchors.keys()].filter((id) => !keepChapterIds.has(id));


      for (const [chapterIndex, chapter] of input.chapters.entries()) {
        let chapterId = chapter.id;
        if (chapterId) {
          await tx.longreadChapter.update({ where: { id: chapterId }, data: { order: chapterIndex, title: chapter.title, hidden: chapter.hidden } });
        } else {
          const created = await tx.longreadChapter.create({
            data: { organizationId, documentId: document.id, order: chapterIndex, title: chapter.title, hidden: chapter.hidden, anchor: newAnchor() },
            select: { id: true },
          });
          chapterId = created.id;
        }
        for (const [blockIndex, block] of chapter.blocks.entries()) {
          const content = validated[chapterIndex]![blockIndex]! as Prisma.InputJsonObject;
          if (block.id) {
            await tx.longreadBlock.update({
              where: { id: block.id },
              data: { chapterId, order: blockIndex, type: block.type, schemaVersion: block.schemaVersion, content,
                ...(block.title !== undefined ? { title: block.title } : {}), ...(block.hidden !== undefined ? { hidden: block.hidden } : {}) },
            });
          } else {
            await tx.longreadBlock.create({
              data: { organizationId, chapterId, order: blockIndex, type: block.type, schemaVersion: block.schemaVersion, content, title: block.title ?? null, hidden: block.hidden ?? false },
            });
          }
        }
      }
      // Move retained blocks before deleting chapters, whose deletion cascades to their remaining blocks.
      if (dropChapters.length) await tx.longreadChapter.deleteMany({ where: { id: { in: dropChapters }, documentId: document.id } });
      return input.revision + 1;
    });

    await this.recordUpdated(lessonId, organizationId, actorId, revision, input.chapters.length, blockCount);
    return this.getDraft(lessonId, organizationId);
  }

  /** Deep copy of a chapter (blocks and nested ids included) placed right after the original. */
  async duplicateChapter(lessonId: string, chapterId: string, organizationId: string, revision: number, actorId: string | null) {
    await this.ensureEnabled(organizationId);

    await this.prisma.$transaction(async (tx) => {
      const document = await tx.longreadDocument.findFirst({
        where: { lessonId, organizationId, lesson: { deletedAt: null } },
        select: { id: true },
      });
      if (!document) throw new NotFoundException('Longread not found');

      const source = await tx.longreadChapter.findFirst({
        where: { id: chapterId, documentId: document.id },
        include: { blocks: { orderBy: { order: 'asc' } } },
      });
      if (!source) throw new NotFoundException('Chapter not found');

      const chapterCount = await tx.longreadChapter.count({ where: { documentId: document.id } });
      if (chapterCount >= MAX_CHAPTERS) throw new BadRequestException(`A longread can hold at most ${MAX_CHAPTERS} chapters`);

      const swapped = await tx.longreadDocument.updateMany({
        where: { id: document.id, draftRevision: revision },
        data: { draftRevision: { increment: 1 } },
      });
      if (swapped.count === 0) {
        const current = await tx.longreadDocument.findUnique({ where: { id: document.id }, select: { draftRevision: true } });
        throw new ConflictException({ message: 'Longread was changed by someone else', currentRevision: current?.draftRevision ?? null });
      }

      await tx.longreadChapter.updateMany({ where: { documentId: document.id, order: { gt: source.order } }, data: { order: { increment: 1 } } });
      const copy = await tx.longreadChapter.create({
        data: {
          organizationId,
          documentId: document.id,
          order: source.order + 1,
          title: `${source.title} (копия)`.slice(0, 200),
          hidden: source.hidden,
          anchor: newAnchor(),
        },
        select: { id: true },
      });
      for (const block of source.blocks) {
        await tx.longreadBlock.create({
          data: {
            organizationId,
            chapterId: copy.id,
            order: block.order,
            type: block.type,
            title: block.title,
            hidden: block.hidden,
            schemaVersion: block.schemaVersion,
            content: remapContentIds(block.content) as Prisma.InputJsonObject,
          },
        });
      }
    });

    this.lastAudit.delete(lessonId);
    await this.recordUpdated(lessonId, organizationId, actorId, revision + 1, null, null, 'chapter_duplicated');
    return this.getDraft(lessonId, organizationId);
  }

  private async recordUpdated(
    lessonId: string,
    organizationId: string,
    actorId: string | null,
    revision: number,
    chapters: number | null,
    blocks: number | null,
    operation = 'saved',
  ) {
    const now = Date.now();
    const last = this.lastAudit.get(lessonId);
    if (last !== undefined && now - last < AUDIT_THROTTLE_MS) return;
    this.lastAudit.set(lessonId, now);
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'longread.updated',
      targetType: 'lesson',
      targetId: lessonId,
      summary: 'Updated longread draft',
      metadata: { revision, operation, ...(chapters !== null ? { chapters, blocks } : {}) },
    });
  }
}
