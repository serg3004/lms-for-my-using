import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  assertFolderDepth,
  assertFolderNameFree,
  folderCycle,
  folderSkipReason,
} from '../../common/folder-rules.js';
import { canManageFolder, visibleFolderIds, type FolderActor } from '../../common/folder-access.js';
import { assertFolderShareable, folderShareCandidates, folderSharedUsers } from '../../common/folder-share.js';
import { folderDepth, indexFolders, subtreeHeight, subtreeIds } from '../../common/folder-tree.js';
import { PrismaService } from '../../database/prisma.service.js';
import { LIBRARY_ITEM_STORES } from './library-item-stores.js';
import type { BulkLibraryFolderInput, CreateLibraryFolderInput, LibraryFolderScope, UpdateLibraryFolderInput } from './library-folders.schemas.js';

/** Who manages the folders of a section; the people of other roles do not see the folder tree at all. */
const MANAGER_ROLES: Record<LibraryFolderScope, readonly string[]> = {
  course: ['admin'],
  assignment: ['admin', 'manager'],
  material: ['admin'],
};

const folderSelect = { id: true, scope: true, name: true, color: true, parentId: true, visibleToStaff: true, accessRoles: true, sharedUserIds: true, createdBy: true, createdAt: true, updatedAt: true } as const;
type Folder = Prisma.LibraryFolderGetPayload<{ select: typeof folderSelect }>;
type DeleteImpact = { folders: number; movedToRoot: Array<{ id: string; title: string }> };
type BulkReason = 'not_found' | 'forbidden' | 'name_conflict' | 'too_deep' | 'cycle' | 'already_in_folder' | 'covered_by_parent';
type Outcome = { id: string; result: 'done'; impact?: DeleteImpact } | { id: string; result: 'skipped'; reason: BulkReason };
export type LibraryActor = { organizationId: string; id: string; roles: readonly string[] };

/**
 * PR 581: the folders of the sections that keep their own list (courses, assignments). One table and one set of
 * rules for all of them: the shared tree rules in `common/folder-rules`, one lock per organization, and a
 * `LibraryItemStore` per section for what lies in the folders. Deleting a folder deletes the folders below it and
 * moves its items to the root; items themselves are never deleted from here.
 */
@Injectable()
export class LibraryFoldersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: LibraryActor, scope: LibraryFolderScope) {
    this.assertManager(actor, scope);
    const store = LIBRARY_ITEM_STORES[scope];
    const [allFolders, counts] = await this.prisma.$transaction(async (tx) => [
      await this.load(tx, actor.organizationId, scope),
      await store.counts(tx, actor.organizationId),
    ] as const, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    // PR 576: a folder closed to the actor, and the items inside it, are neither listed nor counted.
    const seen = visibleFolderIds(allFolders, actor);
    const folders = allFolders.filter((folder) => seen.has(folder.id));
    const shown = counts.filter((row) => row.folderId === null || seen.has(row.folderId));
    const direct = new Map(shown.map((row) => [row.folderId, row.count]));
    const names = new Map((await folderSharedUsers(this.prisma, actor.organizationId, [...new Set(folders.filter((folder) => canManageFolder(folder, actor)).flatMap((folder) => folder.sharedUserIds))])).map((user) => [user.id, user]));
    const rows = folders.map((folder) => ({
      ...folder,
      sharedUserIds: canManageFolder(folder, actor) ? folder.sharedUserIds : [],
      sharedUsers: canManageFolder(folder, actor) ? folder.sharedUserIds.flatMap((id) => names.get(id) ?? []) : [],
      canManage: canManageFolder(folder, actor),
      childFolderCount: 0,
      itemCount: direct.get(folder.id) ?? 0,
      totalItemCount: direct.get(folder.id) ?? 0,
    }));
    const byId = indexFolders(rows);
    const depths = new Map(folders.map((folder) => [folder.id, folderDepth(folder.id, indexFolders(folders))]));
    // Deepest first, so a folder's total is complete before it is added to its parent.
    for (const row of [...rows].sort((a, b) => depths.get(b.id)! - depths.get(a.id)!)) {
      const parent = row.parentId ? byId.get(row.parentId) : undefined;
      if (parent) {
        parent.childFolderCount += 1;
        parent.totalItemCount += row.totalItemCount;
      }
    }
    return { folders: rows, itemCount: shown.reduce((sum, row) => sum + row.count, 0), rootItemCount: direct.get(null) ?? 0 };
  }

