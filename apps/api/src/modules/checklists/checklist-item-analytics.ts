import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service.js';
import type { FolderActor } from './checklist-folder-tree.js';
import { analyticsEmployeeFilter, type ChecklistSheetAnalytics } from './checklist-sheet-analytics.js';
import { collectFeedbackFields, readFeedbackAnswers, type FeedbackAnswerSetSnapshot, type FeedbackLayout } from './checklist-feedback-layout.js';
import type { ChecklistItemAnalyticsQuery } from './checklists.schemas.js';

/**
 * PR 460: one sheet cut by criteria, groups, feedback fields and notes. Read-only. Everything comes from the
 * snapshot frozen with each instance, so editing the sheet later never rewrites history and a criterion removed
 * from the sheet still shows up (by its frozen text).
 */

type Level = { value: number; label: string; score: number; color?: string };
type SheetLevel = { level: number; label: string; points?: number; color?: string };
type SnapItem = { id: string; text?: string; points?: number; groupId?: string | null; scale?: { id: string; name: string; levels: Level[] } | null };
type SnapGroup = { id: string; title?: string; order?: number };
type Snapshot = {
  checklist?: {
    scoringMode?: string; scaleLevels?: SheetLevel[] | null; items?: SnapItem[]; itemGroups?: SnapGroup[];
    feedbackEnabled?: boolean; feedbackRequired?: boolean; feedbackLayout?: unknown; feedbackAnswerSets?: Record<string, FeedbackAnswerSetSnapshot>;
  };
} | null;

export type ItemAnalyticsRow = {
  sessionId: string | null;
  finishedAt: Date | null;
  snapshot: Snapshot;
  feedbackAnswers: Record<string, string | string[]>;
  employee: string;
  observer: string | null;
  results: ReadonlyArray<{ itemId: string; answerState: string; scaleLevel: number | null; checked: boolean; points: number; comment: string | null; reviewComment: string | null }>;
};

type LevelCount = { value: number; label: string | null; labelKey: 'yes' | 'no' | null; color: string | null; count: number };
type Metrics = { total: number; answered: number; skipped: number; scoreSum: number; scoreMax: number; scored: number; withNote: number; levels: Map<string, { kind: 'yes_no' | 'sheet' | 'scale'; name: string | null; levels: LevelCount[] }> };
const emptyMetrics = (): Metrics => ({ total: 0, answered: 0, skipped: 0, scoreSum: 0, scoreMax: 0, scored: 0, withNote: 0, levels: new Map() });

function bump(metrics: Metrics, key: string, kind: 'yes_no' | 'sheet' | 'scale', name: string | null, level: Omit<LevelCount, 'count'>) {
  const block = metrics.levels.get(key) ?? { kind, name, levels: [] };
  let entry = block.levels.find((candidate) => candidate.value === level.value && candidate.label === level.label);
  if (!entry) { entry = { ...level, count: 0 }; block.levels.push(entry); }
  entry.count += 1;
  metrics.levels.set(key, block);
}

const hasText = (value: string | null | undefined) => typeof value === 'string' && value.trim().length > 0;

