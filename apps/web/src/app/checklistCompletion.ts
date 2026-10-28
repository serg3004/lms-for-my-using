import type { TFunction } from 'i18next';
import type {
  ChecklistItemResultSummary,
  ChecklistItemSummary,
  ChecklistScoringMode,
  ChecklistScaleLevel,
} from '../shared/api/types.js';
import { hasChecklistPhotoEvidence } from './checklistPhotoEvidence.js';

export type ChecklistAnswerState = {
  checked?: boolean;
  scaleLevel?: number | null;
  hasPhoto?: boolean;
};

export function checklistItemLevels(item: Pick<ChecklistItemSummary, 'scale'>, scoringMode: ChecklistScoringMode, levels: ChecklistScaleLevel[] | null): ChecklistScaleLevel[] | null {
  if (item.scale) return item.scale.levels.map((level) => ({ level: level.value, label: level.label, points: level.score }));
  return scoringMode === 'scale' ? levels ?? [] : null;
}

export function hasChecklistAnswer(scoringMode: ChecklistScoringMode, answer: ChecklistAnswerState | undefined, item?: Pick<ChecklistItemSummary, 'scale'>) {
  if (!answer) return false;
  if (item?.scale) return item.scale.levels.some((level) => level.value === answer.scaleLevel);
  return scoringMode === 'scale' ? answer.scaleLevel != null : answer.checked === true;
}

export function isChecklistAnswerComplete(
  item: Pick<ChecklistItemSummary, 'photoRequired' | 'scale'>,
  scoringMode: ChecklistScoringMode,
  answer: ChecklistAnswerState | undefined,
) {
  if (!hasChecklistAnswer(scoringMode, answer, item)) return false;
  return !item.photoRequired || answer?.hasPhoto === true;
}

export function isChecklistRequirementSatisfied(
  item: Pick<ChecklistItemSummary, 'isRequired' | 'photoRequired' | 'scale'>,
  scoringMode: ChecklistScoringMode,
  answer: ChecklistAnswerState | undefined,
) {
  if (!hasChecklistAnswer(scoringMode, answer, item)) return !item.isRequired;
  return isChecklistAnswerComplete(item, scoringMode, answer);
}

export function checklistResultToAnswer(result: ChecklistItemResultSummary | undefined): ChecklistAnswerState | undefined {
  if (!result) return undefined;
  return {
    checked: result.checked,
    scaleLevel: result.scaleLevel,
    hasPhoto: hasChecklistPhotoEvidence(result),
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

export function localizeChecklistScaleError(message: string | null, t: TFunction) {
  return message === 'Select a valid level from this criterion’s evaluation scale'
    ? t('checklists.invalidCriterionScale', 'Select a valid level from this criterion’s evaluation scale')
    : message;
}
