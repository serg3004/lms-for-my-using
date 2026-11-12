import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { supportedLocales } from '../i18n/index.js';
import { RichDescription } from '../shared/RichDescription.js';
import { RichText } from '../shared/RichText.js';
import { ApiClientError } from '../shared/apiClient.js';
import { getCurrentUser } from '../shared/api/auth.js';
import {
  attachPublicPhoto,
  finishPublicChecklist,
  getPublicCaptcha,
  getPublicPass,
  openPublicChecklist,
  startPublicChecklist,
  startPublicChecklistSignedIn,
  submitPublicItem,
} from '../shared/api/checklistPublic.js';
import type { PublicCaptcha, PublicChecklistFront } from '../shared/api/checklistPublic.js';
import type { ChecklistInstanceSummary } from '../shared/api/types.js';
import { Button, InlineFeedback, PageState } from '../shared/ui.js';
import { ChecklistTaking } from './LearnerChecklistsPage.js';
import type { ChecklistTakingApi } from './LearnerChecklistsPage.js';

const LANGUAGE_KEY = 'lms-prototype-language';
const LOCALE_NAMES: Record<(typeof supportedLocales)[number], string> = { ru: 'Русский', en: 'English', kk: 'Қазақша', zh: '中文' };
const passStorageKey = (token: string) => `lms-public-pass:${token}`;

type StoredPass = { instanceId: string; passKey: string };

function readStoredPass(token: string): StoredPass | null {
  try {
    const raw = window.localStorage.getItem(passStorageKey(token));
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredPass>) : null;
    return parsed && typeof parsed.instanceId === 'string' && typeof parsed.passKey === 'string' ? { instanceId: parsed.instanceId, passKey: parsed.passKey } : null;
  } catch {
    return null;
  }
}
function storePass(token: string, pass: StoredPass | null) {
  try {
    if (pass) window.localStorage.setItem(passStorageKey(token), JSON.stringify(pass));
    else window.localStorage.removeItem(passStorageKey(token));
  } catch {
    // A browser without storage still passes the sheet; it just cannot resume it after a reload.
  }
}

/** The guest has no profile: the language is what they chose before, else the phone's language, else the default. */
function useGuestLocale() {
  const { i18n } = useTranslation();
  useEffect(() => {
    let stored: string | null;
    try { stored = window.localStorage.getItem(LANGUAGE_KEY); } catch { stored = null; }
    const wanted = stored ?? (navigator.language || '').split('-')[0];
    if (wanted && (supportedLocales as readonly string[]).includes(wanted) && wanted !== i18n.language) void i18n.changeLanguage(wanted);
  }, [i18n]);
}

function errorDetailCode(error: unknown) {
  return error instanceof ApiClientError ? error.details[0]?.code : undefined;
}

/** What went wrong, in the guest's language; the server's own text is English and not for guests. */
export function publicErrorText(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiClientError)) return t('publicChecklist.networkError', 'No connection. Your answers are kept on this page; check the network and try again.');
  const code = errorDetailCode(error);
  if (code === 'CAPTCHA_INVALID') return t('publicChecklist.captchaWrong', 'The code is wrong. Enter the characters from the new picture.');
  if (code === 'CAPTCHA_EXPIRED') return t('publicChecklist.captchaExpired', 'The code has expired. Enter the characters from the new picture.');
  if (code === 'DAILY_LIMIT') return t('publicChecklist.dailyLimit', 'This checklist has reached its limit of passes for today. Please try again tomorrow.');
  if (error.status === 429) return t('publicChecklist.tooMany', 'Too many requests from your connection. Wait a few minutes and try again.');
  if (error.status === 408 || error.status === 0) return t('publicChecklist.networkError', 'No connection. Your answers are kept on this page; check the network and try again.');
  if (error.status === 403) return t('publicChecklist.photosForbidden', 'Photos are not allowed on this checklist.');
  return error.message;
}

const shell = { maxWidth: 720, margin: '0 auto', padding: '16px max(16px, env(safe-area-inset-left, 0px)) 48px', boxSizing: 'border-box' as const, minWidth: 0 };
const card = { background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e3e8ef)', borderRadius: 14, padding: 16, display: 'grid', gap: 12, minWidth: 0 };

