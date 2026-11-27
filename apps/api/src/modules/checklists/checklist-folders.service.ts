import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { markGuestPassesDisabled } from './checklist-public-access.js';
import {
  MAX_FOLDER_DEPTH,
  canManageFolder,
  folderDepth,
  indexFolders,
  isAdmin,
  normalizeFolderName,
  subtreeHeight,
  subtreeIds,
  visibleFolderIds,
  type FolderActor,
} from './checklist-folder-tree.js';
import type { BulkChecklistFolderInput, CreateChecklistFolderInput, UpdateChecklistFolderInput } from './checklists.schemas.js';

/** Roles that can open the checklist library at all (`checklistsRead`); a grant to anyone else would show nothing. */
const LIBRARY_ROLES = ['admin', 'manager', 'instructor', 'mentor'] as const;
const ACTIVE_INSTANCE_STATUSES = ['assigned', 'in_progress', 'submitted'] as const;
const folderSelect = { id: true, parentId: true, name: true, color: true, visibleToStaff: true, sharedUserIds: true, createdBy: true, createdAt: true, creator: { select: { id: true, firstName: true, lastName: true, deletedAt: true } } } as const;

/** What deleting a folder removes; shown to the user before they confirm and returned after the deletion. */
export type FolderDeleteImpact = {
  folders: number;
  checklists: number;
  /** Sheets with active assignments: not deleted but turned into drafts and moved to the root. */
  movedToDraft: Array<{ id: string; title: string }>;
};

/**
 * PR 395: the organization-wide folder tree of checklists. Folders are shared by the whole organization; the
 * administrator and the folder's creator manage a folder, other staff roles see it only when it is opened to staff
 * (and its whole chain of parents is), and a learner never sees folders.
 */
