import type { ChecklistInstanceSummary } from '../shared/api/types.js';

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ChecklistDeadlineState = 'none' | 'scheduled' | 'due_soon' | 'expired' | 'closed';

export function getChecklistDeadlineState(
  instance: Pick<ChecklistInstanceSummary, 'status' | 'dueAt'>,
  nowMs = Date.now(),
): ChecklistDeadlineState {
  if (!instance.dueAt) return 'none';
  if (instance.status === 'expired') return 'expired';
  if (instance.status === 'submitted' || instance.status === 'completed') return 'closed';

  const dueAtMs = Date.parse(instance.dueAt);
  if (!Number.isFinite(dueAtMs)) return 'scheduled';
  if (dueAtMs <= nowMs) return 'expired';
  if (dueAtMs - nowMs <= DUE_SOON_WINDOW_MS) return 'due_soon';
  return 'scheduled';
}

export function formatChecklistDueAt(dueAt: string | null, locale?: string) {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return dueAt;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function localDateTimeToUtcIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}
