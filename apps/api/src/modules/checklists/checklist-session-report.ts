import type { Prisma } from '@prisma/client';

import {
  DEFAULT_LEVEL_COLORS, defaultLevelColor, highlightStyle, type HighlightStyle, type ResultColors,
} from './checklist-colors.js';
import { performanceBand } from './checklist-performance-band.js';
import type { ChecklistsService } from './checklists.service.js';

type Breakdown = Awaited<ReturnType<ChecklistsService['getScoreBreakdown']>>;

export type ReportPerson = {
  id: string; firstName: string; lastName: string; email: string;
  department: { id: string; name: string } | null;
};

export type ReportLocationCapture = {
  capturePoint: string; status: string; capturedAt: Date;
  latitude?: number | null; longitude?: number | null; accuracyMeters?: number | null;
};

export type SessionReportInput = {
  session: {
    id: string; instanceId: string; status: string; scheduledAt: Date | null; durationMinutes: number | null;
    startedAt: Date | null; timezone: string; locationCapturePolicy: string;
    strengths: string | null; developmentAreas: string | null; nextSteps: string | null;
    contextFieldsSnapshot: Prisma.JsonValue | null; contextValues: Prisma.JsonValue | null;
  };
  instance: {
    id: string; status: string; totalScore: number; maxScore: number; percentage: number | null;
    passed: boolean | null; scored: boolean | null; completedAt: Date | null;
  };
  checklistId: string;
  learner: ReportPerson;
  observer: ReportPerson;
  breakdown: Breakdown;
  formula: 'snapshot' | 'criteria';
  settings: { highPerformanceThreshold: number; lowThreshold: number | null; resultColors: ResultColors };
  /** False when the viewer is the learner and the feedback policy still hides the result (see applyFeedbackVisibility). */
  visible: boolean;
  locationCaptures: ReportLocationCapture[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const percentOf = (earned: number, max: number) => (max > 0 ? Math.round((earned / max) * 100) : null);

/** Shared server-side aggregation for report groups and multi-observation exports. */
export function aggregateReportScores(values: ReadonlyArray<{ score: number; maxScore: number; percentage?: number | null } | null>) {
  const score = round2(values.reduce((sum, value) => sum + (value?.score ?? 0), 0));
  const maxScore = round2(values.reduce((sum, value) => sum + (value?.maxScore ?? 0), 0));
  const present = values.filter((value) => value !== null);
  const percentage = present.length === 1 && present[0]!.percentage !== undefined ? present[0]!.percentage : percentOf(score, maxScore);
  return { score, maxScore, percentage };
}

function rangeColor(percentage: number | null, settings: SessionReportInput['settings']): HighlightStyle | null {
  if (percentage === null) return null;
  const band = performanceBand(percentage, { high: settings.highPerformanceThreshold, low: settings.lowThreshold });
  return highlightStyle(settings.resultColors[band]);
}

function contextEntries(session: SessionReportInput['session']) {
  const fields = Array.isArray(session.contextFieldsSnapshot) ? session.contextFieldsSnapshot : [];
  const values = session.contextValues && typeof session.contextValues === 'object' && !Array.isArray(session.contextValues)
    ? (session.contextValues as Record<string, unknown>) : {};
  return fields
    .filter((field): field is { id: string; label: string; type: string; order: number } =>
      !!field && typeof field === 'object' && !Array.isArray(field) && typeof (field as { id?: unknown }).id === 'string')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((field) => ({ id: field.id, label: field.label, type: field.type, value: typeof values[field.id] === 'string' ? (values[field.id] as string) : null }));
}

/**
 * PR 370: the one data set behind the detailed session report. The screen (PR 371), the PDF
 * (PR 372) and the summary XLSX (PR 373) all render this object and never calculate a score,
 * a percentage or a colour themselves. Pure: everything it needs is passed in.
 */
export function buildSessionReport(input: SessionReportInput) {
  const { session, instance, breakdown, settings } = input;
  const plannedEnd = session.scheduledAt && session.durationMinutes
    ? new Date(session.scheduledAt.getTime() + session.durationMinutes * 60_000) : null;

  const header = {
    status: session.status,
    timezone: session.timezone,
    scheduledStart: session.scheduledAt,
    scheduledEnd: plannedEnd,
    startedAt: session.startedAt,
    completedAt: instance.completedAt,
    learner: input.learner,
    observer: input.observer,
  };
  const base = { sessionId: session.id, instanceId: instance.id, checklist: { id: input.checklistId, title: breakdown.checklist.title }, header };

  if (!input.visible) {
    return {
      ...base, visible: false as const, generalInfo: [], summary: null, groups: [], criteria: [], feedback: null,
      location: { policy: session.locationCapturePolicy, captures: [] },
    };
  }

  // Group numbers follow the sheet order and skip groups without criteria; ungrouped criteria are numbered on their own.
  const groupById = new Map(breakdown.checklist.itemGroups.map((group) => [group.id, group]));
  const groupNumbers = new Map<string | null, number>();
  const criteriaCounters = new Map<string | null, number>();
  const groupTotals = new Map<string | null, { earned: number; max: number; count: number }>();
  let ungroupedCounter = 0;

  const criteria = breakdown.rows.map(({ item, result, state, earned, max }) => {
    const groupId = item.groupId && groupById.has(item.groupId) ? item.groupId : null;
    if (!groupNumbers.has(groupId)) groupNumbers.set(groupId, groupId === null ? 0 : [...groupNumbers.keys()].filter((key) => key !== null).length + 1);
    const inGroup = (criteriaCounters.get(groupId) ?? 0) + 1;
    criteriaCounters.set(groupId, inGroup);
    ungroupedCounter += groupId === null ? 1 : 0;
    const number = groupId === null ? String(ungroupedCounter) : `${groupNumbers.get(groupId)}.${inGroup}`;

    const totals = groupTotals.get(groupId) ?? { earned: 0, max: 0, count: 0 };
    groupTotals.set(groupId, { earned: totals.earned + earned, max: totals.max + max, count: totals.count + 1 });

    const level = item.scale?.levels.find((candidate) => candidate.value === result?.scaleLevel)
      ?? (!item.scale && breakdown.checklist.scoringMode === 'scale'
        ? breakdown.checklist.scaleLevels?.find((candidate) => candidate.level === result?.scaleLevel) : undefined);
    const scaleMax = item.scale ? Math.max(0, ...item.scale.levels.map((candidate) => candidate.score)) : 0;
    let color: string | null = null;
    if (state === 'answered') {
      if (level && 'color' in level && level.color) color = level.color;
      else if (level && 'score' in level) color = defaultLevelColor(level.score, scaleMax);
      else color = max > 0 && earned >= max ? DEFAULT_LEVEL_COLORS.full : earned <= 0 ? DEFAULT_LEVEL_COLORS.zero : DEFAULT_LEVEL_COLORS.partial;
    }

    return {
      id: item.id,
      number,
      groupId,
      text: item.text,
      state,
      score: state === 'skipped' ? null : round2(earned),
      maxScore: state === 'skipped' ? null : round2(max),
      levelLabel: level ? level.label : null,
      comment: result?.comment ?? null,
      photo: result?.photoObjectKey ? { fileName: result.photoFileName ?? null } : null,
      reviewStatus: result?.reviewStatus ?? null,
      color: color ? highlightStyle(color) : null,
    };
  });

  const groups = [...groupTotals.entries()]
    .filter(([groupId]) => groupId !== null)
    .map(([groupId, totals]) => {
      const percentage = percentOf(totals.earned, totals.max);
      return {
        id: groupId, number: String(groupNumbers.get(groupId)), title: groupById.get(groupId as string)!.title,
        score: round2(totals.earned), maxScore: round2(totals.max), percentage, criteriaCount: totals.count,
        color: rangeColor(percentage, settings),
      };
    });

  const percentage = instance.scored ? instance.percentage : null;
  const summary = {
    scored: instance.scored === true,
    percentage,
    totalScore: instance.totalScore,
    maxScore: instance.maxScore,
    criteriaCount: criteria.length,
    answeredCount: criteria.filter((criterion) => criterion.state === 'answered').length,
    skippedCount: criteria.filter((criterion) => criterion.state === 'skipped').length,
    passed: instance.passed,
    passThreshold: breakdown.checklist.passThreshold,
    formula: input.formula,
    color: rangeColor(percentage, settings),
  };

  return {
    ...base,
    visible: true as const,
    generalInfo: contextEntries(session),
    summary,
    groups,
    criteria,
    feedback: breakdown.checklist.feedbackEnabled
      ? { strengths: session.strengths, developmentAreas: session.developmentAreas, comment: session.nextSteps }
      : null,
    location: { policy: session.locationCapturePolicy, captures: input.locationCaptures },
  };
}

export type ChecklistSessionReport = ReturnType<typeof buildSessionReport>;
