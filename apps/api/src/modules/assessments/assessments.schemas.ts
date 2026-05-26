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
