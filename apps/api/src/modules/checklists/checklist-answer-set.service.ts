import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { collectAnswerSetIds, parseAnswerOptions, parseFeedbackLayout, type FeedbackLayout } from './checklist-feedback-layout.js';
import type { CreateChecklistAnswerSetInput, UpdateChecklistAnswerSetInput } from './checklists.schemas.js';

const answerSetSelect = {
  id: true,
  organizationId: true,
  name: true,
  status: true,
  options: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * PR 405: tenant-scoped library of reusable answer sets for the choice fields of a sheet's feedback
 * section. Same lifecycle rules as evaluation scales (PR 369): an edit never touches sessions that
 * already started, because instances freeze the resolved options in their snapshot; a set that a
 * sheet still references is archived, not deleted.
 */
@Injectable()
export class ChecklistAnswerSetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  async list(organizationId: string, showSheetNames = false) {
    const sets = await this.prisma.checklistAnswerSet.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: answerSetSelect,
    });
    const usage = await this.usageBySet(organizationId);
    return sets.map((set) => this.present(set, usage, showSheetNames));
  }

  async get(answerSetId: string, organizationId: string, showSheetNames = false) {
    const set = await this.prisma.checklistAnswerSet.findFirst({ where: { id: answerSetId, organizationId }, select: answerSetSelect });
    if (!set) throw new NotFoundException('Answer set not found');
    return this.present(set, await this.usageBySet(organizationId), showSheetNames);
  }

  async create(organizationId: string, input: CreateChecklistAnswerSetInput, actorId: string) {
    const created = await this.prisma.checklistAnswerSet.create({
      data: { organizationId, name: input.name, options: this.optionsJson(input.options), createdBy: actorId },
    });
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_answer_set.created',
      targetType: 'checklist_answer_set',
      targetId: created.id,
      summary: `Created answer set ${created.name}`,
      metadata: { optionCount: input.options.length },
    });
    return this.get(created.id, organizationId);
  }

  async update(answerSetId: string, organizationId: string, input: UpdateChecklistAnswerSetInput, actorId: string) {
    const set = await this.prisma.checklistAnswerSet.findFirst({ where: { id: answerSetId, organizationId }, select: { id: true, status: true } });
    if (!set) throw new NotFoundException('Answer set not found');
    if (set.status === 'archived') throw new BadRequestException('Cannot modify an archived answer set');

    const updated = await this.prisma.checklistAnswerSet.update({
      where: { id: answerSetId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.options !== undefined ? { options: this.optionsJson(input.options) } : {}),
      },
    });
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_answer_set.updated',
      targetType: 'checklist_answer_set',
      targetId: answerSetId,
      summary: `Updated answer set ${updated.name}`,
      metadata: { fields: Object.keys(input) },
    });
    return this.get(answerSetId, organizationId);
  }

  /** A new, active, independent set with the same options (new option ids, so the copy shares nothing). */
  async copy(answerSetId: string, organizationId: string, name: string | undefined, actorId: string) {
    const source = await this.prisma.checklistAnswerSet.findFirst({ where: { id: answerSetId, organizationId }, select: answerSetSelect });
    if (!source) throw new NotFoundException('Answer set not found');
    const options = parseAnswerOptions(source.options);
    const created = await this.prisma.checklistAnswerSet.create({
      data: {
        organizationId,
        name: (name ?? `${source.name} (copy)`).slice(0, 255),
        options: this.optionsJson(options),
        createdBy: actorId,
      },
    });
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_answer_set.copied',
      targetType: 'checklist_answer_set',
      targetId: created.id,
      summary: `Copied answer set ${source.name}`,
      metadata: { sourceAnswerSetId: answerSetId, optionCount: options.length },
    });
    return this.get(created.id, organizationId);
  }

  /** Idempotent and non-destructive; allowed regardless of usage. */
  async archive(answerSetId: string, organizationId: string, actorId: string) {
    const set = await this.prisma.checklistAnswerSet.findFirst({ where: { id: answerSetId, organizationId }, select: { id: true, name: true, status: true } });
    if (!set) throw new NotFoundException('Answer set not found');
    if (set.status !== 'archived') {
      await this.prisma.checklistAnswerSet.update({ where: { id: answerSetId }, data: { status: 'archived' } });
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'checklist_answer_set.archived',
        targetType: 'checklist_answer_set',
        targetId: answerSetId,
        summary: `Archived answer set ${set.name}`,
      });
    }
    return this.get(answerSetId, organizationId);
  }

  /** Hard delete only while no sheet's feedback layout references the set. */
  async remove(answerSetId: string, organizationId: string, actorId: string) {
    const set = await this.prisma.checklistAnswerSet.findFirst({ where: { id: answerSetId, organizationId }, select: { id: true, name: true } });
    if (!set) throw new NotFoundException('Answer set not found');
    const usage = await this.usageBySet(organizationId);
    if ((usage.get(answerSetId)?.length ?? 0) > 0) {
      throw new ConflictException('Cannot delete an answer set used by checklists -- archive it instead');
    }
    await this.prisma.checklistAnswerSet.delete({ where: { id: answerSetId } });
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_answer_set.deleted',
      targetType: 'checklist_answer_set',
      targetId: answerSetId,
      summary: `Deleted answer set ${set.name}`,
    });
  }

  /**
   * Every answer set a layout points at must belong to the organization; a new reference must be to
   * an active set (an archived one may stay where the sheet already used it).
   */
  async assertLayoutReferences(organizationId: string, layout: FeedbackLayout | null, previous: FeedbackLayout | null) {
    const ids = collectAnswerSetIds(layout);
    if (ids.length === 0) return;
    const keep = new Set(collectAnswerSetIds(previous));
    const sets = await this.prisma.checklistAnswerSet.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, status: true } });
    const byId = new Map(sets.map((set) => [set.id, set]));
    for (const id of ids) {
      const set = byId.get(id);
      if (!set) throw new BadRequestException(`Unknown answer set: ${id}`);
      if (set.status === 'archived' && !keep.has(id)) throw new BadRequestException(`Answer set is archived: ${id}`);
    }
  }

  /** The sets a layout uses, as stored now -- the data a snapshot freezes. */
  async loadForLayout(organizationId: string, layout: FeedbackLayout | null) {
    const ids = collectAnswerSetIds(layout);
    if (ids.length === 0) return [];
    return this.prisma.checklistAnswerSet.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true, options: true } });
  }

  private optionsJson(options: { id: string; name: string; description?: string | null }[]): Prisma.InputJsonValue {
    return options.map((option) => ({ id: option.id, name: option.name, description: option.description ?? null }));
  }

  /** Sheet names are shown to administrators only; everyone else gets the count (folders may hide sheets). */
  private present(set: { id: string; options: Prisma.JsonValue } & Record<string, unknown>, usage: Map<string, { id: string; title: string }[]>, showSheetNames: boolean) {
    const used = usage.get(set.id) ?? [];
    return { ...set, options: parseAnswerOptions(set.options), usageCount: used.length, usedByChecklists: showSheetNames ? used : [], inUse: used.length > 0 };
  }

  /** setId -> checklists whose feedback layout references it (sheets in the trash do not count). */
  private async usageBySet(organizationId: string) {
    const checklists = await this.prisma.checklist.findMany({
      where: { organizationId, deletedAt: null, feedbackLayout: { not: Prisma.DbNull } },
      select: { id: true, title: true, feedbackLayout: true },
    });
    const usage = new Map<string, { id: string; title: string }[]>();
    for (const checklist of checklists) {
      for (const id of collectAnswerSetIds(parseFeedbackLayout(checklist.feedbackLayout))) {
        usage.set(id, [...(usage.get(id) ?? []), { id: checklist.id, title: checklist.title }]);
      }
    }
    return usage;
  }
}
