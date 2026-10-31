import type { TFunction } from 'i18next';
import { ApiClientError } from '../../shared/apiClient.js';
import type { ChecklistFolder, ChecklistFolderDeleteImpact } from '../../shared/api/types.js';

/** PR 396: pure helpers of the checklist folder tree on the list screen. The server enforces every rule; these only present it. */
export const MAX_FOLDER_DEPTH = 5;

export type FolderRow = { folder: ChecklistFolder; level: number; hasChildren: boolean };

export function childrenByParent(folders: readonly ChecklistFolder[]) {
  const map = new Map<string | null, ChecklistFolder[]>();
  for (const folder of folders) map.set(folder.parentId, [...(map.get(folder.parentId) ?? []), folder]);
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return map;
}

/** Folders in tree order with their level (1 = top level). A folder whose parent is not in the list is shown at the top. */
export function folderRows(folders: readonly ChecklistFolder[], expanded: ReadonlySet<string> | 'all' = 'all'): FolderRow[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const children = childrenByParent(folders.map((folder) => (folder.parentId !== null && !ids.has(folder.parentId) ? { ...folder, parentId: null } : folder)));
  const rows: FolderRow[] = [];
  const walk = (parentId: string | null, level: number, trail: ReadonlySet<string>) => {
    for (const folder of children.get(parentId) ?? []) {
      if (trail.has(folder.id)) continue;
      const hasChildren = (children.get(folder.id) ?? []).length > 0;
      rows.push({ folder, level, hasChildren });
      if (hasChildren && (expanded === 'all' || expanded.has(folder.id))) walk(folder.id, level + 1, new Set(trail).add(folder.id));
    }
  };
  walk(null, 1, new Set());
  return rows;
}

/** Folders from the top down to the given one; empty for the root or an unknown id. */
export function folderPath(folders: readonly ChecklistFolder[], folderId: string | null | undefined): ChecklistFolder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: ChecklistFolder[] = [];
  for (let current = byId.get(folderId); current && !path.includes(current); current = current.parentId ? byId.get(current.parentId) : undefined) path.unshift(current);
  return path;
}

export function folderPathLabel(folders: readonly ChecklistFolder[], folderId: string | null | undefined, separator = ' / '): string {
  return folderPath(folders, folderId).map((folder) => folder.name).join(separator);
}

/** Ancestors that must be expanded for the folder to be visible in the tree. */
export function ancestorIds(folders: readonly ChecklistFolder[], folderId: string | null | undefined): string[] {
  return folderPath(folders, folderId).slice(0, -1).map((folder) => folder.id);
}

/** A folder from the URL that no longer exists (or is hidden) falls back to "all checklists". */
export function resolveSelectedFolder(folders: readonly ChecklistFolder[], requested: string | null): string | null {
  return requested && folders.some((folder) => folder.id === requested) ? requested : null;
}

/** Sheets shown for the selection: everything for "all checklists", otherwise the sheets directly in the folder. */
export function sheetsInFolder<T extends { folderId?: string | null }>(sheets: readonly T[], folderId: string | null): T[] {
  return folderId === null ? [...sheets] : sheets.filter((sheet) => (sheet.folderId ?? null) === folderId);
}

/** A new subfolder is possible only while the parent leaves room below the depth limit. */
export function canAddSubfolder(folders: readonly ChecklistFolder[], parentId: string | null): boolean {
  return folderPath(folders, parentId).length < MAX_FOLDER_DEPTH;
}

export function deleteImpactMessage(name: string, impact: ChecklistFolderDeleteImpact, t: TFunction): string {
  const base = t('admin.checklists.folders.deleteConfirm', 'Delete the folder "{{name}}" with everything inside? Folders: {{folders}}, checklists to be deleted: {{checklists}}. Completed results are kept. This cannot be undone.', {
    name, folders: impact.folders, checklists: impact.checklists,
  });
  if (impact.movedToDraft.length === 0) return base;
  const titles = impact.movedToDraft.map((sheet) => `«${sheet.title}»`).join(', ');
  return `${base} ${t('admin.checklists.folders.deleteMoved', 'Checklists with assignments in progress are not deleted but moved to drafts at the root: {{titles}}.', { titles })}`;
}

/** Plain-language text for the folder errors (the server messages are English): depth, cycle, duplicate name, gone, not allowed. */
export function folderErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiClientError) {
    if (error.status === 409) return t('admin.checklists.folders.errorDuplicate', 'A folder with this name already exists here.');
    if (error.status === 404) return t('admin.checklists.folders.errorGone', 'The folder no longer exists or is not available to you. Refresh the page.');
    if (error.status === 403) return t('admin.checklists.folders.errorForbidden', 'Only the creator of the folder or an administrator can change it.');
    if (error.status === 400 && /nested/i.test(error.message)) return t('admin.checklists.folders.errorDepth', 'Folders can be nested at most 5 levels deep.');
    if (error.status === 400 && /itself|subfolder/i.test(error.message)) return t('admin.checklists.folders.errorCycle', 'A folder cannot be moved into itself or into one of its subfolders.');
    return error.message;
  }
  return t('admin.checklists.folders.errorGeneric', 'The folder action failed. Try again.');
}
