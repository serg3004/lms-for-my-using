import type { TFunction } from 'i18next';
import type {
  ChecklistAnswerState,
} from '../../app/checklistCompletion.js';
import { isChecklistRequirementSatisfied } from '../../app/checklistCompletion.js';
import type {
  ChecklistInstanceSummary,
  ChecklistItemSummary,
  ChecklistScaleLevel,
  ChecklistScoringMode,
  ChecklistStatus,
  ChecklistSummary,
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
}) {
  return {
    title: form.title,
    description: form.description || null,
    scoringMode: form.scoringMode,
    passThreshold: form.passThreshold,
    requiresReview: form.requiresReview,
    scaleLevels: form.scoringMode === 'scale' ? form.scaleLevels : null,
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
