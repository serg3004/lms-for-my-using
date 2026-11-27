/** PR 395: pure rules of the checklist folder tree, kept free of the database so they are unit-tested directly. */

export { MAX_FOLDER_DEPTH, folderDepth, indexFolders, normalizeFolderName, subtreeHeight, subtreeIds } from '../../common/folder-tree.js';

export { canManageFolder, folderAccessMode, isAdmin, visibleFolderIds } from '../../common/folder-access.js';
export type { FolderAccessMode, FolderActor, FolderNode } from '../../common/folder-access.js';
