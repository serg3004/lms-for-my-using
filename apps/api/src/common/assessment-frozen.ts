import { z } from 'zod';
import { questionTypeSchema, scoringModeSchema, questionDefinitionSchema } from '@lms/shared/assessment-question-types';

export const frozenAssessmentQuestionSchema = z.object({
  id: z.string().uuid(), type: questionTypeSchema, title: z.string(), text: z.string().nullable(), imageUrl: z.string().nullable(),
  order: z.number().int().min(0),
  points: z.number().int().min(1), scoringMode: scoringModeSchema, definition: questionDefinitionSchema.nullable(),
  options: z.array(z.object({ id: z.string().uuid(), text: z.string().nullable(), imageUrl: z.string().nullable(), isCorrect: z.boolean(), order: z.number().int() }).strict()),
  assessment: z.object({ id: z.string().uuid(), title: z.string(), passingScore: z.number().int().min(0).max(100), maxAttempts: z.number().int().min(1).nullable() }).strict(),
}).strict();
export type FrozenAssessmentQuestion = z.infer<typeof frozenAssessmentQuestionSchema>;
export const frozenAnswerQuestionSchema = z.object({ question: frozenAssessmentQuestionSchema, revealAnswers: z.boolean(), blockId: z.string().uuid() }).strict();
export const longreadResultMetadataSchema = z.object({ lessonId: z.string().uuid(), version: z.number().int().min(1), title: z.string(), passingScore: z.number().int().min(0).max(100) }).strict();

export function publicAttemptContext<T extends { longreadMetadata?: unknown }>(row: T) {
  const { longreadMetadata, ...value } = row;
  const parsed = longreadResultMetadataSchema.safeParse(longreadMetadata);
  return { ...value, ...(parsed.success ? { longread: { lessonId: parsed.data.lessonId, version: parsed.data.version } } : {}) };
}
