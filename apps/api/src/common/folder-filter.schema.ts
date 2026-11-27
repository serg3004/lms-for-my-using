import { z } from 'zod';

/**
 * PR 581: the folder a list shows. Without the parameter a list shows everything; `root` shows the items that are in
 * no folder; an id shows the items directly in that folder. Returns `undefined` (no filter), `null` (root) or the id.
 */
export const folderFilterQuerySchema = z.object({ folderId: z.union([z.guid(), z.literal('root')]).optional() });

export function folderFilterOf(query: unknown): string | null | undefined {
  const { folderId } = folderFilterQuerySchema.parse(query);
  return folderId === undefined ? undefined : folderId === 'root' ? null : folderId;
}
