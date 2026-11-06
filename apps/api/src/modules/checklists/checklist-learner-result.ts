/** Wire projection only: scoring and persisted snapshots always retain the original values. */
const pointKeys = new Set(['points', 'score', 'totalScore', 'maxScore', 'earned', 'weight']);
const resultKeys = new Set(['percentage', 'passed', 'scored', 'previousPercentage', 'newPercentage', 'previousPassed', 'newPassed', 'newScored']);
const contentKeys = new Set(['contextValues', 'feedbackAnswers']);

export function withoutLearnerPoints<T>(value: T, hideResult = false): T {
  if (Array.isArray(value)) return value.map((child) => withoutLearnerPoints(child, hideResult)) as T;
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !pointKeys.has(key) && !(hideResult && resultKeys.has(key))).map(([key, child]) =>
    [key, contentKeys.has(key) ? child : withoutLearnerPoints(child, hideResult)])) as T;
}

export function presentLearnerInstance<T>(instance: T, privileged = false): T {
  if (privileged || !instance || typeof instance !== 'object' || !('status' in instance)) return instance;
  const source = instance as Record<string, unknown>;
  const completed = source.status === 'completed';
  const checklist = source.checklist as { showPointsToLearner?: boolean; scoringMode?: string } | undefined;
  const pointsVisible = completed && checklist?.showPointsToLearner === true && checklist.scoringMode !== 'none';
  const result = pointsVisible ? { ...source } : withoutLearnerPoints(source);
  if (!completed) Object.assign(result, { percentage: null, passed: null, scored: null });
  return result as T;
}

export function presentLearnerReport<T extends { pointsVisible?: boolean }>(report: T): T {
  return report.pointsVisible === false ? withoutLearnerPoints(report) : report;
}
