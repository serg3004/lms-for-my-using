import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { MAX_FOLDER_DEPTH, folderDepth, indexFolders, normalizeFolderName, subtreeHeight, subtreeIds } from '../../common/folder-tree.js';
import { PrismaService } from '../../database/prisma.service.js';
import { lockAssessmentFolders } from './assessment-folder-lock.js';
import { assessmentCourseScope } from './assessment-author-scope.js';
import { AssessmentAttemptInProgressException, AssessmentsService } from './assessments.service.js';
import type { BulkAssessmentFolderInput, CreateAssessmentFolderInput, UpdateAssessmentFolderInput } from './assessments.schemas.js';

const folderSelect = { id: true, name: true, parentId: true, createdBy: true, createdAt: true, updatedAt: true } as const;

type Folder = Prisma.AssessmentFolderGetPayload<{ select: typeof folderSelect }>;
type DeleteImpact = { folders: number; movedToRoot: Array<{ id: string; title: string }> };
type SkipReason = 'not_found' | 'forbidden' | 'name_conflict' | 'too_deep' | 'cycle' | 'already_in_folder' | 'covered_by_parent' | 'longread_exercise' | 'attempt_in_progress';
type Outcome = { id: string; result: 'done'; impact?: DeleteImpact } | { id: string; result: 'skipped'; reason: SkipReason };

class FolderOperationException extends BadRequestException {
  constructor(readonly reason: 'cycle' | 'too_deep' | 'longread_exercise', message: string) {
    super(message);
  }
}

@Injectable()
export class AssessmentFoldersService {
  constructor(private readonly prisma: PrismaService, private readonly assessments: AssessmentsService) {}

