/** PR 333: outbox topic for the best-effort email copy of a "write to the participant" message. */
export const CHECKLIST_SESSION_MESSAGE_NOTIFY_JOB = 'checklists.session-message-notify';

/** At most this many messages per session inside the window, so the button cannot be used to spam. */
export const SESSION_MESSAGE_LIMIT = 3;
export const SESSION_MESSAGE_WINDOW_MS = 10 * 60_000;