  async create(actor: LibraryActor, input: CreateLibraryFolderInput) {
    this.assertManager(actor, input.scope);
    return this.locked(actor.organizationId, async (tx) => {
      const folders = await this.load(tx, actor.organizationId, input.scope);
      const parentId = input.parentId ?? null;
      if (parentId) {
        this.require(folders, parentId, actor);
        assertFolderDepth(folderDepth(parentId, indexFolders(folders)) + 1);
      }
      assertFolderNameFree(folders, parentId, input.name);
      if (input.sharedUserIds?.length) await assertFolderShareable(tx, actor.organizationId, input.sharedUserIds);
      const created = await tx.libraryFolder.create({
        data: {
          organizationId: actor.organizationId, scope: input.scope, createdBy: actor.id, parentId, name: input.name, ...(input.color ? { color: input.color } : {}),
          visibleToStaff: input.visibleToStaff ?? false, accessRoles: input.visibleToStaff ? [] : input.accessRoles ?? [], sharedUserIds: input.sharedUserIds ?? [],
        },
        select: folderSelect,
      });
      return { ...created, sharedUsers: await folderSharedUsers(tx, actor.organizationId, created.sharedUserIds), canManage: true };
    });
  }

  async update(actor: LibraryActor, id: string, input: UpdateLibraryFolderInput) {
    const { folder } = await this.updateFolder(actor, id, input);
    return { ...folder, sharedUsers: await folderSharedUsers(this.prisma, actor.organizationId, folder.sharedUserIds), canManage: true };
  }

  /** PR 576: employees a folder can be opened to by name. */
  shareCandidates(actor: LibraryActor, scope: LibraryFolderScope, search: string | undefined) {
    this.assertManager(actor, scope);
    return folderShareCandidates(this.prisma, actor.organizationId, search);
  }

  async deleteImpact(actor: LibraryActor, id: string) {
    return this.locked(actor.organizationId, async (tx) => (await this.impact(tx, actor, id)).impact);
  }

  async remove(actor: LibraryActor, id: string) {
    return (await this.removeSubtree(actor, id)).impact;
  }

  /** One request moves or deletes up to 100 folders or items; each one is reported on its own, none stops the others. */
  async bulk(actor: LibraryActor, input: BulkLibraryFolderInput) {
    this.assertManager(actor, input.scope);
    const ids = [...new Set(input.ids)];
    let ordered = ids;
    if (input.kind === 'folder' && input.action === 'delete') {
      const folders = indexFolders(await this.load(this.prisma, actor.organizationId, input.scope));
      ordered = [...ids].sort((a, b) => folderDepth(a, folders) - folderDepth(b, folders));
    }
    const results = new Map<string, Outcome>();
    const deleted = new Set<string>();
    for (const id of ordered) {
      try {
        let outcome: Outcome = { id, result: 'done' };
        if (input.kind === 'item') {
          if (!await this.moveItem(actor, input.scope, id, input.action === 'move' ? input.parentId : null)) outcome = { id, result: 'skipped', reason: 'already_in_folder' };
        } else if (input.action === 'move') {
          if (!(await this.updateFolder(actor, id, { parentId: input.parentId })).changed) outcome = { id, result: 'skipped', reason: 'already_in_folder' };
        } else if (deleted.has(id)) {
          outcome = { id, result: 'skipped', reason: 'covered_by_parent' };
        } else {
          const { folderIds, impact } = await this.removeSubtree(actor, id);
          folderIds.forEach((folderId) => deleted.add(folderId));
          outcome = { id, result: 'done', impact };
        }
        results.set(id, outcome);
      } catch (error) {
        const reason = folderSkipReason(error);
        if (!reason) throw error;
        results.set(id, { id, result: 'skipped', reason });
      }
    }
    const outcomes = ids.map((id) => results.get(id)!);
    const done = outcomes.filter((row) => row.result === 'done').length;
    return { action: input.action, kind: input.kind, done, skipped: ids.length - done, results: outcomes };
  }

