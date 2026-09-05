import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination.schema.js';

export const orgExternalReferenceEntityTypeSchema = z.enum(['DEPARTMENT', 'DEPARTMENT_TYPE', 'POSITION']);

/** 1..64 chars, normalized to a lowercase slug (letters, digits, hyphens; no leading/trailing hyphen). */
export const sourceSystemSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toLowerCase())
  .refine((value) => /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value), {
    message: 'sourceSystem must be a lowercase slug of letters, digits and hyphens',
  });

/** 1..255 chars, case-exact -- never normalized, since the source system owns this value's casing. */
export const externalIdSchema = z.string().trim().min(1).max(255);

export const createOrgExternalReferenceSchema = z.object({
  organizationId: z.string().uuid(),
  entityType: orgExternalReferenceEntityTypeSchema,
  entityId: z.string().uuid(),
  sourceSystem: sourceSystemSchema,
  externalId: externalIdSchema,
});
export type CreateOrgExternalReferenceInput = z.infer<typeof createOrgExternalReferenceSchema>;

export const listOrgExternalReferencesQuerySchema = paginationQuerySchema.extend({
  entityType: orgExternalReferenceEntityTypeSchema.optional(),
  entityId: z.string().uuid().optional(),
  sourceSystem: sourceSystemSchema.optional(),
});
export type ListOrgExternalReferencesQuery = z.infer<typeof listOrgExternalReferencesQuerySchema>;

export const resolveOrgExternalReferenceQuerySchema = z.object({
  entityType: orgExternalReferenceEntityTypeSchema,
  sourceSystem: sourceSystemSchema,
  externalId: externalIdSchema,
});
export type ResolveOrgExternalReferenceQuery = z.infer<typeof resolveOrgExternalReferenceQuerySchema>;
