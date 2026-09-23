import type { ChecklistInstanceStatus, ChecklistSessionStatus } from './api/types.js';
import type { BadgeVariant } from './ui.js';

/**
 * Shared ChecklistInstance status -> Badge tone mapping (PR 294 UI foundation). Screens that
 * render an instance's status today each invent their own ad hoc color logic (e.g.
 * LearnerChecklistsPage's local hardcoded-hex `COLORS` constant, InstructorChecklistReviewsPage's
 * separate token-based one) -- this is the single source of truth new screens (starting with the
 * PR 295+ session UI) should use instead. Existing pages are not migrated by this PR; see
 * docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md's "UI foundation" section.
 *
 * Only reuses existing Badge tone variants/tokens -- no new colors.
 */
export const CHECKLIST_INSTANCE_STATUS_BADGE_VARIANT: Record<ChecklistInstanceStatus, BadgeVariant> = {
  assigned: 'neutral',
  in_progress: 'info',
  submitted: 'info',
  completed: 'success',
  expired: 'danger',
};

/**
 * ChecklistSession lifecycle status -> Badge tone (PR 295), fixed in advance by
 * ADR_CHECKLIST_SESSION_OVERLAY.md's "UI foundation" section so this PR doesn't invent the
 * mapping ad hoc. Distinct record from the instance mapping above even though `in_progress`
 * appears in both -- a session and its underlying instance can be in different states at once
 * (session lifecycle is orthogonal to instance/submission lifecycle, see the ADR's state-machine
 * section), so the two must never be collapsed into one shared lookup keyed only by string value.
 */
export const CHECKLIST_SESSION_STATUS_BADGE_VARIANT: Record<ChecklistSessionStatus, BadgeVariant> = {
  scheduled: 'info',
  in_progress: 'info',
  paused: 'warning',
  completed: 'success',
  cancelled: 'danger',
};
