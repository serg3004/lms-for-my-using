import { z } from 'zod';

export const importKindSchema = z.enum(['DEPARTMENTS', 'MEMBERSHIPS']);
export const importModeSchema = z.enum(['CREATE_ONLY', 'UPSERT']);
export const previewImportFieldsSchema = z.object({
  kind: importKindSchema,
  mode: importModeSchema,
});
export const commitImportSchema = z.object({ token: z.string().min(43).max(256) });
export const historyQuerySchema = z.object({
  entityType: z.string().trim().min(1).max(80).optional(),
  entityId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ImportKind = z.infer<typeof importKindSchema>;
export type ImportMode = z.infer<typeof importModeSchema>;
