import { z } from 'zod';
import { assessmentAnswerSchema } from '@lms/shared/assessment-question-types';

export const createAssessmentAttemptAnswerSchema = assessmentAnswerSchema;

export const createAssessmentAttemptSchema = z.object({
  placementId: z.guid().nullable().optional(),
  attemptId: z.guid().optional(),
  answers: z.array(createAssessmentAttemptAnswerSchema).nonempty(),
}).strict();

export const recordAssessmentAnswerSchema = z.object({
  attemptId: z.guid(),
  answer: assessmentAnswerSchema,
}).strict();

export type CreateAssessmentAttemptInput = z.infer<typeof createAssessmentAttemptSchema>;
export type CreateAssessmentAttemptAnswerInput = z.infer<typeof createAssessmentAttemptAnswerSchema>;
