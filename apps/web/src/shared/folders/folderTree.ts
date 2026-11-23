export type FolderNode = { id: string; name: string; parentId: string | null };
export const MAX_FOLDER_DEPTH = 5;

export type FolderRow<F extends FolderNode> = { folder: F; level: number; hasChildren: boolean };

export function childrenByParent<F extends FolderNode>(folders: readonly F[]) {
  const map = new Map<string | null, F[]>();
  for (const folder of folders) map.set(folder.parentId, [...(map.get(folder.parentId) ?? []), folder]);
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return map;
}

/** Folders in tree order with their level (1 = top level). A folder whose parent is not in the list is shown at the top. */
export function folderRows<F extends FolderNode>(folders: readonly F[], expanded: ReadonlySet<string> | 'all' = 'all'): FolderRow<F>[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const children = childrenByParent(folders.map((folder) => (folder.parentId !== null && !ids.has(folder.parentId) ? { ...folder, parentId: null } : folder)));
  const rows: FolderRow<F>[] = [];
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
export function folderPath<F extends FolderNode>(folders: readonly F[], folderId: string | null | undefined): F[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: F[] = [];
  for (let current = byId.get(folderId); current && !path.includes(current); current = current.parentId ? byId.get(current.parentId) : undefined) path.unshift(current);
  return path;
}

export function folderPathLabel(folders: readonly FolderNode[], folderId: string | null | undefined, separator = ' / '): string {
  return folderPath(folders, folderId).map((folder) => folder.name).join(separator);
}

/** Ancestors that must be expanded for the folder to be visible in the tree. */
export function ancestorIds(folders: readonly FolderNode[], folderId: string | null | undefined): string[] {
  return folderPath(folders, folderId).slice(0, -1).map((folder) => folder.id);
}

/** A folder from the URL that no longer exists (or is hidden) falls back to "all checklists". */
export function resolveSelectedFolder(folders: readonly FolderNode[], requested: string | null): string | null {
  return requested && folders.some((folder) => folder.id === requested) ? requested : null;
}

/** PR 408: what the open folder shows: its direct subfolders (by name) and its direct sheets. A folder or sheet whose parent is not visible is shown at the root. */
export function libraryContents<F extends FolderNode, S extends { folderId?: string | null }>(folders: readonly F[], sheets: readonly S[], openFolderId: string | null): { folders: F[]; sheets: S[] } {
  const ids = new Set(folders.map((folder) => folder.id));
  const parentOf = (folder: F) => (folder.parentId !== null && ids.has(folder.parentId) ? folder.parentId : null);
  const sheetFolder = (sheet: S) => (sheet.folderId && ids.has(sheet.folderId) ? sheet.folderId : null);
  return {
    folders: folders.filter((folder) => parentOf(folder) === openFolderId).sort((a, b) => a.name.localeCompare(b.name)),
    sheets: sheets.filter((sheet) => sheetFolder(sheet) === openFolderId),
  };
}

/** The folder and everything below it (the folder itself first). */
export function folderAndDescendantIds(folders: readonly FolderNode[], folderId: string): Set<string> {
  const result = new Set<string>([folderId]);
  for (let added = true; added;) {
    added = false;
    for (const folder of folders) if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) { result.add(folder.id); added = true; }
  }
  return result;
}

/** A new subfolder is possible only while the parent leaves room below the depth limit. */
export function canAddSubfolder(folders: readonly FolderNode[], parentId: string | null): boolean {
  return folderPath(folders, parentId).length < MAX_FOLDER_DEPTH;
}
