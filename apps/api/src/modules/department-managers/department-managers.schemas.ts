import { z } from 'zod';

import { departmentManagerModeSchema } from '../departments/public.js';

export const departmentManagerTypeSchema = z.enum(['DIRECT', 'FUNCTIONAL']);

export const createDepartmentManagerSchema = z.object({
  organizationId: z.string().uuid(),
  departmentId: z.string().uuid(),
  userId: z.string().uuid(),
  type: departmentManagerTypeSchema,
  isPrimary: z.boolean().default(false),
});
export type CreateDepartmentManagerInput = z.infer<typeof createDepartmentManagerSchema>;

export const updateManagerModesSchema = z
  .object({
    directManagerMode: departmentManagerModeSchema,
    functionalManagerMode: departmentManagerModeSchema,
  })
  .partial()
  .refine((data) => data.directManagerMode !== undefined || data.functionalManagerMode !== undefined, {
    message: 'At least one of directManagerMode or functionalManagerMode must be provided',
  });
export type UpdateManagerModesInput = z.infer<typeof updateManagerModesSchema>;
