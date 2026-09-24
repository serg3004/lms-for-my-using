import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { listChecklistSessionParticipants, updateChecklistSession } from '../../shared/api/checklistSessions.js';
import type { ChecklistSessionParticipant, ChecklistSessionSummary } from '../../shared/api/types.js';
import { InlineFeedback, Input, WizardDialog } from '../../shared/ui.js';
import { formatParticipantName } from './domain.js';
import { useDebounced } from './ChecklistSessionWizard.js';

type Props = {
  /** `null` closes the dialog -- same "controlled by the target row" pattern as ConfirmDialog's cancelTarget. */
  session: ChecklistSessionSummary | null;
  onClose: () => void;
  onReassigned: () => void;
  t: TFunction;
};

/**
 * PR 302: the admin/manager CTA for a session whose observer reported they're unavailable (or
 * just any scheduled session's observer, unavailable-flagged or not -- reassignment isn't gated on
 * the flag, only on the session still being `scheduled`). Reuses `WizardDialog` as a single-step
 * shell, per ADR_CHECKLIST_SESSION_OVERLAY.md's "no third modal implementation" rule, and the same
 * debounced observer-search picklist as `ChecklistSessionWizard`'s participants step.
 */
export function ReassignObserverDialog({ session, onClose, onReassigned, t }: Props) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [results, setResults] = useState<ChecklistSessionParticipant[]>([]);
  const [selected, setSelected] = useState<ChecklistSessionParticipant | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearch('');
    setResults([]);
    setSelected(null);
    setError(null);
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    listChecklistSessionParticipants({ role: 'observer', search: debounced || undefined, pageSize: 20 })
      .then((result) => { if (!cancelled) setResults(result.items); })
      .catch(() => { if (!cancelled) setResults([]); });
    return () => { cancelled = true; };
  }, [session, debounced]);

  async function submit() {
    if (!session || !selected) return;
    setBusy(true);
    setError(null);
    try {
      await updateChecklistSession(session.id, { observerId: selected.id, version: session.version });
      onReassigned();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.checklists.sessions.reassign.error', 'Unable to reassign the observer.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardDialog
      busy={busy}
      cancelLabel={t('admin.checklists.sessions.reassign.cancel', 'Cancel')}
      currentStep={0}
      nextDisabled={!selected}
      nextLabel={t('admin.checklists.sessions.reassign.save', 'Save')}
      onBack={onClose}
      onClose={onClose}
      onNext={() => { void submit(); }}
      open={session !== null}
      steps={[{ key: 'observer', label: t('admin.checklists.sessions.reassign.stepLabel', 'New observer') }]}
      title={t('admin.checklists.sessions.reassign.title', 'Reassign observer')}
    >
      {error && <InlineFeedback title={t('admin.checklists.sessions.reassign.error', 'Unable to reassign the observer.')} tone="error">{error}</InlineFeedback>}
      {session?.observerUnavailableReason && (
        <InlineFeedback title={t('admin.checklists.sessions.reassign.unavailableReason', 'Reported unavailable')} tone="warning">
          {session.observerUnavailableReason}
        </InlineFeedback>
      )}
      <Input
        aria-label={t('admin.checklists.sessions.reassign.search', 'Find observer')}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('admin.checklists.sessions.reassign.search', 'Find observer')}
        value={search}
      />
      <ul className="ds-wizard-dialog__picklist">
        {results.map((participant) => (
          <li key={participant.id}>
            <label>
              <input
                checked={selected?.id === participant.id}
                name="reassign-observer"
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
