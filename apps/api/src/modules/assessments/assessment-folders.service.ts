import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { FolderMoveException, assertFolderDepth, assertFolderNameFree, folderCycle, folderSkipReason, type FolderMoveReason } from '../../common/folder-rules.js';
import { canManageFolder, isAdmin, visibleFolderIds, type FolderActor } from '../../common/folder-access.js';
import { folderDepth, indexFolders, subtreeHeight, subtreeIds } from '../../common/folder-tree.js';
import { assertFolderShareable, folderShareCandidates, folderSharedUsers } from '../../common/folder-share.js';
import { PrismaService } from '../../database/prisma.service.js';
import { lockAssessmentFolders } from './assessment-folder-lock.js';
import { assessmentCourseScope } from './assessment-author-scope.js';
import { AssessmentAttemptInProgressException, AssessmentsService } from './assessments.service.js';
import type { BulkAssessmentFolderInput, CreateAssessmentFolderInput, UpdateAssessmentFolderInput } from './assessments.schemas.js';

const folderSelect = { id: true, name: true, color: true, parentId: true, visibleToStaff: true, accessRoles: true, sharedUserIds: true, createdBy: true, createdAt: true, updatedAt: true } as const;

type Folder = Prisma.AssessmentFolderGetPayload<{ select: typeof folderSelect }>;
type DeleteImpact = { folders: number; movedToRoot: Array<{ id: string; title: string }> };
type SkipReason = 'not_found' | 'forbidden' | 'name_conflict' | 'too_deep' | 'cycle' | 'already_in_folder' | 'covered_by_parent' | 'longread_exercise' | 'attempt_in_progress';
type Outcome = { id: string; result: 'done'; impact?: DeleteImpact } | { id: string; result: 'skipped'; reason: SkipReason };

type FolderOperationReason = FolderMoveReason | 'longread_exercise';

@Injectable()
export class AssessmentFoldersService {
  constructor(private readonly prisma: PrismaService, private readonly assessments: AssessmentsService) {}

