import { formatUserName } from '../admin-checklists/domain.js';
import type {
  BulkCreateChecklistSessionResult,
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

export function formatParticipantName(participant: { firstName: string; lastName?: string | null; email: string }) {
  return formatUserName(participant);
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
