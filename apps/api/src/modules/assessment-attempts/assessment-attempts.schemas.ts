import { z } from 'zod';

export const createAssessmentAttemptAnswerSchema = z
  .object({
    questionId: z.string().uuid(),
    selectedOptionId: z.string().uuid().optional(),
    selectedOptionIds: z.array(z.string().uuid()).nonempty().optional(),
  })
  .refine((input) => Boolean(input.selectedOptionId) !== Boolean(input.selectedOptionIds), {
    message: 'Answer requires exactly one of selectedOptionId or selectedOptionIds',
  });

export const createAssessmentAttemptSchema = z.object({
  answers: z.array(createAssessmentAttemptAnswerSchema).nonempty(),
});

export type CreateAssessmentAttemptInput = z.infer<typeof createAssessmentAttemptSchema>;
export type CreateAssessmentAttemptAnswerInput = z.infer<typeof createAssessmentAttemptAnswerSchema>;
