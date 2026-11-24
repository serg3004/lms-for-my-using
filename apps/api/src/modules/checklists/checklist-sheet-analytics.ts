import { analyticsFieldFilter, analyticsFieldPresentation } from '../user-fields/public.js';
import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service.js';
import { visibleFolderIds, type FolderActor, type FolderNode } from './checklist-folder-tree.js';
import { buildAnalyticsSummary } from './checklist-analytics-summary.js';
import { GUEST_USER_EMAIL } from './checklist-public-access.js';
import type { ChecklistSheetAnalyticsQuery } from './checklists.schemas.js';

/**
 * PR 459: analytics over several sheets at once (the "Analytics" tab). Separate from getManagerAnalytics so the
 * existing employee analytics pages keep their behaviour; read-only over sessions, results and frozen snapshots.
 */

/** A sheet is open to an analytics viewer when an administrator, its author, an observer of a session on it, or it lies where the list shows it to the viewer. */
export function accessibleAnalyticsSheetIds(
  sheets: ReadonlyArray<{ id: string; createdBy: string | null; folderId: string | null }>,
  folders: readonly FolderNode[],
  actor: FolderActor,
  observedSheetIds: ReadonlySet<string>,
): Set<string> {
  if (actor.roles.includes('admin')) return new Set(sheets.map((sheet) => sheet.id));
  const visible = visibleFolderIds(folders, actor);
  return new Set(sheets.filter((sheet) =>
    sheet.createdBy === actor.id || observedSheetIds.has(sheet.id) || sheet.folderId === null || visible.has(sheet.folderId)).map((sheet) => sheet.id));
}

type SnapshotLevel = { value: number; label: string; score: number; color?: string };
type SheetLevel = { level: number; label: string; points?: number; color?: string };
type SnapshotItem = { id: string; scale?: { id: string; name: string; levels: SnapshotLevel[] } | null };
type Snapshot = { checklist?: { scoringMode?: string; scaleLevels?: SheetLevel[] | null; items?: SnapshotItem[] } } | null;

export type AnalyticsInstance = {
  checklistId: string;
  /** Session status, or null for a result the employee finished on their own (no session). */
  sessionStatus: 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | null;
  scheduledAt: Date | null;
  instanceStatus: string;
  percentage: number;
  scored: boolean;
  /** PR 468: a pass through the public link or QR code (no account); counted in the totals and shown on its own line. */
  guest?: boolean;
  snapshot: Snapshot;
  results: ReadonlyArray<{ itemId: string; answerState: string; scaleLevel: number | null; checked: boolean; points: number }>;
};

export type ScaleBlock = {
  scaleKey: string;
  kind: 'yes_no' | 'sheet' | 'scale';
  name: string | null;
  levels: Array<{ value: number; label: string | null; labelKey: 'yes' | 'no' | null; color: string | null; count: number }>;
};

type Counters = {
  planned: number; completed: number; inProgress: number; notStarted: number; overdue: number; selfCompleted: number;
  scoredCount: number; scoreTotal: number; criteriaTotal: number; answered: number; skipped: number; zeroPoints: number;
  guestCompleted: number; guestScoredCount: number; guestScoreTotal: number;
  scales: Map<string, ScaleBlock>;
};
const emptyCounters = (): Counters => ({ planned: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, selfCompleted: 0, scoredCount: 0, scoreTotal: 0, criteriaTotal: 0, answered: 0, skipped: 0, zeroPoints: 0, guestCompleted: 0, guestScoredCount: 0, guestScoreTotal: 0, scales: new Map() });

function addLevel(counters: Counters, scaleKey: string, base: Omit<ScaleBlock, 'levels' | 'scaleKey'>, level: { value: number; label: string | null; labelKey: 'yes' | 'no' | null; color: string | null }) {
  const block = counters.scales.get(scaleKey) ?? { scaleKey, ...base, levels: [] };
  let entry = block.levels.find((candidate) => candidate.value === level.value && candidate.label === level.label);
  if (!entry) { entry = { ...level, count: 0 }; block.levels.push(entry); }
  entry.count += 1;
  counters.scales.set(scaleKey, block);
}

