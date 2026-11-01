import { captureExerciseQuestions, publicExerciseQuestion } from './longread-exercise-snapshot.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isLearnerOnly, type CurrentUser } from '../auth/public.js';
import { LearningTargetResolverService } from '../learning-targets/public.js';
import { PrismaService } from '../../database/prisma.service.js';
import { LongreadsService } from './longreads.service.js';
import { LongreadVersionsService } from './longread-versions.service.js';
import { readerView, readingState, validHeading, visibleReaderChapters, type ReaderSnapshot, type ReadingState } from './longread-reader.js';
import type { LongreadPositionInput } from './longreads.schemas.js';

type ReaderActor = Pick<CurrentUser, 'id' | 'organizationId' | 'roles'>;

@Injectable()
export class LongreadReaderService {
  constructor(private readonly prisma: PrismaService, private readonly versions: LongreadVersionsService, private readonly drafts: LongreadsService, private readonly learningTargets: LearningTargetResolverService = new LearningTargetResolverService(prisma)) {}

  private async snapshot(lessonId: string, actor: ReaderActor): Promise<ReaderSnapshot> {
    const { organizationId, id: userId } = actor;
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, organizationId, deletedAt: null, type: 'longread', course: { deletedAt: null } }, select: { courseId: true, course: { select: { status: true, selfEnrollmentEnabled: true } } } });
    if (!lesson) throw new NotFoundException('Longread not found');
    if (isLearnerOnly(actor.roles)) {
      const resolution = await this.learningTargets.resolveForUser(organizationId, userId, lesson.courseId, { course: lesson.course });
      if (lesson.course.status !== 'published' || !resolution.isEntitled) throw new NotFoundException('Longread not found');
    }
    const published = await this.versions.readPublished(lessonId, organizationId, userId);
    return { ...published, chapters: visibleReaderChapters(published.chapters) };
  }

  async read(lessonId: string, actor: ReaderActor, chapter?: string) {
    const { organizationId, id: userId } = actor;
    const snapshot = await this.snapshot(lessonId, actor);
    const progress = await this.prisma.progress.findFirst({ where: { lessonId, organizationId, userId, deletedAt: null }, select: { longreadReadingState: true } });
    if (!progress) throw new NotFoundException('Longread not found');
    return readerView(snapshot, readingState(snapshot, progress.longreadReadingState), chapter);
  }

  /** Reading position is not chapter completion, a score or an assessment attempt. */
  async position(lessonId: string, actor: ReaderActor, input: LongreadPositionInput) {
    const { organizationId, id: userId } = actor;
    const snapshot = await this.snapshot(lessonId, actor);
    if (snapshot.version !== input.version) throw new ConflictException('Longread version changed');
    const state = await this.prisma.$transaction(async (tx) => {
      const found = await tx.progress.findFirst({ where: { lessonId, organizationId, userId, deletedAt: null }, select: { id: true } });
      if (!found) throw new NotFoundException('Longread not found');
      await tx.$queryRaw`SELECT id FROM progress WHERE id = ${found.id}::uuid FOR UPDATE`;
      const row = await tx.progress.findUniqueOrThrow({ where: { id: found.id } });
      const previous = readingState(snapshot, row.longreadReadingState);
      const index = snapshot.chapters.findIndex((chapter) => chapter.anchor === input.chapter);
      if (index < 0 || (snapshot.settings.readingOrder === 'sequential' && index > previous.maxReached + 1)) throw new NotFoundException('Longread chapter not found');
      if (input.mode === 'bookmark' && previous.chapter !== input.chapter) throw new ConflictException('Reading chapter changed');
      const headingIndex = input.headingIndex ?? null;
      if (!validHeading(snapshot.chapters[index]!, headingIndex)) throw new BadRequestException('Invalid reading heading');
      const next: ReadingState = { version: snapshot.version, chapter: input.chapter, headingIndex, maxReached: Math.max(previous.maxReached, index) };
      await tx.progress.update({ where: { id: row.id }, data: { longreadReadingState: next } });
      return next;
    });
    return readerView(snapshot, state);
  }

  /** Author-only draft read: deliberately never calls the published reader/pinning path. */
  async preview(lessonId: string, organizationId: string, chapterId?: string) {
    const draft = await this.drafts.getDraft(lessonId, organizationId);
    const chapters = draft.chapters.filter((chapter) => !chapter.hidden);
    const selected = chapterId ? chapters.find((chapter) => chapter.id === chapterId) : chapters[0];
    if (!selected) throw new NotFoundException('Longread chapter not found');
    const captured = await captureExerciseQuestions(this.prisma, lessonId, organizationId, chapters);
    const projected = captured.chapters.map((chapter) => ({ ...chapter, blocks: chapter.blocks.map(({ question, ...block }) => ({ ...block, ...(question ? { question: publicExerciseQuestion(question, `preview:${block.id}`) } : {}) })) }));
    const snapshot = { ...draft, version: draft.revision, chapters: visibleReaderChapters(projected as unknown as ReaderSnapshot['chapters']) };
    return { ...readerView(snapshot, { version: draft.revision, chapter: selected.anchor, headingIndex: null, maxReached: chapters.length - 1 }, undefined, true), draftRevision: draft.revision };
  }
}
