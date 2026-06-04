import { z } from 'zod';

export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);

const courseSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createCourseSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  slug: courseSlugSchema,
  description: z.string().trim().max(1000).optional(),
  status: courseStatusSchema.default('draft'),
});

export const updateCourseStatusSchema = z.object({
  status: courseStatusSchema,
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseStatusInput = z.infer<typeof updateCourseStatusSchema>;
