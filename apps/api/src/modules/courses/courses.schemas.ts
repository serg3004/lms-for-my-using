import { z } from 'zod';
import { richTextSchema } from '@lms/shared/rich-text';

export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);

const courseSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const courseCategorySchema = z.enum(['safety', 'management']);

export const createCourseSchema = z.object({
  organizationId: z.guid(),
  title: z.string().trim().min(1).max(160),
  slug: courseSlugSchema,
  description: richTextSchema(1000).optional(),
  category: courseCategorySchema.optional(),
  durationMinutes: z.number().int().min(1).max(10_000).optional(),
  status: courseStatusSchema.default('draft'),
  selfEnrollmentEnabled: z.boolean().default(false),
  /** PR 581: the folder of the course list the course is created in; moving it later is done by the folder tools. */
  folderId: z.guid().nullable().optional(),
});

/** zod 4 applies `.default()` inside `.partial()`, so the defaulted fields are re-declared without defaults: a PATCH must change only what it sends. */
export const updateCourseSchema = createCourseSchema
  .omit({ organizationId: true, folderId: true })
  .extend({ status: courseStatusSchema, selfEnrollmentEnabled: z.boolean() })
  .partial();

export const updateCourseStatusSchema = z.object({
  status: courseStatusSchema,
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpdateCourseStatusInput = z.infer<typeof updateCourseStatusSchema>;

export const assignCourseInstructorSchema = z.object({
  instructorId: z.guid(),
});

export type AssignCourseInstructorInput = z.infer<typeof assignCourseInstructorSchema>;
