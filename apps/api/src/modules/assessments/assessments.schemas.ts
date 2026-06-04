import { z } from 'zod';

export const assessmentStatusSchema = z.enum(['draft', 'published', 'archived']);

export const createAssessmentSchema = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
  lessonId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  status: assessmentStatusSchema.default('draft'),
  passingScore: z.number().int().min(0).max(100).default(70),
  maxAttempts: z.number().int().min(1).optional(),
  availableAfterCourseCompletion: z.boolean().default(true),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentStatusSchema = z.object({
  status: assessmentStatusSchema,
});
export type UpdateAssessmentStatusInput = z.infer<typeof updateAssessmentStatusSchema>;

export const updateAssessmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    status: assessmentStatusSchema,
    passingScore: z.number().int().min(0).max(100),
    maxAttempts: z.number().int().min(1).nullable(),
    availableAfterCourseCompletion: z.boolean(),
  })
  .partial();
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
