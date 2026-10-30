import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { checkPublishable, type SnapshotChapter } from './longread-publish-check.js';
import { longreadSettingsSchema, type LongreadSettings } from './longreads.schemas.js';
import { LongreadsService } from './longreads.service.js';

type Tx = Prisma.TransactionClient;

const documentScope = (lessonId: string, organizationId: string) => ({ lessonId, organizationId, lesson: { deletedAt: null } });

function readSettings(raw: unknown): LongreadSettings {
  return { ...longreadSettingsSchema.parse({}), ...(typeof raw === 'object' && raw !== null ? raw : {}) } as LongreadSettings;
}

function asSnapshot(raw: unknown): SnapshotChapter[] {
  return Array.isArray(raw) ? (raw as SnapshotChapter[]) : [];
}

/** Publishing, immutable versions, history, restore and the learner-facing read (PR 382). */
@Injectable()
export class LongreadVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly longreads: LongreadsService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  /** Serialises publishes, restores and unpublishes of one document: they queue on the row lock instead of racing. */
  private async lockDocument(tx: Tx, documentId: string) {
    await tx.$queryRaw`SELECT id FROM longread_documents WHERE id = ${documentId}::uuid FOR UPDATE`;
  }

  private async draftSnapshot(db: Tx | PrismaService, documentId: string): Promise<SnapshotChapter[]> {
    const chapters = await db.longreadChapter.findMany({
      where: { documentId },
      orderBy: { order: 'asc' },
      include: { blocks: { orderBy: { order: 'asc' } } },
    });
    return chapters.map((chapter) => ({
      title: chapter.title,
      anchor: chapter.anchor,
      hidden: chapter.hidden,
      blocks: chapter.blocks.map((block) => ({ type: block.type, schemaVersion: block.schemaVersion, content: block.content })),
    }));
  }

  async publishCheck(lessonId: string, organizationId: string) {
    await this.longreads.ensureEnabled(organizationId);
    const document = await this.prisma.longreadDocument.findFirst({ where: documentScope(lessonId, organizationId), select: { id: true, settings: true } });
    if (!document) throw new NotFoundException('Longread not found');
    const reasons = checkPublishable(await this.draftSnapshot(this.prisma, document.id), readSettings(document.settings));
    return { ok: reasons.length === 0, reasons };
  }

  /** Publish or republish: cuts an immutable version from the draft and makes it the one learners open. */
  async publish(lessonId: string, organizationId: string, draftRevision: number, actorId: string | null) {
    await this.longreads.ensureEnabled(organizationId);

    const result = await this.prisma.$transaction(async (tx) => {
      const found = await tx.longreadDocument.findFirst({ where: documentScope(lessonId, organizationId), select: { id: true } });
      if (!found) throw new NotFoundException('Longread not found');
      await this.lockDocument(tx, found.id);
      const document = await tx.longreadDocument.findUniqueOrThrow({ where: { id: found.id } });

      if (document.draftRevision !== draftRevision) {
        throw new ConflictException({ message: 'Longread was changed by someone else', currentRevision: document.draftRevision });
      }
      const latest = await tx.longreadRevision.findFirst({ where: { documentId: document.id }, orderBy: { number: 'desc' } });

      let revision;
      let republished = false;
      if (latest && latest.sourceDraftRevision === document.draftRevision) {
        // The draft did not change since the latest version: switching it back on creates no duplicate.
        if (document.publishedRevisionId === latest.id) throw new ConflictException('The draft has no changes since the published version');
        revision = latest;
      } else {
        const snapshot = await this.draftSnapshot(tx, document.id);
        const settings = readSettings(document.settings);
        const reasons = checkPublishable(snapshot, settings);
        if (reasons.length) throw new UnprocessableEntityException({ message: 'The longread cannot be published', reasons });

        const number = document.lastRevisionNumber + 1;
        revision = await tx.longreadRevision.create({
          data: {
            organizationId,
            documentId: document.id,
            number,
            schemaVersion: document.schemaVersion,
            sourceDraftRevision: document.draftRevision,
            settings,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            createdById: actorId,
          },
        });
        await tx.longreadDocument.update({ where: { id: document.id }, data: { lastRevisionNumber: number } });
        republished = document.publishedRevisionId !== null;
      }

      await tx.longreadDocument.update({ where: { id: document.id }, data: { publishedRevisionId: revision.id } });
      await tx.lesson.update({ where: { id: lessonId, organizationId }, data: { status: 'published' }, select: { id: true } });
      return { version: revision.number, publishedAt: revision.createdAt, republished };
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'longread.published',
      targetType: 'lesson',
      targetId: lessonId,
      summary: `Published longread version ${result.version}`,
      metadata: { version: result.version, republished: result.republished },
    });
    return { version: result.version, publishedAt: result.publishedAt };
  }

  /** New openings stop at once; versions, learners' pinned versions and their results stay. */
  async unpublish(lessonId: string, organizationId: string, actorId: string | null) {
    await this.longreads.ensureEnabled(organizationId);
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.longreadDocument.findFirst({ where: documentScope(lessonId, organizationId), select: { id: true } });
      if (!found) throw new NotFoundException('Longread not found');
      await this.lockDocument(tx, found.id);
      await tx.longreadDocument.update({ where: { id: found.id }, data: { publishedRevisionId: null } });
      await tx.lesson.update({ where: { id: lessonId, organizationId }, data: { status: 'draft' }, select: { id: true } });
    });
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'longread.unpublished',
      targetType: 'lesson',
      targetId: lessonId,
      summary: 'Unpublished longread',
    });
  }

  async listVersions(lessonId: string, organizationId: string) {
    await this.longreads.ensureEnabled(organizationId);
    const document = await this.prisma.longreadDocument.findFirst({
      where: documentScope(lessonId, organizationId),
      select: {
        draftRevision: true,
        publishedRevisionId: true,
        revisions: {
          orderBy: { number: 'desc' },
          select: { id: true, number: true, createdAt: true, sourceDraftRevision: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!document) throw new NotFoundException('Longread not found');
    return {
      draftRevision: document.draftRevision,
      versions: document.revisions.map((revision) => ({
        number: revision.number,
        createdAt: revision.createdAt,
        author: revision.createdBy ? { id: revision.createdBy.id, name: `${revision.createdBy.firstName} ${revision.createdBy.lastName}`.trim() } : null,
        published: revision.id === document.publishedRevisionId,
      })),
    };
  }

  /** Replaces the draft with a copy of an old version; the version itself, and every other one, is left untouched. */
  async restoreVersion(lessonId: string, organizationId: string, number: number, draftRevision: number, actorId: string | null) {
    await this.longreads.ensureEnabled(organizationId);
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.longreadDocument.findFirst({ where: documentScope(lessonId, organizationId), select: { id: true } });
      if (!found) throw new NotFoundException('Longread not found');
      await this.lockDocument(tx, found.id);

      const revision = await tx.longreadRevision.findUnique({ where: { documentId_number: { documentId: found.id, number } } });
      if (!revision) throw new NotFoundException('Version not found');

      const swapped = await tx.longreadDocument.updateMany({
        where: { id: found.id, draftRevision },
        data: { draftRevision: { increment: 1 }, settings: revision.settings as Prisma.InputJsonValue },
      });
      if (swapped.count === 0) {
        const current = await tx.longreadDocument.findUnique({ where: { id: found.id }, select: { draftRevision: true } });
        throw new ConflictException({ message: 'Longread was changed by someone else', currentRevision: current?.draftRevision ?? null });
      }

      await tx.longreadChapter.deleteMany({ where: { documentId: found.id } });
      for (const [chapterIndex, chapter] of asSnapshot(revision.snapshot).entries()) {
        const created = await tx.longreadChapter.create({
          data: { organizationId, documentId: found.id, order: chapterIndex, title: chapter.title, anchor: chapter.anchor, hidden: chapter.hidden },
          select: { id: true },
        });
        for (const [blockIndex, block] of chapter.blocks.entries()) {
          await tx.longreadBlock.create({
            data: {
              organizationId,
              chapterId: created.id,
              order: blockIndex,
              type: block.type,
              schemaVersion: block.schemaVersion,
              content: block.content as Prisma.InputJsonObject,
            },
          });
        }
      }
    });
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'longread.version_restored',
      targetType: 'lesson',
      targetId: lessonId,
      summary: `Restored longread version ${number} into the draft`,
      metadata: { version: number },
    });
    return this.longreads.getDraft(lessonId, organizationId);
  }

  /**
   * What a learner opens: the version the learner already started, otherwise the latest published one (which then becomes
   * the learner's pinned version). The draft is never returned here. Every refusal is the same 404.
   */
  async readPublished(lessonId: string, organizationId: string, userId: string) {
    if (!(await this.longreads.isEnabled(organizationId))) throw new NotFoundException('Not found');
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, organizationId, deletedAt: null, status: 'published', type: 'longread' },
      select: { id: true, courseId: true },
    });
    const document = lesson
      ? await this.prisma.longreadDocument.findFirst({ where: { lessonId, organizationId }, include: { publishedRevision: true } })
      : null;
    if (!lesson || !document?.publishedRevision) throw new NotFoundException('Longread not found');

    let revision = document.publishedRevision;
    const progress = await this.prisma.progress.findFirst({
      where: { courseId: lesson.courseId, lessonId, userId, organizationId },
      select: { id: true, deletedAt: true, longreadRevision: true },
    });
    if (progress?.longreadRevision) {
      revision = progress.longreadRevision;
    } else if (!progress) {
      try {
        await this.prisma.progress.create({
          data: { organizationId, courseId: lesson.courseId, lessonId, userId, status: 'in_progress', longreadRevisionId: revision.id },
        });
      } catch (error) {
        // A concurrent first open created the row; the unique key makes that the winner.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    } else if (!progress.deletedAt) {
      await this.prisma.progress.updateMany({ where: { id: progress.id, longreadRevisionId: null }, data: { longreadRevisionId: revision.id } });
    }
    const pinned = await this.prisma.progress.findFirst({
      where: { courseId: lesson.courseId, lessonId, userId, organizationId },
      select: { longreadRevision: true },
    });
    if (pinned?.longreadRevision) revision = pinned.longreadRevision;

    return {
      lessonId,
      version: revision.number,
      publishedAt: revision.createdAt,
      schemaVersion: revision.schemaVersion,
      settings: readSettings(revision.settings),
      chapters: asSnapshot(revision.snapshot)
        .filter((chapter) => !chapter.hidden)
        .map((chapter) => ({
          title: chapter.title,
          anchor: chapter.anchor,
          blocks: chapter.blocks.map((block) => ({ type: block.type, schemaVersion: block.schemaVersion, content: block.content })),
        })),
    };
  }
}

