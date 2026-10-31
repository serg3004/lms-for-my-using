import { z } from 'zod';

import { questionTypeSchema, scoringModeSchema, questionDefinitionSchema } from '@lms/shared/assessment-question-types';

export const assessmentQuestionTypeSchema = questionTypeSchema;
export const assessmentQuestionScoringModeSchema = scoringModeSchema;

export const createAssessmentQuestionSchema = z.object({
  organizationId: z.string().uuid(),
  definition: questionDefinitionSchema.nullable().optional(),
  type: assessmentQuestionTypeSchema.default('single_choice'),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().max(4000).optional(),
  imageUrl: z.string().trim().min(1).max(2000).optional(),
  points: z.number().int().min(1).default(1),
  order: z.number().int().min(0).default(0),
  scoringMode: assessmentQuestionScoringModeSchema.default('all_or_nothing'),
}).strict();

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
    definition: questionDefinitionSchema.nullable(),
    type: assessmentQuestionTypeSchema,
    title: z.string().trim().min(1).max(200),
    text: z.string().trim().max(4000).nullable(),
    imageUrl: z.string().trim().min(1).max(2000).nullable(),
    points: z.number().int().min(1),
    order: z.number().int().min(0),
    scoringMode: assessmentQuestionScoringModeSchema,
  })
  .partial().strict();

export const updateAssessmentAnswerOptionSchema = z
  .object({
    text: z.string().trim().min(1).max(2000).nullable(),
    imageUrl: z.string().trim().min(1).max(2000).nullable(),
    isCorrect: z.boolean(),
    order: z.number().int().min(0),
  })
  .partial().strict();

export type CreateAssessmentQuestionInput = z.infer<typeof createAssessmentQuestionSchema>;
export type CreateAssessmentAnswerOptionInput = z.infer<typeof createAssessmentAnswerOptionSchema>;
export type UpdateAssessmentQuestionInput = z.infer<typeof updateAssessmentQuestionSchema>;
export type UpdateAssessmentAnswerOptionInput = z.infer<typeof updateAssessmentAnswerOptionSchema>;
