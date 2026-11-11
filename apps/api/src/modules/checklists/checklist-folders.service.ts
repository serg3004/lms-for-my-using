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

const ACTIVE_INSTANCE_STATUSES = ['assigned', 'in_progress', 'submitted'] as const;
const folderSelect = { id: true, parentId: true, name: true, visibleToStaff: true, createdBy: true, createdAt: true, creator: { select: { id: true, firstName: true, lastName: true, deletedAt: true } } } as const;

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
    const folders = all
      .filter((folder) => visible.has(folder.id))
      .map((folder) => ({
        ...folder,
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
    const created = await this.prisma.checklistFolder.create({
      data: { organizationId, parentId, name: input.name, visibleToStaff: input.visibleToStaff ?? false, createdBy: actor.id },
      select: folderSelect,
    });
    await this.auditLog.record({ organizationId, actorId: actor.id, action: 'checklist.folder_created', targetType: 'checklist_folder', targetId: created.id, summary: `Created checklist folder ${created.name}` });
    return { ...created, creator: presentCreator(created.creator), canManage: true, checklistCount: 0, childFolderCount: 0, totalChecklistCount: 0 };
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

    const updated = await this.prisma.checklistFolder.update({
      where: { id: folderId, organizationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.visibleToStaff !== undefined ? { visibleToStaff: input.visibleToStaff } : {}),
      },
      select: folderSelect,
    });
    if (audit) await this.auditLog.record({ organizationId, actorId: actor.id, action: 'checklist.folder_updated', targetType: 'checklist_folder', targetId: folderId, summary: `Updated checklist folder ${updated.name}`, metadata: { fields: Object.keys(input) } });
    return { ...updated, creator: presentCreator(updated.creator), canManage: true };
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
  private requireVisible<T extends { id: string; parentId: string | null; createdBy: string | null; visibleToStaff: boolean }>(id: string, all: readonly T[], actor: FolderActor): T {
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
