import { z } from 'zod';

export const positionCourseRequirementSchema = z.enum(['REQUIRED', 'OPTIONAL']);
export const positionCourseStatusSchema = z.enum(['active', 'archived']);

const dueDaysSchema = z.number().int().min(0).max(3650);

export const createPositionCourseSchema = z.object({
  organizationId: z.string().uuid(),
  positionId: z.string().uuid(),
  courseId: z.string().uuid(),
  requirement: positionCourseRequirementSchema.default('REQUIRED'),
  dueDays: dueDaysSchema.optional(),
});
export type CreatePositionCourseInput = z.infer<typeof createPositionCourseSchema>;

export const updatePositionCourseSchema = z
  .object({
    requirement: positionCourseRequirementSchema,
    dueDays: dueDaysSchema.nullable(),
  })
  .partial();
export type UpdatePositionCourseInput = z.infer<typeof updatePositionCourseSchema>;

export const listPositionCoursesQuerySchema = z.object({
  positionId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  status: positionCourseStatusSchema.optional(),
});
export type ListPositionCoursesQuery = z.infer<typeof listPositionCoursesQuerySchema>;
