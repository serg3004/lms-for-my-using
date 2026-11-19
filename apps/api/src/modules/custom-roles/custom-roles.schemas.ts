import { PERMISSION_SCOPES } from '@lms/shared/permission-catalog';
import { z } from 'zod';

const grantSchema = z.object({ action: z.string().trim().min(1).max(100), scope: z.enum(PERMISSION_SCOPES) });
const permissionsSchema = z.array(grantSchema).max(200);
const nameSchema = z.string().trim().min(1).max(80);
const descriptionSchema = z.string().trim().max(500).nullable();

export const listCustomRolesQuerySchema = z.object({ state: z.enum(['active', 'archived']).optional() });

export const createCustomRoleSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  permissions: permissionsSchema.optional(),
  /** "Create based on": copies the description and the grants of this role of the same organization. */
  basedOnRoleId: z.guid().optional(),
});
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;

export const updateCustomRoleSchema = z
  .object({ version: z.number().int().min(1), name: nameSchema.optional(), description: descriptionSchema.optional(), permissions: permissionsSchema.optional() })
  .strict();
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleSchema>;

export const archiveCustomRoleSchema = z.object({ version: z.number().int().min(1) }).strict();