/** Adds one criterion's answer from one instance to the metrics. */
function addAnswer(metrics: Metrics, sheetId: string, mode: string | undefined, sheetLevels: SheetLevel[], item: SnapItem, result: ItemAnalyticsRow['results'][number] | undefined) {
  metrics.total += 1;
  if (!result) return;
  if (result.answerState === 'skipped') { metrics.skipped += 1; return; }
  if (result.answerState !== 'answered') return;
  metrics.answered += 1;
  if (hasText(result.comment) || hasText(result.reviewComment)) metrics.withNote += 1;
  if (item.scale) {
    const level = item.scale.levels.find((candidate) => candidate.value === result.scaleLevel);
    if (!level) return;
    bump(metrics, `scale:${item.scale.id}`, 'scale', item.scale.name, { value: level.value, label: level.label, labelKey: null, color: level.color ?? null });
    const max = Math.max(0, ...item.scale.levels.map((candidate) => candidate.score));
    if (mode !== 'none' && max > 0) { metrics.scored += 1; metrics.scoreSum += level.score; metrics.scoreMax += max; }
  } else if (mode === 'scale') {
    const level = sheetLevels.find((candidate) => candidate.level === result.scaleLevel);
    if (!level) return;
    bump(metrics, `sheet:${sheetId}`, 'sheet', null, { value: level.level, label: level.label, labelKey: null, color: level.color ?? null });
    const max = Math.max(0, ...sheetLevels.map((candidate) => candidate.points ?? 0));
    if (max > 0) { metrics.scored += 1; metrics.scoreSum += level.points ?? 0; metrics.scoreMax += max; }
  } else {
    bump(metrics, 'yes_no', 'yes_no', null, { value: result.checked ? 1 : 0, label: null, labelKey: result.checked ? 'yes' : 'no', color: null });
    if (mode !== 'none' && (item.points ?? 0) > 0) { metrics.scored += 1; metrics.scoreSum += result.points; metrics.scoreMax += item.points ?? 0; }
  }
}

function present(metrics: Metrics) {
  return {
    total: metrics.total,
    answered: metrics.answered,
    skipped: metrics.skipped,
    remaining: Math.max(0, metrics.total - metrics.answered - metrics.skipped),
    completionPercentage: metrics.total > 0 ? Math.round((metrics.answered / metrics.total) * 100) : null,
    averagePercentage: metrics.scoreMax > 0 ? Math.round((metrics.scoreSum / metrics.scoreMax) * 100) : null,
    // PR 462: the raw sums, so the screen can recompute the total over a hand-picked set of criteria exactly.
    scoreSum: metrics.scoreSum,
    scoreMax: metrics.scoreMax,
    withNote: metrics.withNote,
    noteShare: metrics.answered > 0 ? Math.round((metrics.withNote / metrics.answered) * 100) : null,
    scales: [...metrics.levels.entries()].map(([scaleKey, block]) => ({ scaleKey, ...block, levels: [...block.levels].sort((a, b) => a.value - b.value) })),
  };
}

/** Criteria and groups: one pass over the instances, grouped by the frozen item id / group id. */
function buildCriteriaAndGroups(rows: readonly ItemAnalyticsRow[], sheetId: string) {
  const criteria = new Map<string, { id: string; text: string; groupId: string | null; order: number; metrics: Metrics }>();
  const groups = new Map<string | null, { id: string | null; title: string | null; order: number; criteriaIds: Set<string>; metrics: Metrics }>();
  for (const row of rows) {
    const checklist = row.snapshot?.checklist;
    const items = checklist?.items ?? [];
    const groupTitles = new Map((checklist?.itemGroups ?? []).map((group) => [group.id, group]));
    const resultById = new Map(row.results.map((result) => [result.itemId, result]));
    items.forEach((item, index) => {
      const groupId = item.groupId && groupTitles.has(item.groupId) ? item.groupId : null;
      const result = resultById.get(item.id);
      const entry = criteria.get(item.id) ?? { id: item.id, text: item.text ?? '', groupId, order: index, metrics: emptyMetrics() };
      // The newest frozen text wins (rows come newest first), a criterion removed from the sheet keeps its last text.
      if (!criteria.has(item.id)) criteria.set(item.id, entry);
      addAnswer(entry.metrics, sheetId, checklist?.scoringMode, checklist?.scaleLevels ?? [], item, result);
      const group = groups.get(groupId) ?? { id: groupId, title: groupId ? groupTitles.get(groupId)?.title ?? null : null, order: groupId ? groupTitles.get(groupId)?.order ?? index : Number.MAX_SAFE_INTEGER, criteriaIds: new Set<string>(), metrics: emptyMetrics() };
      group.criteriaIds.add(item.id);
      groups.set(groupId, group);
      addAnswer(group.metrics, sheetId, checklist?.scoringMode, checklist?.scaleLevels ?? [], item, result);
    });
  }
  return {
    criteria: [...criteria.values()].sort((a, b) => a.order - b.order).map((entry) => ({ id: entry.id, text: entry.text, groupId: entry.groupId, ...present(entry.metrics) })),
    groups: [...groups.values()].sort((a, b) => a.order - b.order).map((entry) => ({ id: entry.id, title: entry.title, criteriaCount: entry.criteriaIds.size, ...present(entry.metrics) })),
  };
}

