import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination.schema.js';

export const positionStatusSchema = z.enum(['active', 'archived']);

const positionCodeSchema = z.string().trim().min(1).max(60);
const positionTitleSchema = z.string().trim().min(1).max(160);
const positionDescriptionSchema = z.string().trim().max(1000);

export const createPositionSchema = z.object({
  organizationId: z.string().uuid(),
  code: positionCodeSchema,
  title: positionTitleSchema,
  description: positionDescriptionSchema.optional(),
});
export type CreatePositionInput = z.infer<typeof createPositionSchema>;

export const updatePositionSchema = z
  .object({
    code: positionCodeSchema,
    title: positionTitleSchema,
    description: positionDescriptionSchema.nullable(),
  })
  .partial();
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

export const listPositionsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  status: positionStatusSchema.optional(),
});
export type ListPositionsQuery = z.infer<typeof listPositionsQuerySchema>;
