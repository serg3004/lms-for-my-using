import { formatUserName } from '../admin-checklists/domain.js';
import type {
  BulkCreateChecklistSessionResult,
  ChecklistSessionParticipant,
  ChecklistSessionStatus,
  ChecklistSessionSummary,
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

export function canProceedFromScheduleStep(mode: ScheduleMode, scheduledAt: string) {
  return mode === 'now' || scheduledAt.trim().length > 0;
}

export function partitionBulkCreateResults(result: BulkCreateChecklistSessionResult) {
  return {
    created: result.results.filter((r) => r.status === 'created'),
    skipped: result.results.filter((r) => r.status === 'skipped'),
    failed: result.results.filter((r) => r.status === 'failed'),
  };
}