/** Feedback: per field of the frozen layouts, how many sessions filled it and how the chosen options spread. */
function buildFeedback(rows: readonly ItemAnalyticsRow[]) {
  const fields = new Map<string, { id: string; kind: 'text' | 'choice'; title: string; builtin: string | null; sessions: number; filled: number; options: Map<string, { id: string; name: string; count: number }> }>();
  for (const row of rows) {
    const checklist = row.snapshot?.checklist;
    if (row.sessionId === null || !checklist || checklist.feedbackEnabled === false) continue;
    const layout = (checklist.feedbackLayout ?? null) as FeedbackLayout | null;
    const list = layout ? collectFeedbackFields(layout) : collectFeedbackFields({ fields: ['strengths', 'developmentAreas', 'nextSteps'].map((id) => ({ id, kind: 'text' as const, title: '', required: false, builtin: id as 'strengths' | 'developmentAreas' | 'nextSteps' })), sections: [] });
    for (const field of list) {
      const entry = fields.get(field.id) ?? { id: field.id, kind: field.kind, title: field.title, builtin: field.builtin ?? null, sessions: 0, filled: 0, options: new Map() };
      entry.sessions += 1;
      const answer = row.feedbackAnswers[field.id];
      const values = Array.isArray(answer) ? answer : typeof answer === 'string' && answer.trim() ? [answer] : [];
      if (values.length > 0) entry.filled += 1;
      if (field.kind === 'choice' && field.answerSetId) {
        const set = checklist.feedbackAnswerSets?.[field.answerSetId];
        for (const optionId of values) {
          const option = set?.options.find((candidate) => candidate.id === optionId);
          const slot = entry.options.get(optionId) ?? { id: optionId, name: option?.name ?? optionId, count: 0 };
          slot.count += 1;
          entry.options.set(optionId, slot);
        }
      }
      fields.set(field.id, entry);
    }
  }
  return [...fields.values()].map((entry) => ({
    id: entry.id, kind: entry.kind, title: entry.title, builtin: entry.builtin,
    sessions: entry.sessions, filled: entry.filled, notFilled: entry.sessions - entry.filled,
    options: entry.kind === 'choice' ? [...entry.options.values()].sort((a, b) => b.count - a.count) : [],
  }));
}

export const NOTES_PAGE_SIZE = 20;

/** Notes: the per-criterion counts come from the criteria cut, the list is every note, newest first, paged. */
function buildNotes(rows: readonly ItemAnalyticsRow[], sheetId: string, page: number, itemId?: string) {
  const { criteria } = buildCriteriaAndGroups(rows, sheetId);
  const list: Array<{ sessionId: string | null; itemId: string; itemText: string; comment: string | null; reviewComment: string | null; at: string | null; employee: string; observer: string | null }> = [];
  for (const row of rows) {
    const texts = new Map((row.snapshot?.checklist?.items ?? []).map((item) => [item.id, item.text ?? '']));
    for (const result of row.results) {
      if (itemId && result.itemId !== itemId) continue;
      if (!hasText(result.comment) && !hasText(result.reviewComment)) continue;
      list.push({ sessionId: row.sessionId, itemId: result.itemId, itemText: texts.get(result.itemId) ?? '', comment: hasText(result.comment) ? result.comment : null, reviewComment: hasText(result.reviewComment) ? result.reviewComment : null, at: row.finishedAt ? row.finishedAt.toISOString() : null, employee: row.employee, observer: row.observer });
    }
  }
  list.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return {
    criteria: criteria.map((entry) => ({ id: entry.id, text: entry.text, answered: entry.answered, withNote: entry.withNote, noteShare: entry.noteShare })),
    notes: { total: list.length, page, pageSize: NOTES_PAGE_SIZE, items: list.slice((page - 1) * NOTES_PAGE_SIZE, page * NOTES_PAGE_SIZE) },
  };
}

