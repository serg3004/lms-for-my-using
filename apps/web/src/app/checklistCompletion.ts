import type {
  ChecklistItemResultSummary,
  ChecklistItemSummary,
  ChecklistScoringMode,
} from '../shared/api/types.js';

export type ChecklistAnswerState = {
  checked?: boolean;
  scaleLevel?: number | null;
  hasPhoto?: boolean;
};

export function hasChecklistAnswer(scoringMode: ChecklistScoringMode, answer: ChecklistAnswerState | undefined) {
  if (!answer) return false;
  return scoringMode === 'scale' ? answer.scaleLevel != null : answer.checked === true;
}

export function isChecklistAnswerComplete(
  item: Pick<ChecklistItemSummary, 'photoRequired'>,
  scoringMode: ChecklistScoringMode,
  answer: ChecklistAnswerState | undefined,
) {
  if (!hasChecklistAnswer(scoringMode, answer)) return false;
  return !item.photoRequired || answer?.hasPhoto === true;
}

export function isChecklistRequirementSatisfied(
  item: Pick<ChecklistItemSummary, 'isRequired' | 'photoRequired'>,
  scoringMode: ChecklistScoringMode,
  answer: ChecklistAnswerState | undefined,
) {
  if (!hasChecklistAnswer(scoringMode, answer)) return !item.isRequired;
  return isChecklistAnswerComplete(item, scoringMode, answer);
}

export function checklistResultToAnswer(result: ChecklistItemResultSummary | undefined): ChecklistAnswerState | undefined {
  if (!result) return undefined;
  return {
    checked: result.checked,
    scaleLevel: result.scaleLevel,
    hasPhoto: Boolean(result.photoFileName),
  };
}

export function getRequiredChecklistProgress(
  items: ChecklistItemSummary[],
  results: ChecklistItemResultSummary[],
  scoringMode: ChecklistScoringMode,
) {
  const requiredItems = items.filter((item) => item.isRequired);
  const resultByItemId = new Map(results.map((result) => [result.itemId, result]));
  const completedRequired = requiredItems.filter((item) =>
    isChecklistAnswerComplete(item, scoringMode, checklistResultToAnswer(resultByItemId.get(item.id))),
  ).length;

  return { completedRequired, requiredCount: requiredItems.length };
}
