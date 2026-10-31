import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
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
import type { CreateChecklistFolderInput, UpdateChecklistFolderInput } from './checklists.schemas.js';

const ACTIVE_INSTANCE_STATUSES = ['assigned', 'in_progress', 'submitted'] as const;
const folderSelect = { id: true, parentId: true, name: true, visibleToStaff: true, createdBy: true, createdAt: true } as const;

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
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    });
    const direct = new Map(counts.map((row) => [row.folderId, row._count._all]));
    const folders = all
      .filter((folder) => visible.has(folder.id))
      .map((folder) => ({
        ...folder,
        canManage: canManageFolder(folder, actor),
        checklistCount: direct.get(folder.id) ?? 0,
        totalChecklistCount: subtreeIds(folder.id, all).reduce((sum, id) => sum + (direct.get(id) ?? 0), 0),
      }));
    const hidden = new Set(all.filter((folder) => !visible.has(folder.id)).map((folder) => folder.id));
    const checklistCount = counts.filter((row) => row.folderId === null || !hidden.has(row.folderId)).reduce((sum, row) => sum + row._count._all, 0);
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
    return { ...created, canManage: true, checklistCount: 0, totalChecklistCount: 0 };
  }

  async update(folderId: string, organizationId: string, actor: FolderActor, input: UpdateChecklistFolderInput) {
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
        if (subtreeIds(folderId, all).includes(nextParentId)) throw new BadRequestException('A folder cannot be moved into itself or into one of its subfolders');
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
    await this.auditLog.record({ organizationId, actorId: actor.id, action: 'checklist.folder_updated', targetType: 'checklist_folder', targetId: folderId, summary: `Updated checklist folder ${updated.name}`, metadata: { fields: Object.keys(input) } });
    return { ...updated, canManage: true };
  }

  /** What `remove` would do, without changing anything. */
  async deleteImpact(folderId: string, organizationId: string, actor: FolderActor): Promise<FolderDeleteImpact> {
    const all = await this.loadAll(organizationId);
    const folder = this.requireVisible(folderId, all, actor);
    this.requireManage(folder, actor);
    return this.computeImpact(subtreeIds(folderId, all), organizationId).then((impact) => impact.summary);
  }

  /** Deletes the folder with every subfolder and sheet inside; sheets with active assignments become drafts at the root. */
  async remove(folderId: string, organizationId: string, actor: FolderActor): Promise<FolderDeleteImpact> {
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
        await tx.checklist.updateMany({ where: { id: { in: impact.busyIds }, organizationId }, data: { status: 'draft', folderId: null, pinned: false } });
      }
      await tx.checklistFolder.updateMany({ where: { id: { in: folderIds }, organizationId, deletedAt: null }, data: { deletedAt: now } });
      return impact.summary;
    });

    await this.auditLog.record({
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
    return new BadRequestException(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`);
  }
}