function addInstance(counters: Counters, instance: AnalyticsInstance, now: Date) {
  const { sessionStatus } = instance;
  if (sessionStatus === null) {
    counters.selfCompleted += 1;
  } else {
    counters.planned += 1;
    if (sessionStatus === 'completed') counters.completed += 1;
    else if (sessionStatus === 'scheduled') counters.notStarted += 1;
    else counters.inProgress += 1;
    if (sessionStatus !== 'completed' && instance.scheduledAt && instance.scheduledAt < now) counters.overdue += 1;
  }
  const finished = sessionStatus === 'completed' || (sessionStatus === null && instance.instanceStatus === 'completed');
  if (finished && instance.scored) { counters.scoredCount += 1; counters.scoreTotal += instance.percentage; }
  if (instance.guest && finished) {
    counters.guestCompleted += 1;
    if (instance.scored) { counters.guestScoredCount += 1; counters.guestScoreTotal += instance.percentage; }
  }

  const checklist = instance.snapshot?.checklist;
  const items = checklist?.items ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  counters.criteriaTotal += items.length;
  const resultById = new Map(instance.results.map((result) => [result.itemId, result]));
  for (const [itemId, item] of byId) {
    const result = resultById.get(itemId);
    if (!result) continue;
    if (result.answerState === 'skipped') { counters.skipped += 1; continue; }
    if (result.answerState !== 'answered') continue;
    counters.answered += 1;
    if (item.scale) {
      const level = item.scale.levels.find((candidate) => candidate.value === result.scaleLevel);
      if (!level) continue;
      if (checklist?.scoringMode !== 'none' && level.score === 0) counters.zeroPoints += 1;
      addLevel(counters, `scale:${item.scale.id}`, { kind: 'scale', name: item.scale.name }, { value: level.value, label: level.label, labelKey: null, color: level.color ?? null });
    } else if (checklist?.scoringMode === 'scale') {
      const level = (checklist.scaleLevels ?? []).find((candidate) => candidate.level === result.scaleLevel);
      if (!level) continue;
      if (level.points === 0) counters.zeroPoints += 1;
      addLevel(counters, `sheet:${instance.checklistId}`, { kind: 'sheet', name: null }, { value: level.level, label: level.label, labelKey: null, color: level.color ?? null });
    } else {
      if (checklist?.scoringMode !== 'none' && result.points === 0) counters.zeroPoints += 1;
      addLevel(counters, 'yes_no', { kind: 'yes_no', name: null }, { value: result.checked ? 1 : 0, label: null, labelKey: result.checked ? 'yes' : 'no', color: null });
    }
  }
}

function present(counters: Counters) {
  const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
  return {
    plan: { planned: counters.planned, completed: counters.completed, inProgress: counters.inProgress, notStarted: counters.notStarted, overdue: counters.overdue, remaining: counters.planned - counters.completed },
    completionPercentage: rate(counters.completed, counters.planned),
    selfCompleted: counters.selfCompleted,
    // PR 468: the guests' own line; their passes are inside the totals above and never inside a department or a manager.
    guests: { completed: counters.guestCompleted, averagePercentage: counters.guestScoredCount ? Math.round(counters.guestScoreTotal / counters.guestScoredCount) : null },
    averagePercentage: counters.scoredCount ? Math.round(counters.scoreTotal / counters.scoredCount) : null,
    criteria: { total: counters.criteriaTotal, answered: counters.answered, skipped: counters.skipped, remaining: Math.max(0, counters.criteriaTotal - counters.answered - counters.skipped), zeroPoints: counters.zeroPoints },
    scales: [...counters.scales.values()].map((block) => ({ ...block, levels: [...block.levels].sort((a, b) => a.value - b.value) })),
  };
}

export type QueueRow = { checklistId: string; scheduledAt: Date | null; createdAt: Date };

