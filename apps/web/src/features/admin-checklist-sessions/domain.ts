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
