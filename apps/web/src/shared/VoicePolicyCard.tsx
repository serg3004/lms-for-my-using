import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminCard, FormField } from './adminPage.js';
import { ApiClientError } from './apiClient.js';
import { getVoicePolicy, saveVoicePolicy, type VoicePolicy } from './api/voicePolicy.js';

type State = 'loading' | 'ready' | 'saving' | 'saved' | 'loadError' | 'saveError' | 'conflict';

/** PR 511: the administrator decides what is available in checklist comments of the organization. A checklist can only narrow it. */
export function VoicePolicyCard({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<VoicePolicy | null>(null);
  const [state, setState] = useState<State>('loading');

  const load = () => getVoicePolicy(organizationId).then((next) => { setPolicy(next); setState('ready'); }).catch(() => setState('loadError'));
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  function change(patch: Partial<VoicePolicy>) {
    setPolicy((current) => (current ? { ...current, ...patch } : current));
    setState('ready');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!policy) return;
    setState('saving');
    try {
      setPolicy(await saveVoicePolicy(organizationId, policy));
      setState('saved');
    } catch (error) {
      setState(error instanceof ApiClientError && error.status === 409 ? 'conflict' : 'saveError');
    }
  }

  return (
    <AdminCard>
      <form className="admin-form" onSubmit={(event) => void save(event)}>
        <h2>{t('voicePolicy.title', 'Dictation and sound in checklist comments')}</h2>
        <p>{t('voicePolicy.hint', 'Here you decide what is available in the whole organization. The author of a checklist can only turn a mode off for that checklist, not on if it is off here. Recordings already made stay listenable.')}</p>
        {state === 'loadError' ? <p className="admin-form__error" role="alert">{t('voicePolicy.loadError', 'The settings could not be loaded. Reload the page.')}</p> : null}
        {policy ? (
          <>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={policy.dictationEnabled} onChange={(event) => change({ dictationEnabled: event.target.checked })} />
              <span>{t('voicePolicy.dictation', 'Dictation (speech to text)')}</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={policy.voiceNotesEnabled} onChange={(event) => change({ voiceNotesEnabled: event.target.checked })} />
              <span>{t('voicePolicy.voice', 'Sound recording')}</span>
            </label>
            <p className="admin-form__hint">{t('voicePolicy.voiceHint', 'The recording is saved in the checklist and listened to by the reviewer. It is off by default.')}</p>
            <FormField id="voice-max-seconds" label={t('voicePolicy.maxSeconds', 'Longest recording, seconds')} hint={t('voicePolicy.maxSecondsHint', 'From 5 to 120.')}>
              <input id="voice-max-seconds" type="number" min={5} max={120} required disabled={!policy.voiceNotesEnabled} value={policy.maxSeconds} onChange={(event) => change({ maxSeconds: Number(event.target.value) })} />
            </FormField>
            <FormField id="voice-per-comment" label={t('voicePolicy.perComment', 'Recordings per comment')} hint={t('voicePolicy.perCommentHint', 'From 1 to 3.')}>
              <input id="voice-per-comment" type="number" min={1} max={3} required disabled={!policy.voiceNotesEnabled} value={policy.perComment} onChange={(event) => change({ perComment: Number(event.target.value) })} />
            </FormField>
          </>
        ) : null}
        {state === 'saved' ? <p role="status">{t('voicePolicy.saved', 'Saved. It applies to the next recording.')}</p> : null}
        {state === 'saveError' ? <p className="admin-form__error" role="alert">{t('voicePolicy.saveError', 'The settings were not saved. Check the values and try again.')}</p> : null}
        {state === 'conflict' ? (
          <p className="admin-form__error" role="alert">
            {t('voicePolicy.conflict', 'Someone else changed these settings. Load the current ones and repeat your change.')}{' '}
            <button className="admin-btn" onClick={() => void load()} type="button">{t('voicePolicy.reload', 'Load current settings')}</button>
          </p>
        ) : null}
        <div className="admin-form__actions">
          <button className="admin-btn admin-btn--primary" disabled={!policy || state === 'saving' || state === 'loading' || state === 'loadError'} type="submit">{state === 'saving' ? t('voicePolicy.saving', 'Saving…') : t('voicePolicy.save', 'Save')}</button>
        </div>
      </form>
    </AdminCard>
  );
}
