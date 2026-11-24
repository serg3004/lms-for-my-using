import { z } from 'zod';
import { assessmentAnswerSchema, draftAssessmentAnswerSchema } from '@lms/shared/assessment-question-types';

export const createAssessmentAttemptAnswerSchema = assessmentAnswerSchema;

export const createAssessmentAttemptSchema = z.object({
  placementId: z.guid().nullable().optional(),
  attemptId: z.guid().optional(),
  answers: z.array(createAssessmentAttemptAnswerSchema).nonempty(),
}).strict();

export const recordAssessmentAnswerSchema = z.object({
  attemptId: z.guid(),
  answer: z.union([draftAssessmentAnswerSchema, z.object({ questionId: z.guid(), clear: z.literal(true) }).strict()]),
}).strict();

export type CreateAssessmentAttemptInput = z.infer<typeof createAssessmentAttemptSchema>;
export type CreateAssessmentAttemptAnswerInput = z.infer<typeof createAssessmentAttemptAnswerSchema>;
