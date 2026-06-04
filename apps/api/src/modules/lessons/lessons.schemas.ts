import { z } from 'zod';

export const lessonStatusSchema = z.enum(['draft', 'published', 'archived']);

const lessonSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createLessonSchema = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  slug: lessonSlugSchema,
  description: z.string().trim().max(1000).optional(),
  order: z.number().int().min(0).default(0),
  status: lessonStatusSchema.default('draft'),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const updateLessonStatusSchema = z.object({
  status: lessonStatusSchema,
});
export type UpdateLessonStatusInput = z.infer<typeof updateLessonStatusSchema>;

export const updateLessonSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable(),
    order: z.number().int().min(0),
    status: lessonStatusSchema,
  })
  .partial();
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
