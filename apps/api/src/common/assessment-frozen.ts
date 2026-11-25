import { z } from 'zod';
import { questionTypeSchema, scoringModeSchema, questionDefinitionSchema } from '@lms/shared/assessment-question-types';

export const frozenAssessmentQuestionSchema = z.object({
  id: z.guid(), type: questionTypeSchema, title: z.string(), text: z.string().nullable(), imageUrl: z.string().nullable(),
  order: z.number().int().min(0),
  points: z.number().int().min(1), scoringMode: scoringModeSchema, definition: questionDefinitionSchema.nullable(),
  correctFeedback: z.string().nullable().optional(),
  incorrectFeedback: z.string().nullable().optional(),
  options: z.array(z.object({ id: z.guid(), text: z.string().nullable(), imageUrl: z.string().nullable(), isCorrect: z.boolean(), order: z.number().int() }).strict()),
  assessment: z.object({ id: z.guid(), title: z.string(), passingScore: z.number().int().min(0).max(100), maxAttempts: z.number().int().min(1).nullable() }).strict(),
}).strict();
export type FrozenAssessmentQuestion = z.infer<typeof frozenAssessmentQuestionSchema>;
export const frozenAnswerQuestionSchema = z.union([
  z.object({ question: frozenAssessmentQuestionSchema, revealAnswers: z.boolean(), blockId: z.guid() }).strict(),
  z.object({ question: frozenAssessmentQuestionSchema, revealAnswers: z.literal(false), resultSettings: z.object({
    passMessage: z.string().nullable(), failMessage: z.string().nullable(),
    showCorrectAnswers: z.boolean(), policy: z.unknown(),
  }).optional() }).strict(),
]);
export const longreadResultMetadataSchema = z.object({ lessonId: z.guid(), version: z.number().int().min(1), title: z.string(), passingScore: z.number().int().min(0).max(100) }).strict();

export function publicAttemptContext<T extends { longreadMetadata?: unknown }>(row: T) {
  const { longreadMetadata, ...value } = row;
  const parsed = longreadResultMetadataSchema.safeParse(longreadMetadata);
  return { ...value, ...(parsed.success ? { longread: { lessonId: parsed.data.lessonId, version: parsed.data.version } } : {}) };
}
