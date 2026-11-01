import { z } from 'zod';
import { assessmentAnswerSchema } from '@lms/shared/assessment-question-types';

export const createAssessmentAttemptAnswerSchema = assessmentAnswerSchema;

export const createAssessmentAttemptSchema = z.object({
  answers: z.array(createAssessmentAttemptAnswerSchema).nonempty(),
}).strict();

export type CreateAssessmentAttemptInput = z.infer<typeof createAssessmentAttemptSchema>;
export type CreateAssessmentAttemptAnswerInput = z.infer<typeof createAssessmentAttemptAnswerSchema>;
