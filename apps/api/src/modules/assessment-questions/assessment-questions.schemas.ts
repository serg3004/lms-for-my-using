import { z } from 'zod';

export const assessmentQuestionTypeSchema = z.enum(['single_choice', 'multiple_choice', 'true_false']);

export const createAssessmentQuestionSchema = z.object({
  organizationId: z.string().uuid(),
  type: assessmentQuestionTypeSchema.default('single_choice'),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().max(4000).optional(),
  points: z.number().int().min(1).default(1),
  order: z.number().int().min(0).default(0),
});

export const createAssessmentAnswerOptionSchema = z.object({
  organizationId: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
  isCorrect: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
});

export type CreateAssessmentQuestionInput = z.infer<typeof createAssessmentQuestionSchema>;
export type CreateAssessmentAnswerOptionInput = z.infer<typeof createAssessmentAnswerOptionSchema>;
