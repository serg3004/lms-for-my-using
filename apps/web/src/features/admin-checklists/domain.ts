import type { TFunction } from 'i18next';
import type {
  ChecklistAnswerState,
} from '../../app/checklistCompletion.js';
import { checklistItemLevels, isChecklistRequirementSatisfied } from '../../app/checklistCompletion.js';
import type {
  ChecklistAccessMode,
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

/** An untouched draft: the default title and nothing entered. Safe to discard when the author leaves without typing. */
export function isUntouchedDraft(checklist: ChecklistSummary, defaultTitle: string) {
  return (
    checklist.status === 'draft' &&
    checklist.title === defaultTitle &&
    !(checklist.description ?? '').trim() &&
    checklist.items.length === 0 &&
    (checklist.itemGroups ?? []).length === 0 &&
    (checklist.contextFields ?? []).length === 0
  );
}

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
  allowFinishIncomplete: boolean;
  forbidGalleryPhotos: boolean;
  accessMode: ChecklistAccessMode;
  pinned: boolean;
  /** Left out for people who may not change it (only the creator and admins can). */
  allowEditByAll?: boolean;
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
    allowFinishIncomplete: form.allowFinishIncomplete,
    forbidGalleryPhotos: form.forbidGalleryPhotos,
    accessMode: form.accessMode,
    // Only a free checklist can be pinned; switching the mode back clears the pin in the same save.
    pinned: form.accessMode === 'free' && form.pinned,
    ...(form.allowEditByAll === undefined ? {} : { allowEditByAll: form.allowEditByAll }),
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
    const levels = checklistItemLevels(item, scoringMode, scaleLevels);
    const weight = item.weight ?? 1;
    if (levels !== null) {
      maxScore += weight * levels.reduce((max, level) => Math.max(max, level.points), 0);
      totalScore += weight * (levels.find((level) => level.level === answers[item.id]?.scaleLevel)?.points ?? 0);
    } else if (scoringMode === 'all_required') {
      maxScore += weight;
      totalScore += answers[item.id]?.checked ? weight : 0;
    } else {
      maxScore += item.points * weight;
      totalScore += answers[item.id]?.checked ? item.points * weight : 0;
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
  const byOrder = (a: ChecklistItemSummary, b: ChecklistItemSummary) => a.order - b.order;
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  const buckets: GroupedItems[] = sortedGroups.map((group) => ({ group, items: items.filter((item) => item.groupId === group.id).sort(byOrder) }));
  const groupIds = new Set(groups.map((group) => group.id));
  const ungrouped = items.filter((item) => item.groupId == null || !groupIds.has(item.groupId)).sort(byOrder);
  if (ungrouped.length > 0 || groups.length === 0) buckets.push({ group: null, items: ungrouped });
  return buckets;
}

/**
 * Swaps a criterion with its neighbour within the same group (or the same ungrouped bucket),
 * returning the two {id, order} pairs to persist -- mirrors moveGroup's up/down contract so the
 * builder's group and criterion reordering share one interaction pattern (PR 317).
 */
export function moveItem(items: ChecklistItemSummary[], itemId: string, direction: 'up' | 'down'): Array<{ id: string; order: number }> {
  const target = items.find((item) => item.id === itemId);
  if (!target) return [];
  const siblings = items.filter((item) => (item.groupId ?? null) === (target.groupId ?? null)).sort((a, b) => a.order - b.order);
  const index = siblings.findIndex((item) => item.id === itemId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) return [];
  const a = siblings[index]!;
  const b = siblings[targetIndex]!;
  return [{ id: a.id, order: b.order }, { id: b.id, order: a.order }];
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

export const SCALE_MIN_LEVELS = 2;
export const SCALE_MAX_LEVELS = 20;
export const SCALE_MAX_SCORE = 1000;

/** One editable row of the scale editor. `score` stays a string so a half-typed number is not lost. */
export type ScaleLevelDraft = { key: string; label: string; score: string };

let scaleLevelKeySeed = 0;
function nextScaleLevelKey() {
  scaleLevelKeySeed += 1;
  return `scale-level-${scaleLevelKeySeed}`;
}

export function createScaleLevelDraft(label = '', score = ''): ScaleLevelDraft {
  return { key: nextScaleLevelKey(), label, score };
}

/** A new scale starts with two empty levels worth 0 and 100 points. */
export function newScaleLevelDrafts(): ScaleLevelDraft[] {
  return [createScaleLevelDraft('', '0'), createScaleLevelDraft('', '100')];
}

export function scaleLevelDraftsFromLevels(levels: ChecklistScaleLevelSummary[]): ScaleLevelDraft[] {
  return [...levels]
    .sort((a, b) => a.value - b.value)
    .map((level) => createScaleLevelDraft(level.label, String(level.score)));
}

export type ScaleDraftError = 'name' | 'tooFewLevels' | 'tooManyLevels' | 'label' | 'score';

export function validateScaleDraft(name: string, levels: ScaleLevelDraft[]): ScaleDraftError | null {
  if (!name.trim()) return 'name';
  if (levels.length < SCALE_MIN_LEVELS) return 'tooFewLevels';
  if (levels.length > SCALE_MAX_LEVELS) return 'tooManyLevels';
  if (levels.some((level) => !level.label.trim())) return 'label';
  const validScore = (value: string) => /^\d+$/.test(value.trim()) && Number(value) <= SCALE_MAX_SCORE;
  if (levels.some((level) => !validScore(level.score))) return 'score';
  return null;
}

/** Level numbers are always 1..n in row order, so they stay unique whatever the user adds, removes or moves. */
export function scaleDraftToInput(name: string, levels: ScaleLevelDraft[]) {
  return {
    name: name.trim(),
    levels: levels.map((level, index) => ({ value: index + 1, label: level.label.trim(), score: Number(level.score) })),
  };
}

export function moveScaleLevelDraft(levels: ScaleLevelDraft[], index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= levels.length) return levels;
  const next = [...levels];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

/** Plain-text summary of a scale's levels for a tooltip, e.g. "Yes (100), No (0)". */
export function describeScaleLevels(levels: ChecklistScaleLevelSummary[]) {
  return [...levels]
    .sort((a, b) => a.value - b.value)
    .map((level) => `${level.label} (${level.score})`)
    .join(', ');
}

/**
 * PR 327: the one "next step" the list offers for a status -- publish a draft, take a published
 * checklist back to draft, restore an archived one as a draft (never straight to published, so it
 * is re-checked by the publish rules). Archiving is a separate, secondary action.
 */
export function checklistStatusAction(status: ChecklistStatus): ChecklistStatus {
  return status === 'draft' ? 'published' : 'draft';
}
