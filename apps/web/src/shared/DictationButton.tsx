import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DICTATION_LANGUAGES, dictationLanguage, HINT_KEY, LANGUAGE_KEY, readStored, useDictation, writeStored, type DictationLanguage,
} from './dictation.js';

/**
 * PR 508: the microphone button of a comment field. The finished phrases are added at the cursor through `onText`; the person can
 * correct them and save the comment as usual. The language follows the interface language and can be changed next to the button.
 * Where the browser cannot recognise speech the button is not shown and the field stays a plain text field.
 */
export function DictationButton({ onText, disabled, id }: { onText: (text: string) => void; disabled?: boolean; id: string }) {
  const { t: translate, i18n } = useTranslation();
  const t = translate as unknown as (key: string, fallback: string, options?: Record<string, unknown>) => string;
  const [language, setLanguage] = useState<DictationLanguage>(() => {
    const stored = readStored(LANGUAGE_KEY);
    return dictationLanguage(stored ?? i18n.language);
  });
  const [hint, setHint] = useState(false);
  const dictation = useDictation({ language, onText });
  // The hint belongs to the recording that showed it.
  useEffect(() => { if (!dictation.listening) setHint(false); }, [dictation.listening]);
  if (!dictation.supported) return null;

  const { listening, seconds, interim, problem } = dictation;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const toggle = () => {
    if (listening) { dictation.stop(); setHint(false); return; }
    if (readStored(HINT_KEY) === null) { writeStored(HINT_KEY, '1'); setHint(true); }
    dictation.start();
  };
  const problemText: Record<NonNullable<typeof problem>, string> = {
    denied: t('dictation.errorDenied', 'No access to the microphone. Allow it in the site settings of your browser (the lock icon next to the address) and press "Try again".'),
    'no-microphone': t('dictation.errorNoMicrophone', 'No microphone was found. Connect one and press "Try again".'),
    network: t('dictation.errorNetwork', 'Speech recognition needs the internet and could not connect. Press "Try again".'),
    language: t('dictation.errorLanguage', 'Your browser cannot recognise this language. Pick another one or type the text.'),
    failed: t('dictation.errorFailed', 'Dictation stopped because of an error. Press "Try again" or type the text.'),
    silence: t('dictation.silence', 'Nothing was heard. Check the microphone and speak closer to it.'),
  };

  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          aria-pressed={listening}
          className={`ds-button ${listening ? 'ds-button--primary' : 'ds-button--secondary'} ds-button--sm`}
          disabled={disabled}
          id={`${id}-dictation`}
          onClick={toggle}
          style={{ minHeight: 44, minWidth: 44 }}
          type="button"
        >
          <span aria-hidden="true">{listening ? '■' : '🎤'}</span>{' '}
          {listening ? t('dictation.stop', 'Stop') : t('dictation.start', 'Dictate')}
        </button>
        {listening && <span aria-hidden="true" style={{ color: 'var(--color-danger)', fontVariantNumeric: 'tabular-nums' }}>● {clock}</span>}
        <label style={{ alignItems: 'center', display: 'inline-flex', fontSize: 13, gap: 6 }}>
          <span className="ui-visually-hidden">{t('dictation.language', 'Dictation language')}</span>
          <select
            aria-label={t('dictation.language', 'Dictation language')}
            className="ds-input"
            disabled={disabled || listening}
            onChange={(event) => { const next = dictationLanguage(event.target.value); setLanguage(next); writeStored(LANGUAGE_KEY, next); }}
            style={{ minHeight: 44, width: 'auto' }}
            value={language}
          >
            {DICTATION_LANGUAGES.map((code) => <option key={code} value={code}>{t(`dictation.lang_${code}`, code)}</option>)}
          </select>
        </label>
        {problem && problem !== 'language' && problem !== 'silence' && (
          <button className="ds-button ds-button--secondary ds-button--sm" disabled={disabled} onClick={toggle} style={{ minHeight: 44 }} type="button">{t('dictation.retry', 'Try again')}</button>
        )}
      </div>
      <span className="ui-visually-hidden" role="status">{listening ? t('dictation.listening', 'Recording is on, speak') : ''}</span>
      {listening && interim && <span aria-hidden="true" style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', overflowWrap: 'anywhere' }}>{interim}</span>}
      {hint && <p className="admin-form__hint" role="note" style={{ margin: 0 }}>{t('dictation.hint', 'The speech is processed by your browser (Google or Apple); we do not keep the sound.')}</p>}
      {problem && <p role="alert" style={{ color: 'var(--color-danger)', margin: 0 }}>{problemText[problem]}</p>}
    </div>
  );
}
