import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { listChecklistSessionParticipants, updateChecklistSession } from '../../shared/api/checklistSessions.js';
import type { ChecklistSessionParticipant, ChecklistSessionSummary } from '../../shared/api/types.js';
import { InlineFeedback, Input, WizardDialog } from '../../shared/ui.js';
import { buildSessionUpdatePayload, excludeCurrentObserver, formatParticipantName, toDatetimeLocalValue } from './domain.js';
import { useDebounced } from './ChecklistSessionWizard.js';

type Props = {
  /** `null` closes the dialog -- same "controlled by the target row" pattern as ConfirmDialog's cancelTarget. */
  session: ChecklistSessionSummary | null;
  onClose: () => void;
  onSaved: () => void;
  t: TFunction;
};

/**
 * PR 333: one dialog for everything a manager changes on a scheduled session -- the time and,
 * optionally, the observer (PR 302's reassignment, which used to be its own dialog). Both go out
 * as a single PATCH so the version check and the audit trail see one coherent edit. Reuses
 * `WizardDialog` as a single-step shell, per ADR_CHECKLIST_SESSION_OVERLAY.md's "no third modal
 * implementation" rule, and the same debounced observer-search picklist as the creation wizard.
 */
export function EditSessionDialog({ session, onClose, onSaved, t }: Props) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [results, setResults] = useState<ChecklistSessionParticipant[]>([]);
  const [selected, setSelected] = useState<ChecklistSessionParticipant | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScheduledAt(toDatetimeLocalValue(session?.scheduledAt ?? null));
    setSearch('');
    setResults([]);
    setSelected(null);
    setError(null);
  }, [session?.id, session?.scheduledAt]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    listChecklistSessionParticipants({ role: 'observer', search: debounced || undefined, pageSize: 20 })
      .then((result) => {
        if (!cancelled) setResults(excludeCurrentObserver(result.items, session.observerId).filter((item) => item.id !== session.learner.id));
      })
      .catch(() => { if (!cancelled) setResults([]); });
    return () => { cancelled = true; };
  }, [session, debounced]);

  const payload = session
    ? buildSessionUpdatePayload(session, { scheduledAt, observerId: selected?.id ?? '' }, Intl.DateTimeFormat().resolvedOptions().timeZone)
    : null;

  async function submit() {
    if (!session || !payload) return;
    setBusy(true);
    setError(null);
    try {
      await updateChecklistSession(session.id, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.checklists.sessions.edit.error', 'Unable to save the session.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardDialog
      busy={busy}
      cancelLabel={t('admin.checklists.sessions.edit.cancel', 'Cancel')}
      currentStep={0}
      nextDisabled={!payload}
      nextLabel={t('admin.checklists.sessions.edit.save', 'Save')}
      onBack={onClose}
      onClose={onClose}
      onNext={() => { void submit(); }}
      open={session !== null}
      steps={[{ key: 'edit', label: t('admin.checklists.sessions.edit.stepLabel', 'Time and observer') }]}
      title={t('admin.checklists.sessions.edit.title', 'Edit session')}
    >
      {error && <InlineFeedback title={t('admin.checklists.sessions.edit.error', 'Unable to save the session.')} tone="error">{error}</InlineFeedback>}
      <Input
        label={t('admin.checklists.sessions.edit.scheduledAt', 'Date and time')}
        onChange={(e) => setScheduledAt(e.target.value)}
        type="datetime-local"
        value={scheduledAt}
      />
      {session?.observerUnavailableReason && (
        <InlineFeedback title={t('admin.checklists.sessions.reassign.unavailableReason', 'Reported unavailable')} tone="warning">
          {session.observerUnavailableReason}
        </InlineFeedback>
      )}
      <p style={{ margin: '12px 0 4px', fontWeight: 600 }}>
        {t('admin.checklists.sessions.edit.observer', 'Observer')}: {session ? formatParticipantName(session.observer) : ''}
      </p>
      <Input
        aria-label={t('admin.checklists.sessions.reassign.search', 'Find observer')}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('admin.checklists.sessions.edit.searchHint', 'Find another observer (optional)')}
        value={search}
      />
      <ul className="ds-wizard-dialog__picklist">
        {results.map((participant) => (
          <li key={participant.id}>
            <label>
              <input
                checked={selected?.id === participant.id}
                name="edit-session-observer"
                onChange={() => setSelected(participant)}
                type="radio"
              />
              {formatParticipantName(participant)}
            </label>
          </li>
        ))}
      </ul>
    </WizardDialog>
  );
}
