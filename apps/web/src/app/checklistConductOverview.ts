import type {
  ChecklistItemGroup,
  ChecklistItemResultAnswerState,
  ChecklistItemResultSummary,
  ChecklistItemSummary,
  ChecklistScoringMode,
} from '../shared/api/types.js';
import { checklistResultToAnswer, isChecklistAnswerComplete } from './checklistCompletion.js';
import { hasChecklistPhotoEvidence } from './checklistPhotoEvidence.js';

/** Navigation state only: does not change required-item validation or scoring. */
export function conductAnswerState(item: ChecklistItemSummary, result: ChecklistItemResultSummary | undefined, scoringMode: ChecklistScoringMode): ChecklistItemResultAnswerState {
  if (!result || result.answerState === 'unanswered') return 'unanswered';
  if (result.answerState === 'skipped') return 'skipped';
  if (item.photoRequired && !hasChecklistPhotoEvidence(result)) return 'unanswered';
  if (result.answerState === 'answered') return 'answered';
  return isChecklistAnswerComplete(item, item.scale ? 'scale' : scoringMode, checklistResultToAnswer(result)) ? 'answered' : 'unanswered';
}

export function conductCriteria(items: ChecklistItemSummary[], results: ChecklistItemResultSummary[], scoringMode: ChecklistScoringMode) {
  const byItem = new Map(results.map((result) => [result.itemId, result]));
  return items.map((item, index) => ({ item, index, state: conductAnswerState(item, byItem.get(item.id), scoringMode) }));
}
export type ConductCriterion = ReturnType<typeof conductCriteria>[number];

export function conductOverviewGroups(criteria: ConductCriterion[], groups: ChecklistItemGroup[], hideAnswered: boolean) {
  const visible = criteria.filter((criterion) => !hideAnswered || criterion.state === 'unanswered');
  const knownGroups = new Set(groups.map((group) => group.id));
  return [
    ...[...groups].sort((a, b) => a.order - b.order).map((group) => ({ id: group.id, title: group.title, criteria: visible.filter(({ item }) => item.groupId === group.id) })),
    { id: null, title: '', criteria: visible.filter(({ item }) => !item.groupId || !knownGroups.has(item.groupId)) },
  ].filter((group) => group.criteria.length > 0);
}

/** Keep original step indices; filtering never removes context or the trailing feedback step. */
export function nextConductStep(criteria: ConductCriterion[], currentIndex: number, hasContext: boolean, hideAnswered: boolean) {
  const offset = hasContext ? 1 : 0;
  const next = criteria.find(({ index, state }) => index + offset > currentIndex && (!hideAnswered || state === 'unanswered'));
  return next ? next.index + offset : criteria.length + offset;
}
