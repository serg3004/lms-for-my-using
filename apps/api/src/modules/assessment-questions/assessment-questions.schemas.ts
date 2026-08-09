import { z } from 'zod';

export const assessmentQuestionTypeSchema = z.enum(['single_choice', 'multiple_choice', 'true_false']);

// Only consulted for multiple_choice grading (single_choice/true_false always grade all-or-nothing).
export const assessmentQuestionScoringModeSchema = z.enum([
  'all_or_nothing',
  'proportional',
  'proportional_with_penalty',
  'per_option',
]);

export const createAssessmentQuestionSchema = z.object({
  organizationId: z.string().uuid(),
  type: assessmentQuestionTypeSchema.default('single_choice'),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().max(4000).optional(),
  imageUrl: z.string().trim().min(1).max(2000).optional(),
  points: z.number().int().min(1).default(1),
  order: z.number().int().min(0).default(0),
  scoringMode: assessmentQuestionScoringModeSchema.default('all_or_nothing'),
});

export const createAssessmentAnswerOptionSchema = z
  .object({
    organizationId: z.string().uuid(),
    text: z.string().trim().min(1).max(2000).optional(),
    imageUrl: z.string().trim().min(1).max(2000).optional(),
    isCorrect: z.boolean().default(false),
    order: z.number().int().min(0).default(0),
  })
  .refine((input) => input.text || input.imageUrl, {
    message: 'Answer option requires text or imageUrl',
  });

export const updateAssessmentQuestionSchema = z
  .object({
    type: assessmentQuestionTypeSchema,
    title: z.string().trim().min(1).max(200),
    text: z.string().trim().max(4000).nullable(),
    imageUrl: z.string().trim().min(1).max(2000).nullable(),
    points: z.number().int().min(1),
    order: z.number().int().min(0),
    scoringMode: assessmentQuestionScoringModeSchema,
  })
  .partial();

export const updateAssessmentAnswerOptionSchema = z
  .object({
    text: z.string().trim().min(1).max(2000).nullable(),
    imageUrl: z.string().trim().min(1).max(2000).nullable(),
    isCorrect: z.boolean(),
    order: z.number().int().min(0),
  })
  .partial();

export type CreateAssessmentQuestionInput = z.infer<typeof createAssessmentQuestionSchema>;
export type CreateAssessmentAnswerOptionInput = z.infer<typeof createAssessmentAnswerOptionSchema>;
export type UpdateAssessmentQuestionInput = z.infer<typeof updateAssessmentQuestionSchema>;
export type UpdateAssessmentAnswerOptionInput = z.infer<typeof updateAssessmentAnswerOptionSchema>;
