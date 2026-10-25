import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { sendChecklistSessionMessage } from '../../shared/api/checklistSessions.js';
import type { ChecklistSessionSummary } from '../../shared/api/types.js';
import { InlineFeedback, Textarea, WizardDialog } from '../../shared/ui.js';
import { formatParticipantName } from './domain.js';

export const SESSION_MESSAGE_MAX_LENGTH = 500;

type Props = {
  session: ChecklistSessionSummary | null;
  onClose: () => void;
  onSent: () => void;
  t: TFunction;
};

/**
 * PR 333: "Write to the participant". The employee gets an in-app notification (plus a best-effort
 * email) with this text and the checklist title only -- the dialog says so, because the observer's
 * feedback and location are never part of it.
 */
export function MessageParticipantDialog({ session, onClose, onSent, t }: Props) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessage('');
    setError(null);
  }, [session?.id]);

  async function submit() {
    if (!session || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendChecklistSessionMessage(session.id, message.trim());
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.checklists.sessions.message.error', 'Unable to send the message.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardDialog
      busy={busy}
      cancelLabel={t('admin.checklists.sessions.message.cancel', 'Cancel')}
      currentStep={0}
      nextDisabled={!message.trim()}
      nextLabel={t('admin.checklists.sessions.message.send', 'Send')}
      onBack={onClose}
      onClose={onClose}
      onNext={() => { void submit(); }}
      open={session !== null}
      steps={[{ key: 'message', label: t('admin.checklists.sessions.message.stepLabel', 'Message') }]}
      title={t('admin.checklists.sessions.message.title', 'Write to the participant')}
    >
      {error && <InlineFeedback title={t('admin.checklists.sessions.message.error', 'Unable to send the message.')} tone="error">{error}</InlineFeedback>}
      {session && (
        <p style={{ margin: '0 0 8px' }}>
          {t('admin.checklists.sessions.message.to', 'To: {{name}}', { name: formatParticipantName(session.learner) })}
        </p>
      )}
      <Textarea
        hint={t('admin.checklists.sessions.message.hint', 'The employee sees this text and the checklist name. Feedback and location are never included.')}
        label={t('admin.checklists.sessions.message.label', 'Message')}
        maxLength={SESSION_MESSAGE_MAX_LENGTH}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        value={message}
      />
    </WizardDialog>
  );
}
