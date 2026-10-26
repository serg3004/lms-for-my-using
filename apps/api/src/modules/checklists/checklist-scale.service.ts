import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import type { CreateChecklistScaleInput, UpdateChecklistScaleInput } from './checklists.schemas.js';

const scaleSelect = {
  id: true,
  organizationId: true,
  name: true,
  status: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  levels: {
    orderBy: { value: 'asc' as const },
    select: { id: true, value: true, label: true, score: true },
  },
} as const;

/**
 * Tenant-scoped, reusable evaluation scale library (PR 293) -- create/edit/archive, plus hard delete
 * only for a scale no checklist item references (a ChecklistItem.scaleId FK must never be able to dangle). Coexists with the existing
 * checklist-level scoringMode='scale'/Checklist.scaleLevels mechanism; this service never touches
 * either (see ADR_CHECKLIST_SESSION_OVERLAY.md and CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md PR 293).
 */
@Injectable()
export class ChecklistScaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  async list(organizationId: string) {
    const scales = await this.prisma.checklistScale.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: scaleSelect,
    });
    const usedIds = await this.findUsedScaleIds(
      organizationId,
      scales.map((scale) => scale.id),
    );
    return scales.map((scale) => ({ ...scale, inUse: usedIds.has(scale.id) }));
  }

  async get(scaleId: string, organizationId: string) {
    const scale = await this.prisma.checklistScale.findFirst({
      where: { id: scaleId, organizationId },
      select: scaleSelect,
    });
    if (!scale) throw new NotFoundException('Evaluation scale not found');
    const usedIds = await this.findUsedScaleIds(organizationId, [scale.id]);
    return { ...scale, inUse: usedIds.has(scale.id) };
  }

  async create(organizationId: string, input: CreateChecklistScaleInput, actorId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const scale = await tx.checklistScale.create({
        data: { organizationId, name: input.name, createdBy: actorId },
      });
      await tx.checklistScaleLevel.createMany({
        data: input.levels.map((level) => ({ organizationId, scaleId: scale.id, ...level })),
      });
      return scale;
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_scale.created',
      targetType: 'checklist_scale',
      targetId: created.id,
      summary: `Created evaluation scale ${created.name}`,
      metadata: { levelCount: input.levels.length },
    });

    return this.get(created.id, organizationId);
  }

  /**
   * Full name/levels replace -- never a partial per-level patch (levels have no identity a caller
   * can address individually). Rejected once the scale is used by any checklist that has actually
   * been assigned (see `assertNotUsed`): the fix for an in-use scale is to archive it and create a
   * fresh one, never to mutate levels that a real ChecklistInstance already snapshotted.
   */
  async update(scaleId: string, organizationId: string, input: UpdateChecklistScaleInput, actorId: string) {
    const scale = await this.prisma.checklistScale.findFirst({
      where: { id: scaleId, organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!scale) throw new NotFoundException('Evaluation scale not found');
    if (scale.status === 'archived') {
      throw new BadRequestException('Cannot modify an archived evaluation scale');
    }
    await this.assertNotUsed(scaleId, organizationId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.levels) {
        await tx.checklistScaleLevel.deleteMany({ where: { scaleId, organizationId } });
        await tx.checklistScaleLevel.createMany({
          data: input.levels.map((level) => ({ organizationId, scaleId, ...level })),
        });
      }
      return tx.checklistScale.update({
        where: { id: scaleId, organizationId },
        data: { ...(input.name !== undefined ? { name: input.name } : {}) },
      });
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_scale.updated',
      targetType: 'checklist_scale',
      targetId: scaleId,
      summary: `Updated evaluation scale ${updated.name}`,
      metadata: { fields: Object.keys(input) },
    });

    return this.get(scaleId, organizationId);
  }

  /**
   * PR 343: an in-use scale cannot be edited (see `assertNotUsed`), so "Make a copy" is the way to
   * change it: a new, active, independent scale with the same levels. The copy never inherits the
   * source's usage, so it is editable until a checklist using it is assigned.
   */
  async copy(scaleId: string, organizationId: string, name: string | undefined, actorId: string) {
    const source = await this.prisma.checklistScale.findFirst({
      where: { id: scaleId, organizationId },
      select: scaleSelect,
    });
    if (!source) throw new NotFoundException('Evaluation scale not found');

    const copyName = (name ?? `${source.name} (copy)`).slice(0, 120);
    const created = await this.prisma.$transaction(async (tx) => {
      const scale = await tx.checklistScale.create({
        data: { organizationId, name: copyName, createdBy: actorId },
      });
      await tx.checklistScaleLevel.createMany({
        data: source.levels.map((level) => ({
          organizationId,
          scaleId: scale.id,
          value: level.value,
          label: level.label,
          score: level.score,
        })),
      });
      return scale;
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_scale.copied',
      targetType: 'checklist_scale',
      targetId: created.id,
      summary: `Copied evaluation scale ${source.name}`,
      metadata: { sourceScaleId: scaleId, levelCount: source.levels.length },
    });

    return this.get(created.id, organizationId);
  }

  /**
   * The only lifecycle transition permitted on an already-used scale -- non-destructive (levels
   * are untouched), and always allowed regardless of usage. Idempotent: archiving an
   * already-archived scale is a no-op, not an error.
   */
  async archive(scaleId: string, organizationId: string, actorId: string) {
    const scale = await this.prisma.checklistScale.findFirst({
      where: { id: scaleId, organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!scale) throw new NotFoundException('Evaluation scale not found');

    if (scale.status !== 'archived') {
      await this.prisma.checklistScale.update({ where: { id: scaleId, organizationId }, data: { status: 'archived' } });

      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'checklist_scale.archived',
        targetType: 'checklist_scale',
        targetId: scaleId,
        summary: `Archived evaluation scale ${scale.name}`,
      });
    }

    return this.get(scaleId, organizationId);
  }

  /**
   * Hard delete -- allowed only while no ChecklistItem (in any checklist, draft or archived)
   * references the scale. Sessions/instances keep their own immutable templateSnapshot, so they
   * cannot dangle; the FK is `onDelete: Restrict` as a second line of defence. A scale that is in
   * use must be archived instead (non-destructive).
   */
  async remove(scaleId: string, organizationId: string, actorId: string) {
    const scale = await this.prisma.checklistScale.findFirst({
      where: { id: scaleId, organizationId },
      select: { id: true, name: true },
    });
    if (!scale) throw new NotFoundException('Evaluation scale not found');

    const item = await this.prisma.checklistItem.findFirst({
      where: { organizationId, scaleId },
      select: { id: true },
    });
    if (item) {
      throw new ConflictException(
        'Cannot delete an evaluation scale used by checklist criteria -- archive it instead',
      );
    }

    await this.prisma.checklistScale.delete({ where: { id: scaleId, organizationId } });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_scale.deleted',
      targetType: 'checklist_scale',
      targetId: scaleId,
      summary: `Deleted evaluation scale ${scale.name}`,
    });
  }

  /**
   * "Used" means at least one ChecklistInstance exists for a checklist that has an item
   * referencing this scale -- assignment is the moment a checklist's items (and, transitively,
   * their scale references) get captured into an immutable templateSnapshot. This is a
   * deliberately conservative proxy: it also blocks edits for a scale whose referencing item was
   * later removed from a checklist that still has old instances, which is the safe direction to
   * err in (a false "used" only costs the caller an archive+recreate, never risks corrupting a
   * snapshot already taken).
   */
  /** Same "used" definition as `assertNotUsed`, answered for many scales in one query. */
  private async findUsedScaleIds(organizationId: string, scaleIds: string[]) {
    if (scaleIds.length === 0) return new Set<string>();
    const items = await this.prisma.checklistItem.findMany({
      where: { organizationId, scaleId: { in: scaleIds }, checklist: { instances: { some: { organizationId } } } },
      select: { scaleId: true },
      distinct: ['scaleId'],
    });
    return new Set(items.flatMap((item) => (item.scaleId ? [item.scaleId] : [])));
  }

  private async assertNotUsed(scaleId: string, organizationId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { organizationId, checklist: { items: { some: { scaleId } } } },
      select: { id: true },
    });
    if (instance) {
      throw new BadRequestException(
        'Cannot modify an evaluation scale already used by an assigned checklist -- archive it and create a new one instead',
      );
    }
  }
}
