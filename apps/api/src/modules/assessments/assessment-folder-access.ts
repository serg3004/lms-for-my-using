import type { Prisma } from '@prisma/client';

import { visibleFolderIds, type FolderActor } from '../../common/folder-access.js';

/** The access fields of a test folder, as the folder rules read them. */
export const folderAccessSelect = { id: true, parentId: true, createdBy: true, visibleToStaff: true, accessRoles: true, sharedUserIds: true } as const;

/** PR 576: folders the actor may not see. The library hides the tests inside them; the administrator sees everything. */
export async function hiddenFolderIds(db: Pick<Prisma.TransactionClient, 'assessmentFolder'>, organizationId: string, actor: FolderActor): Promise<string[]> {
  const folders = await db.assessmentFolder.findMany({ where: { organizationId, deletedAt: null }, select: folderAccessSelect });
  const visible = visibleFolderIds(folders, actor);
  return folders.filter((folder) => !visible.has(folder.id)).map((folder) => folder.id);
}