  async list(organizationId: string, actor: FolderActor, instructorId?: string) {
    const [everyFolder, counts] = await this.prisma.$transaction([
      this.loadFolders(this.prisma, organizationId),
      this.prisma.assessment.groupBy({
        by: ['folderId'],
        where: { organizationId, deletedAt: null, ...assessmentCourseScope(organizationId, instructorId) },
        _count: { _all: true },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    // PR 576: a folder closed to the actor and the tests inside it are not listed or counted.
    const seen = visibleFolderIds(everyFolder, actor);
    const folders = everyFolder.filter((folder) => seen.has(folder.id));
    const shown = counts.filter((row) => row.folderId === null || seen.has(row.folderId));
    const direct = new Map(shown.map((row) => [row.folderId, row._count._all]));
    const byId = indexFolders(folders);
    const names = new Map((await folderSharedUsers(this.prisma, organizationId, [...new Set(folders.filter((folder) => canManageFolder(folder, actor)).flatMap((folder) => folder.sharedUserIds))])).map((user) => [user.id, user]));
    const rows = folders.map((folder) => ({
      ...folder,
      sharedUserIds: canManageFolder(folder, actor) ? folder.sharedUserIds : [],
      sharedUsers: canManageFolder(folder, actor) ? folder.sharedUserIds.flatMap((id) => names.get(id) ?? []) : [],
      canManage: canManageFolder(folder, actor),
      childFolderCount: 0,
      assessmentCount: direct.get(folder.id) ?? 0,
      totalAssessmentCount: direct.get(folder.id) ?? 0,
    }));
    const byRowId = indexFolders(rows);
    const depths = new Map(folders.map((folder) => [folder.id, folderDepth(folder.id, byId)]));
    for (const row of [...rows].sort((a, b) => depths.get(b.id)! - depths.get(a.id)!)) {
      const parent = row.parentId ? byRowId.get(row.parentId) : undefined;
      if (parent) {
        parent.childFolderCount += 1;
        parent.totalAssessmentCount += row.totalAssessmentCount;
      }
    }
    return { folders: rows, assessmentCount: shown.reduce((total, row) => total + row._count._all, 0), rootAssessmentCount: direct.get(null) ?? 0 };
  }

  create(organizationId: string, actor: FolderActor, input: CreateAssessmentFolderInput) {
    return this.withFolderLock(organizationId, async (tx) => {
      const folders = await this.loadFolders(tx, organizationId);
      const parentId = input.parentId ?? null;
      if (parentId) {
        this.requireFolder(folders, parentId, actor);
        assertFolderDepth(folderDepth(parentId, indexFolders(folders)) + 1);
      }
      assertFolderNameFree(folders, parentId, input.name);
      if (input.sharedUserIds?.length) await assertFolderShareable(tx, organizationId, input.sharedUserIds);
      return tx.assessmentFolder.create({
        data: { organizationId, createdBy: actor.id, parentId, name: input.name, color: input.color, visibleToStaff: input.visibleToStaff ?? false, accessRoles: input.visibleToStaff ? [] : input.accessRoles ?? [], sharedUserIds: input.sharedUserIds ?? [] },
        select: folderSelect,
      }).then(async (folder) => ({ ...folder, sharedUsers: await folderSharedUsers(tx, organizationId, folder.sharedUserIds), canManage: true }));
    });
  }

  async update(organizationId: string, id: string, actor: FolderActor, input: UpdateAssessmentFolderInput) {
    const { folder } = await this.updateFolder(organizationId, id, actor, input);
    return { ...folder, sharedUsers: await folderSharedUsers(this.prisma, organizationId, folder.sharedUserIds), canManage: true };
  }

  /** PR 576: employees a test folder can be opened to by name. */
  shareCandidates(organizationId: string, search: string | undefined) {
    return folderShareCandidates(this.prisma, organizationId, search);
  }

  private updateFolder(organizationId: string, id: string, actor: FolderActor, input: UpdateAssessmentFolderInput) {
    return this.withFolderLock(organizationId, async (tx) => {
      const folders = await this.loadFolders(tx, organizationId);
      const current = this.requireFolder(folders, id, actor);
      this.requireManage(current, actor);
      const parentId = input.parentId === undefined ? current.parentId : input.parentId;
      const name = input.name ?? current.name;
      if (parentId !== current.parentId && parentId !== null) {
        this.requireFolder(folders, parentId, actor);
        if (subtreeIds(id, folders).includes(parentId)) {
          throw folderCycle();
        }
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
      if (input.sharedUserIds?.length) await assertFolderShareable(tx, organizationId, input.sharedUserIds, current.sharedUserIds);
      const folder = await tx.assessmentFolder.update({ where: { id, organizationId }, data: { parentId, name, color, visibleToStaff, accessRoles, sharedUserIds }, select: folderSelect });
      return { folder, changed: true };
    });
  }

  async deleteImpact(organizationId: string, id: string, actor: FolderActor, instructorId?: string) {
    return this.withFolderLock(organizationId, async (tx) => {
      const { impact } = await this.getDeleteImpact(tx, organizationId, id, actor, instructorId);
      return impact;
    });
  }

  async remove(organizationId: string, id: string, actor: FolderActor, instructorId?: string) {
    const { impact } = await this.removeSubtree(organizationId, id, actor, instructorId);
    return impact;
  }

  async bulk(organizationId: string, input: BulkAssessmentFolderInput, actor: FolderActor, instructorId?: string) {
    const ids = [...new Set(input.ids)];
    let ordered = ids;
    if (input.kind === 'folder' && input.action === 'delete') {
      const folders = indexFolders(await this.loadFolders(this.prisma, organizationId));
      ordered = [...ids].sort((a, b) => folderDepth(a, folders) - folderDepth(b, folders));
    }

    const results = new Map<string, Outcome>();
    const deleted = new Set<string>();
    for (const id of ordered) {
      try {
        let outcome: Outcome = { id, result: 'done' };
        if (input.kind === 'assessment') {
          if (input.action === 'delete') {
            await this.assessments.deleteAssessment(id, organizationId, instructorId);
          } else if (!await this.moveAssessment(organizationId, id, input.parentId, actor, instructorId)) {
            outcome = { id, result: 'skipped', reason: 'already_in_folder' };
          }
        } else if (input.action === 'move') {
          const { changed } = await this.updateFolder(organizationId, id, actor, { parentId: input.parentId });
          if (!changed) outcome = { id, result: 'skipped', reason: 'already_in_folder' };
        } else if (deleted.has(id)) {
          outcome = { id, result: 'skipped', reason: 'covered_by_parent' };
        } else {
          const { folderIds, impact } = await this.removeSubtree(organizationId, id, actor, instructorId);
          folderIds.forEach((folderId) => deleted.add(folderId));
          outcome = { id, result: 'done', impact };
        }
        results.set(id, outcome);
      } catch (error) {
        const reason = this.skipReason(error);
        if (!reason) throw error;
        results.set(id, { id, result: 'skipped', reason });
      }
    }

    const outcomes = ids.map((id) => results.get(id)!);
    const done = outcomes.filter((row) => row.result === 'done').length;
    return { action: input.action, kind: input.kind, done, skipped: ids.length - done, results: outcomes };
  }

  private moveAssessment(organizationId: string, id: string, folderId: string | null, actor: FolderActor, instructorId?: string) {
    return this.withFolderLock(organizationId, async (tx) => {
      const scope = { id, organizationId, deletedAt: null, ...assessmentCourseScope(organizationId, instructorId) };
      const assessment = await tx.assessment.findFirst({ where: scope, select: { folderId: true, isLongreadExercise: true } });
      if (!assessment) throw new NotFoundException('Assessment not found');
      if (folderId !== null) {
        this.requireFolder(await this.loadFolders(tx, organizationId), folderId, actor);
        if (assessment.isLongreadExercise) {
          throw new FolderMoveException<FolderOperationReason>('longread_exercise', 'Assessments created by longread exercises stay at the root');
        }
      }
      if (assessment.folderId === folderId) return false;
      const moved = await tx.assessment.updateMany({ where: scope, data: { folderId } });
      if (!moved.count) throw new NotFoundException('Assessment not found');
      return true;
    });
  }

  private removeSubtree(organizationId: string, id: string, actor: FolderActor, instructorId?: string) {
    return this.withFolderLock(organizationId, async (tx) => {
      const result = await this.getDeleteImpact(tx, organizationId, id, actor, instructorId);
      const { folderIds } = result;
      await tx.assessment.updateMany({ where: { organizationId, folderId: { in: folderIds } }, data: { folderId: null } });
      await tx.assessmentFolder.updateMany({ where: { organizationId, id: { in: folderIds } }, data: { deletedAt: new Date() } });
      return result;
    });
  }

  private async getDeleteImpact(tx: Prisma.TransactionClient, organizationId: string, id: string, actor: FolderActor, instructorId?: string) {
    const folders = await this.loadFolders(tx, organizationId);
    this.requireManage(this.requireFolder(folders, id, actor), actor);
    const folderIds = subtreeIds(id, folders);
    // A subfolder closed to the actor is not theirs to delete together with its parent.
    const seen = visibleFolderIds(folders, actor);
    if (folderIds.some((folderId) => !seen.has(folderId))) throw new ForbiddenException('The folder contains folders closed to you');
    const where = { organizationId, deletedAt: null, folderId: { in: folderIds } };
    if (instructorId && await tx.assessment.findFirst({
      where: { ...where, OR: [{ courseId: null }, { NOT: assessmentCourseScope(organizationId, instructorId) }] },
      select: { id: true },
    })) throw new ForbiddenException('Folder contains assessments outside your assigned courses');

    const movedToRoot = await tx.assessment.findMany({ where, select: { id: true, title: true }, orderBy: { id: 'asc' } });
    return { folderIds, impact: { folders: folderIds.length, movedToRoot } satisfies DeleteImpact };
  }

  private withFolderLock<T>(organizationId: string, action: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await lockAssessmentFolders(tx, organizationId);
      return action(tx);
    });
  }

  private loadFolders(tx: Prisma.TransactionClient, organizationId: string) {
    return tx.assessmentFolder.findMany({
      where: { organizationId, deletedAt: null },
      select: folderSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** A missing folder and a folder closed to the actor look the same: 404. */
  private requireFolder(folders: readonly Folder[], id: string, actor: FolderActor) {
    const folder = folders.find((row) => row.id === id);
    if (!folder || !visibleFolderIds(folders, actor).has(id)) throw new NotFoundException('Folder not found');
    return folder;
  }

  private requireManage(folder: Pick<Folder, 'createdBy'>, actor: FolderActor) {
    if (!canManageFolder(folder, actor)) {
      throw new ForbiddenException(isAdmin(actor) ? 'Not allowed' : 'Only the creator or an administrator can change this folder');
    }
  }

  private skipReason(error: unknown): SkipReason | undefined {
    if (error instanceof FolderMoveException) return error.reason;
    if (error instanceof AssessmentAttemptInProgressException) return 'attempt_in_progress';
    return folderSkipReason(error);
  }
}