/** Pure aggregation: per sheet and in total. `queue` is every session not started yet, whatever its date. */
export function buildSheetAnalytics(
  sheets: ReadonlyArray<{ id: string; title: string }>,
  instances: readonly AnalyticsInstance[],
  queue: readonly QueueRow[],
  now: Date,
) {
  const total = emptyCounters();
  const rows = sheets.map((sheet) => {
    const counters = emptyCounters();
    for (const instance of instances) if (instance.checklistId === sheet.id && instance.sessionStatus !== 'cancelled') addInstance(counters, instance, now);
    const waiting = queue.filter((row) => row.checklistId === sheet.id);
    const oldest = waiting.reduce<Date | null>((min, row) => { const at = row.scheduledAt ?? row.createdAt; return !min || at < min ? at : min; }, null);
    return { checklistId: sheet.id, title: sheet.title, ...present(counters), queue: { notStarted: waiting.length, oldestDays: oldest ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 86_400_000)) : null } };
  });
  for (const instance of instances) if (instance.sessionStatus !== 'cancelled') addInstance(total, instance, now);
  const oldestAll = queue.reduce<Date | null>((min, row) => { const at = row.scheduledAt ?? row.createdAt; return !min || at < min ? at : min; }, null);
  return {
    total: { ...present(total), queue: { notStarted: queue.length, oldestDays: oldestAll ? Math.max(0, Math.floor((now.getTime() - oldestAll.getTime()) / 86_400_000)) : null } },
    sheets: rows,
  };
}

/** The employee scope of an analytics read: the viewer's own scope plus the optional department and manager filters. */
export function analyticsEmployeeFilter(organizationId: string, userScope: Prisma.UserWhereInput, query: { departmentId?: string; departmentIds?: string[]; employeeIds?: string[]; managerId?: string }): Prisma.UserWhereInput {
  return {
    AND: [
      userScope,
      ...(query.employeeIds?.length ? [{ id: { in: query.employeeIds } }] : []),
      ...(query.departmentIds?.length ? [{ departmentMemberships: { some: { organizationId, isPrimary: true, effectiveTo: null, departmentId: { in: query.departmentIds } } } }] : []),
      ...(query.departmentId ? [{ departmentMemberships: { some: { organizationId, isPrimary: true, effectiveTo: null, departmentId: query.departmentId } } }] : []),
      ...(query.managerId && query.managerId !== 'unassigned' ? [{ departmentMemberships: { some: { organizationId, isPrimary: true, effectiveTo: null, department: { managers: { some: { organizationId, userId: query.managerId, type: { in: ['DIRECT', 'FUNCTIONAL'] as ('DIRECT' | 'FUNCTIONAL')[] }, isPrimary: true, effectiveTo: null } } } } } }] : []),
      ...(query.managerId === 'unassigned' ? [{ departmentMemberships: { none: { organizationId, isPrimary: true, effectiveTo: null, department: { managers: { some: { organizationId, isPrimary: true, effectiveTo: null } } } } } }] : []),
    ],
  };
}

const MAX_INSTANCES = 5000;

/** Plain helper (built in ChecklistsService's constructor body, not injected). */
export class ChecklistSheetAnalytics {
  constructor(private readonly prisma: PrismaService) {}

