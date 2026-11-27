/** PR 395/515/576: who may see and manage a folder, shared by the sections that open folders to roles (checklists, tests). */

import { indexFolders } from './folder-tree.js';

/**
 * Who a folder is open to (PR 576): `visibleToStaff` means "all employees", `accessRoles` "the chosen roles", neither
 * "only the creator and administrators". `sharedUserIds` (PR 515): employees opened by name, on top of any of these.
 */
export type FolderNode = { id: string; parentId: string | null; createdBy: string | null; visibleToStaff: boolean; accessRoles?: readonly string[]; sharedUserIds?: readonly string[] };
export type FolderActor = { id: string; roles: readonly string[] };
export type FolderAccessMode = 'owner' | 'all' | 'roles';

export function folderAccessMode(folder: Pick<FolderNode, 'visibleToStaff' | 'accessRoles'>): FolderAccessMode {
  return folder.visibleToStaff ? 'all' : (folder.accessRoles?.length ?? 0) > 0 ? 'roles' : 'owner';
}

export function isAdmin(actor: FolderActor) {
  return actor.roles.includes('admin');
}

/** Administrator and the creator may change a folder (rename, move, open to staff, delete). */
export function canManageFolder(folder: Pick<FolderNode, 'createdBy'>, actor: FolderActor) {
  return isAdmin(actor) || (folder.createdBy !== null && folder.createdBy === actor.id);
}

/**
 * Folders the actor may see. The administrator sees all. Everyone else sees a folder they created, one opened
 * to all employees, to one of their roles or to them by name, but only when the whole chain of parents is visible too. A learner never sees a folder.
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
    let result = folder.visibleToStaff || folder.createdBy === actor.id || (folder.sharedUserIds?.includes(actor.id) ?? false)
      || (folder.accessRoles?.some((role) => actor.roles.includes(role)) ?? false);
    if (result && folder.parentId) {
      const parent = byId.get(folder.parentId);
      result = parent ? visible(parent, new Set(trail).add(folder.id)) : false;
    }
    memo.set(folder.id, result);
    return result;
  };
  return new Set(folders.filter((folder) => visible(folder, new Set())).map((folder) => folder.id));
}
