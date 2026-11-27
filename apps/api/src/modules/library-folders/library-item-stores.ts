import type { Prisma } from '@prisma/client';

import type { LibraryFolderScope } from './library-folders.schemas.js';

/**
 * PR 581: what a section keeps in its folders. A section gives the folder service these five operations; the tree
 * itself (create, rename, move, delete, bulk, rules) is the same for every section.
 */
export type LibraryItemStore = {
  /** Items per folder (`null` is the root level). */
  counts(tx: Prisma.TransactionClient, organizationId: string): Promise<Array<{ folderId: string | null; count: number }>>;
  /** The item with the folder it is in, or `null` when it does not exist in the organization. */
  find(tx: Prisma.TransactionClient, organizationId: string, id: string): Promise<{ id: string; folderId: string | null } | null>;
  /** Names of the items in these folders, for the "what happens when I delete" message. */
  titlesIn(tx: Prisma.TransactionClient, organizationId: string, folderIds: string[]): Promise<Array<{ id: string; title: string }>>;
  setFolder(tx: Prisma.TransactionClient, organizationId: string, id: string, folderId: string | null): Promise<void>;
  /** Items of deleted folders go to the root. */
  unfile(tx: Prisma.TransactionClient, organizationId: string, folderIds: string[]): Promise<void>;
};

const courseStore: LibraryItemStore = {
  async counts(tx, organizationId) {
    const rows = await tx.course.groupBy({ by: ['folderId'], where: { organizationId, deletedAt: null }, _count: { _all: true } });
    return rows.map((row) => ({ folderId: row.folderId, count: row._count._all }));
  },
  find: (tx, organizationId, id) => tx.course.findFirst({ where: { id, organizationId, deletedAt: null }, select: { id: true, folderId: true } }),
  async titlesIn(tx, organizationId, folderIds) {
    return tx.course.findMany({ where: { organizationId, deletedAt: null, folderId: { in: folderIds } }, select: { id: true, title: true }, orderBy: { id: 'asc' } });
  },
  async setFolder(tx, organizationId, id, folderId) {
    await tx.course.updateMany({ where: { id, organizationId, deletedAt: null }, data: { folderId } });
  },
  async unfile(tx, organizationId, folderIds) {
    await tx.course.updateMany({ where: { organizationId, folderId: { in: folderIds } }, data: { folderId: null } });
  },
};

const assignmentStore: LibraryItemStore = {
  async counts(tx, organizationId) {
    const rows = await tx.assignment.groupBy({ by: ['folderId'], where: { organizationId, deletedAt: null }, _count: { _all: true } });
    return rows.map((row) => ({ folderId: row.folderId, count: row._count._all }));
  },
  find: (tx, organizationId, id) => tx.assignment.findFirst({ where: { id, organizationId, deletedAt: null }, select: { id: true, folderId: true } }),
  async titlesIn(tx, organizationId, folderIds) {
    const rows = await tx.assignment.findMany({ where: { organizationId, deletedAt: null, folderId: { in: folderIds } }, select: { id: true, course: { select: { title: true } } }, orderBy: { id: 'asc' } });
    return rows.map((row) => ({ id: row.id, title: row.course.title }));
  },
  async setFolder(tx, organizationId, id, folderId) {
    await tx.assignment.updateMany({ where: { id, organizationId, deletedAt: null }, data: { folderId } });
  },
  async unfile(tx, organizationId, folderIds) {
    await tx.assignment.updateMany({ where: { organizationId, folderId: { in: folderIds } }, data: { folderId: null } });
  },
};

export const LIBRARY_ITEM_STORES: Record<LibraryFolderScope, LibraryItemStore> = { course: courseStore, assignment: assignmentStore };
