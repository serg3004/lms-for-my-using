import { useEffect, useId, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../shared/apiClient.js';
import { Button, Dialog, InlineFeedback, Select, Textarea } from '../shared/ui.js';
import type { ChecklistTransferCandidate } from '../shared/api/types.js';
import { listChecklistTransferCandidates, listChecklistTransferHistory, transferChecklistInstance } from '../shared/api/checklists.js';
import type { ChecklistTransferHistoryRow } from '../shared/api/types.js';

export const TRANSFER_NOTE_MAX = 500;

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; candidates: ChecklistTransferCandidate[] };

const fullName = (user: { firstName: string; lastName: string } | null, t: TFunction) => (user ? `${user.lastName} ${user.firstName}`.trim() : t('checklists.transfer.unknownUser', 'Employee'));

/**
 * PR 477: "Hand over the check…". The executor, an administrator or a manager of the team picks a colleague (the people of
 * the same department, decided by the server), may add a note, and the unfinished check moves to that person with its
 * answers and photos. `expectedUpdatedAt` is the version on screen: if the check changed meanwhile the server answers 409.
 */
export function ChecklistTransferButton({ instanceId, expectedUpdatedAt, onTransferred, t }: {
  instanceId: string; expectedUpdatedAt: string; onTransferred: () => void; t: TFunction;
}) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ conflict: boolean; message: string } | null>(null);
  const titleId = useId();
  const introId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    setLoad({ status: 'loading' });
    setRecipient('');
    setNote('');
    setError(null);
    listChecklistTransferCandidates(instanceId)
      .then((candidates) => { if (current) setLoad({ status: 'ready', candidates: Array.isArray(candidates) ? candidates : [] }); })
      .catch(() => { if (current) setLoad({ status: 'error' }); });
    return () => { current = false; };
  }, [open, instanceId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await transferChecklistInstance(instanceId, { toUserId: recipient, ...(note.trim() ? { note: note.trim() } : {}), expectedUpdatedAt });
      setOpen(false);
      onTransferred();
    } catch (err) {
      const conflict = err instanceof ApiClientError && err.status === 409;
      setError({ conflict, message: conflict ? t('checklists.transfer.conflict', 'The check has changed. Reload the page and try again.') : t('checklists.transfer.error', 'Unable to hand the check over.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" style={{ minHeight: 44, marginTop: 12 }} onClick={() => setOpen(true)}>
        {t('checklists.transfer.open', 'Hand over the check…')}
      </Button>
      <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} labelledBy={titleId} describedBy={introId} initialFocusRef={cancelRef}>
        <h2 id={titleId}>{t('checklists.transfer.title', 'Hand the check over to a colleague')}</h2>
        <p id={introId}>{t('checklists.transfer.intro', 'The unfinished check moves to your colleague together with the answers and photos. After the hand-over you cannot edit it.')}</p>
        {load.status === 'loading' && <p role="status">{t('checklists.transfer.loading', 'Loading colleagues…')}</p>}
        {load.status === 'error' && <InlineFeedback tone="error">{t('checklists.transfer.loadError', 'Unable to load the list of colleagues.')}</InlineFeedback>}
        {load.status === 'ready' && load.candidates.length === 0 && (
          <p role="status">{t('checklists.transfer.empty', 'No colleagues available: a check can only be handed to someone from the same department.')}</p>
        )}
        {load.status === 'ready' && load.candidates.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Select label={t('checklists.transfer.recipient', 'Hand over to')} value={recipient} onChange={(event) => setRecipient(event.target.value)} disabled={busy}>
              <option value="">{t('checklists.transfer.choose', 'Choose a colleague')}</option>
              {load.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{fullName(candidate, t)}</option>)}
            </Select>
            <Textarea
              label={t('checklists.transfer.note', 'Note to the colleague (optional)')}
              hint={t('checklists.transfer.noteCount', '{{count}} of {{max}}', { count: note.length, max: TRANSFER_NOTE_MAX })}
              value={note} maxLength={TRANSFER_NOTE_MAX} rows={3} disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        )}
        {error && (
          <InlineFeedback tone="error" action={error.conflict ? <Button type="button" size="sm" variant="secondary" style={{ minHeight: 44 }} onClick={() => window.location.reload()}>{t('checklists.transfer.reload', 'Reload')}</Button> : undefined}>
            {error.message}
          </InlineFeedback>
        )}
        <div className="ds-dialog__actions">
          <button className="ds-button ds-button--secondary ds-button--md" disabled={busy} onClick={() => setOpen(false)} ref={cancelRef} type="button" style={{ minHeight: 44 }}>
            {t('checklists.transfer.cancel', 'Cancel')}
          </button>
          <Button type="button" aria-busy={busy || undefined} disabled={busy || recipient === ''} style={{ minHeight: 44 }} onClick={() => void submit()}>
            {t('checklists.transfer.submit', 'Hand over')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/** The hand-overs of one check (who to whom, when, the note); renders nothing when there were none or the history cannot be read. */
export function ChecklistTransferHistory({ instanceId, t }: { instanceId: string; t: TFunction }) {
  const { i18n } = useTranslation();
  const [rows, setRows] = useState<ChecklistTransferHistoryRow[]>([]);
  useEffect(() => {
    let current = true;
    listChecklistTransferHistory(instanceId).then((history) => { if (current) setRows(Array.isArray(history) ? history : []); }).catch(() => { if (current) setRows([]); });
    return () => { current = false; };
  }, [instanceId]);
  if (rows.length === 0) return null;
  const format = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  return (
    <section aria-labelledby={`transfer-history-${instanceId}`} style={{ marginTop: 16 }}>
      <h2 id={`transfer-history-${instanceId}`} style={{ fontSize: 16 }}>{t('checklists.transfer.historyTitle', 'Hand-over history')}</h2>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {rows.map((row) => (
          <li key={row.id}>
            {t('checklists.transfer.historyLine', '{{from}} → {{to}}, {{date}}', { from: fullName(row.from, t), to: fullName(row.to, t), date: format(row.at) })}
            {row.note && <div style={{ fontSize: 13 }}>{t('checklists.transfer.historyNote', 'Note: {{note}}', { note: row.note })}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