@Injectable()
export class ChecklistFoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Visible folders with the number of sheets directly in them and in their whole subtree. */
  async list(organizationId: string, actor: FolderActor) {
    const all = await this.loadAll(organizationId);
    const visible = visibleFolderIds(all, actor);
    const counts = await this.prisma.checklist.groupBy({
      by: ['folderId'],
      where: { organizationId, deletedAt: null, OR: [{ folderId: null }, { folderId: { in: [...visible] } }] },
      _count: { _all: true },
    });
    const direct = new Map(counts.map((row) => [row.folderId, row._count._all]));
    const managed = all.filter((folder) => visible.has(folder.id) && canManageFolder(folder, actor));
    const names = new Map((await this.sharedUsers(organizationId, [...new Set(managed.flatMap((folder) => folder.sharedUserIds))])).map((user) => [user.id, user]));
    const folders = all
      .filter((folder) => visible.has(folder.id))
      .map((folder) => ({
        ...folder,
        // Who a folder is opened to is shown only to those who manage it.
        sharedUserIds: canManageFolder(folder, actor) ? folder.sharedUserIds : [],
        sharedUsers: canManageFolder(folder, actor) ? folder.sharedUserIds.flatMap((id) => names.get(id) ?? []) : [],
        creator: presentCreator(folder.creator),
        canManage: canManageFolder(folder, actor),
        childFolderCount: all.filter((child) => child.parentId === folder.id && visible.has(child.id)).length,
        checklistCount: direct.get(folder.id) ?? 0,
        totalChecklistCount: subtreeIds(folder.id, all).filter((id) => visible.has(id)).reduce((sum, id) => sum + (direct.get(id) ?? 0), 0),
      }));
    const checklistCount = counts.reduce((sum, row) => sum + row._count._all, 0);
    return { folders, checklistCount };
  }

  async create(organizationId: string, actor: FolderActor, input: CreateChecklistFolderInput) {
    const all = await this.loadAll(organizationId);
    const parentId = input.parentId ?? null;
    if (parentId) {
      const parent = this.requireVisible(parentId, all, actor);
      this.requireManage(parent, actor);
      if (folderDepth(parentId, indexFolders(all)) + 1 > MAX_FOLDER_DEPTH) throw this.tooDeep();
    }
    this.assertNameFree(all, parentId, input.name, null);
    if (input.sharedUserIds?.length) await this.assertShareable(organizationId, input.sharedUserIds);
    const created = await this.prisma.checklistFolder.create({
      data: { organizationId, parentId, name: input.name, visibleToStaff: input.visibleToStaff ?? false, ...(input.color ? { color: input.color } : {}), ...(input.sharedUserIds ? { sharedUserIds: input.sharedUserIds } : {}), createdBy: actor.id },
      select: folderSelect,
    });
    await this.auditLog.record({ organizationId, actorId: actor.id, action: 'checklist.folder_created', targetType: 'checklist_folder', targetId: created.id, summary: `Created checklist folder ${created.name}` });
    return { ...created, sharedUsers: await this.sharedUsers(organizationId, created.sharedUserIds), creator: presentCreator(created.creator), canManage: true, checklistCount: 0, childFolderCount: 0, totalChecklistCount: 0 };
  }

  async update(folderId: string, organizationId: string, actor: FolderActor, input: UpdateChecklistFolderInput, audit = true) {
    const all = await this.loadAll(organizationId);
    const folder = this.requireVisible(folderId, all, actor);
    this.requireManage(folder, actor);
    const byId = indexFolders(all);

    const nextParentId = input.parentId === undefined ? folder.parentId : input.parentId;
    const nextName = input.name ?? folder.name;
    if (nextParentId !== folder.parentId) {
      if (nextParentId !== null) {
        const target = this.requireVisible(nextParentId, all, actor);
        this.requireManage(target, actor);
        // Not into itself and not into one of its own descendants.
        if (subtreeIds(folderId, all).includes(nextParentId)) throw new FolderMoveException('cycle', 'A folder cannot be moved into itself or into one of its subfolders');
        if (folderDepth(nextParentId, byId) + subtreeHeight(folderId, all) > MAX_FOLDER_DEPTH) throw this.tooDeep();
      }
    }
    if (nextParentId !== folder.parentId || nextName !== folder.name) this.assertNameFree(all, nextParentId, nextName, folderId);

    if (input.sharedUserIds?.length) await this.assertShareable(organizationId, input.sharedUserIds, folder.sharedUserIds);
    const updated = await this.prisma.checklistFolder.update({
      where: { id: folderId, organizationId },
      data: {
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.sharedUserIds !== undefined ? { sharedUserIds: input.sharedUserIds } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.visibleToStaff !== undefined ? { visibleToStaff: input.visibleToStaff } : {}),
      },
      select: folderSelect,
    });
    if (audit) await this.auditLog.record({ organizationId, actorId: actor.id, action: 'checklist.folder_updated', targetType: 'checklist_folder', targetId: folderId, summary: `Updated checklist folder ${updated.name}`, metadata: { fields: Object.keys(input), ...(input.sharedUserIds !== undefined ? { sharedUserCount: input.sharedUserIds.length } : {}), ...(input.color !== undefined ? { color: input.color } : {}) } });
    return { ...updated, sharedUsers: await this.sharedUsers(organizationId, updated.sharedUserIds), creator: presentCreator(updated.creator), canManage: true };
  }

  /** PR 515: employees a folder can be opened to by name: active staff of the organization who can use the library. */
  async shareCandidates(organizationId: string, search: string | undefined) {
    const term = search?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: 'active',
        memberships: { some: { organizationId, role: { in: [...LIBRARY_ROLES] } } },
        ...(term ? { OR: [{ firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 30,
    });
    return users.map((user) => ({ id: user.id, name: `${user.lastName} ${user.firstName}`.trim() }));
  }

  /** Names of employees already given access, so the dialog can show them without a search. */
  async sharedUsers(organizationId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({ where: { organizationId, id: { in: [...ids] } }, select: { id: true, firstName: true, lastName: true } });
    return users.map((user) => ({ id: user.id, name: `${user.lastName} ${user.firstName}`.trim() }));
  }

  /** Every named employee must be an active member of this organization with a library role (those already on the list stay as they are). */
  private async assertShareable(organizationId: string, ids: readonly string[], already: readonly string[] = []) {
    const fresh = ids.filter((id) => !already.includes(id));
    if (fresh.length === 0) return;
    const found = await this.prisma.user.count({
      where: { id: { in: fresh }, organizationId, deletedAt: null, status: 'active', memberships: { some: { organizationId, role: { in: [...LIBRARY_ROLES] } } } },
    });
    if (found !== fresh.length) throw new BadRequestException('A folder can be opened only to active staff of the organization');
  }

  /** What `remove` would do, without changing anything. */
  async deleteImpact(folderId: string, organizationId: string, actor: FolderActor): Promise<FolderDeleteImpact> {
    const all = await this.loadAll(organizationId);
    const folder = this.requireVisible(folderId, all, actor);
    this.requireManage(folder, actor);
    return this.computeImpact(subtreeIds(folderId, all), organizationId).then((impact) => impact.summary);
  }

  /** Deletes the folder with every subfolder and sheet inside; sheets with active assignments become drafts at the root. */
  async remove(folderId: string, organizationId: string, actor: FolderActor, audit = true): Promise<FolderDeleteImpact> {
    const all = await this.loadAll(organizationId);
    const folder = this.requireVisible(folderId, all, actor);
    this.requireManage(folder, actor);
    const folderIds = subtreeIds(folderId, all);
    const now = new Date();

    const summary = await this.prisma.$transaction(async (tx) => {
      const impact = await this.computeImpact(folderIds, organizationId, tx);
      if (impact.deletableIds.length > 0) {
        await tx.checklist.updateMany({ where: { id: { in: impact.deletableIds }, organizationId }, data: { deletedAt: now } });
      }
      if (impact.busyIds.length > 0) {
        // A draft cannot stay pinned in the free catalog.
        await tx.checklist.updateMany({ where: { id: { in: impact.busyIds }, organizationId }, data: { status: 'draft', folderId: null, pinned: false, publicAccess: 'off', publicAccessChangedAt: now } });
        await markGuestPassesDisabled(tx, organizationId, impact.busyIds, 'sheet_closed');
      }
      await tx.checklistFolder.updateMany({ where: { id: { in: folderIds }, organizationId, deletedAt: null }, data: { deletedAt: now } });
      return impact.summary;
    });

    if (audit) await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'checklist.folder_deleted',
      targetType: 'checklist_folder',
      targetId: folderId,
      summary: `Deleted checklist folder ${folder.name}`,
      metadata: { folders: summary.folders, checklists: summary.checklists, movedToDraft: summary.movedToDraft.length },
    });
    return summary;
  }

  /** One audit entry for the request; overlapping deletions are counted only once. */
  async bulk(organizationId: string, actor: FolderActor, input: BulkChecklistFolderInput) {
    if (!input.ids.length || input.ids.length > 100) throw new BadRequestException('Select between 1 and 100 folders');
    if (input.action === 'move' && input.parentId === undefined) throw new BadRequestException('parentId is required for move');
    const all = await this.loadAll(organizationId);
    if (input.action === 'move' && input.parentId) this.requireManage(this.requireVisible(input.parentId, all, actor), actor);
    const ids = [...new Set(input.ids)];
    const ordered = input.action === 'delete' ? [...ids].sort((a, b) => folderDepth(a, indexFolders(all)) - folderDepth(b, indexFolders(all))) : ids;
    const results = new Map<string, FolderBulkOutcome>();
    const deleted = new Set<string>();
    const summary: FolderDeleteImpact = { folders: 0, checklists: 0, movedToDraft: [] };
    for (const id of ordered) {
      try {
        const folder = this.requireVisible(id, all, actor);
        this.requireManage(folder, actor);
        if (deleted.has(id)) { results.set(id, { id, result: 'skipped', reason: 'covered_by_parent' }); continue; }
        if (input.action === 'move') {
          if (folder.parentId === input.parentId) { results.set(id, { id, result: 'skipped', reason: 'already_in_folder' }); continue; }
          await this.update(id, organizationId, actor, { parentId: input.parentId }, false);
        } else {
          const impact = await this.remove(id, organizationId, actor, false);
          summary.folders += impact.folders; summary.checklists += impact.checklists; summary.movedToDraft.push(...impact.movedToDraft);
          subtreeIds(id, all).forEach((descendant) => deleted.add(descendant));
        }
        results.set(id, { id, result: 'done' });
      } catch (error) {
        const reason = error instanceof NotFoundException ? 'not_found' : error instanceof ForbiddenException ? 'forbidden' : error instanceof ConflictException ? 'name_conflict' : error instanceof FolderMoveException ? error.reason : null;
        if (!reason) throw error;
        results.set(id, { id, result: 'skipped', reason });
      }
    }
    const outcomes = ids.map((id) => results.get(id)!);
    const done = outcomes.filter((outcome) => outcome.result === 'done').length;
    await this.auditLog.record({ organizationId, actorId: actor.id, action: `checklist.folder_bulk_${input.action}`, targetType: 'checklist_folder', targetId: null, summary: `Bulk ${input.action}: ${done} folders`, metadata: { ids, done, skipped: ids.length - done, ...(input.action === 'delete' ? { folders: summary.folders, checklists: summary.checklists, movedToDraft: summary.movedToDraft.length } : {}) } });
    return { action: input.action, done, skipped: ids.length - done, results: outcomes, ...(input.action === 'delete' ? { summary } : {}) };
  }

  private async computeImpact(folderIds: string[], organizationId: string, db: Pick<PrismaService, 'checklist' | 'checklistInstance'> = this.prisma) {
    const sheets = await db.checklist.findMany({ where: { organizationId, deletedAt: null, folderId: { in: folderIds } }, select: { id: true, title: true } });
    const busy = sheets.length === 0
      ? []
      : await db.checklistInstance.findMany({
        where: { organizationId, checklistId: { in: sheets.map((sheet) => sheet.id) }, status: { in: [...ACTIVE_INSTANCE_STATUSES] }, deletedAt: null },
        select: { checklistId: true },
        distinct: ['checklistId'],
      });
    const busyIds = busy.map((row) => row.checklistId);
    const movedToDraft = sheets.filter((sheet) => busyIds.includes(sheet.id));
    const deletableIds = sheets.filter((sheet) => !busyIds.includes(sheet.id)).map((sheet) => sheet.id);
    return {
      busyIds,
      deletableIds,
      summary: { folders: folderIds.length, checklists: deletableIds.length, movedToDraft } satisfies FolderDeleteImpact,
    };
  }

  private loadAll(organizationId: string) {
    return this.prisma.checklistFolder.findMany({ where: { organizationId, deletedAt: null }, select: folderSelect, orderBy: { createdAt: 'asc' } });
  }

  /** A missing folder and a folder the actor may not see look the same: 404. */
  private requireVisible<T extends { id: string; parentId: string | null; createdBy: string | null; visibleToStaff: boolean; sharedUserIds?: readonly string[] }>(id: string, all: readonly T[], actor: FolderActor): T {
    const folder = all.find((candidate) => candidate.id === id);
    if (!folder || !visibleFolderIds(all, actor).has(id)) throw new NotFoundException('Folder not found');
    return folder;
  }

  private requireManage(folder: { createdBy: string | null }, actor: FolderActor) {
    if (!canManageFolder(folder, actor)) {
      throw new ForbiddenException(isAdmin(actor) ? 'Not allowed' : 'Only the creator or an administrator can change this folder');
    }
  }

  private assertNameFree(all: ReadonlyArray<{ id: string; parentId: string | null; name: string }>, parentId: string | null, name: string, exceptId: string | null) {
    const wanted = normalizeFolderName(name);
    if (all.some((folder) => folder.id !== exceptId && folder.parentId === parentId && normalizeFolderName(folder.name) === wanted)) {
      throw new ConflictException('A folder with this name already exists here');
    }
  }

  private tooDeep() {
    return new FolderMoveException('too_deep', `Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`);
  }
}

type FolderBulkOutcome = { id: string; result: 'done' } | { id: string; result: 'skipped'; reason: 'not_found' | 'forbidden' | 'name_conflict' | 'too_deep' | 'cycle' | 'already_in_folder' | 'covered_by_parent' };
class FolderMoveException extends BadRequestException {
  constructor(readonly reason: 'cycle' | 'too_deep', message: string) { super(message); }
}

function presentCreator(creator: { id: string; firstName: string; lastName: string; deletedAt: Date | null } | null) {
  return creator && !creator.deletedAt && (creator.firstName.trim() || creator.lastName.trim()) ? { id: creator.id, firstName: creator.firstName, lastName: creator.lastName } : null;
}
