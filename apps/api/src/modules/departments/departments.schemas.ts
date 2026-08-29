import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination.schema.js';

/** Plan invariant: adjacency-list tree, PostgreSQL recursive CTE traversal, 32-level cap. */
export const MAX_DEPARTMENT_DEPTH = 32;

export const departmentStatusSchema = z.enum(['active', 'archived']);
export const departmentManagerModeSchema = z.enum(['LOCAL', 'INHERIT', 'MERGE']);

const departmentCodeSchema = z.string().trim().min(1).max(60);
const departmentNameSchema = z.string().trim().min(1).max(160);
const departmentDescriptionSchema = z.string().trim().max(1000);
const sortOrderSchema = z.number().int().min(0).max(1_000_000);

export const createDepartmentSchema = z.object({
  organizationId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  departmentTypeId: z.string().uuid().optional(),
  name: departmentNameSchema,
  code: departmentCodeSchema.optional(),
  description: departmentDescriptionSchema.optional(),
  sortOrder: sortOrderSchema.default(0),
  directManagerMode: departmentManagerModeSchema.default('LOCAL'),
  functionalManagerMode: departmentManagerModeSchema.default('LOCAL'),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z
  .object({
    name: departmentNameSchema,
    departmentTypeId: z.string().uuid().nullable(),
    code: departmentCodeSchema.nullable(),
    description: departmentDescriptionSchema.nullable(),
    sortOrder: sortOrderSchema,
    directManagerMode: departmentManagerModeSchema,
    functionalManagerMode: departmentManagerModeSchema,
  })
  .partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const moveDepartmentSchema = z.object({
  parentId: z.string().uuid().nullable(),
});
export type MoveDepartmentInput = z.infer<typeof moveDepartmentSchema>;

export const listDepartmentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  departmentTypeId: z.string().uuid().optional(),
  status: departmentStatusSchema.optional(),
});
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;

export const departmentStatusFilterQuerySchema = z.object({
  status: departmentStatusSchema.optional(),
});
export type DepartmentStatusFilterQuery = z.infer<typeof departmentStatusFilterQuerySchema>;

export const createDepartmentTypeSchema = z.object({
  organizationId: z.string().uuid(),
  code: departmentCodeSchema,
  name: departmentNameSchema,
  sortOrder: sortOrderSchema.default(0),
});
export type CreateDepartmentTypeInput = z.infer<typeof createDepartmentTypeSchema>;

export const updateDepartmentTypeSchema = z
  .object({
    code: departmentCodeSchema,
    name: departmentNameSchema,
    sortOrder: sortOrderSchema,
  })
  .partial();
export type UpdateDepartmentTypeInput = z.infer<typeof updateDepartmentTypeSchema>;
