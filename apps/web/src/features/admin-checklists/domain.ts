import type { TFunction } from 'i18next';
import type {
  ChecklistAnswerState,
} from '../../app/checklistCompletion.js';
import { isChecklistRequirementSatisfied } from '../../app/checklistCompletion.js';
import type {
  ChecklistGeolocationPolicy,
  ChecklistInstanceSummary,
  ChecklistItemGroup,
  ChecklistItemSummary,
  ChecklistPreSessionVisibility,
  ChecklistScaleLevel,
  ChecklistScaleLevelSummary,
  ChecklistScoringMode,
  ChecklistStatus,
  ChecklistSummary,
  ContextField,
  UserSummary,
} from '../../shared/api/types.js';

export const CHECKLIST_STATUSES: ChecklistStatus[] = ['draft', 'published', 'archived'];
export const SCORING_MODES: ChecklistScoringMode[] = ['sum_points', 'all_required', 'scale'];

export type PreviewAnswer = ChecklistAnswerState;
export type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };

export function filterChecklists(checklists: ChecklistSummary[], search: string, statusFilter: 'all' | ChecklistStatus) {
  return checklists.filter((checklist) => {
    if (statusFilter !== 'all' && checklist.status !== statusFilter) return false;
    return !search.trim() || checklist.title.toLowerCase().includes(search.trim().toLowerCase());
  });
}

export function formatUserName(user: { firstName: string; lastName?: string | null; email: string }) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export function resolveUserName(users: UserSummary[], userId: string) {
  const user = users.find((candidate) => candidate.id === userId);
  return user ? formatUserName(user) : userId;
}

export function filterAssignableUsers(users: UserSummary[], instances: ChecklistInstanceSummary[]) {
  const activeStatuses = new Set(['assigned', 'in_progress', 'submitted']);
  return users.filter((user) => !instances.some((instance) => instance.userId === user.id && activeStatuses.has(instance.status)));
}

export function buildChecklistSettingsPayload(form: {
  title: string;
  description: string;
  scoringMode: ChecklistScoringMode;
  passThreshold: number;
  requiresReview: boolean;
  scaleLevels: ChecklistScaleLevel[];
  defaultLocationCapturePolicy: ChecklistGeolocationPolicy | '';
  preSessionVisibility: ChecklistPreSessionVisibility;
}) {
  return {
    title: form.title,
    description: form.description || null,
    scoringMode: form.scoringMode,
    passThreshold: form.passThreshold,
    requiresReview: form.requiresReview,
    scaleLevels: form.scoringMode === 'scale' ? form.scaleLevels : null,
    defaultLocationCapturePolicy: form.defaultLocationCapturePolicy || null,
    preSessionVisibility: form.preSessionVisibility,
  };
}

export function canAssignChecklist(checklistStatus: ChecklistStatus, assignUserId: string) {
  return checklistStatus === 'published' && assignUserId.trim().length > 0;
}

export function applyItemPatch(items: ChecklistItemSummary[], itemId: string, patch: Partial<ChecklistItemSummary>) {
  return items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
}

export function removeItemById(items: ChecklistItemSummary[], itemId: string) {
  return items.filter((item) => item.id !== itemId);
}

export function applyScaleLevelPatch(levels: ChecklistScaleLevel[], index: number, patch: Partial<ChecklistScaleLevel>) {
  return levels.map((level, currentIndex) => (currentIndex === index ? { ...level, ...patch } : level));
}

export function appendScaleLevel(levels: ChecklistScaleLevel[]) {
  return [...levels, { level: levels.length + 1, label: '', points: 0 }];
}

export function removeScaleLevelAt(levels: ChecklistScaleLevel[], index: number) {
  return levels.filter((_, currentIndex) => currentIndex !== index);
}

