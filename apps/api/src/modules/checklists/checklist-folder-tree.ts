/** PR 395: pure rules of the checklist folder tree, kept free of the database so they are unit-tested directly. */

import { indexFolders } from '../../common/folder-tree.js';
export { MAX_FOLDER_DEPTH, folderDepth, indexFolders, normalizeFolderName, subtreeHeight, subtreeIds } from '../../common/folder-tree.js';

export type FolderNode = { id: string; parentId: string | null; createdBy: string | null; visibleToStaff: boolean };
export type FolderActor = { id: string; roles: readonly string[] };

export function isAdmin(actor: FolderActor) {
  return actor.roles.includes('admin');
}

/** Administrator and the creator may change a folder (rename, move, open to staff, delete). */
export function canManageFolder(folder: Pick<FolderNode, 'createdBy'>, actor: FolderActor) {
  return isAdmin(actor) || (folder.createdBy !== null && folder.createdBy === actor.id);
}

/**
 * Folders the actor may see. The administrator sees all. Everyone else sees a folder they created or one opened
 * to staff, but only when the whole chain of parents is visible too. A learner never sees a folder.
 */
export function visibleFolderIds(folders: readonly FolderNode[], actor: FolderActor): Set<string> {
  if (isAdmin(actor)) return new Set(folders.map((folder) => folder.id));
  if (actor.roles.every((role) => role === 'learner')) return new Set();
  const byId = indexFolders(folders);
  const memo = new Map<string, boolean>();
  const visible = (folder: FolderNode, trail: ReadonlySet<string>): boolean => {
    const known = memo.get(folder.id);
    if (known !== undefined) return known;
    if (trail.has(folder.id)) return false;
    let result = folder.visibleToStaff || folder.createdBy === actor.id;
    if (result && folder.parentId) {
      const parent = byId.get(folder.parentId);
      result = parent ? visible(parent, new Set(trail).add(folder.id)) : false;
    }
    memo.set(folder.id, result);
    return result;
  };
  return new Set(folders.filter((folder) => visible(folder, new Set())).map((folder) => folder.id));
}
