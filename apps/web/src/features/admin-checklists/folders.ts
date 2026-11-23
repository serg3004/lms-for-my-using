import { plainText } from '@lms/shared/rich-text';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../../shared/apiClient.js';
import type { ChecklistFolder, ChecklistFolderDeleteImpact } from '../../shared/api/types.js';

import { folderAndDescendantIds } from '../../shared/folders/folderTree.js';
export { MAX_FOLDER_DEPTH, ancestorIds, canAddSubfolder, childrenByParent, folderAndDescendantIds, folderPath, folderPathLabel, folderRows, libraryContents, resolveSelectedFolder } from '../../shared/folders/folderTree.js';

/** PR 408: live assignments of every sheet in the folder, subfolders included. */
export function folderAssignmentTotal(folders: readonly ChecklistFolder[], sheets: ReadonlyArray<{ folderId?: string | null; assignmentCount?: number }>, folderId: string): number {
  const inside = folderAndDescendantIds(folders, folderId);
  return sheets.reduce((sum, sheet) => sum + (sheet.folderId && inside.has(sheet.folderId) ? sheet.assignmentCount ?? 0 : 0), 0);
}

/** PR 408: the number of subfolders plus sheets directly inside a folder, for the "Items" column. */
export function folderDirectCounts(folders: readonly ChecklistFolder[], sheets: ReadonlyArray<{ folderId?: string | null }>, folderId: string) {
  return { folders: folders.filter((folder) => folder.parentId === folderId).length, sheets: sheets.filter((sheet) => sheet.folderId === folderId).length };
}

export function deleteImpactMessage(name: string, impact: ChecklistFolderDeleteImpact, t: TFunction): string {
  const base = t('admin.checklists.folders.deleteConfirm', 'Delete the folder "{{name}}" with everything inside? Folders: {{folders}}, checklists to be deleted: {{checklists}}. Completed results are kept. This cannot be undone.', {
    name, folders: impact.folders, checklists: impact.checklists,
  });
  if (impact.movedToDraft.length === 0) return base;
  const titles = impact.movedToDraft.map((sheet) => `«${plainText(sheet.title)}»`).join(', ');
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
