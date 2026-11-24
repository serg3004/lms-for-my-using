/**
 * PR 519: the extra blocks of the analytics dashboard (trend over weeks, completion by department, weakest criteria), built from the
 * same instances the totals use, so every number on the dashboard agrees with the table below it.
 * PR 520 adds the result bands (pie), the weekday/hour heat map and the ranking of employees.
 */

type SummaryLevel = { value: number; score: number };
type SummaryItem = { id: string; text?: string; points?: number; scale?: { id: string; levels: SummaryLevel[] } | null };

export type SummaryInstance = {
  checklistId: string;
  sessionStatus: 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | null;
  instanceStatus: string;
  percentage: number;
  scored: boolean;
  /** The day the session was planned for, or the day a self-completed result was finished. */
  at: Date | null;
  /** When the result was finished (the heat map is drawn from it; falls back to `at`). */
  completedAt?: Date | null;
  userId?: string;
  userName?: string | null;
  /** A pass through the public link or QR code: not a person of the organization, so left out of the ranking. */
  guest?: boolean;
  departmentId: string | null;
  departmentName: string | null;
  snapshot: { checklist?: { scoringMode?: string; items?: SummaryItem[] } } | null;
  results: ReadonlyArray<{ itemId: string; answerState: string; scaleLevel: number | null; checked: boolean; points: number }>;
};

const MAX_WEEKS = 26;
const MAX_DEPARTMENTS = 8;
const MAX_WEAK = 5;
const MIN_ANSWERS_FOR_WEAK = 3;
const MAX_PEOPLE = 5;
/** PR 520: a finished result is "good" from this percentage, "with remarks" from the next one and "bad" below it. */
export const GOOD_FROM = 80;
export const REMARKS_FROM = 60;
export const HEAT_BUCKET_HOURS = 2;

const isFinished = (instance: SummaryInstance) => instance.sessionStatus === 'completed' || (instance.sessionStatus === null && instance.instanceStatus === 'completed');
const average = (sum: number, count: number) => (count > 0 ? Math.round(sum / count) : null);

/** Monday 00:00 UTC of the week the date falls in. */
export function weekStart(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const shift = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - shift * 86_400_000);
}

/** How well one answer went, 0-100, or null when the answer carries no score (an unscored sheet or an item without a scale). */
export function answerPercentage(item: SummaryItem, scoringMode: string | undefined, result: SummaryInstance['results'][number]): number | null {
  if (scoringMode === 'none') return null;
  if (item.scale) {
    const max = Math.max(...item.scale.levels.map((level) => level.score), 0);
    const level = item.scale.levels.find((candidate) => candidate.value === result.scaleLevel);
    return level && max > 0 ? Math.round((level.score / max) * 100) : null;
  }
  return result.checked ? 100 : 0;
}

/** Result band of one finished, scored result. */
export function resultBand(percentage: number): 'good' | 'mid' | 'bad' {
  return percentage >= GOOD_FROM ? 'good' : percentage >= REMARKS_FROM ? 'mid' : 'bad';
}

/** Finished results by weekday (Monday first) and two-hour block of the day, in the viewer's time (`tzOffsetMinutes` east of UTC). */
export function buildHeat(instances: readonly SummaryInstance[], tzOffsetMinutes = 0): number[][] {
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 / HEAT_BUCKET_HOURS }, () => 0));
  for (const instance of instances) {
    const moment = instance.completedAt ?? instance.at;
    if (!moment || !isFinished(instance)) continue;
    const local = new Date(moment.getTime() + tzOffsetMinutes * 60_000);
    heat[(local.getUTCDay() + 6) % 7]![Math.floor(local.getUTCHours() / HEAT_BUCKET_HOURS)]! += 1;
  }
  return heat;
}

