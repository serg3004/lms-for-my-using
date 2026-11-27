import { z } from 'zod';

import { FOLDER_COLORS } from '@lms/shared/constants/folder-colors';

export const LIBRARY_FOLDER_SCOPES = ['course', 'assignment'] as const;
export type LibraryFolderScope = (typeof LIBRARY_FOLDER_SCOPES)[number];

const scope = z.enum(LIBRARY_FOLDER_SCOPES);
const location = z.guid().nullable();

export const listLibraryFoldersSchema = z.object({ scope }).strict();
export const createLibraryFolderSchema = z.object({
  scope,
  name: z.string().trim().min(1).max(200),
  color: z.enum(FOLDER_COLORS).optional(),
  parentId: location.optional(),
}).strict();
export const updateLibraryFolderSchema = createLibraryFolderSchema.omit({ scope: true }).partial();
export const bulkLibraryFolderSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('move'), scope, kind: z.enum(['item', 'folder']), ids: z.array(z.guid()).min(1).max(100), parentId: location }).strict(),
  // Items are never deleted from a folder list: only folders can be deleted here (their items go to the root).
  z.object({ action: z.literal('delete'), scope, kind: z.literal('folder'), ids: z.array(z.guid()).min(1).max(100) }).strict(),
]);

export type CreateLibraryFolderInput = z.infer<typeof createLibraryFolderSchema>;
export type UpdateLibraryFolderInput = z.infer<typeof updateLibraryFolderSchema>;
export type BulkLibraryFolderInput = z.infer<typeof bulkLibraryFolderSchema>;