  /** The sheets the viewer may open in the analytics (PR 459 rule), full rows. */
  async accessible(organizationId: string, actor: FolderActor) {
    const [sheets, folders, observed] = await Promise.all([
      this.prisma.checklist.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, title: true, createdBy: true, folderId: true, status: true } }),
      this.prisma.checklistFolder.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, parentId: true, createdBy: true, visibleToStaff: true } }),
      actor.roles.includes('admin') ? Promise.resolve([] as Array<{ instance: { checklistId: string } }>)
        : this.prisma.checklistSession.findMany({ where: { organizationId, observerId: actor.id, deletedAt: null }, select: { instance: { select: { checklistId: true } } } }),
    ]);
    const ids = accessibleAnalyticsSheetIds(sheets, folders, actor, new Set(observed.map((row) => row.instance.checklistId)));
    return sheets.filter((sheet) => ids.has(sheet.id));
  }

  /** The sheets the viewer may pick in the tab, with the number of sessions planned in the period. */
  async listSheets(organizationId: string, actor: FolderActor, userScope: Prisma.UserWhereInput, query: Pick<ChecklistSheetAnalyticsQuery, 'from' | 'to'>) {
    const sheets = await this.accessible(organizationId, actor);
    const sessions = await this.prisma.checklistSession.findMany({
      where: { organizationId, deletedAt: null, status: { not: 'cancelled' }, scheduledAt: { gte: new Date(query.from), lte: new Date(query.to) }, instance: { deletedAt: null, checklistId: { in: sheets.map((sheet) => sheet.id) }, user: userScope } },
      select: { instance: { select: { checklistId: true } } },
    });
    const perSheet = new Map<string, number>();
    for (const session of sessions) perSheet.set(session.instance.checklistId, (perSheet.get(session.instance.checklistId) ?? 0) + 1);
    return sheets.map((sheet) => ({ id: sheet.id, title: sheet.title, status: sheet.status, folderId: sheet.folderId, sessionsInPeriod: perSheet.get(sheet.id) ?? 0 }))
      .sort((a, b) => b.sessionsInPeriod - a.sessionsInPeriod || a.title.localeCompare(b.title));
  }

  async overview(organizationId: string, actor: FolderActor & { locale?: string | null }, userScope: Prisma.UserWhereInput, query: ChecklistSheetAnalyticsQuery, now = new Date()) {
    const [accessibleSheets, fieldScope, presentation] = await Promise.all([
      this.accessible(organizationId, actor),
      analyticsFieldFilter(this.prisma, organizationId, actor.roles, query.fieldFilters),
      query.groupByField ? analyticsFieldPresentation(this.prisma, organizationId, actor, query.groupByField) : undefined,
    ]);
    const wanted = query.checklistIds?.length ? new Set(query.checklistIds) : null;
    const sheets = accessibleSheets.filter((sheet) => !wanted || wanted.has(sheet.id));
    const sheetIds = sheets.map((sheet) => sheet.id);
    const empty = { ...buildSheetAnalytics([], [], [], now), summary: { trend: [], departments: [], weak: [], results: { good: 0, mid: 0, bad: 0 }, heat: Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0)), people: [], previous: null } };
    if (sheetIds.length === 0) return { ...empty, period: { from: query.from, to: query.to }, truncated: false };

    const from = new Date(query.from);
    const to = new Date(query.to);
    const employeeFilter = analyticsEmployeeFilter(
      organizationId, query.fieldFilters ? { AND: [userScope, fieldScope] } : userScope, query,
    );
    const instanceSelect = {
      checklistId: true, userId: true, status: true, percentage: true, scored: true, templateSnapshot: true, completedAt: true,
      user: { select: { email: true, firstName: true, lastName: true, departmentMemberships: { where: { organizationId, isPrimary: true, effectiveTo: null }, take: 1, select: { department: { select: { id: true, name: true } } } } } },
      results: { select: { itemId: true, answerState: true, scaleLevel: true, checked: true, points: true } },
    } as const;
    const readInstances = async (periodFrom: Date, periodTo: Date) => {
      const [periodSessions, periodSelfDone] = await Promise.all([
        this.prisma.checklistSession.findMany({
          where: { organizationId, deletedAt: null, scheduledAt: { gte: periodFrom, lte: periodTo }, instance: { deletedAt: null, checklistId: { in: sheetIds }, user: employeeFilter } },
          select: { status: true, scheduledAt: true, instance: { select: instanceSelect } }, orderBy: { scheduledAt: 'desc' }, take: MAX_INSTANCES,
        }),
        this.prisma.checklistInstance.findMany({
          where: { organizationId, deletedAt: null, session: { is: null }, status: 'completed', completedAt: { gte: periodFrom, lte: periodTo }, checklistId: { in: sheetIds }, user: employeeFilter },
          select: instanceSelect, orderBy: { completedAt: 'desc' }, take: MAX_INSTANCES,
        }),
      ]);
      return { sessions: periodSessions, selfDone: periodSelfDone };
    };
    const [{ sessions, selfDone }, waiting] = await Promise.all([
      readInstances(from, to),
      this.prisma.checklistSession.findMany({
        where: { organizationId, deletedAt: null, status: 'scheduled', instance: { deletedAt: null, checklistId: { in: sheetIds }, user: employeeFilter } },
        select: { scheduledAt: true, createdAt: true, instance: { select: { checklistId: true, userId: true } } }, take: MAX_INSTANCES,
      }),
    ]);
    const toInstance = (instance: (typeof selfDone)[number], sessionStatus: AnalyticsInstance['sessionStatus'], scheduledAt: Date | null): AnalyticsInstance & { userId: string; userName: string; completedAt: Date | null; at: Date | null; departmentId: string | null; departmentName: string | null } => ({
      checklistId: instance.checklistId, userId: instance.userId, sessionStatus, scheduledAt, instanceStatus: instance.status, percentage: instance.percentage, scored: instance.scored,
      at: scheduledAt ?? instance.completedAt, completedAt: instance.completedAt,
      userName: `${instance.user?.lastName ?? ''} ${instance.user?.firstName ?? ''}`.trim(),
      departmentId: instance.user?.departmentMemberships[0]?.department.id ?? null, departmentName: instance.user?.departmentMemberships[0]?.department.name ?? null,
      guest: instance.user?.email === GUEST_USER_EMAIL,
      snapshot: (instance.templateSnapshot ?? null) as Snapshot, results: instance.results,
    });
    const toInstances = (read: { sessions: typeof sessions; selfDone: typeof selfDone }) => [
      ...read.sessions.map((session) => toInstance(session.instance, session.status, session.scheduledAt)),
      ...read.selfDone.map((instance) => toInstance(instance, null, null)),
    ];
    const instances = toInstances({ sessions, selfDone });
    const queue = waiting.map((row) => ({ checklistId: row.instance.checklistId, userId: row.instance.userId, scheduledAt: row.scheduledAt, createdAt: row.createdAt }));
    // PR 520: the same period just before this one, for the "change against the previous period" of the key figures.
    const length = to.getTime() - from.getTime();
    const previousTotal = length > 0
      ? buildSheetAnalytics(sheets, toInstances(await readInstances(new Date(from.getTime() - length), new Date(from.getTime() - 1))), [], now).total
      : null;
    const previous = previousTotal && { completed: previousTotal.plan.completed, completionPercentage: previousTotal.completionPercentage, averagePercentage: previousTotal.averagePercentage, overdue: previousTotal.plan.overdue };
    const result = { ...buildSheetAnalytics(sheets, instances, queue, now), summary: { ...buildAnalyticsSummary(instances, { tzOffsetMinutes: query.tzOffset }), previous } };
    if (presentation) {
      const sheetById = new Map(sheets.map((sheet) => [sheet.id, sheet]));
      const values = await presentation.values([...new Set([...instances, ...queue].map((row) => row.userId))]);
      const groups = new Map<string | null, { label: string; instances: typeof instances; queue: typeof queue; sheets: Set<string> }>();
      const groupOf = (row: { userId: string; checklistId: string }) => {
        const value = values.get(row.userId);
        const key = value?.key ?? null;
        let group = groups.get(key);
        if (!group) {
          group = { label: value?.label ?? '', instances: [], queue: [], sheets: new Set() };
          groups.set(key, group);
        }
        group.sheets.add(row.checklistId);
        return group;
      };
      for (const row of instances) groupOf(row).instances.push(row);
      for (const row of queue) groupOf(row).queue.push(row);
      const groupedRows = [...groups].flatMap(([groupKey, group]) =>
        buildSheetAnalytics([...group.sheets].map((id) => sheetById.get(id)!), group.instances, group.queue, now).sheets
          .map((row) => ({ ...row, fieldLabel: group.label, groupKey })),
      );
      return {
        ...result, sheets: groupedRows.slice(0, MAX_INSTANCES), fieldColumn: presentation.label,
        period: { from: query.from, to: query.to },
        truncated: sessions.length >= MAX_INSTANCES || selfDone.length >= MAX_INSTANCES || waiting.length >= MAX_INSTANCES || groupedRows.length > MAX_INSTANCES,
      };
    }
    return { ...result, period: { from: query.from, to: query.to }, truncated: sessions.length >= MAX_INSTANCES || selfDone.length >= MAX_INSTANCES };
  }
}
