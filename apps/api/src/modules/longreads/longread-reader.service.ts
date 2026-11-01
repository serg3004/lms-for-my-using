import { learningHistorySchema, type VersionLearning } from '@lms/shared/longread-progress';
import { Prisma } from '@prisma/client';
import { completionState, completionView, chapterAccessible } from './longread-completion.js';
import { captureExerciseQuestions, publicExerciseQuestion } from './longread-exercise-snapshot.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
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
    return this.visit(lessonId, actor, { chapter });
  }

  async position(lessonId: string, actor: ReaderActor, input: LongreadPositionInput) {
    return this.visit(lessonId, actor, input);
  }

  async complete(lessonId: string, actor: ReaderActor, input: { version: number; chapter: string; blockId?: string }) {
    return this.visit(lessonId, actor, { ...input, action: input.blockId ? 'continue' : 'complete' });
  }

  private async visit(lessonId: string, actor: ReaderActor, input: { chapter?: string; version?: number; headingIndex?: number | null; mode?: 'navigate' | 'bookmark'; action?: 'continue' | 'complete'; blockId?: string }) {
    const snapshot = await this.snapshot(lessonId, actor);
    if (input.version !== undefined && snapshot.version !== input.version) throw new ConflictException('Longread version changed');
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.progress.findFirst({ where: { lessonId, organizationId: actor.organizationId, userId: actor.id, deletedAt: null }, select: { id: true } });
      if (!found) throw new NotFoundException('Longread not found');
      await tx.$queryRaw`SELECT id FROM progress WHERE id = ${found.id}::uuid FOR UPDATE`;
      const row = await tx.progress.findUniqueOrThrow({ where: { id: found.id }, include: { longreadRevision: { select: { id: true, number: true, documentId: true } } } });
      if (!row.longreadRevision || row.longreadRevision.number !== snapshot.version) throw new ConflictException('Longread version changed');
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const now = clock!.now;
      const raw = row.longreadReadingState as { learning?: unknown } | null, parsed = learningHistorySchema.safeParse(raw?.learning);
      const history = parsed.success ? parsed.data : {};
      const learning: VersionLearning = history[String(snapshot.version)] ?? { chapters: {} };
      // Preserve completed pre-390 reading records; immutable old versions had no Continue blocks.
      if (!Object.keys(history).length && row.status === 'completed' && !snapshot.chapters.some((c) => c.blocks.some((b) => b.type === 'continue'))) {
        for (const chapter of snapshot.chapters) learning.chapters[chapter.anchor] = { enteredAt: row.createdAt.toISOString(), completedAt: (row.completedAt ?? now).toISOString(), passed: [] };
      }
      const previous = readingState(snapshot, row.longreadReadingState), anchor = input.chapter ?? previous.chapter;
      const index = snapshot.chapters.findIndex((c) => c.anchor === anchor);
      if (index < 0 || !chapterAccessible(snapshot, learning, index)) throw new NotFoundException('Longread chapter not found');
      if (input.mode === 'bookmark' && previous.chapter !== anchor) throw new ConflictException('Reading chapter changed');
      if (!learning.chapters[anchor]) learning.chapters[anchor] = { enteredAt: now.toISOString(), passed: [] };
      const attempts = await tx.assessmentAttempt.findMany({ where: { organizationId: actor.organizationId, userId: actor.id, longreadRevisionId: row.longreadRevision.id, deletedAt: null }, select: { longreadBlockId: true, assessmentId: true, countsTowardResults: true, answers: { where: { deletedAt: null }, select: { isCorrect: true } } } });
      let completion = await completionState(tx, row.longreadRevision.documentId, snapshot, learning, attempts, now);
      const current = completion.chapters[index]!;
      const saved = learning.chapters[anchor]!;
      if (input.action === 'continue') {
        const gate = current.gates.find((g) => g.blockId === input.blockId);
        if (!gate) throw new NotFoundException('Continue block not found');
        if (!gate.passed && gate.reasons.length) throw new UnprocessableEntityException({ message: 'Continue is blocked', reasons: gate.reasons });
        if (!saved.passed.includes(gate.blockId)) saved.passed.push(gate.blockId);
      }
      if (input.action === 'complete' && !saved.completedAt) {
        if (current.reasons.length) throw new UnprocessableEntityException({ message: 'Chapter is not complete', reasons: current.reasons });
        saved.completedAt = now.toISOString();
      }
      if (input.action) completion = await completionState(tx, row.longreadRevision.documentId, snapshot, learning, attempts, now);
      learning.summary = completion; history[String(snapshot.version)] = learning;
      const state: ReadingState = { version: snapshot.version, chapter: input.mode ? anchor : previous.chapter,
        headingIndex: input.mode ? input.headingIndex ?? null : previous.headingIndex, maxReached: Math.max(previous.maxReached, index) };
      // The completion policy controls access; the old cursor frontier is only a bookmark.
      const unmasked = readerView({ ...snapshot, settings: { ...snapshot.settings, readingOrder: 'free' } }, state, anchor);
      const view = completionView({ ...unmasked, settings: snapshot.settings }, completion);
      const shown = view.chapters[index]!;
      if (input.headingIndex !== undefined && !validHeading(shown, input.headingIndex)) throw new BadRequestException('Invalid reading heading');
      const data: Prisma.ProgressUpdateInput = { longreadReadingState: { ...state, learning: history } as unknown as Prisma.InputJsonValue };
      data.score = completion.percentage;
      data.status = completion.completed ? 'completed' : 'in_progress';
      data.completedAt = completion.completed ? new Date(Math.max(...completion.chapters.filter((c) => c.required && c.completedAt).map((c) => new Date(c.completedAt!).getTime()))) : null;
      await tx.progress.update({ where: { id: row.id }, data });
      return view;
    });
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