export function computePreviewResult(
  items: ChecklistItemSummary[],
  scoringMode: ChecklistScoringMode,
  scaleLevels: ChecklistScaleLevel[],
  passThreshold: number,
  answers: Record<string, PreviewAnswer>,
) {
  let totalScore = 0;
  let maxScore = 0;
  for (const item of items) {
    if (scoringMode === 'scale') {
      maxScore += scaleLevels.reduce((max, level) => Math.max(max, level.points), 0);
      totalScore += scaleLevels.find((level) => level.level === answers[item.id]?.scaleLevel)?.points ?? 0;
    } else if (scoringMode === 'all_required') {
      maxScore += 1;
      totalScore += answers[item.id]?.checked ? 1 : 0;
    } else {
      maxScore += item.points;
      totalScore += answers[item.id]?.checked ? item.points : 0;
    }
  }
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const allAnswered = items.length > 0 && items.every((item) =>
    isChecklistRequirementSatisfied(item, scoringMode, answers[item.id]),
  );
  return { totalScore, maxScore, percentage, passed: allAnswered && percentage >= passThreshold, allAnswered };
}

export function createDefaultScale(t: TFunction): ChecklistScaleLevel[] {
  return [0, 25, 50, 75, 100].map((points, index) => ({
    level: index + 1,
    label: t(`admin.checklists.defaultScale.${index + 1}`),
    points,
  }));
}

// ---- PR 296: observation-sheet builder (item groups, context fields) ----

export type GroupedItems = { group: ChecklistItemGroup | null; items: ChecklistItemSummary[] };

/**
 * Buckets items by their group, ordered groups-first (by ChecklistItemGroup.order), then a
 * synthetic "ungrouped" bucket (group: null) for items whose groupId doesn't match any group --
 * always last, so a criterion is never silently dropped from the builder's view.
 */
export function groupItems(items: ChecklistItemSummary[], groups: ChecklistItemGroup[]): GroupedItems[] {
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  const buckets: GroupedItems[] = sortedGroups.map((group) => ({ group, items: items.filter((item) => item.groupId === group.id) }));
  const groupIds = new Set(groups.map((group) => group.id));
  const ungrouped = items.filter((item) => item.groupId == null || !groupIds.has(item.groupId));
  if (ungrouped.length > 0 || groups.length === 0) buckets.push({ group: null, items: ungrouped });
  return buckets;
}

export function applyGroupPatch(groups: ChecklistItemGroup[], groupId: string, patch: Partial<ChecklistItemGroup>) {
  return groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group));
}

/** Swaps a group with its neighbour in the given direction, returning the two {id, order} pairs to persist. */
export function moveGroup(groups: ChecklistItemGroup[], groupId: string, direction: 'up' | 'down'): Array<{ id: string; order: number }> {
  const sorted = [...groups].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((group) => group.id === groupId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= sorted.length) return [];
  const a = sorted[index];
  const b = sorted[targetIndex];
  return [{ id: a.id, order: b.order }, { id: b.id, order: a.order }];
}

export function applyContextFieldPatch(fields: ContextField[], fieldId: string, patch: Partial<ContextField>) {
  return fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field));
}

export function appendContextField(fields: ContextField[]): ContextField[] {
  return [...fields, { id: crypto.randomUUID(), label: '', type: 'text', required: false, order: fields.length }];
}

export function removeContextFieldById(fields: ContextField[], fieldId: string) {
  return fields.filter((field) => field.id !== fieldId);
}

// ---- PR 293/296: reusable evaluation scale library (scale-manager builder UI) ----

export function createDefaultReusableScaleLevels(t: TFunction): ChecklistScaleLevelSummary[] {
  return [
    { value: 1, label: t('admin.checklists.scaleManager.defaultLow', 'Low'), score: 0 },
    { value: 2, label: t('admin.checklists.scaleManager.defaultMedium', 'Medium'), score: 50 },
    { value: 3, label: t('admin.checklists.scaleManager.defaultHigh', 'High'), score: 100 },
  ];
}
