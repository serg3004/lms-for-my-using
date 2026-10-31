import { z } from 'zod';
import { questionResponseSchema } from '@lms/shared/assessment-question-types';

export const createAssessmentAttemptAnswerSchema = z
  .object({
    questionId: z.string().uuid(),
    response: questionResponseSchema.optional(),
    selectedOptionId: z.string().uuid().optional(),
    selectedOptionIds: z.array(z.string().uuid()).nonempty().optional(),
  }).strict()
  .refine((input) => [input.selectedOptionId, input.selectedOptionIds, input.response].filter((value) => value !== undefined).length === 1, {
    message: 'Answer requires exactly one of selectedOptionId, selectedOptionIds or response',
  });

export const createAssessmentAttemptSchema = z.object({
  answers: z.array(createAssessmentAttemptAnswerSchema).nonempty(),
}).strict();

export type CreateAssessmentAttemptInput = z.infer<typeof createAssessmentAttemptSchema>;
export type CreateAssessmentAttemptAnswerInput = z.infer<typeof createAssessmentAttemptAnswerSchema>;
