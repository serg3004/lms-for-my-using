import type { TFunction } from 'i18next';

export function checklistResultText(result: { percentage?: number | null; totalScore?: number; maxScore?: number }, showPoints: boolean, t: TFunction): string {
  if (typeof result.percentage !== 'number') return t('checklistSessions.learner.notScored', 'Not scored (all skipped)');
  return showPoints && typeof result.totalScore === 'number' && typeof result.maxScore === 'number'
    ? t('checklists.resultLine', '{{score}} / {{max}} ({{percentage}}%)', { score: result.totalScore, max: result.maxScore, percentage: result.percentage })
    : t('checklists.resultPercentage', '{{percentage}}%', { percentage: result.percentage });
}