export function buildAnalyticsSummary(instances: readonly SummaryInstance[], options: { tzOffsetMinutes?: number } = {}) {
  const live = instances.filter((instance) => instance.sessionStatus !== 'cancelled');

  const weeks = new Map<number, { planned: number; completed: number; scoreSum: number; scored: number }>();
  for (const instance of live) {
    if (!instance.at) continue;
    const key = weekStart(instance.at).getTime();
    const bucket = weeks.get(key) ?? { planned: 0, completed: 0, scoreSum: 0, scored: 0 };
    if (instance.sessionStatus !== null) bucket.planned += 1;
    if (isFinished(instance)) {
      bucket.completed += 1;
      if (instance.scored) { bucket.scoreSum += instance.percentage; bucket.scored += 1; }
    }
    weeks.set(key, bucket);
  }
  const trend = [...weeks].sort((a, b) => a[0] - b[0]).slice(-MAX_WEEKS).map(([start, bucket]) => ({
    weekStart: new Date(start).toISOString().slice(0, 10),
    planned: bucket.planned,
    completed: bucket.completed,
    averagePercentage: average(bucket.scoreSum, bucket.scored),
  }));

  const departments = new Map<string, { id: string | null; name: string | null; planned: number; completed: number; scoreSum: number; scored: number }>();
  for (const instance of live) {
    const key = instance.departmentId ?? 'none';
    const row = departments.get(key) ?? { id: instance.departmentId, name: instance.departmentName, planned: 0, completed: 0, scoreSum: 0, scored: 0 };
    if (instance.sessionStatus !== null) { row.planned += 1; if (instance.sessionStatus === 'completed') row.completed += 1; }
    if (isFinished(instance) && instance.scored) { row.scoreSum += instance.percentage; row.scored += 1; }
    departments.set(key, row);
  }
  const departmentRows = [...departments.values()]
    .filter((row) => row.planned > 0 || row.scored > 0)
    .map((row) => ({ id: row.id, name: row.name, planned: row.planned, completed: row.completed, completionPercentage: row.planned > 0 ? Math.round((row.completed / row.planned) * 100) : null, averagePercentage: average(row.scoreSum, row.scored) }))
    .sort((a, b) => (b.completionPercentage ?? -1) - (a.completionPercentage ?? -1) || (b.averagePercentage ?? -1) - (a.averagePercentage ?? -1))
    .slice(0, MAX_DEPARTMENTS);

  // Criteria by their frozen text of the newest sheet version; the weakest are those with the lowest average of how well they were answered.
  const criteria = new Map<string, { checklistId: string; text: string; sum: number; answered: number }>();
  for (const instance of live.filter(isFinished)) {
    const checklist = instance.snapshot?.checklist;
    const results = new Map(instance.results.map((result) => [result.itemId, result]));
    for (const item of checklist?.items ?? []) {
      const result = results.get(item.id);
      if (!result || result.answerState !== 'answered') continue;
      const percentage = answerPercentage(item, checklist?.scoringMode, result);
      if (percentage === null) continue;
      const key = `${instance.checklistId}:${item.id}`;
      const entry = criteria.get(key) ?? { checklistId: instance.checklistId, text: item.text ?? '', sum: 0, answered: 0 };
      entry.sum += percentage;
      entry.answered += 1;
      criteria.set(key, entry);
    }
  }
  const weak = [...criteria.entries()]
    .filter(([, entry]) => entry.answered >= MIN_ANSWERS_FOR_WEAK && entry.text !== '')
    .map(([key, entry]) => ({ id: key.slice(key.indexOf(':') + 1), checklistId: entry.checklistId, text: entry.text, answered: entry.answered, percentage: Math.round(entry.sum / entry.answered) }))
    .sort((a, b) => a.percentage - b.percentage || b.answered - a.answered)
    .slice(0, MAX_WEAK);

  const finishedScored = live.filter((instance) => isFinished(instance) && instance.scored);
  const results = { good: 0, mid: 0, bad: 0 };
  for (const instance of finishedScored) results[resultBand(instance.percentage)] += 1;

  const people = new Map<string, { name: string; sum: number; count: number }>();
  for (const instance of finishedScored) {
    if (instance.guest || !instance.userId) continue;
    const row = people.get(instance.userId) ?? { name: instance.userName ?? '', sum: 0, count: 0 };
    row.sum += instance.percentage;
    row.count += 1;
    people.set(instance.userId, row);
  }
  const ranking = [...people.entries()]
    .map(([id, row]) => ({ id, name: row.name, sessions: row.count, averagePercentage: Math.round(row.sum / row.count) }))
    .sort((a, b) => b.averagePercentage - a.averagePercentage || b.sessions - a.sessions || a.name.localeCompare(b.name))
    .slice(0, MAX_PEOPLE);

  return { trend, departments: departmentRows, weak, results, heat: buildHeat(live, options.tzOffsetMinutes), people: ranking };
}

