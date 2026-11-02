import { useState } from 'react';
import type { TFunction } from 'i18next';
import { Button, ConfirmDialog } from '../shared/ui.js';

type Props = {
  /** The sheet goes to an instructor instead of being completed. */
  requiresReview: boolean;
  /** Titles of the criteria that still block finishing. */
  missing: string[];
  onFinish: () => Promise<void>;
  t: TFunction;
};

/**
 * PR 406б: the explicit end of a self-filled sheet. The button is available when every required
 * criterion is answered; otherwise it is disabled and the list says what is missing. Finishing asks
 * for confirmation because answers cannot be changed afterwards.
 */
export function ChecklistFinishBar({ requiresReview, missing, onFinish, t }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = requiresReview ? t('checklists.sendForReview', 'Send for review') : t('checklists.finishCheck', 'Finish the check');
  const blocked = missing.length > 0;
  async function confirm() {
    setBusy(true);
    try {
      await onFinish();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }
  return (
    <div style={{ marginTop: 20 }}>
      {blocked && (
        <div id="finish-missing" role="status" style={{ fontSize: 13, marginBottom: 8 }}>
          <strong>{t('checklists.finishMissing', 'Not answered yet:')}</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {missing.map((title) => <li key={title}>{title}</li>)}
          </ul>
        </div>
      )}
      <Button type="button" disabled={blocked} aria-describedby={blocked ? 'finish-missing' : undefined} style={{ minHeight: 44 }} onClick={() => setConfirming(true)}>{label}</Button>
      <ConfirmDialog
        open={confirming}
        title={label}
        message={<p>{requiresReview
          ? t('checklists.finishConfirmReview', 'The answers will go to your instructor and cannot be changed afterwards.')
          : t('checklists.finishConfirm', 'After finishing, the answers cannot be changed.')}</p>}
        confirmLabel={label}
        cancelLabel={t('checklists.finishCancel', 'Cancel')}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
