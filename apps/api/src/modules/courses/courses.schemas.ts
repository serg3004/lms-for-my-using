import { z } from 'zod';

export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);

const courseSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const courseCategorySchema = z.enum(['safety', 'management']);

export const createCourseSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  slug: courseSlugSchema,
  description: z.string().trim().max(1000).optional(),
  category: courseCategorySchema.optional(),
  durationMinutes: z.number().int().min(1).max(10_000).optional(),
  status: courseStatusSchema.default('draft'),
  selfEnrollmentEnabled: z.boolean().default(false),
});

export const updateCourseSchema = createCourseSchema.omit({ organizationId: true }).partial();

export const updateCourseStatusSchema = z.object({
  status: courseStatusSchema,
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpdateCourseStatusInput = z.infer<typeof updateCourseStatusSchema>;

export const assignCourseInstructorSchema = z.object({
  instructorId: z.string().uuid(),
});

export type AssignCourseInstructorInput = z.infer<typeof assignCourseInstructorSchema>;