/** Pure: the requested cut of the prepared rows (rows arrive newest first). */
export function buildItemAnalytics(by: ChecklistItemAnalyticsQuery['by'], rows: readonly ItemAnalyticsRow[], sheetId: string, page = 1, itemId?: string) {
  const base = { by, instances: rows.length };
  if (by === 'criteria') return { ...base, criteria: buildCriteriaAndGroups(rows, sheetId).criteria };
  if (by === 'groups') return { ...base, groups: buildCriteriaAndGroups(rows, sheetId).groups };
  if (by === 'feedback') return { ...base, feedback: buildFeedback(rows) };
  return { ...base, ...buildNotes(rows, sheetId, page, itemId) };
}

const MAX_ROWS = 5000;
const personName = (person: { firstName: string; lastName: string } | null | undefined) => (person ? `${person.lastName} ${person.firstName}`.trim() : null);

/** Plain helper (built in ChecklistsService's constructor body, not injected). */
export class ChecklistItemAnalytics {
  constructor(private readonly prisma: PrismaService, private readonly access: ChecklistSheetAnalytics) {}

  async items(organizationId: string, actor: FolderActor, userScope: Prisma.UserWhereInput, checklistId: string, query: ChecklistItemAnalyticsQuery) {
    const accessible = await this.access.accessible(organizationId, actor);
    // A sheet the viewer may not open is indistinguishable from one that does not exist.
    if (!accessible.some((sheet) => sheet.id === checklistId)) throw new NotFoundException('Checklist not found');
    const from = new Date(query.from);
    const to = new Date(query.to);
    const employeeFilter = analyticsEmployeeFilter(organizationId, userScope, query);
    const person = { select: { firstName: true, lastName: true } } as const;
    const instanceSelect = {
      completedAt: true, templateSnapshot: true, user: person,
      results: { select: { itemId: true, answerState: true, scaleLevel: true, checked: true, points: true, comment: true, reviewComment: true } },
    } as const;
    const [sessions, selfDone] = await Promise.all([
      this.prisma.checklistSession.findMany({
        where: { organizationId, deletedAt: null, status: { not: 'cancelled' }, scheduledAt: { gte: from, lte: to }, ...(query.observerId ? { observerId: query.observerId } : {}), instance: { deletedAt: null, checklistId, user: employeeFilter } },
        select: { id: true, feedbackAnswers: true, strengths: true, developmentAreas: true, nextSteps: true, scheduledAt: true, observer: person, instance: { select: instanceSelect } },
        orderBy: { scheduledAt: 'desc' }, take: MAX_ROWS,
      }),
      query.observerId ? Promise.resolve([]) : this.prisma.checklistInstance.findMany({
        where: { organizationId, deletedAt: null, session: { is: null }, status: 'completed', completedAt: { gte: from, lte: to }, checklistId, user: employeeFilter },
        select: instanceSelect, orderBy: { completedAt: 'desc' }, take: MAX_ROWS,
      }),
    ]);
    const rows: ItemAnalyticsRow[] = [
      ...sessions.map((session) => ({
        sessionId: session.id, finishedAt: session.instance.completedAt ?? session.scheduledAt, snapshot: (session.instance.templateSnapshot ?? null) as Snapshot,
        feedbackAnswers: readFeedbackAnswers(session), employee: personName(session.instance.user) ?? '', observer: personName(session.observer), results: session.instance.results,
      })),
      ...selfDone.map((instance) => ({
        sessionId: null, finishedAt: instance.completedAt, snapshot: (instance.templateSnapshot ?? null) as Snapshot,
        feedbackAnswers: {}, employee: personName(instance.user) ?? '', observer: null, results: instance.results,
      })),
    ];
    // Newest first, so the latest frozen text of a criterion wins.
    rows.sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0));
    return { ...buildItemAnalytics(query.by, rows, checklistId, query.page, query.itemId), period: { from: query.from, to: query.to }, truncated: sessions.length >= MAX_ROWS || selfDone.length >= MAX_ROWS };
  }
}