function LanguageSelect() {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language).split('-')[0] ?? 'ru';
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <span>{t('publicChecklist.language', 'Language')}</span>
      <select
        onChange={(event) => { try { window.localStorage.setItem(LANGUAGE_KEY, event.target.value); } catch { /* not saved */ } void i18n.changeLanguage(event.target.value); }}
        style={{ minHeight: 44 }}
        value={current}
      >
        {supportedLocales.map((locale) => <option key={locale} value={locale}>{LOCALE_NAMES[locale]}</option>)}
      </select>
    </label>
  );
}

/** The code picture and the field for it; the parent owns the challenge and the typed code. */
function CaptchaField({ id, captcha, code, onCode, onRefresh, disabled, t }: { id: string; captcha: PublicCaptcha | null; code: string; onCode: (value: string) => void; onRefresh: () => void; disabled?: boolean; t: TFunction }) {
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontWeight: 600 }}>{t('publicChecklist.captchaLabel', 'Code from the picture')}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {captcha
          ? <img alt={t('publicChecklist.captchaAlt', 'Picture with a code of letters and digits')} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captcha.svg)}`} style={{ maxWidth: '100%', height: 'auto', background: '#ffffff', borderRadius: 8, border: '1px solid var(--color-border, #e3e8ef)' }} />
          : <span role="status">{t('publicChecklist.captchaLoading', 'Loading the code…')}</span>}
        <Button disabled={disabled} onClick={onRefresh} size="sm" style={{ minHeight: 44 }} type="button" variant="secondary">{t('publicChecklist.captchaRefresh', 'New picture')}</Button>
      </div>
      <input
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        disabled={disabled}
        id={id}
        inputMode="text"
        maxLength={12}
        onChange={(event) => onCode(event.target.value)}
        spellCheck={false}
        style={{ minHeight: 44, maxWidth: 240, fontSize: 18, letterSpacing: 2 }}
        value={code}
      />
    </div>
  );
}

function useCaptcha(token: string, enabled: boolean) {
  const [captcha, setCaptcha] = useState<PublicCaptcha | null>(null);
  const [code, setCode] = useState('');
  const refresh = useCallback(() => {
    setCode('');
    setCaptcha(null);
    getPublicCaptcha(token).then(setCaptcha).catch(() => setCaptcha(null));
  }, [token]);
  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);
  return { captcha, code, setCode, refresh };
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'front'; front: PublicChecklistFront }
  | { kind: 'pass'; front: PublicChecklistFront; pass: StoredPass; instance: ChecklistInstanceSummary }
  | { kind: 'resume-failed'; front: PublicChecklistFront; pass: StoredPass; message: string };

/** `/c/:token`: a person who scanned the QR code or opened the link passes the sheet, with or without an account (PR 467). */
export function PublicChecklistPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  useGuestLocale();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const goToLogin = useCallback(() => navigate('/login', { replace: true, state: { from: { pathname: `/c/${token}` } } }), [navigate, token]);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: 'loading' });
    (async () => {
      try {
        const front = await openPublicChecklist(token);
        if (cancelled) return;
        const stored = readStoredPass(token);
        if (!stored) { setPhase({ kind: 'front', front }); return; }
        try {
          const instance = await getPublicPass(token, stored.instanceId, stored.passKey);
          if (!cancelled) setPhase({ kind: 'pass', front, pass: stored, instance });
        } catch (error) {
          if (cancelled) return;
          if (error instanceof ApiClientError && error.status === 404) { storePass(token, null); setPhase({ kind: 'front', front }); return; }
          setPhase({ kind: 'resume-failed', front, pass: stored, message: publicErrorText(error, t) });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.status === 401 && errorDetailCode(error) === 'LOGIN_REQUIRED') {
          // Registered only: an employee already signed in continues under their own account, anyone else signs in and comes back here.
          try {
            await getCurrentUser();
            const started = await startPublicChecklistSignedIn(token);
            if (!cancelled) navigate(`/learn/checklists?open=${encodeURIComponent(started.id)}`, { replace: true });
          } catch {
            if (!cancelled) goToLogin();
          }
          return;
        }
        if (error instanceof ApiClientError && error.status === 404) { setPhase({ kind: 'invalid' }); return; }
        setPhase({ kind: 'unavailable', message: publicErrorText(error, t) });
      }
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey, navigate, goToLogin, t]);

  const title = phase.kind === 'front' || phase.kind === 'pass' || phase.kind === 'resume-failed' ? phase.front.title : t('publicChecklist.pageTitle', 'Checklist');
  useEffect(() => { document.title = title; }, [title]);

  return (
    <main id="main-content" style={shell} tabIndex={-1}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><LanguageSelect /></div>
      {phase.kind === 'loading' && <p role="status">{t('publicChecklist.loading', 'Opening the checklist…')}</p>}
      {phase.kind === 'invalid' && (
        <PageState title={t('publicChecklist.invalidTitle', 'This link does not work')} message={t('publicChecklist.invalidText', 'The link was switched off, replaced with a new one, or the checklist is no longer available. Ask the person who gave it to you for a new link or QR code.')} variant="error" />
      )}
      {phase.kind === 'unavailable' && (
        <PageState title={t('publicChecklist.unavailableTitle', 'The checklist did not open')} message={phase.message} variant="error" action={<Button onClick={() => setReloadKey((n) => n + 1)} type="button">{t('publicChecklist.retry', 'Try again')}</Button>} />
      )}
      {phase.kind === 'front' && (
        <FrontScreen
          front={phase.front}
          onLogin={goToLogin}
          onStarted={(pass, instance) => { storePass(token, pass); setPhase({ kind: 'pass', front: phase.front, pass, instance }); }}
          t={t}
          token={token}
        />
      )}
      {phase.kind === 'resume-failed' && (
        <PageState title={t('publicChecklist.resumeFailedTitle', 'Your pass did not open')} message={phase.message} variant="error" action={<Button onClick={() => setReloadKey((n) => n + 1)} type="button">{t('publicChecklist.retry', 'Try again')}</Button>} />
      )}
      {phase.kind === 'pass' && (
        <PassScreen
          front={phase.front}
          instance={phase.instance}
          onInstance={(instance) => setPhase({ kind: 'pass', front: phase.front, pass: phase.pass, instance })}
          onRestart={() => { storePass(token, null); setReloadKey((n) => n + 1); }}
          pass={phase.pass}
          t={t}
          token={token}
        />
      )}
    </main>
  );
}

function FrontScreen({ front, token, onStarted, onLogin, t }: { front: PublicChecklistFront; token: string; onStarted: (pass: StoredPass, instance: ChecklistInstanceSummary) => void; onLogin: () => void; t: TFunction }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { captcha, code, setCode, refresh } = useCaptcha(token, true);
  // A sheet that demands photos cannot be finished by a guest while guest photos are off: say so before they start.
  const blockedByPhotos = front.photoRequiredCount > 0 && !front.guestPhotosAllowed;
  const nameMissing = front.guestNameRequired && !name.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || blockedByPhotos) return;
    if (nameMissing) { setError(t('publicChecklist.nameRequired', 'Enter your name to start.')); return; }
    if (!captcha || !code.trim()) { setError(t('publicChecklist.codeRequired', 'Enter the code from the picture.')); return; }
    setBusy(true);
    setError(null);
    try {
      const started = await startPublicChecklist(token, { guestName: name.trim() || undefined, captchaChallenge: captcha.challenge, captchaCode: code.trim() });
      onStarted({ instanceId: started.instanceId, passKey: started.passKey }, started.instance);
    } catch (err) {
      setError(publicErrorText(err, t));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-labelledby="public-checklist-title" noValidate onSubmit={(event) => void submit(event)} style={card}>
      <h1 id="public-checklist-title" style={{ margin: 0, overflowWrap: 'anywhere' }}><RichText value={front.title} /></h1>
      {front.description && <div style={{ overflowWrap: 'anywhere' }}><RichDescription value={front.description} /></div>}
      <p style={{ margin: 0, color: 'var(--color-text-muted, #6b7280)' }}>{t('publicChecklist.criteriaCount', 'Criteria: {{count}}', { count: front.criteriaCount })}</p>
      {blockedByPhotos && <InlineFeedback tone="warning">{t('publicChecklist.photoBlocked', 'This checklist requires photos, but its owner has not allowed photos for guests, so it cannot be finished from this link. Tell the person who gave you the link.')}</InlineFeedback>}
      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <label htmlFor="public-guest-name" style={{ fontWeight: 600 }}>
          {front.guestNameRequired ? t('publicChecklist.nameLabelRequired', 'Your name') : t('publicChecklist.nameLabelOptional', 'Your name (optional)')}
        </label>
        <input
          autoComplete="name"
          disabled={busy || blockedByPhotos}
          id="public-guest-name"
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required={front.guestNameRequired}
          style={{ minHeight: 44, maxWidth: 420 }}
          value={name}
        />
      </div>
      <CaptchaField captcha={captcha} code={code} disabled={busy || blockedByPhotos} id="public-start-captcha" onCode={setCode} onRefresh={refresh} t={t} />
      {error && <p role="alert" style={{ margin: 0, color: 'var(--color-danger, #b91c1c)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button disabled={busy || blockedByPhotos} style={{ minHeight: 44 }} type="submit">{t('publicChecklist.start', 'Start')}</Button>
        <Button onClick={onLogin} style={{ minHeight: 44 }} type="button" variant="secondary">{t('publicChecklist.signIn', 'Sign in and pass as an employee')}</Button>
      </div>
    </form>
  );
}

function PassScreen({ front, token, pass, instance, onInstance, onRestart, t }: { front: PublicChecklistFront; token: string; pass: StoredPass; instance: ChecklistInstanceSummary; onInstance: (instance: ChecklistInstanceSummary) => void; onRestart: () => void; t: TFunction }) {
  const editable = instance.status === 'assigned' || instance.status === 'in_progress';
  const { captcha, code, setCode, refresh } = useCaptcha(token, editable);
  const codeRef = useRef(code);
  const captchaRef = useRef(captcha);
  codeRef.current = code;
  captchaRef.current = captcha;

  const api = useMemo<ChecklistTakingApi>(() => ({
    submit: (_instanceId, itemId, input) => submitPublicItem(token, pass.instanceId, itemId, pass.passKey, input),
    uploadPhoto: (_instanceId, itemId, file) => attachPublicPhoto(token, pass.instanceId, itemId, pass.passKey, file),
    removePhoto: () => Promise.reject(new ApiClientError(t('publicChecklist.photoNoRemove', 'A photo cannot be removed here; attach another one instead.'), 400)),
    finish: async () => {
      const current = captchaRef.current;
      const typed = codeRef.current.trim();
      if (!current || !typed) throw new ApiClientError(t('publicChecklist.codeRequired', 'Enter the code from the picture.'), 400);
      try {
        await finishPublicChecklist(token, pass.instanceId, pass.passKey, { captchaChallenge: current.challenge, captchaCode: typed });
      } catch (error) {
        refresh();
        throw new ApiClientError(publicErrorText(error, t), error instanceof ApiClientError ? error.status : 0);
      }
    },
  }), [token, pass, refresh, t]);

  const reload = useCallback(async () => {
    try {
      onInstance(await getPublicPass(token, pass.instanceId, pass.passKey));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) onRestart();
    }
  }, [token, pass, onInstance, onRestart]);

  const done = instance.status === 'completed' || instance.status === 'submitted';
  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      {done && (
        <section aria-labelledby="public-thanks" style={{ ...card, borderColor: 'var(--color-success, #0f9f6e)' }}>
          <h2 id="public-thanks" style={{ margin: 0 }}>{t('publicChecklist.thanksTitle', 'Thank you!')}</h2>
          <p style={{ margin: 0 }}>{instance.status === 'submitted'
            ? t('publicChecklist.thanksReview', 'Your answers were sent. The result will be confirmed by a reviewer.')
            : t('publicChecklist.thanksText', 'Your answers were sent.')}</p>
          <div><Button onClick={onRestart} style={{ minHeight: 44 }} type="button" variant="secondary">{t('publicChecklist.again', 'Pass again')}</Button></div>
        </section>
      )}
      <ChecklistTaking
        api={api}
        beforeFinish={(
          <div style={{ ...card, marginTop: 16 }}>
            <p style={{ margin: 0 }}>{t('publicChecklist.finishCaptchaHint', 'To send the answers, enter the code from the picture.')}</p>
            <CaptchaField captcha={captcha} code={code} id="public-finish-captcha" onCode={setCode} onRefresh={refresh} t={t} />
          </div>
        )}
        instance={instance}
        onUpdated={reload}
        photos={front.guestPhotosAllowed ? 'attach' : 'off'}
        t={t}
      />
    </div>
  );
}
