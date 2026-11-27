import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { MAX_FOLDER_DEPTH, normalizeFolderName } from './folder-tree.js';

/**
 * PR 580: the rules every folder library shares (checklists, tests, and the sections that get folders next):
 * one error for a move that breaks the tree, one name check, one depth check and one mapping of an error to the
 * "skipped" reason of a bulk result. A section keeps only what is its own: who may see a folder and what lies in it.
 */
export type FolderMoveReason = 'cycle' | 'too_deep';

export class FolderMoveException<R extends string = FolderMoveReason> extends BadRequestException {
  constructor(readonly reason: R, message: string) {
    super(message);
  }
}

export function folderTooDeep() {
  return new FolderMoveException('too_deep', `Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`);
}

export function folderCycle() {
  return new FolderMoveException('cycle', 'A folder cannot be moved into itself or into one of its subfolders');
}

/** `depth` is the level the folder (or the deepest folder of a moved subtree) would reach. */
export function assertFolderDepth(depth: number) {
  if (depth > MAX_FOLDER_DEPTH) throw folderTooDeep();
}

/** Names are unique among the folders of one parent, without regard to case. */
export function assertFolderNameFree(
  folders: ReadonlyArray<{ id: string; parentId: string | null; name: string }>,
  parentId: string | null,
  name: string,
  exceptId: string | null = null,
) {
  const wanted = normalizeFolderName(name);
  if (folders.some((folder) => folder.id !== exceptId && folder.parentId === parentId && normalizeFolderName(folder.name) === wanted)) {
    throw new ConflictException('A folder with this name already exists here');
  }
}

export type FolderSkipReason = 'not_found' | 'forbidden' | 'name_conflict' | FolderMoveReason;

/** The reason a bulk request skips a row because of this error; `undefined` means the error is not a per-row one. */
export function folderSkipReason(error: unknown): FolderSkipReason | undefined {
  if (error instanceof FolderMoveException && (error.reason === 'cycle' || error.reason === 'too_deep')) return error.reason;
  if (error instanceof NotFoundException) return 'not_found';
  if (error instanceof ForbiddenException) return 'forbidden';
  if (error instanceof ConflictException) return 'name_conflict';
  return undefined;
}