  async list(organizationId: string, instructorId?: string) {
    const [folders, counts] = await this.prisma.$transaction([
      this.loadFolders(this.prisma, organizationId),
      this.prisma.assessment.groupBy({
        by: ['folderId'],
        where: { organizationId, deletedAt: null, ...assessmentCourseScope(organizationId, instructorId) },
        _count: { _all: true },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const direct = new Map(counts.map((row) => [row.folderId, row._count._all]));
    const byId = indexFolders(folders);
    const rows = folders.map((folder) => ({
      ...folder,
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
    return { folders: rows, assessmentCount: counts.reduce((total, row) => total + row._count._all, 0), rootAssessmentCount: direct.get(null) ?? 0 };
  }

  create(organizationId: string, actorId: string, input: CreateAssessmentFolderInput) {
    return this.withFolderLock(organizationId, async (tx) => {
      const folders = await this.loadFolders(tx, organizationId);
      const parentId = input.parentId ?? null;
      if (parentId) {
        this.requireFolder(folders, parentId);
        this.assertDepth(folderDepth(parentId, indexFolders(folders)) + 1);
      }
      this.assertNameFree(folders, parentId, input.name);
      return tx.assessmentFolder.create({
        data: { organizationId, createdBy: actorId, parentId, name: input.name },
        select: folderSelect,
      });
    });
  }

  async update(organizationId: string, id: string, input: UpdateAssessmentFolderInput) {
    const { folder } = await this.updateFolder(organizationId, id, input);
    return folder;
  }

  private updateFolder(organizationId: string, id: string, input: UpdateAssessmentFolderInput) {
    return this.withFolderLock(organizationId, async (tx) => {
      const folders = await this.loadFolders(tx, organizationId);
      const current = this.requireFolder(folders, id);
      const parentId = input.parentId === undefined ? current.parentId : input.parentId;
      const name = input.name ?? current.name;
      if (parentId !== current.parentId && parentId !== null) {
        this.requireFolder(folders, parentId);
        if (subtreeIds(id, folders).includes(parentId)) {
          throw new FolderOperationException('cycle', 'A folder cannot be moved into itself or a descendant');
        }
        this.assertDepth(folderDepth(parentId, indexFolders(folders)) + subtreeHeight(id, folders));
      }
      if (parentId === current.parentId && name === current.name) return { folder: current, changed: false };
      this.assertNameFree(folders, parentId, name, id);
      const folder = await tx.assessmentFolder.update({ where: { id, organizationId }, data: { parentId, name }, select: folderSelect });
      return { folder, changed: true };
    });
  }

  async deleteImpact(organizationId: string, id: string, instructorId?: string) {
    return this.withFolderLock(organizationId, async (tx) => {
      const { impact } = await this.getDeleteImpact(tx, organizationId, id, instructorId);
      return impact;
    });
  }

  async remove(organizationId: string, id: string, instructorId?: string) {
    const { impact } = await this.removeSubtree(organizationId, id, instructorId);
    return impact;
  }

  async bulk(organizationId: string, input: BulkAssessmentFolderInput, instructorId?: string) {
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
          } else if (!await this.moveAssessment(organizationId, id, input.parentId, instructorId)) {
            outcome = { id, result: 'skipped', reason: 'already_in_folder' };
          }
        } else if (input.action === 'move') {
          const { changed } = await this.updateFolder(organizationId, id, { parentId: input.parentId });
          if (!changed) outcome = { id, result: 'skipped', reason: 'already_in_folder' };
        } else if (deleted.has(id)) {
          outcome = { id, result: 'skipped', reason: 'covered_by_parent' };
        } else {
          const { folderIds, impact } = await this.removeSubtree(organizationId, id, instructorId);
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

  private moveAssessment(organizationId: string, id: string, folderId: string | null, instructorId?: string) {
    return this.withFolderLock(organizationId, async (tx) => {
      const scope = { id, organizationId, deletedAt: null, ...assessmentCourseScope(organizationId, instructorId) };
      const assessment = await tx.assessment.findFirst({ where: scope, select: { folderId: true, isLongreadExercise: true } });
      if (!assessment) throw new NotFoundException('Assessment not found');
      if (folderId !== null) {
        const destination = await tx.assessmentFolder.findFirst({ where: { id: folderId, organizationId, deletedAt: null }, select: { id: true } });
        if (!destination) throw new NotFoundException('Folder not found');
        if (assessment.isLongreadExercise) {
          throw new FolderOperationException('longread_exercise', 'Assessments created by longread exercises stay at the root');
        }
      }
      if (assessment.folderId === folderId) return false;
      const moved = await tx.assessment.updateMany({ where: scope, data: { folderId } });
      if (!moved.count) throw new NotFoundException('Assessment not found');
      return true;
    });
  }

  private removeSubtree(organizationId: string, id: string, instructorId?: string) {
    return this.withFolderLock(organizationId, async (tx) => {
      const result = await this.getDeleteImpact(tx, organizationId, id, instructorId);
      const { folderIds } = result;
      await tx.assessment.updateMany({ where: { organizationId, folderId: { in: folderIds } }, data: { folderId: null } });
      await tx.assessmentFolder.updateMany({ where: { organizationId, id: { in: folderIds } }, data: { deletedAt: new Date() } });
      return result;
    });
  }

  private async getDeleteImpact(tx: Prisma.TransactionClient, organizationId: string, id: string, instructorId?: string) {
    const folders = await this.loadFolders(tx, organizationId);
    this.requireFolder(folders, id);
    const folderIds = subtreeIds(id, folders);
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

  private requireFolder(folders: readonly Folder[], id: string) {
    const folder = folders.find((row) => row.id === id);
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  private assertNameFree(folders: readonly Folder[], parentId: string | null, name: string, id?: string) {
    const normalized = normalizeFolderName(name);
    if (folders.some((row) => row.id !== id && row.parentId === parentId && normalizeFolderName(row.name) === normalized)) {
      throw new ConflictException('A folder with this name already exists here');
    }
  }

  private assertDepth(depth: number) {
    if (depth > MAX_FOLDER_DEPTH) throw new FolderOperationException('too_deep', `Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`);
  }

  private skipReason(error: unknown): SkipReason | undefined {
    if (error instanceof FolderOperationException) return error.reason;
    if (error instanceof NotFoundException) return 'not_found';
    if (error instanceof ForbiddenException) return 'forbidden';
    if (error instanceof ConflictException) return 'name_conflict';
    if (error instanceof AssessmentAttemptInProgressException) return 'attempt_in_progress';
  }
}
