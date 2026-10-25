import { formatUserName } from '../admin-checklists/domain.js';
import type {
  BulkCreateChecklistSessionResult,
  ChecklistSessionParticipant,
  ChecklistSessionRecipientSchedule,
  ChecklistSessionStatus,
  ChecklistSessionSummary,
  UpdateChecklistSessionInput,
} from '../../shared/api/types.js';

export { formatUserName };

export const CHECKLIST_SESSION_STATUSES: ChecklistSessionStatus[] = ['scheduled', 'in_progress', 'paused', 'completed', 'cancelled'];

export type SessionStatusTab = 'all' | ChecklistSessionStatus;
export const SESSION_STATUS_TABS: SessionStatusTab[] = ['all', ...CHECKLIST_SESSION_STATUSES];

// ---- PR 318: sessions list filters ("Период"/"Наблюдатель" cards) ----

export type SessionPeriod = 'all' | 'last7' | 'last30' | 'quarter';
export const SESSION_PERIODS: SessionPeriod[] = ['all', 'last7', 'last30', 'quarter'];

/**
 * Resolves a period option to the `scheduledFrom` value `GET /checklist-sessions` already
 * accepts -- no new backend filter, just a friendlier front-end control over an existing one.
 */
export function resolvePeriodScheduledFrom(period: SessionPeriod, now: Date = new Date()): string | undefined {
  const days = period === 'last7' ? 7 : period === 'last30' ? 30 : period === 'quarter' ? 90 : null;
  if (days === null) return undefined;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---- PR 325: sessions list filters live in the URL ----

export type SessionFilters = {
  status: SessionStatusTab;
  period: SessionPeriod;
  observerId: string;
  checklistId: string;
  learnerId: string;
  departmentId: string;
  search: string;
  page: number;
};

export type SessionFilterKey = Exclude<keyof SessionFilters, 'page'>;

const SESSION_FILTER_DEFAULTS: Record<SessionFilterKey, string> = {
  status: 'all',
  period: 'all',
  observerId: '',
  checklistId: '',
  learnerId: '',
  departmentId: '',
  search: '',
};

/** Reads filters from the query string; unknown enum values and bad page numbers fall back to defaults. */
export function parseSessionFilters(params: URLSearchParams): SessionFilters {
  const status = params.get('status') as SessionStatusTab | null;
  const period = params.get('period') as SessionPeriod | null;
  const page = Number(params.get('page'));
  return {
    status: status && SESSION_STATUS_TABS.includes(status) ? status : 'all',
    period: period && SESSION_PERIODS.includes(period) ? period : 'all',
    observerId: params.get('observerId') ?? '',
    checklistId: params.get('checklistId') ?? '',
    learnerId: params.get('learnerId') ?? '',
    departmentId: params.get('departmentId') ?? '',
    search: params.get('search') ?? '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Applies a filter change to the query string: defaults are dropped and any filter change resets paging. */
export function applySessionFilterChange(params: URLSearchParams, change: Partial<Record<SessionFilterKey, string>> | { page: number }): URLSearchParams {
  const next = new URLSearchParams(params);
  if ('page' in change) {
    if (change.page > 1) next.set('page', String(change.page)); else next.delete('page');
    return next;
  }
  for (const [key, value] of Object.entries(change) as Array<[SessionFilterKey, string]>) {
    if (!value || value === SESSION_FILTER_DEFAULTS[key]) next.delete(key); else next.set(key, value);
  }
  next.delete('page');
  return next;
}

/** Filters (other than the status tabs) that are currently narrowing the list, for the removable chips. */
export function activeSessionFilterKeys(filters: SessionFilters): Array<Exclude<SessionFilterKey, 'status'>> {
  return (['period', 'checklistId', 'departmentId', 'learnerId', 'observerId', 'search'] as const).filter(
    (key) => filters[key] !== SESSION_FILTER_DEFAULTS[key],
  );
}

/** Only a still-`scheduled` session can be cancelled -- once it starts, participants are locked in (see ADR). */
export function canCancelSession(session: Pick<ChecklistSessionSummary, 'status'>) {
  return session.status === 'scheduled';
}

/** Repeat only makes sense once a session has reached a terminal state. */
export function canRepeatSession(session: Pick<ChecklistSessionSummary, 'status'>) {
  return session.status === 'completed' || session.status === 'cancelled';
}

/**
 * PR 302: reassigning the observer is just a PATCH observerId change, so it shares the exact same
 * "still scheduled" window as cancel/update (ADR: participants are frozen once a session starts).
 */
export function canReassignObserver(session: Pick<ChecklistSessionSummary, 'status'>) {
  return session.status === 'scheduled';
}

export function formatParticipantName(participant: { firstName: string; lastName?: string | null; email: string }) {
  return formatUserName(participant);
}

/**
 * PR 302 review fix: `ReassignObserverDialog`'s picklist exists to pick a *replacement* -- listing
 * the session's current observer among the candidates invited picking a no-op "reassignment" that
 * would silently dismiss a valid unavailability report without assigning anyone new. The backend
 * now rejects that no-op too (`ChecklistSessionService.update()`), but excluding it here is the
 * actual UX fix -- a disabled/absent option beats a 400 after the admin already picked it.
 */
export function excludeCurrentObserver(candidates: ChecklistSessionParticipant[], currentObserverId: string) {
  return candidates.filter((candidate) => candidate.id !== currentObserverId);
}

/** Matches the backend's `POST /checklist-sessions/bulk` `learnerIds` cap (see API contract). */
export const MAX_BULK_SESSION_LEARNERS = 100;

export function canProceedFromParticipantsStep(learnerIds: readonly string[], observerId: string) {
  return learnerIds.length > 0 && learnerIds.length <= MAX_BULK_SESSION_LEARNERS && observerId.trim().length > 0;
}

export function canProceedFromChecklistStep(checklistId: string) {
  return checklistId.trim().length > 0;
}

export type ScheduleMode = 'now' | 'later';
/** PR 333: only a session that has not started can be edited or deleted. */
export function canDeleteSession(session: Pick<ChecklistSessionSummary, 'status'>) {
  return session.status === 'scheduled';
}

/** PR 333: a message about a finished session has nothing to act on. */
export function canMessageParticipant(session: Pick<ChecklistSessionSummary, 'status'>) {
  return session.status !== 'completed' && session.status !== 'cancelled';
}

/** ISO instant -> `datetime-local` value in browser wall time (the same convention `toSessionScheduledAt` reads back). */
export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * PR 333: one PATCH for the unified edit dialog. Only what actually changed is sent; `null` means
 * "nothing to save" (or an unreadable date), which keeps Save disabled. A changed time always
 * carries the browser timezone so the stored wall time and the stored zone never disagree.
 */
export function buildSessionUpdatePayload(
  session: Pick<ChecklistSessionSummary, 'version' | 'scheduledAt' | 'observerId'>,
  draft: { scheduledAt: string; observerId: string },
  timezone: string,
): UpdateChecklistSessionInput | null {
  const payload: UpdateChecklistSessionInput = { version: session.version };
  let changed = false;
  if (draft.scheduledAt && draft.scheduledAt !== toDatetimeLocalValue(session.scheduledAt)) {
    const iso = toSessionScheduledAt(draft.scheduledAt);
    if (!iso) return null;
    payload.scheduledAt = iso;
    payload.timezone = timezone;
    changed = true;
  }
  if (draft.observerId && draft.observerId !== session.observerId) {
    payload.observerId = draft.observerId;
    changed = true;
  }
  return changed ? payload : null;
}

export type SessionScheduleDraft = { scheduledAt: string; durationMinutes: string };

/** A datetime-local value denotes browser wall time. Reject invalid dates and DST gaps
 * instead of silently normalizing them to a different appointment time. */
export function toSessionScheduledAt(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
  const inputParts = value.split(/[-T:]/).map(Number);
  return parts.every((part, index) => part === inputParts[index]) ? date.toISOString() : null;
}

export function isSessionDurationValid(value: string): boolean {
  if (value.trim() === '') return true;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440;
}

export function canProceedFromScheduleStep(mode: ScheduleMode, scheduledAt: string, durationMinutes = '') {
  return isSessionDurationValid(durationMinutes) && (mode === 'now' || toSessionScheduledAt(scheduledAt) !== null);
}

export function buildIndividualSessionSchedules(
  learnerIds: readonly string[],
  drafts: Readonly<Record<string, SessionScheduleDraft>>,
  fallback: SessionScheduleDraft,
  timezone: string,
): ChecklistSessionRecipientSchedule[] | null {
  if (learnerIds.length === 0) return null;
  const schedules: ChecklistSessionRecipientSchedule[] = [];
  for (const learnerId of learnerIds) {
    const draft = drafts[learnerId] ?? fallback;
    const scheduledAt = toSessionScheduledAt(draft.scheduledAt);
    if (!scheduledAt || !isSessionDurationValid(draft.durationMinutes)) return null;
    schedules.push({ learnerId, scheduledAt, durationMinutes: draft.durationMinutes.trim() ? Number(draft.durationMinutes) : null, timezone });
  }
  return schedules;
}

export function partitionBulkCreateResults(result: BulkCreateChecklistSessionResult) {
  return {
    created: result.results.filter((r) => r.status === 'created'),
    skipped: result.results.filter((r) => r.status === 'skipped'),
    failed: result.results.filter((r) => r.status === 'failed'),
  };
}