  private updateFolder(actor: LibraryActor, id: string, input: UpdateLibraryFolderInput) {
    return this.locked(actor.organizationId, async (tx) => {
      const current = await this.requireOwn(tx, actor, id);
      const folders = await this.load(tx, actor.organizationId, current.scope as LibraryFolderScope);
      const parentId = input.parentId === undefined ? current.parentId : input.parentId;
      const name = input.name ?? current.name;
      if (parentId !== current.parentId && parentId !== null) {
        this.require(folders, parentId, actor);
        if (subtreeIds(id, folders).includes(parentId)) throw folderCycle();
        assertFolderDepth(folderDepth(parentId, indexFolders(folders)) + subtreeHeight(id, folders));
      }
      const color = input.color ?? current.color;
      // "All employees" and a list of roles exclude each other: choosing "all" empties the roles.
      const visibleToStaff = input.visibleToStaff ?? current.visibleToStaff;
      const accessRoles: string[] = visibleToStaff ? [] : (input.accessRoles ?? current.accessRoles);
      const sharedUserIds: string[] = input.sharedUserIds ?? current.sharedUserIds;
      const accessChanged = visibleToStaff !== current.visibleToStaff || accessRoles.join() !== current.accessRoles.join() || sharedUserIds.join() !== current.sharedUserIds.join();
      const locationChanged = parentId !== current.parentId || name !== current.name;
      if (!locationChanged && color === current.color && !accessChanged) return { folder: current, changed: false };
      if (locationChanged) assertFolderNameFree(folders, parentId, name, id);
      if (input.sharedUserIds?.length) await assertFolderShareable(tx, actor.organizationId, input.sharedUserIds, current.sharedUserIds);
      const folder = await tx.libraryFolder.update({ where: { id, organizationId: actor.organizationId }, data: { parentId, name, color, visibleToStaff, accessRoles, sharedUserIds }, select: folderSelect });
      return { folder, changed: true };
    });
  }

  private moveItem(actor: LibraryActor, scope: LibraryFolderScope, id: string, folderId: string | null) {
    return this.locked(actor.organizationId, async (tx) => {
      const store = LIBRARY_ITEM_STORES[scope];
      const item = await store.find(tx, actor.organizationId, id);
      if (!item) throw new NotFoundException('Item not found');
      if (folderId !== null) this.require(await this.load(tx, actor.organizationId, scope), folderId, actor);
      if (item.folderId === folderId) return false;
      await store.setFolder(tx, actor.organizationId, id, folderId);
      return true;
    });
  }

  private removeSubtree(actor: LibraryActor, id: string) {
    return this.locked(actor.organizationId, async (tx) => {
      const result = await this.impact(tx, actor, id);
      const scope = result.scope;
      await LIBRARY_ITEM_STORES[scope].unfile(tx, actor.organizationId, result.folderIds);
      await tx.libraryFolder.updateMany({ where: { organizationId: actor.organizationId, id: { in: result.folderIds } }, data: { deletedAt: new Date() } });
      return result;
    });
  }

  private async impact(tx: Prisma.TransactionClient, actor: LibraryActor, id: string) {
    const folder = await this.requireOwn(tx, actor, id);
    const scope = folder.scope as LibraryFolderScope;
    const folders = await this.load(tx, actor.organizationId, scope);
    const folderIds = subtreeIds(id, folders);
    const movedToRoot = await LIBRARY_ITEM_STORES[scope].titlesIn(tx, actor.organizationId, folderIds);
    return { scope, folderIds, impact: { folders: folderIds.length, movedToRoot } satisfies DeleteImpact };
  }

  /** A folder of another organization, of a removed folder, or of a section the actor does not manage looks like a missing one. */
  private async requireOwn(tx: Prisma.TransactionClient, actor: LibraryActor, id: string): Promise<Folder> {
    const folder = await tx.libraryFolder.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null }, select: folderSelect });
    if (!folder) throw new NotFoundException('Folder not found');
    this.assertManager(actor, folder.scope as LibraryFolderScope);
    // PR 576: a folder closed to the actor looks missing; a visible one can be changed only by its creator or an administrator.
    const all = await this.load(tx, actor.organizationId, folder.scope as LibraryFolderScope);
    if (!visibleFolderIds(all, actor).has(id)) throw new NotFoundException('Folder not found');
    if (!canManageFolder(folder, actor)) throw new ForbiddenException('Only the creator or an administrator can change this folder');
    return folder;
  }

  private assertManager(actor: LibraryActor, scope: LibraryFolderScope) {
    if (!actor.roles.some((role) => MANAGER_ROLES[scope].includes(role))) throw new ForbiddenException('Not allowed');
  }

  private locked<T>(organizationId: string, action: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('library_folders'), hashtext(${organizationId}::uuid::text))`;
      return action(tx);
    });
  }

  private load(db: Pick<Prisma.TransactionClient, 'libraryFolder'>, organizationId: string, scope: LibraryFolderScope) {
    return db.libraryFolder.findMany({ where: { organizationId, scope, deletedAt: null }, select: folderSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }

  private require(folders: readonly Folder[], id: string, actor: FolderActor) {
    const folder = folders.find((row) => row.id === id);
    if (!folder || !visibleFolderIds(folders, actor).has(id)) throw new NotFoundException('Folder not found');
    return folder;
  }
}
