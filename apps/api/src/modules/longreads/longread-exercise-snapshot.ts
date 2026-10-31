import { frozenAssessmentQuestionSchema } from '../../common/assessment-frozen.js';
import type { Prisma } from '@prisma/client';
import { exerciseContentSchema, type ExerciseContent } from '@lms/shared/longread-exercises';
import { validateQuestionDefinition, publicQuestionDefinition } from '../../common/assessment-question-definition.js';
import { seededShuffle } from '../../common/seeded-shuffle.js';
import type { SnapshotChapter, SnapshotBlock, PublishRefusal } from './longread-publish-check.js';

export type FrozenQuestion = import('../../common/assessment-frozen.js').FrozenAssessmentQuestion;
export type ExerciseSnapshotBlock = SnapshotBlock & { id: string; question: FrozenQuestion; content: ExerciseContent };

export function visibleExercises(chapters: SnapshotChapter[]): ExerciseSnapshotBlock[] {
  return chapters.filter((chapter) => !chapter.hidden).flatMap((chapter) => chapter.blocks.filter((block) => !block.hidden && block.type === 'exercise' && block.id && block.question) as ExerciseSnapshotBlock[]);
}
export function publicExerciseQuestion(question: FrozenQuestion, seed: string) {
  return { id: question.id, type: question.type, title: question.title, text: question.text, imageUrl: question.imageUrl, points: question.points,
    scoringMode: question.scoringMode, assessment: question.assessment,
    options: question.definition ? [] : seededShuffle(question.options.map(({ id, text, imageUrl }) => ({ id, text, imageUrl })), `${seed}:options`),
    ...(question.definition ? { definition: publicQuestionDefinition(question.definition, seed) } : {}) };
}
/** Resolve references under the publication transaction. Only version snapshots contain answer keys. */
export async function captureExerciseQuestions(db: Pick<Prisma.TransactionClient, 'assessmentQuestion'>, lessonId: string, organizationId: string, chapters: SnapshotChapter[]) {
  const blocks = chapters.flatMap((chapter) => chapter.blocks.filter((block) => block.type === 'exercise'));
  const ids = blocks.flatMap((block) => { const value = exerciseContentSchema.safeParse(block.content); return value.success && value.data.questionId ? [value.data.questionId] : []; });
  const rows = ids.length ? await db.assessmentQuestion.findMany({ where: { id: { in: [...new Set(ids)] }, organizationId, deletedAt: null, assessment: { lessonId, organizationId, deletedAt: null } },
    select: { id: true, type: true, title: true, text: true, imageUrl: true, order: true, points: true, scoringMode: true, definition: true,
      options: { where: { deletedAt: null }, orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true, text: true, imageUrl: true, isCorrect: true, order: true } },
      assessment: { select: { id: true, title: true, passingScore: true, maxAttempts: true } } } }) : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const reasons: PublishRefusal[] = [];
  const result = chapters.map((chapter) => ({ ...chapter, blocks: chapter.blocks.map((block, blockIndex) => {
    if (block.type !== 'exercise') return block;
    const parsed = exerciseContentSchema.safeParse(block.content), source = parsed.success && parsed.data.questionId ? byId.get(parsed.data.questionId) : null;
    try {
      if (!parsed.success || !source || !block.id) throw new Error('Missing exercise question');
      const definition = validateQuestionDefinition(source.type, source.definition);
      if (!definition && (source.options.length < 2 || !source.options.some((option) => option.isCorrect) || source.type !== 'multiple_choice' && source.options.filter((option) => option.isCorrect).length !== 1)) throw new Error('Invalid choice answer key');
      const question: FrozenQuestion = frozenAssessmentQuestionSchema.parse({ ...source, definition, points: parsed.data.weight });
      return { ...block, content: parsed.data, question };
    } catch {
      reasons.push({ code: 'question_unavailable', message: 'Exercise requires a valid question of this lesson and organization', chapter: chapter.title, blockIndex });
      return block;
    }
  }) }));
  const totals = new Map<string, number>();
  for (const block of visibleExercises(result)) {
    if (block.content.mode !== 'graded') continue;
    const id = block.question.assessment.id; totals.set(id, (totals.get(id) ?? 0) + block.question.points);
  }
  if ([...totals.values()].some((total) => total > 2147483647)) reasons.push({ code: 'invalid_block', message: 'Total graded exercise weight exceeds storage limit' });
  return { chapters: result, reasons };
}
