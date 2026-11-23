/** The root folder is level 1, so a chain of five folders is the deepest allowed. */
export const MAX_FOLDER_DEPTH = 5;

type FolderNode = { id: string; parentId: string | null };

export function indexFolders<T extends { id: string }>(folders: readonly T[]) {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

/** Level of a folder: 1 for a root folder. A broken chain (missing parent) counts only the folders found. */
export function folderDepth(id: string, byId: ReadonlyMap<string, FolderNode>): number {
  let depth = 0;
  const seen = new Set<string>();
  for (let current = byId.get(id); current && !seen.has(current.id); current = current.parentId ? byId.get(current.parentId) : undefined) {
    seen.add(current.id);
    depth += 1;
  }
  return depth;
}

/** The folder itself and every folder below it, at any level. */
export function subtreeIds(rootId: string, folders: readonly FolderNode[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId) childrenOf.set(folder.parentId, [...(childrenOf.get(folder.parentId) ?? []), folder.id]);
  }
  const result: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.includes(id)) continue;
    result.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return result;
}

/** Number of levels in the subtree starting at the folder (1 for a folder without children). */
export function subtreeHeight(rootId: string, folders: readonly FolderNode[]): number {
  const childrenOf = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId) childrenOf.set(folder.parentId, [...(childrenOf.get(folder.parentId) ?? []), folder.id]);
  }
  const height = (id: string, trail: ReadonlySet<string>): number => {
    if (trail.has(id)) return 0;
    const next = new Set(trail).add(id);
    return 1 + Math.max(0, ...(childrenOf.get(id) ?? []).map((child) => height(child, next)));
  };
  return height(rootId, new Set());
}

/** Names are unique among siblings without regard to case. */
export function normalizeFolderName(name: string) {
  return name.trim().toLocaleLowerCase();
}
